import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useWorkout, useWorkoutTick } from '../context/WorkoutContext'
import { dateKey, formatLong, getNow, weekStartMonday, weekDatesFromStart } from '../lib/dates'
import { formatDuration } from '../lib/timers'
import { progressiveOverloadBanner } from '../lib/overload'
import {
  getWeightedPrefillForExercise,
  isDeloadBannerDismissed,
  isDeloadWeekActive,
  shouldSuggestDeloadWeek,
} from '../lib/deload'
import { formatLastSessionLine, type LastWeightedSetDefaults } from '../lib/lastSession'
import { computeWeekSummary, isMondayMorningLocal, isSundayLocal } from '../lib/weekSummary'
import { computeLongevityScore } from '../lib/longevityScore'
import { ConfirmDialog } from './ConfirmDialog'
import { EditSetLogModal } from './EditSetLogModal'
import { GymModeView } from './GymModeView'
import { WorkoutInProgressView } from './WorkoutInProgressView'
import { LogSetModal } from './LogSetModal'
import {
  pickActiveExerciseId,
  readGymModeEnabled,
  setsLoggedTodayForExercise,
  targetSetsForExercise,
  writeGymModeEnabled,
} from '../lib/gymMode'
import { PostWorkoutCheckinScreen, WorkoutMoodCheckinModal } from './WorkoutMoodCheckinModal'
import { readPostWorkoutCheckinEnabled } from '../lib/persist'
import { AppleHealthBadge } from './AppleHealthBadge'
import { scheduledTrainingModeForDay, trainingModeDef } from '../lib/trainingMode'
import { TodayMoreQuickGrid } from './TodayMoreQuickGrid'
import { DailyCheckinCard } from './DailyCheckinCard'
import { TrainerPlanCard } from './TrainerPlanCard'
import { requestNotificationPermission } from '../lib/desktopNotifications'
import { streakCurrent } from '../lib/achievements'
import { buildSessionSummaryExtras } from '../lib/sessionSummary'
import {
  formatSleepDuration,
  macroTotalsForDateKey,
  mealLogsForDateKey,
  sleepLogForDateKey,
  waterOzForDateKey,
} from '../lib/stats'
import {
  DEFAULT_MACRO_GOAL_CALORIES,
  DEFAULT_MACRO_GOAL_CARBS_G,
  DEFAULT_MACRO_GOAL_FAT_G,
  DEFAULT_MACRO_GOAL_PROTEIN_G,
  DEFAULT_WATER_GOAL_OZ,
} from '../types'
import {
  migrateDailyMotivationFromSession,
  readDailyMotivationForDay,
  readRecentDailyMotivationTexts,
  writeDailyMotivationForDay,
} from '../lib/dailyMotivation'
import { buildDailyMotivationInput, claudeParseMeal, fetchDailyMotivation } from '../lib/anthropicCoach'
import { fetchWeeklyInsight, type WeeklyInsight } from '../lib/weeklyInsight'
import {
  readGymBarcode,
  renderGymBarcodeToCanvas,
  requestGymCardScreenWakeLock,
  type GymBarcodeStored,
} from '../lib/gymBarcode'
import { PostWorkoutStretchesCard, stretchSuggestionsForSummary } from './PostWorkoutStretchesCard'
import { SessionSummaryModal, type SessionSummaryData } from './SessionSummaryModal'
import { SpotifyPlayerCard } from './SpotifyPlayerCard'
import type { Exercise, SetLog, TodaySectionId } from '../types'

type Props = {
  onOpenHistory: () => void
  onOpenGymMembershipSetup?: () => void
  onGoToTodayTab?: () => void
  screenLayout?: 'mobile' | 'desktop'
  moreOpen: boolean
  onMoreOpenChange: (open: boolean) => void
  planOpen: boolean
  onPlanOpenChange: (open: boolean) => void
}

const MORE_QUICK_SECTION_IDS: TodaySectionId[] = [
  'weekly-volume',
  'cardio-tracker',
  'water-tracker',
  'sleep-tracker',
]

const inp = 'apex-input w-full px-3 py-2.5 min-h-11 font-normal'
const btnNeutral = 'apex-btn min-h-11 px-3 text-[13px] font-medium touch-manipulation'

const DAILY_FITNESS_QUOTES = [
  'Progress is built one rep at a time — show up today.',
  'Consistency beats intensity. Small wins stack into big change.',
  'Your future self is watching — make them proud this session.',
  'Strength isn’t given; it’s earned between sets when nobody’s watching.',
  'Rest is part of the plan — train hard, recover harder.',
  'The bar doesn’t care about your mood — only your effort.',
  'You don’t have to be extreme — just consistent.',
  'Every expert was once a beginner who refused to quit.',
  'Discipline is choosing what you want most over what you want now.',
  'Sweat is just your body applauding your effort.',
  'The only bad workout is the one that didn’t happen.',
  'Champions keep going when the warmup is over.',
  'Comfort zones don’t build muscle — challenge does.',
  'Fuel well, sleep well, train smart — the trifecta of gains.',
  'Your legs carry you through life — give them the work they deserve.',
  'A strong core anchors everything — don’t skip the basics.',
  'Mobility today keeps injuries away tomorrow.',
  'Cardio isn’t punishment — it’s building an engine that lasts.',
  'Track the work, trust the process, celebrate the PRs.',
  'You’re not competing with anyone on the app — only with yesterday’s you.',
  'Heavy isn’t heroic — controlled, honest reps are.',
  'Breathe, brace, lift with intent. Details become PRs.',
] as const

function dailyQuoteForDateKey(todayKey: string): string {
  let h = 2166136261
  for (let i = 0; i < todayKey.length; i++) {
    h ^= todayKey.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const idx = Math.abs(h >>> 0) % DAILY_FITNESS_QUOTES.length
  return DAILY_FITNESS_QUOTES[idx]!
}

function fmtCardioMin(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return 'No duration'
  return `${m} min`
}

function minutesBetweenTimes(bed: string, wake: string): number | null {
  if (!bed || !wake) return null
  const [bh, bm] = bed.split(':').map(Number)
  const [wh, wm] = wake.split(':').map(Number)
  if (![bh, bm, wh, wm].every((n) => Number.isFinite(n))) return null
  let start = bh * 60 + bm
  let end = wh * 60 + wm
  if (end <= start) end += 24 * 60
  return end - start
}

function TodaySheetStepper({
  label,
  valueNode,
  onMinus,
  onPlus,
  minusLabel,
  plusLabel,
}: {
  label: string
  valueNode: ReactNode
  onMinus: () => void
  onPlus: () => void
  minusLabel: string
  plusLabel: string
}) {
  return (
    <div className="apex-log-set-sheet__stepper-card">
      <p className="apex-log-set-sheet__stepper-label">{label}</p>
      <div className="apex-log-set-sheet__stepper-row">
        <button
          type="button"
          className="apex-log-set-sheet__stepper-btn"
          aria-label={minusLabel}
          onClick={onMinus}
        >
          −
        </button>
        <div className="apex-log-set-sheet__stepper-value">{valueNode}</div>
        <button
          type="button"
          className="apex-log-set-sheet__stepper-btn"
          aria-label={plusLabel}
          onClick={onPlus}
        >
          +
        </button>
      </div>
    </div>
  )
}

function SleepLogSheet({
  open,
  sleepHours,
  sleepMinutes,
  bedtime,
  wakeTime,
  appleHealthHint,
  onBedtimeChange,
  onWakeTimeChange,
  onSleepHoursChange,
  onSleepMinutesChange,
  onClose,
  onLog,
}: {
  open: boolean
  sleepHours: number
  sleepMinutes: number
  bedtime: string
  wakeTime: string
  appleHealthHint: boolean
  onBedtimeChange: (v: string) => void
  onWakeTimeChange: (v: string) => void
  onSleepHoursChange: (h: number) => void
  onSleepMinutesChange: (m: number) => void
  onClose: () => void
  onLog: () => void
}) {
  if (!open) return null
  const totalMin = sleepHours * 60 + sleepMinutes
  return (
    <div
      className="apex-log-set-sheet-overlay fixed inset-0 z-[72] flex items-end justify-center p-0"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="apex-log-set-sheet w-full max-w-lg max-h-[92vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Log sleep"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="apex-log-set-sheet__handle-wrap">
          <span className="apex-log-set-sheet__pill" aria-hidden />
        </div>
        <h2 className="apex-log-set-sheet__title">Sleep</h2>
        {appleHealthHint ? (
          <p className="apex-log-set-sheet__last text-center px-2">
            Imported from Apple Health — adjust and save
          </p>
        ) : null}
        <div className="apex-log-set-sheet__steppers">
          <TodaySheetStepper
            label="HOURS"
            valueNode={<span className="apex-log-set-sheet__num-main tabular-nums">{sleepHours}</span>}
            onMinus={() => onSleepHoursChange(Math.max(0, sleepHours - 1))}
            onPlus={() => onSleepHoursChange(Math.min(24, sleepHours + 1))}
            minusLabel="Decrease hours"
            plusLabel="Increase hours"
          />
          <TodaySheetStepper
            label="MINUTES"
            valueNode={<span className="apex-log-set-sheet__num-main tabular-nums">{sleepMinutes}</span>}
            onMinus={() => onSleepMinutesChange((sleepMinutes + 55) % 60)}
            onPlus={() => onSleepMinutesChange((sleepMinutes + 5) % 60)}
            minusLabel="Decrease minutes"
            plusLabel="Increase minutes"
          />
        </div>
        <p className="text-[11px] font-medium text-[var(--apex-text-tertiary)] uppercase tracking-wide mt-4 mb-2 px-1">
          Optional
        </p>
        <div className="grid grid-cols-2 gap-3 pb-2">
          <label className="block">
            <span className="text-[12px] font-medium text-[var(--apex-text-secondary)] mb-1.5 block">Bedtime</span>
            <input
              type="time"
              className={inp}
              value={bedtime}
              onChange={(e) => onBedtimeChange(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-[12px] font-medium text-[var(--apex-text-secondary)] mb-1.5 block">Wake time</span>
            <input
              type="time"
              className={inp}
              value={wakeTime}
              onChange={(e) => onWakeTimeChange(e.target.value)}
            />
          </label>
        </div>
        {totalMin > 0 ? (
          <p className="text-[12px] font-medium text-[var(--apex-text-secondary)] text-center pb-2 tabular-nums">
            {formatSleepDuration(totalMin)}
          </p>
        ) : null}
        <footer className="apex-log-set-sheet__footer apex-safe-bottom">
          <button
            type="button"
            className="apex-log-set-sheet__log-btn"
            disabled={totalMin <= 0}
            onClick={onLog}
          >
            Log sleep
          </button>
        </footer>
      </div>
    </div>
  )
}

function WaterLogSheet({
  open,
  waterTodayOz,
  waterGoalOz,
  customMode,
  customOz,
  onCustomMode,
  onCustomOzChange,
  onClose,
  onAddOz,
}: {
  open: boolean
  waterTodayOz: number
  waterGoalOz: number
  customMode: boolean
  customOz: string
  onCustomMode: (on: boolean) => void
  onCustomOzChange: (v: string) => void
  onClose: () => void
  onAddOz: (oz: number) => void
}) {
  if (!open) return null
  const quickAmounts = [8, 16, 32] as const
  return (
    <div
      className="apex-log-set-sheet-overlay fixed inset-0 z-[72] flex items-end justify-center p-0"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="apex-log-set-sheet w-full max-w-lg"
        role="dialog"
        aria-modal="true"
        aria-label="Log water"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="apex-log-set-sheet__handle-wrap">
          <span className="apex-log-set-sheet__pill" aria-hidden />
        </div>
        <h2 className="apex-log-set-sheet__title">Water</h2>
        <p className="text-center mt-3 mb-1">
          <span className="text-[32px] font-medium tabular-nums text-[var(--apex-text-primary)] leading-none">
            {waterTodayOz}
          </span>
          <span className="text-[14px] font-medium text-[var(--apex-text-secondary)] ml-1">oz today</span>
        </p>
        <p className="text-[12px] font-medium text-[var(--apex-text-secondary)] text-center mb-5 tabular-nums">
          Goal {waterGoalOz} oz
        </p>
        <div className="grid grid-cols-2 gap-2 pb-3">
          {quickAmounts.map((oz) => (
            <button
              key={oz}
              type="button"
              className="min-h-12 rounded-[8px] border-[0.5px] border-white/[0.1] bg-white/[0.06] text-[15px] font-medium text-[var(--apex-text-primary)] touch-manipulation active:scale-[0.98]"
              onClick={() => onAddOz(oz)}
            >
              +{oz} oz
            </button>
          ))}
          <button
            type="button"
            className={`min-h-12 rounded-[8px] border-[0.5px] text-[15px] font-medium touch-manipulation active:scale-[0.98] ${
              customMode
                ? 'border-[#c0582a] bg-[#c0582a]/20 text-[var(--apex-text-primary)]'
                : 'border-white/[0.1] bg-white/[0.06] text-[var(--apex-text-primary)]'
            }`}
            onClick={() => onCustomMode(!customMode)}
          >
            Custom
          </button>
        </div>
        {customMode ? (
          <div className="flex gap-2 pb-4">
            <input
              inputMode="decimal"
              className={`min-h-11 flex-1 ${inp}`}
              placeholder="Ounces"
              value={customOz}
              onChange={(e) => onCustomOzChange(e.target.value)}
            />
            <button
              type="button"
              className="apex-btn-primary min-h-11 px-4 shrink-0 text-[13px] font-medium rounded-[8px]"
              onClick={() => {
                const oz = Math.round(Number(customOz))
                if (!Number.isFinite(oz) || oz <= 0) return
                onAddOz(oz)
                onCustomOzChange('')
              }}
            >
              Add
            </button>
          </div>
        ) : null}
        <footer className="apex-log-set-sheet__footer apex-safe-bottom">
          <button type="button" className="apex-log-set-sheet__log-btn" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}

export function TodayTab({
  onOpenHistory,
  onOpenGymMembershipSetup,
  onGoToTodayTab,
  screenLayout = 'mobile',
  moreOpen: _moreOpen,
  onMoreOpenChange,
  planOpen: _planOpen,
  onPlanOpenChange,
}: Props) {
  const isDesktop = screenLayout === 'desktop'
  const {
    state,
    userId,
    todayKey,
    notify,
    addSetLog,
    updateSetLog,
    deleteSetLog,
    updateScheduleDay,
    getSupersetPartner,
    startGymSession,
    pauseGymSession,
    resumeGymSession,
    stopGymSession,
    startCardioTimer,
    pauseCardioTimer,
    resetCardioTimer,
    addCardioEntry,
    applyCardioTimerToEntry,
    deleteCardio,
    buildTodayShareText,
    resolveExerciseById,
    completeNotificationPrompt,
    coachNote,
    refreshCoachNote,
    addWaterOz,
    logSleep,
    addMealLog,
    deleteMealLog,
    applyDeloadWeek,
    dismissDeloadSuggestion,
  } = useWorkout()
  const { clock, gymElapsedMs, cardioElapsedMs } = useWorkoutTick()

  const fallbackQuote = useMemo(() => dailyQuoteForDateKey(todayKey), [todayKey])
  const streakDays = useMemo(() => streakCurrent(state, clock), [state.setLogs, state.cardioEntries, state.streakShieldUsedWeekStart, clock])
  const [motivationText, setMotivationText] = useState<string | null>(null)
  const [motivationReady, setMotivationReady] = useState(false)
  const [gymBarcode, setGymBarcode] = useState<GymBarcodeStored | null>(() => readGymBarcode())
  const [weeklyInsight, setWeeklyInsight] = useState<WeeklyInsight | null>(null)

  const weekRecap = useMemo(() => computeWeekSummary(state, clock), [state, clock])
  const showSundayRecap = isSundayLocal(clock) && !isMondayMorningLocal(clock)
  const weekRecapEmpty =
    weekRecap.totalSets === 0 && weekRecap.totalVolumeLbs === 0 && weekRecap.prCount === 0

  const sched = state.schedule.find((d) => d.dateKey === todayKey)
  const planName = sched?.workoutName?.trim() ?? ''
  const isRestDay = !planName
  const dayStatusLabel = isRestDay ? 'Rest day' : planName || 'Workout day'

  const firstName = useMemo(() => {
    const full = state.settings.displayName?.trim() ?? ''
    return full.split(' ')[0] || null
  }, [state.settings.displayName])

  const headerGreeting = useMemo(() => {
    const hour = new Date(clock).getHours()
    const salutation = hour >= 5 && hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'
    return firstName ? `${salutation}, ${firstName}.` : `${salutation}.`
  }, [clock, firstName])

  const headerDateLabel = useMemo(() => {
    const d = new Date(clock)
    const dow = d.toLocaleDateString('en-US', { weekday: 'short' })
    const md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${dow}, ${md}`
  }, [clock])

  const longevityScore = useMemo(() => computeLongevityScore(state).score, [state])

  const weeklyVolLabel = useMemo(() => {
    const v = weekRecap.totalVolumeLbs
    if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}K`
    return v > 0 ? `${v}` : '—'
  }, [weekRecap.totalVolumeLbs])

  const { weeklySessionsDone, weeklySessionGoal } = useMemo(() => {
    const ws = weekStartMonday(new Date(clock))
    const dates = weekDatesFromStart(ws)
    const loggedKeys = new Set(state.setLogs.map((l) => new Date(l.at).toISOString().slice(0, 10)))
    const done = dates.filter((d) => loggedKeys.has(d)).length
    const goal = dates.filter((d) => state.schedule.some((s) => s.dateKey === d && s.workoutName.trim())).length
    return { weeklySessionsDone: done, weeklySessionGoal: Math.max(goal, 1) }
  }, [state.setLogs, state.schedule, clock])

  const weeklyBarData = useMemo(() => {
    const ws = weekStartMonday(new Date(clock))
    const dates = weekDatesFromStart(ws)
    const todayStr = new Date(clock).toISOString().slice(0, 10)
    return dates.map((d, i) => {
      const vol = state.setLogs
        .filter((l): l is import('../types').WeightedSetLog => l.kind === 'weighted' && new Date(l.at).toISOString().slice(0, 10) === d)
        .reduce((sum, l) => sum + (l.weight ?? 0) * l.reps, 0)
      return { date: d, vol, isToday: d === todayStr, label: ['M','T','W','T','F','S','S'][i] ?? '' }
    })
  }, [state.setLogs, clock])

  const strengthSparkline = useMemo(() => {
    const now = new Date(clock)
    const points: number[] = []
    for (let w = 7; w >= 0; w--) {
      const ws = weekStartMonday(new Date(now.getFullYear(), now.getMonth(), now.getDate() - w * 7))
      const we = new Date(ws.getTime() + 7 * 86400000)
      const weekLogs = state.setLogs.filter((l): l is import('../types').WeightedSetLog =>
        l.kind === 'weighted' && l.at >= ws.getTime() && l.at < we.getTime()
      )
      const maxE1rm = weekLogs.reduce((best, l) => {
        const w2 = l.weight ?? 0
        const e1rm = l.reps > 0 ? w2 * (1 + l.reps / 30) : w2
        return e1rm > best ? e1rm : best
      }, 0)
      points.push(maxE1rm)
    }
    return points
  }, [state.setLogs, clock])

  const todayPlannedExercises = useMemo(() => {
    if (!sched?.plannedExerciseIds?.length) return []
    return sched.plannedExerciseIds
      .map((id) => resolveExerciseById(id))
      .filter((ex): ex is NonNullable<typeof ex> => ex != null)
  }, [sched, resolveExerciseById])

  useEffect(() => {
    let cancelled = false
    const cached =
      readDailyMotivationForDay(todayKey) ?? migrateDailyMotivationFromSession(todayKey)
    if (cached) {
      setMotivationText(cached)
      setMotivationReady(true)
      return
    }
    setMotivationText(null)
    setMotivationReady(false)
    const recent = readRecentDailyMotivationTexts(todayKey)
    const input = buildDailyMotivationInput(state, streakDays, clock, recent, isRestDay)
    void fetchDailyMotivation(input)
      .then((text) => {
        if (cancelled) return
        setMotivationText(text)
        setMotivationReady(true)
        writeDailyMotivationForDay(todayKey, text)
      })
      .catch(() => {
        if (cancelled) return
        setMotivationText(fallbackQuote)
        setMotivationReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [todayKey, fallbackQuote])

  useEffect(() => {
    void refreshCoachNote()
  }, [refreshCoachNote])

  useEffect(() => {
    void fetchWeeklyInsight(state).then((data) => {
      if (data) setWeeklyInsight(data)
    })
  }, [])

  const [logTarget, setLogTarget] = useState<Exercise | null>(null)
  const [gymModeEnabled, setGymModeEnabled] = useState(() => readGymModeEnabled())
  const [gymModeStandardOnce, setGymModeStandardOnce] = useState(false)
  const [gymModeEnteredAt, setGymModeEnteredAt] = useState<number | null>(null)
  const [gymModeEditOpen, setGymModeEditOpen] = useState(false)
  const [gymModeEditPrefill, setGymModeEditPrefill] = useState<LastWeightedSetDefaults | null>(
    null,
  )
  const [gymModeEditPrefillVersion, setGymModeEditPrefillVersion] = useState(0)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [sessionSummary, setSessionSummary] = useState<SessionSummaryData | null>(null)
  const [cardioName, setCardioName] = useState('')
  const [cardioManualMin, setCardioManualMin] = useState('')
  const [confirmCardioId, setConfirmCardioId] = useState<string | null>(null)
  const [sleepSheetOpen, setSleepSheetOpen] = useState(false)
  const [waterSheetOpen, setWaterSheetOpen] = useState(false)
  const [sleepHours, setSleepHours] = useState(7)
  const [sleepMinutes, setSleepMinutes] = useState(30)
  const [sleepBedtime, setSleepBedtime] = useState('')
  const [sleepWakeTime, setSleepWakeTime] = useState('')
  const [waterCustomMode, setWaterCustomMode] = useState(false)
  const [waterCustomOz, setWaterCustomOz] = useState('')

  const waterGoalOz = state.settings.waterGoalOz ?? DEFAULT_WATER_GOAL_OZ
  const waterTodayOz = useMemo(
    () => waterOzForDateKey(state, todayKey),
    [state.waterLogs, todayKey],
  )
  const sleepTodayLog = useMemo(
    () => sleepLogForDateKey(state, todayKey),
    [state.sleepLogs, todayKey],
  )
  const appleHealthToday = useMemo(() => {
    const h = state.appleHealthToday
    if (!h || h.dateKey !== todayKey || !state.settings.appleHealthSyncEnabled) return null
    return h
  }, [state.appleHealthToday, state.settings.appleHealthSyncEnabled, todayKey])

  useEffect(() => {
    if (!sleepSheetOpen) return
    if (sleepTodayLog) {
      setSleepHours(Math.floor(sleepTodayLog.durationMinutes / 60))
      setSleepMinutes(sleepTodayLog.durationMinutes % 60)
      return
    }
    if (appleHealthToday?.sleepMinutes) {
      const total = Math.max(0, Math.round(appleHealthToday.sleepMinutes))
      setSleepHours(Math.floor(total / 60))
      setSleepMinutes(total % 60)
      return
    }
    setSleepHours(7)
    setSleepMinutes(30)
  }, [sleepSheetOpen, sleepTodayLog?.id, sleepTodayLog?.durationMinutes, appleHealthToday?.sleepMinutes])

  useEffect(() => {
    const fromTimes = minutesBetweenTimes(sleepBedtime, sleepWakeTime)
    if (fromTimes == null || fromTimes <= 0) return
    setSleepHours(Math.floor(fromTimes / 60))
    setSleepMinutes(fromTimes % 60)
  }, [sleepBedtime, sleepWakeTime])

  const [mealNameDraft, setMealNameDraft] = useState('')
  const [mealCalDraft, setMealCalDraft] = useState('')
  const [mealProteinDraft, setMealProteinDraft] = useState('')
  const [mealCarbsDraft, setMealCarbsDraft] = useState('')
  const [mealFatDraft, setMealFatDraft] = useState('')
  const [mealAiText, setMealAiText] = useState('')
  const [mealAiBusy, setMealAiBusy] = useState(false)
  const [confirmMealDeleteId, setConfirmMealDeleteId] = useState<string | null>(null)

  const macroGoals = useMemo(
    () => ({
      calories: state.settings.macroGoalCalories ?? DEFAULT_MACRO_GOAL_CALORIES,
      proteinG: state.settings.macroGoalProteinG ?? DEFAULT_MACRO_GOAL_PROTEIN_G,
      carbsG: state.settings.macroGoalCarbsG ?? DEFAULT_MACRO_GOAL_CARBS_G,
      fatG: state.settings.macroGoalFatG ?? DEFAULT_MACRO_GOAL_FAT_G,
    }),
    [state.settings],
  )
  const macroToday = useMemo(
    () => macroTotalsForDateKey(state, todayKey),
    [state.mealLogs, todayKey],
  )
  const mealsToday = useMemo(
    () =>
      [...mealLogsForDateKey(state, todayKey)].sort((a, b) => b.at - a.at),
    [state.mealLogs, todayKey],
  )

  function submitMealDraft() {
    const name = mealNameDraft.trim()
    const calories = Number(mealCalDraft)
    if (!name || !Number.isFinite(calories) || calories < 0) return
    addMealLog({
      name,
      calories,
      proteinG: Number(mealProteinDraft) || 0,
      carbsG: Number(mealCarbsDraft) || 0,
      fatG: Number(mealFatDraft) || 0,
    })
    setMealNameDraft('')
    setMealCalDraft('')
    setMealProteinDraft('')
    setMealCarbsDraft('')
    setMealFatDraft('')
    notify('Meal logged')
  }

  function applyParsedMeal(parsed: {
    name: string
    calories: number
    proteinG: number
    carbsG: number
    fatG: number
  }) {
    setMealNameDraft(parsed.name)
    setMealCalDraft(String(parsed.calories))
    setMealProteinDraft(String(parsed.proteinG))
    setMealCarbsDraft(String(parsed.carbsG))
    setMealFatDraft(String(parsed.fatG))
  }

  const [editLog, setEditLog] = useState<SetLog | null>(null)
  const [confirmDeleteSetId, setConfirmDeleteSetId] = useState<string | null>(null)
  const [moodCheckinOpen, setMoodCheckinOpen] = useState(false)
  const [postWorkoutCheckinOpen, setPostWorkoutCheckinOpen] = useState(false)
  const [endedSessionTrainingMode, setEndedSessionTrainingMode] = useState<
    import('../lib/trainingMode').TrainingMode | null
  >(null)
  const [gymCardOpen, setGymCardOpen] = useState(false)
  const [gymBarcodeRenderError, setGymBarcodeRenderError] = useState<string | null>(null)
  const gymBarcodeCanvasRef = useRef<HTMLCanvasElement>(null)
  const [supersetLogFromId, setSupersetLogFromId] = useState<string | null>(null)

  useEffect(() => {
    if (!gymCardOpen || !gymBarcode) return
    setGymBarcodeRenderError(null)
    let releaseWake = () => {}
    void requestGymCardScreenWakeLock().then((release) => {
      releaseWake = release
    })
    const id = window.requestAnimationFrame(() => {
      const canvas = gymBarcodeCanvasRef.current
      if (!canvas) return
      try {
        renderGymBarcodeToCanvas(canvas, gymBarcode)
      } catch (e) {
        setGymBarcodeRenderError(e instanceof Error ? e.message : 'Could not render barcode')
      }
    })
    return () => {
      window.cancelAnimationFrame(id)
      releaseWake()
    }
  }, [gymCardOpen, gymBarcode])
  const layout = state.todayLayout
  const hiddenSet = useMemo(() => new Set(layout.hidden), [layout.hidden])
  const DESKTOP_HIDDEN: TodaySectionId[] = [
    'water-tracker', 'sleep-tracker', 'spotify-player', 'nutrition-tracker',
  ]
  const orderedSectionIds = useMemo(
    () =>
      layout.order.filter(
        (id) =>
          !hiddenSet.has(id) &&
          id !== 'muscle-balance' &&
          id !== 'gym-tracker' &&
          id !== 'my-plan' &&
          !(isDesktop && DESKTOP_HIDDEN.includes(id)),
      ),
    [layout.order, hiddenSet, isDesktop],
  )

  const moreSectionIds = useMemo(
    () => orderedSectionIds.filter((id) => id !== 'daily-motivation'),
    [orderedSectionIds],
  )

  const moreListSectionIds = useMemo(
    () => moreSectionIds.filter((id) => !MORE_QUICK_SECTION_IDS.includes(id)),
    [moreSectionIds],
  )

  const [moreQuickPanel, setMoreQuickPanel] = useState<TodaySectionId | null>(null)

  function handleMoreQuickSelect(id: TodaySectionId) {
    if (id === 'water-tracker') {
      setWaterSheetOpen(true)
      setWaterCustomMode(false)
      setWaterCustomOz('')
      return
    }
    if (id === 'sleep-tracker') {
      setSleepSheetOpen(true)
      setSleepBedtime('')
      setSleepWakeTime('')
      return
    }
    setMoreQuickPanel((p) => (p === id ? null : id))
  }

  function submitSleepLog() {
    const fromTimes = minutesBetweenTimes(sleepBedtime, sleepWakeTime)
    const minutes =
      fromTimes != null && fromTimes > 0 ? fromTimes : sleepHours * 60 + sleepMinutes
    if (minutes <= 0) return
    const quality = sleepTodayLog?.quality ?? 3
    logSleep(minutes, quality)
    notify('Sleep logged')
    setSleepSheetOpen(false)
  }

  function addWaterFromSheet(oz: number) {
    addWaterOz(oz)
    notify(`+${oz} oz water`)
  }

  const todayScheduledMode = useMemo(
    () => scheduledTrainingModeForDay(state.schedule, todayKey),
    [state.schedule, todayKey],
  )

  function beginWorkoutFlow() {
    onMoreOpenChange(true)
    if (!state.gymSession.active) {
      startGymSession('stopwatch')
      const firstId = pickActiveExerciseId(
        state.todayPlanExerciseIds,
        state.setLogs,
        todayKey,
        null,
      )
      const firstEx = firstId ? resolveExerciseById(firstId) : null
      if (firstEx) setLogTarget(firstEx)
    }
  }

  const todaysLogs = useMemo(
    () =>
      [...state.setLogs]
        .filter((l) => dateKey(new Date(l.at)) === todayKey)
        .sort((a, b) => b.at - a.at),
    [state.setLogs, todayKey],
  )

  const gymSec = Math.floor(gymElapsedMs / 1000)
  const cardioSec = Math.floor(cardioElapsedMs / 1000)

  const overloadBanner = useMemo(
    () =>
      progressiveOverloadBanner(
        state.setLogs,
        state.todayPlanExerciseIds,
        Object.fromEntries(
          state.todayPlanExerciseIds.map((id) => [id, resolveExerciseById(id)?.name ?? 'Exercise']),
        ),
        state.settings.unit,
      ),
    [state.setLogs, state.todayPlanExerciseIds, state.settings.unit, resolveExerciseById],
  )

  const showDeloadBanner =
    shouldSuggestDeloadWeek(state) &&
    !isDeloadBannerDismissed(state.deloadDismissedWeekStart) &&
    !isDeloadWeekActive(state.deloadActiveWeekStart)

  const deloadWeekActive = isDeloadWeekActive(state.deloadActiveWeekStart)

  const lastSessionLine = useMemo(() => {
    if (!logTarget) return null
    return formatLastSessionLine(state.setLogs, logTarget.id, state.settings.unit)
  }, [logTarget, state.setLogs, state.settings.unit])

  const logInitialWeighted = useMemo(() => {
    if (!logTarget) return null
    return getWeightedPrefillForExercise(
      state.setLogs,
      logTarget.id,
      state.settings.unit,
      state.deloadActiveWeekStart,
    )
  }, [logTarget, state.setLogs, state.settings.unit, state.deloadActiveWeekStart])

  function commitWeightedLog(
    ex: Exercise,
    vals: { bodyweight: boolean; weight: number | null; reps: number; sets: number; note: string },
    options?: { deferRestTimer?: boolean; skipRestTimer?: boolean },
  ) {
    addSetLog(
      {
        kind: 'weighted',
        exerciseId: ex.id,
        exerciseName: ex.name,
        muscleGroup: ex.muscleGroup,
        weight: vals.bodyweight ? null : vals.weight,
        bodyweight: vals.bodyweight,
        reps: vals.reps,
        sets: vals.sets,
        note: vals.note,
      },
      options,
    )
  }

  function openExerciseLog(ex: Exercise) {
    setSupersetLogFromId(null)
    setEditLog(null)
    setGymModeStandardOnce(false)
    setLogTarget(ex)
  }

  const useGymModeView =
    Boolean(logTarget) && gymModeEnabled && !gymModeStandardOnce

  useEffect(() => {
    document.body.classList.toggle('apex-gym-mode-active', useGymModeView)
    return () => {
      document.body.classList.remove('apex-gym-mode-active')
    }
  }, [useGymModeView])

  const gymModeElapsedSec = useMemo(() => {
    if (gymModeEnteredAt != null) {
      return Math.max(0, Math.floor((clock - gymModeEnteredAt) / 1000))
    }
    return gymSec
  }, [gymModeEnteredAt, clock, gymSec])

  const gymModeTargetSets = useMemo(() => {
    if (!logTarget) return 3
    return targetSetsForExercise(state.setLogs, logTarget.id)
  }, [logTarget, state.setLogs])

  const workoutActiveExerciseId = useMemo(
    () => pickActiveExerciseId(state.todayPlanExerciseIds, state.setLogs, todayKey, logTarget?.id ?? null),
    [state.todayPlanExerciseIds, state.setLogs, todayKey, logTarget?.id],
  )

  function enterGymMode(ex?: Exercise) {
    setGymModeEnteredAt(Date.now())
    setGymModeStandardOnce(false)
    setGymModeEnabled(true)
    writeGymModeEnabled(true)
    const target =
      ex ??
      (workoutActiveExerciseId
        ? resolveExerciseById(workoutActiveExerciseId)
        : null)
    if (target) {
      setSupersetLogFromId(null)
      setEditLog(null)
      setLogTarget(target)
    }
  }

  function exitGymModeOverlay() {
    setGymModeStandardOnce(true)
    setGymModeEditOpen(false)
  }

  function openGymModeValueEditor(current: LastWeightedSetDefaults) {
    setGymModeEditPrefill(current)
    setGymModeEditOpen(true)
  }

  const gymModeSetsToday = useMemo(() => {
    if (!logTarget) return 0
    return setsLoggedTodayForExercise(state.setLogs, logTarget.id, todayKey)
  }, [logTarget, state.setLogs, todayKey])

  function logSetFromGymMode(
    ex: Exercise,
    vals: { bodyweight: boolean; weight: number | null; reps: number },
  ) {
    const partner = getSupersetPartner(ex.id)
    const deferRest = Boolean(partner && supersetLogFromId === null)
    commitWeightedLog(
      ex,
      {
        bodyweight: vals.bodyweight,
        weight: vals.bodyweight ? null : vals.weight ?? 0,
        reps: vals.reps,
        sets: 1,
        note: '',
      },
      { deferRestTimer: deferRest, skipRestTimer: true },
    )
    notify(`Set logged — ${ex.name}`, 1600)
    if (partner && supersetLogFromId === null) {
      setSupersetLogFromId(ex.id)
      const next = resolveExerciseById(partner)
      if (next) {
        setLogTarget(next)
        setGymModeStandardOnce(false)
        return
      }
    }
    setSupersetLogFromId(null)
  }

  function afterPlanSetLogged(ex: Exercise) {
    const partner = getSupersetPartner(ex.id)
    if (partner && supersetLogFromId === null) {
      setSupersetLogFromId(ex.id)
      const next = resolveExerciseById(partner)
      if (next) {
        setLogTarget(next)
        setEditLog(null)
        return
      }
    }
    setSupersetLogFromId(null)
    setLogTarget(null)
  }

  function swipeQuickLog(ex: Exercise) {
    const last = getWeightedPrefillForExercise(
      state.setLogs,
      ex.id,
      state.settings.unit,
      state.deloadActiveWeekStart,
    )
    if (!last) {
      openExerciseLog(ex)
      return
    }
    const partner = getSupersetPartner(ex.id)
    const deferRest = Boolean(partner && supersetLogFromId === null)
    commitWeightedLog(
      ex,
      {
        bodyweight: last.bodyweight,
        weight: last.weight,
        reps: last.reps,
        sets: last.sets,
        note: '',
      },
      { deferRestTimer: deferRest },
    )
    notify(`Set logged — ${ex.name}`, 2000)
    if (partner && supersetLogFromId === null) {
      setSupersetLogFromId(ex.id)
      const next = resolveExerciseById(partner)
      if (next) {
        const lastB = getWeightedPrefillForExercise(
          state.setLogs,
          partner,
          state.settings.unit,
          state.deloadActiveWeekStart,
        )
        if (lastB) {
          commitWeightedLog(
            next,
            {
              bodyweight: lastB.bodyweight,
              weight: lastB.weight,
              reps: lastB.reps,
              sets: lastB.sets,
              note: '',
            },
            { deferRestTimer: false },
          )
          notify(`Set logged — ${next.name}`, 2000)
          setSupersetLogFromId(null)
        } else {
          openExerciseLog(next)
        }
        return
      }
    }
    setSupersetLogFromId(null)
  }

  async function endGym() {
    const durationSec = Math.floor(gymElapsedMs / 1000)
    const logsToday = state.setLogs.filter((l) => dateKey(new Date(l.at)) === todayKey)
    const names = [...new Set(logsToday.map((l) => l.exerciseName))]
    const prCount = logsToday.filter((l) => l.isPr).length
    const extras = buildSessionSummaryExtras(state, todayKey, names.length, durationSec)
    const trainingMode = state.gymSession.trainingMode
    await stopGymSession()
    setSessionSummary({
      dateLabel: formatLong(getNow()),
      durationSec,
      exerciseNames: names,
      totalSets: logsToday.length,
      prCount,
      stretchSuggestions: stretchSuggestionsForSummary(state.setLogs, todayKey),
      ...extras,
    })
    if (extras.comebackMessage) {
      notify(extras.comebackMessage, 4500)
    }
    if (readPostWorkoutCheckinEnabled()) {
      setEndedSessionTrainingMode(trainingMode)
      setPostWorkoutCheckinOpen(true)
    } else {
      setMoodCheckinOpen(true)
    }
  }

  function finishPostWorkoutCheckin() {
    setPostWorkoutCheckinOpen(false)
    onGoToTodayTab?.()
  }

  function finishMoodCheckin() {
    setMoodCheckinOpen(false)
    setSummaryOpen(true)
    onGoToTodayTab?.()
  }

  function sectionBody(id: TodaySectionId): ReactNode {
    switch (id) {
      case 'daily-motivation':
        return (
          <div className="apex-daily-motivation-card">
            <p className="apex-daily-motivation-card__label">Daily motivation</p>
            {!motivationReady ? (
              <div
                className="rounded-[4px] bg-white/20"
                style={{ width: '60%', height: 12, opacity: 0.2 }}
                aria-hidden
              />
            ) : (
              <p
                className="apex-daily-motivation-card__body transition-opacity duration-500"
                style={{ opacity: motivationReady ? 1 : 0 }}
              >
                {motivationText ?? fallbackQuote}
              </p>
            )}
          </div>
        )
      case 'spotify-player':
        return <SpotifyPlayerCard />
      case 'weekly-volume':
        return null
      case 'muscle-balance':
        return null
      case 'gym-tracker':
        return null
      case 'cardio-tracker':
        return (
          <div className="space-y-4">
            <div className="apex-card p-4 flex flex-col gap-3 min-h-[158px]">
              <div className="flex items-center justify-between gap-2">
                <p className="apex-section-label">Cardio</p>
                {appleHealthToday?.restingHeartRateBpm != null ? <AppleHealthBadge /> : null}
              </div>
              {appleHealthToday?.restingHeartRateBpm != null ? (
                <p className="text-[28px] font-medium tabular-nums text-[var(--apex-text-primary)] leading-none">
                  {appleHealthToday.restingHeartRateBpm}
                  <span className="text-[14px] font-medium text-[var(--apex-text-secondary)] ml-1">bpm resting</span>
                </p>
              ) : null}
              <p className="text-[12px] font-medium text-[var(--apex-text-secondary)]">Session timer</p>
              <p className="apex-stat-num tabular-nums">{formatDuration(cardioSec)}</p>
              <div className="flex gap-1 flex-wrap mt-auto">
                <button
                  type="button"
                  className={`${btnNeutral} flex-1`}
                  onClick={state.cardioTimer.running ? pauseCardioTimer : startCardioTimer}
                >
                  {state.cardioTimer.running ? 'Pause' : 'Start'}
                </button>
                <button type="button" className={`${btnNeutral} flex-1`} onClick={resetCardioTimer}>
                  Reset
                </button>
              </div>
            </div>
            <section className="apex-card p-5 space-y-4">
              <h2 className="apex-section-label">Cardio log</h2>
              <input
                className={`w-full min-h-11 ${inp}`}
                placeholder="Activity name"
                value={cardioName}
                onChange={(e) => setCardioName(e.target.value)}
              />
              <div className="flex gap-2">
                <input
                  inputMode="decimal"
                  className={`min-h-11 flex-1 ${inp}`}
                  placeholder="Minutes (manual)"
                  value={cardioManualMin}
                  onChange={(e) => setCardioManualMin(e.target.value)}
                />
                <button
                  type="button"
                  className="apex-btn-primary min-h-11 px-4 shrink-0 text-[13px] rounded-[8px]"
                  onClick={() => {
                    const name = cardioName.trim() || 'Cardio'
                    const raw = cardioManualMin.trim()
                    const minutes =
                      raw === '' ? null : Math.max(0, Math.round(Number(raw) * 100) / 100)
                    if (raw !== '' && !Number.isFinite(minutes as number)) return
                    addCardioEntry(name, minutes)
                    setCardioManualMin('')
                  }}
                >
                  Log cardio
                </button>
              </div>
              <ul className="space-y-2 pt-1">
                {state.cardioEntries
                  .filter((c) => dateKey(new Date(c.at)) === todayKey)
                  .sort((a, b) => b.at - a.at)
                  .map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-2 rounded-[8px] border-[0.5px] border-white/[0.07] px-4 py-3 apex-card-interactive"
                    >
                      <div>
                        <p className="text-[13px] font-normal text-[var(--apex-text-primary)]">{c.name}</p>
                        <p className="text-[11px] text-[var(--apex-text-secondary)]">{fmtCardioMin(c.durationMinutes)}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button type="button" className={btnNeutral} onClick={() => applyCardioTimerToEntry(c.id)}>
                          Timer
                        </button>
                        <button
                          type="button"
                          className="rounded-[8px] border-[0.5px] border-red-900/50 bg-[var(--apex-surface-card)] min-h-10 px-3 text-[12px] text-red-500"
                          onClick={() => setConfirmCardioId(c.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          </div>
        )
      case 'water-tracker':
      case 'sleep-tracker':
        return null
      case 'nutrition-tracker': {
        const macroRows = [
          { key: 'calories', label: 'Calories', current: macroToday.calories, goal: macroGoals.calories, unit: '' },
          { key: 'protein', label: 'Protein', current: macroToday.proteinG, goal: macroGoals.proteinG, unit: 'g' },
          { key: 'carbs', label: 'Carbs', current: macroToday.carbsG, goal: macroGoals.carbsG, unit: 'g' },
          { key: 'fat', label: 'Fat', current: macroToday.fatG, goal: macroGoals.fatG, unit: 'g' },
        ] as const
        return (
          <div className="apex-card p-5 space-y-4">
            <div>
              <p className="apex-section-label">Nutrition</p>
              <p className="text-[12px] font-medium text-[var(--apex-text-secondary)] mt-1">Today&apos;s macros</p>
            </div>
            <div className="space-y-3">
              {macroRows.map((row) => {
                const pct = row.goal > 0 ? Math.min(1, row.current / row.goal) : 0
                return (
                  <div key={row.key}>
                    <div className="flex justify-between gap-2 text-[12px] font-medium mb-1.5">
                      <span className="text-[var(--apex-text-secondary)]">{row.label}</span>
                      <span className="text-[var(--apex-text-primary)] tabular-nums">
                        {row.current}
                        {row.unit} / {row.goal}
                        {row.unit}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--apex-surface-nested)] overflow-hidden border-[0.5px] border-white/[0.05]">
                      <div
                        className="h-full rounded-full bg-[#ececee] transition-all duration-300"
                        style={{ width: `${Math.round(pct * 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="space-y-2 pt-2 border-t border-[0.5px] border-white/[0.06]">
              <p className="text-[11px] font-medium text-[var(--apex-text-tertiary)] uppercase tracking-wide">AI meal parser</p>
              <textarea
                className={`w-full min-h-16 px-3 py-2.5 resize-y ${inp}`}
                placeholder="e.g. 2 eggs, toast with butter, black coffee"
                value={mealAiText}
                onChange={(e) => setMealAiText(e.target.value)}
              />
              <button
                type="button"
                disabled={!mealAiText.trim() || mealAiBusy}
                className="apex-btn w-full min-h-10 text-[13px] font-medium disabled:opacity-50"
                onClick={() => {
                  setMealAiBusy(true)
                  void claudeParseMeal(mealAiText)
                    .then((parsed) => {
                      applyParsedMeal(parsed)
                      setMealAiText('')
                      notify('Macros filled — review and save')
                    })
                    .catch((e) =>
                      notify(e instanceof Error ? e.message : 'Could not parse meal'),
                    )
                    .finally(() => setMealAiBusy(false))
                }}
              >
                {mealAiBusy ? 'Parsing…' : 'Parse with AI'}
              </button>
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-[var(--apex-text-tertiary)] uppercase tracking-wide">Log meal</p>
              <input
                className={inp}
                placeholder="Meal name"
                value={mealNameDraft}
                onChange={(e) => setMealNameDraft(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  inputMode="numeric"
                  className={inp}
                  placeholder="Calories"
                  value={mealCalDraft}
                  onChange={(e) => setMealCalDraft(e.target.value)}
                />
                <input
                  inputMode="numeric"
                  className={inp}
                  placeholder="Protein (g)"
                  value={mealProteinDraft}
                  onChange={(e) => setMealProteinDraft(e.target.value)}
                />
                <input
                  inputMode="numeric"
                  className={inp}
                  placeholder="Carbs (g)"
                  value={mealCarbsDraft}
                  onChange={(e) => setMealCarbsDraft(e.target.value)}
                />
                <input
                  inputMode="numeric"
                  className={inp}
                  placeholder="Fat (g)"
                  value={mealFatDraft}
                  onChange={(e) => setMealFatDraft(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="apex-btn-primary w-full min-h-11 text-[13px] font-medium rounded-[8px]"
                onClick={submitMealDraft}
              >
                Add meal
              </button>
            </div>
            {mealsToday.length > 0 ? (
              <ul className="space-y-2 pt-2 border-t border-[0.5px] border-white/[0.06]">
                {mealsToday.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-start justify-between gap-2 rounded-[8px] border-[0.5px] border-white/[0.07] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[var(--apex-text-primary)] truncate">{m.name}</p>
                      <p className="text-[11px] font-medium text-[var(--apex-text-secondary)] mt-1 tabular-nums">
                        {m.calories} cal · P {m.proteinG}g · C {m.carbsG}g · F {m.fatG}g
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-[8px] border-[0.5px] border-red-900/50 bg-[var(--apex-surface-card)] min-h-9 px-3 text-[12px] text-red-500 shrink-0"
                      onClick={() => setConfirmMealDeleteId(m.id)}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )
      }
      case 'my-plan':
        return null
      case 'todays-log':
        return (
          <section>
            <h2 className="apex-page-sub mb-1">Session</h2>
            <p className="text-xl font-medium text-[var(--apex-text-primary)] tracking-tight mb-4">Today&apos;s log</p>
            <button type="button" className={`${btnNeutral} w-full min-h-12 mb-4`} onClick={onOpenHistory}>
              Full history
            </button>
            {todaysLogs.length > 0 ? (
              <div className="mb-4">
                <PostWorkoutStretchesCard setLogs={state.setLogs} todayKey={todayKey} />
              </div>
            ) : null}
            <ul className="space-y-3">
              {todaysLogs.map((l) => (
                <li key={l.id} className="apex-card apex-card-interactive p-4">
                  <div className="flex justify-between gap-2 items-start">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium text-[var(--apex-text-primary)] min-w-0 tracking-tight">
                        {l.exerciseName}
                      </p>
                    </div>
                    {l.isPr ? (
                      <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-black">
                        PR
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[14px] font-medium text-[var(--apex-text-secondary)] mt-2">
                    {l.kind === 'weighted'
                      ? `${l.bodyweight ? 'Bodyweight' : `${l.weight ?? 0} ${state.settings.unit}`} × ${l.reps} · ${l.sets} sets`
                      : `${l.durationSec}s timed`}
                  </p>
                  {l.note ? <p className="text-[12px] text-[var(--apex-text-secondary)] mt-2 leading-relaxed">{l.note}</p> : null}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[0.5px] border-white/[0.06] pt-3">
                    <p className="apex-section-label opacity-80">
                      {new Date(l.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        className="apex-btn-primary min-h-9 rounded-[8px] px-3 text-[12px]"
                        onClick={() => {
                          setEditLog(l)
                          setLogTarget(null)
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="apex-btn min-h-9 rounded-[8px] border-red-500/35 bg-red-950/20 px-3 text-[12px] font-medium text-red-400"
                        onClick={() => setConfirmDeleteSetId(l.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
              {todaysLogs.length === 0 ? (
                <li>
                  <div className="apex-empty-state">
                    <p className="text-[14px] font-medium text-[var(--apex-text-secondary)]">No sets logged yet today.</p>
                  </div>
                </li>
              ) : null}
            </ul>
          </section>
        )
      default:
        return null
    }
  }

  return (
    <>
      {state.gymSession.active ? (
        <WorkoutInProgressView
          workoutName={planName || 'Workout'}
          elapsedSec={gymSec}
          planExerciseIds={state.todayPlanExerciseIds}
          setLogs={state.setLogs}
          todayKey={todayKey}
          unit={state.settings.unit}
          activeExerciseId={workoutActiveExerciseId}
          resolveExercise={(id) => resolveExerciseById(id)}
          onActiveExerciseChange={(id) => {
            const ex = resolveExerciseById(id)
            if (!ex) return
            setSupersetLogFromId(null)
            setEditLog(null)
            setGymModeStandardOnce(false)
            setLogTarget(ex)
          }}
          onExitWorkout={() => void endGym()}
          onLogSet={() => {
            const id = workoutActiveExerciseId
            const ex = id ? resolveExerciseById(id) : null
            if (ex) openExerciseLog(ex)
          }}
          onSwipeLog={(ex) => swipeQuickLog(ex)}
          onOpenExerciseDetail={(ex) => openExerciseLog(ex)}
          onOpenGymMode={() => {
            const id = workoutActiveExerciseId
            const ex = id ? resolveExerciseById(id) : null
            if (ex) enterGymMode(ex)
          }}
        />
      ) : null}

    <div className={`apex-tab-stack ${isDesktop ? 'pb-8' : 'pb-32'}${state.gymSession.active ? ' hidden' : ''}`}>
      {!isDesktop ? <header className="apex-card px-5 py-5">
        {/* Date row + streak badge */}
        <div className="flex items-start justify-between mb-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--apex-text-tertiary)]">
            {headerDateLabel}
            {!isRestDay && (
              <span style={{ color: 'var(--apex-accent)' }}> · {dayStatusLabel}</span>
            )}
          </p>
          <div className="flex items-center gap-2">
            {streakDays > 0 && (
              <div
                className="flex items-center gap-1 px-2.5 py-1 rounded-[99px] text-[12px] font-medium"
                style={{ background: 'rgba(61,122,181,0.14)', color: 'var(--apex-accent)' }}
              >
                <span className="tabular-nums">{streakDays}</span>
                <span className="text-[11px]">days</span>
              </div>
            )}
            <button
              type="button"
              className="w-7 h-7 flex items-center justify-center rounded-[8px] text-[var(--apex-text-tertiary)]"
              style={{ background: 'rgba(255,255,255,0.05)' }}
              aria-label={gymBarcode ? 'Open gym membership barcode' : 'Set up gym membership barcode'}
              onClick={() => {
                const saved = readGymBarcode()
                setGymBarcode(saved)
                if (saved) { setGymCardOpen(true) } else { onOpenGymMembershipSetup?.() }
              }}
            >
              <i className="ti ti-barcode text-[16px] leading-none" aria-hidden />
            </button>
          </div>
        </div>
        {/* Greeting */}
        <h1 className="text-[32px] font-medium text-[var(--apex-text-primary)] leading-none tracking-[-0.02em] mb-4">
          {headerGreeting}
        </h1>
        {/* Action buttons */}
        <div className="apex-today-header-actions">
          <button
            type="button"
            className="apex-today-btn-ghost"
            onClick={() => {
              addCardioEntry('Recovery', null)
              onMoreOpenChange(true)
            }}
          >
            Log recovery
          </button>
          <button
            type="button"
            className="apex-today-btn-workout"
            onClick={() => {
              if (isRestDay) {
                updateScheduleDay(todayKey, { workoutName: 'Workout' })
                onMoreOpenChange(true)
                onPlanOpenChange(true)
              }
              beginWorkoutFlow()
            }}
          >
            <span>Workout day</span>
            <span className="apex-today-btn-workout__arrow" aria-hidden>→</span>
          </button>
        </div>
      </header> : null}

      {/* ── Stat trio ───────────────────────────────────────────────────── */}
      {!isDesktop ? <div className="apex-card flex divide-x divide-white/[0.08]" style={{ borderRadius: 12 }}>
        <div className="flex-1 px-4 py-4">
          <div className="text-[22px] font-medium tabular-nums leading-none" style={{ letterSpacing: '-0.02em' }}>{weeklyVolLabel}</div>
          <div className="apex-section-label mt-1.5">Volume</div>
        </div>
        <div className="flex-1 px-4 py-4">
          <div className="text-[22px] font-medium tabular-nums leading-none" style={{ letterSpacing: '-0.02em' }}>
            {weeklySessionsDone}<span className="text-[14px] text-[var(--apex-text-tertiary)]">/{weeklySessionGoal}</span>
          </div>
          <div className="apex-section-label mt-1.5">Sessions</div>
          <div className="flex gap-[3px] mt-2">
            {Array.from({ length: weeklySessionGoal }).map((_, i) => (
              <div
                key={i}
                className="h-[3px] rounded-full flex-1"
                style={{ background: i < weeklySessionsDone ? 'var(--apex-accent)' : 'rgba(255,255,255,0.1)' }}
              />
            ))}
          </div>
        </div>
        <div className="flex-1 px-4 py-4">
          <div className="text-[22px] font-medium tabular-nums leading-none" style={{ letterSpacing: '-0.02em' }}>{longevityScore}</div>
          <div className="apex-section-label mt-1.5">Longevity</div>
        </div>
      </div> : null}

      {/* ── Today's workout card ─────────────────────────────────────────── */}
      {!isDesktop && !isRestDay && !state.gymSession.active ? (
        <div className="apex-card px-4 py-4">
          <p className="apex-section-label mb-2">Today's workout</p>
          <p className="text-[18px] font-medium text-[var(--apex-text-primary)] tracking-tight mb-3">{planName}</p>
          {todayPlannedExercises.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {todayPlannedExercises.slice(0, 3).map((ex) => (
                <span
                  key={ex.id}
                  className="px-2.5 py-1 text-[12px] font-medium rounded-[99px] text-[var(--apex-text-secondary)]"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.08)' }}
                >
                  {ex.name}
                </span>
              ))}
              {todayPlannedExercises.length > 3 && (
                <span
                  className="px-2.5 py-1 text-[12px] font-medium rounded-[99px] text-[var(--apex-text-tertiary)]"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.08)' }}
                >
                  +{todayPlannedExercises.length - 3} more
                </span>
              )}
            </div>
          )}
          <button
            type="button"
            className="w-full min-h-11 rounded-[8px] text-[14px] font-medium text-white touch-manipulation"
            style={{ background: 'var(--apex-accent)' }}
            onClick={beginWorkoutFlow}
          >
            Start workout
          </button>
        </div>
      ) : null}

      {/* ── Weekly volume bar chart ──────────────────────────────────────── */}
      {!isDesktop && weeklyBarData.some((d) => d.vol > 0) ? (
        <div className="apex-card px-4 py-4">
          <p className="apex-section-label mb-3">This week</p>
          <div className="flex items-end gap-[6px] h-16">
            {(() => {
              const maxVol = Math.max(...weeklyBarData.map((d) => d.vol), 1)
              return weeklyBarData.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full rounded-[3px] transition-all" style={{
                    height: `${Math.max((d.vol / maxVol) * 48, d.vol > 0 ? 4 : 2)}px`,
                    background: d.isToday ? 'var(--apex-accent)' : d.vol > 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)',
                    alignSelf: 'flex-end',
                  }} />
                  <span className="text-[10px] font-medium" style={{ color: d.isToday ? 'var(--apex-accent)' : 'rgba(255,255,255,0.3)' }}>{d.label}</span>
                </div>
              ))
            })()}
          </div>
        </div>
      ) : null}

      {/* ── Strength sparkline ───────────────────────────────────────────── */}
      {!isDesktop && strengthSparkline.some((v) => v > 0) ? (
        <div className="apex-card px-4 py-4">
          <p className="apex-section-label mb-3">8-week strength trend</p>
          <svg viewBox="0 0 200 48" className="w-full" style={{ height: 48 }} preserveAspectRatio="none">
            {(() => {
              const max = Math.max(...strengthSparkline, 1)
              const min = Math.min(...strengthSparkline.filter((v) => v > 0), max)
              const range = max - min || 1
              const pts = strengthSparkline.map((v, i) => {
                const x = (i / (strengthSparkline.length - 1)) * 200
                const y = v > 0 ? 44 - ((v - min) / range) * 40 : 44
                return `${x},${y}`
              })
              const d = `M ${pts.join(' L ')}`
              const fillD = `M 0,48 L ${pts.join(' L ')} L 200,48 Z`
              return (
                <>
                  <defs>
                    <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c0582a" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#c0582a" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={fillD} fill="url(#sparkGrad)" />
                  <path d={d} stroke="#c0582a" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </>
              )
            })()}
          </svg>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] font-medium text-[var(--apex-text-tertiary)]">8 wk ago</span>
            <span className="text-[10px] font-medium text-[var(--apex-text-tertiary)]">Now</span>
          </div>
        </div>
      ) : null}

      {/* ── New-user empty state ─────────────────────────────────────────── */}
      {state.setLogs.length === 0 && !state.gymSession.active ? (
        <div className="apex-card p-6 flex flex-col items-center text-center gap-4">
          <div
            className="w-14 h-14 rounded-[12px] flex items-center justify-center text-[28px]"
            style={{ background: 'rgba(109,184,122,0.12)' }}
            aria-hidden
          >
            💪
          </div>
          <div>
            <p className="text-[18px] font-medium text-[var(--apex-text-primary)] tracking-tight">Start your first workout</p>
            <p className="text-[13px] font-medium text-[var(--apex-text-secondary)] mt-1.5 leading-relaxed max-w-[260px] mx-auto">
              Log a set to unlock progress tracking, your AI coach, and streak.
            </p>
          </div>
          <button
            type="button"
            className="apex-btn-primary w-full max-w-[240px] min-h-12 rounded-[8px] text-[14px] font-medium touch-manipulation"
            onClick={beginWorkoutFlow}
          >
            Start workout →
          </button>
          <div className="flex gap-4 text-[11px] font-medium text-[var(--apex-text-tertiary)]">
            <span>Track sets &amp; reps</span>
            <span>·</span>
            <span>Hit PRs</span>
            <span>·</span>
            <span>AI coaching</span>
          </div>
        </div>
      ) : null}

      {state.gymSession.active ? (
        <div
          className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-[0.5px] border-white/[0.1] bg-[var(--apex-surface-page)]/95 backdrop-blur-md px-4 py-3 -mt-px"
          role="status"
          aria-live="polite"
        >
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--apex-text-secondary)]">
              Gym session
            </p>
            <p className="text-[1.75rem] font-medium tabular-nums text-[var(--apex-text-primary)] leading-none tracking-tight">
              {formatDuration(gymSec)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {state.gymSession.pauseStartedAt ? (
              <button
                type="button"
                className={`${btnNeutral} min-h-10 px-3 text-[12px]`}
                onClick={resumeGymSession}
              >
                Resume
              </button>
            ) : (
              <button
                type="button"
                className={`${btnNeutral} min-h-10 px-3 text-[12px]`}
                onClick={pauseGymSession}
              >
                Pause
              </button>
            )}
            <button
              type="button"
              className="apex-btn-primary min-h-11 px-4 text-[13px] font-medium touch-manipulation"
              onClick={() => void endGym()}
            >
              End session
            </button>
          </div>
        </div>
      ) : null}

      {state.gymSession.active && todayScheduledMode ? (
        <div className="apex-card px-5 py-4">
          <p className="apex-section-label">
            {trainingModeDef(todayScheduledMode).label} mode
          </p>
          <p className="mt-2 text-[14px] font-medium text-[var(--apex-text-primary)] leading-relaxed">
            {trainingModeDef(todayScheduledMode).framing}
          </p>
        </div>
      ) : null}

      {coachNote ? (
        <div className="apex-coach-note-card">
          <div className="apex-coach-note-card__icon" aria-hidden>
            <i className="ti ti-message-2" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="apex-coach-note-card__label">From your coach</p>
            <p className="apex-coach-note-card__body">{coachNote}</p>
          </div>
        </div>
      ) : null}

      {weeklyInsight && (
        <div className="apex-card p-4 flex flex-col gap-2">
          <p className="apex-section-label">This week</p>
          <p className="text-[14px] font-normal text-[var(--apex-text-primary)] leading-relaxed">
            {weeklyInsight.insight}
          </p>
          {weeklyInsight.stats && (
            <div className="flex gap-4 mt-1">
              {weeklyInsight.stats.sessions > 0 && (
                <span className="text-[11px] font-normal text-[var(--apex-text-secondary)]">
                  {weeklyInsight.stats.sessions} sessions
                </span>
              )}
              {weeklyInsight.stats.sets > 0 && (
                <span className="text-[11px] font-normal text-[var(--apex-text-secondary)]">
                  {weeklyInsight.stats.sets} sets
                </span>
              )}
              {weeklyInsight.stats.prs > 0 && (
                <span className="text-[11px] font-normal text-[var(--apex-text-secondary)]">
                  {weeklyInsight.stats.prs} PR{weeklyInsight.stats.prs !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <TrainerPlanCard clientUserId={userId} />

      <DailyCheckinCard />

      {sectionBody('daily-motivation')}

      <div className="apex-today-more">
        <div className="apex-today-more__head">
          <p className="apex-today-more__label">More</p>
          <span className="apex-today-more__week">This week</span>
        </div>

        <TodayMoreQuickGrid
          activeId={moreQuickPanel}
          onSelect={handleMoreQuickSelect}
          hideIds={isDesktop ? ['water-tracker', 'sleep-tracker'] : undefined}
        />

        {moreQuickPanel &&
        moreQuickPanel !== 'water-tracker' &&
        moreQuickPanel !== 'sleep-tracker' ? (
          <div className="apex-today-more__panel">{sectionBody(moreQuickPanel)}</div>
        ) : null}

        <div className="apex-tab-stack">
      {showSundayRecap ? (
        <div className="apex-card px-5 py-5 ">
          <p className="text-[0.8125rem] font-medium text-[var(--apex-text-tertiary)] mb-1">Sunday week recap</p>
          <h2 className="text-lg font-medium text-[var(--apex-text-primary)] tracking-tight">This week · {weekRecap.weekLabel}</h2>
          {weekRecapEmpty ? (
            <p className="mt-4 text-[14px] font-medium text-[var(--apex-text-secondary)] leading-relaxed">
              Start logging to see your week take shape
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {weekRecap.totalSets > 0 ? (
                <div className="rounded-[12px] border-[0.5px] border-white/[0.06] px-3 py-3">
                  <p className="text-[0.75rem] font-medium text-[var(--apex-text-tertiary)]">Sets</p>
                  <p className="mt-1 text-xl font-medium tabular-nums text-[var(--apex-text-primary)]">{weekRecap.totalSets}</p>
                </div>
              ) : null}
              {weekRecap.totalVolumeLbs > 0 ? (
                <div className="rounded-[12px] border-[0.5px] border-white/[0.06] px-3 py-3">
                  <p className="text-[0.75rem] font-medium text-[var(--apex-text-tertiary)]">Volume</p>
                  <p className="mt-1 text-xl font-medium tabular-nums text-[var(--apex-text-primary)]">
                    {weekRecap.totalVolumeLbs.toLocaleString()} lb
                  </p>
                </div>
              ) : null}
              {weekRecap.muscleGroups.length > 0 ? (
                <div
                  className={`rounded-[12px] border-[0.5px] border-white/[0.06] px-3 py-3 ${
                    weekRecap.totalSets > 0 && weekRecap.totalVolumeLbs > 0 ? 'col-span-2' : ''
                  }`}
                >
                  <p className="text-[0.75rem] font-medium text-[var(--apex-text-tertiary)]">Muscle groups</p>
                  <p className="mt-1 text-[13px] font-medium text-[var(--apex-text-secondary)] leading-snug">
                    {weekRecap.muscleGroups.join(', ')}
                  </p>
                </div>
              ) : null}
              {weekRecap.prCount > 0 ? (
                <div className="rounded-[12px] border-[0.5px] border-white/[0.06] px-3 py-3 col-span-2">
                  <p className="text-[0.75rem] font-medium text-[var(--apex-text-tertiary)]">PRs hit</p>
                  <p className="mt-1 text-xl font-medium tabular-nums text-[var(--apex-text-primary)]">{weekRecap.prCount}</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {overloadBanner ? (
        <div className="apex-card px-5 py-4">
          <p className="apex-section-label mb-2">Overload</p>
          <p className="apex-lead text-[14px]">
            You&apos;ve done {overloadBanner.weight} {overloadBanner.unitLabel} on{' '}
            {overloadBanner.exerciseName} for 3 sessions in a row — try a small bump next time if
            form stays crisp.
          </p>
        </div>
      ) : null}

      {showDeloadBanner ? (
        <div className="apex-card px-5 py-4 border-[0.5px] border-amber-500/20 bg-amber-950/15">
          <p className="apex-section-label mb-2">Recovery</p>
          <p className="apex-lead text-[14px] leading-relaxed">
            Your body may benefit from a deload this week — volume has climbed for several weeks in
            a row.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              className="apex-btn-primary min-h-11 px-4 text-[13px] font-medium rounded-[8px]"
              onClick={() => applyDeloadWeek()}
            >
              Generate lighter workout
            </button>
            <button
              type="button"
              className="apex-btn min-h-11 px-4 text-[13px] rounded-[8px]"
              onClick={() => dismissDeloadSuggestion()}
            >
              Not this week
            </button>
          </div>
          <p className="mt-3 text-[11px] font-medium text-[var(--apex-text-tertiary)] leading-relaxed">
            Keeps the same exercises and reps; logging prefills at 60% of your last weights (−40%).
          </p>
        </div>
      ) : null}

      {deloadWeekActive ? (
        <div className="apex-card px-5 py-3 border-[0.5px] border-white/[0.08]">
          <p className="text-[13px] font-medium text-[var(--apex-text-secondary)] leading-relaxed">
            <span className="font-medium text-[var(--apex-text-primary)]">Deload week active.</span> Same plan and
            reps — weights prefill at 60% of your last session.
          </p>
        </div>
      ) : null}

      {!isDesktop && state.onboardingComplete && !state.notificationPromptDone ? (
        <div className="apex-card p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-[0.5px] border-white/[0.08]">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--apex-text-secondary)] mb-1.5">Stay in the loop</p>
            <p className="text-[14px] font-medium text-[var(--apex-text-secondary)] leading-snug">
              Enable notifications for Sunday evening week summaries and when your rest timer finishes while Lift is in the background.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              className="apex-btn-primary min-h-11 px-4 shrink-0 text-[13px] rounded-[8px]"
              onClick={async () => {
                await requestNotificationPermission()
                completeNotificationPrompt()
              }}
            >
              Enable
            </button>
            <button type="button" className={`${btnNeutral} min-h-11 px-4`} onClick={completeNotificationPrompt}>
              Not now
            </button>
          </div>
        </div>
      ) : null}

      <div className="apex-tab-stack">
        {moreListSectionIds.map((sid) => (
          <div key={sid}>{sectionBody(sid)}</div>
        ))}
      </div>
        </div>
      </div>

      {useGymModeView && logTarget ? (
        <GymModeView
          exercise={logTarget}
          unit={state.settings.unit}
          setsLoggedToday={gymModeSetsToday}
          targetSets={gymModeTargetSets}
          elapsedSec={gymModeElapsedSec}
          initialWeighted={logInitialWeighted}
          editPrefill={gymModeEditPrefill}
          editPrefillVersion={gymModeEditPrefillVersion}
          onExitGymMode={exitGymModeOverlay}
          onEditValues={openGymModeValueEditor}
          onLogSet={(vals) => logSetFromGymMode(logTarget, vals)}
        />
      ) : null}

      <LogSetModal
        open={gymModeEditOpen || (!!logTarget && !useGymModeView)}
        exercise={logTarget}
        unit={state.settings.unit}
        lastSessionLine={lastSessionLine}
        initialWeighted={gymModeEditOpen ? gymModeEditPrefill : logInitialWeighted}
        setLogs={state.setLogs}
        overlayClassName={gymModeEditOpen || useGymModeView ? 'z-[98]' : undefined}
        onClose={() => {
          if (gymModeEditOpen) {
            setGymModeEditOpen(false)
            return
          }
          setLogTarget(null)
          setSupersetLogFromId(null)
          setGymModeStandardOnce(false)
        }}
        onOpenGymMode={() => {
          if (logTarget) enterGymMode(logTarget)
        }}
        onSave={(p) => {
          if (gymModeEditOpen && p.mode === 'weighted') {
            setGymModeEditPrefill({
              bodyweight: p.bodyweight,
              weight: p.bodyweight ? null : p.weight,
              reps: p.reps,
              sets: 1,
            })
            setGymModeEditPrefillVersion((v) => v + 1)
            setGymModeEditOpen(false)
            return false
          }
          try {
            const ex = p.exercise
            const partner = getSupersetPartner(ex.id)
            const deferRest = Boolean(partner && supersetLogFromId === null)
            if (p.mode === 'weighted') {
              addSetLog(
                {
                  kind: 'weighted',
                  exerciseId: ex.id,
                  exerciseName: ex.name,
                  muscleGroup: ex.muscleGroup,
                  weight: p.bodyweight ? null : p.weight,
                  bodyweight: p.bodyweight,
                  reps: p.reps,
                  sets: p.sets,
                  note: p.note,
                },
                { deferRestTimer: deferRest },
              )
            } else {
              addSetLog(
                {
                  kind: 'timed',
                  exerciseId: ex.id,
                  exerciseName: ex.name,
                  muscleGroup: ex.muscleGroup,
                  durationSec: p.durationSec,
                  note: p.note,
                },
                { deferRestTimer: deferRest },
              )
            }
            if (partner && supersetLogFromId === null) {
              afterPlanSetLogged(ex)
              return false
            }
            setSupersetLogFromId(null)
            setLogTarget(null)
          } catch (e) {
            notify(e instanceof Error ? e.message : 'Could not save set')
            throw e
          }
        }}
      />

      <EditSetLogModal
        open={!!editLog}
        log={editLog}
       
        unit={state.settings.unit}
        onClose={() => setEditLog(null)}
        onSave={(logId, payload) => {
          try {
            updateSetLog(logId, payload)
          } catch (e) {
            notify(e instanceof Error ? e.message : 'Could not update set')
            throw e
          }
        }}
      />

      <SessionSummaryModal
        open={summaryOpen}
       
        data={sessionSummary}
        shareText={buildTodayShareText()}
        onClose={() => {
          setSummaryOpen(false)
          setSessionSummary(null)
        }}
      />

      <ConfirmDialog
        open={!!confirmMealDeleteId}
        title="Delete meal?"
        message="This removes the meal from today's log."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmMealDeleteId(null)}
        onConfirm={() => {
          if (confirmMealDeleteId) deleteMealLog(confirmMealDeleteId)
          setConfirmMealDeleteId(null)
        }}
      />

      <ConfirmDialog
        open={!!confirmDeleteSetId}
        title="Delete this set?"
        message="This removes the set from your log. You can't undo this."
        confirmLabel="Delete"
       
        destructive
        onCancel={() => setConfirmDeleteSetId(null)}
        onConfirm={() => {
          if (confirmDeleteSetId) deleteSetLog(confirmDeleteSetId)
          setConfirmDeleteSetId(null)
        }}
      />

      <ConfirmDialog
        open={!!confirmCardioId}
        title="Delete cardio?"
        message="This removes the cardio entry from today."
        confirmLabel="Delete"
       
        onCancel={() => setConfirmCardioId(null)}
        onConfirm={() => {
          if (confirmCardioId) deleteCardio(confirmCardioId)
          setConfirmCardioId(null)
        }}
      />

      {gymCardOpen && gymBarcode ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Gym membership card"
          className="fixed inset-0 z-[96] flex flex-col items-center justify-center bg-white px-6 py-10"
        >
          <button
            type="button"
            className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 min-h-10 px-4 rounded-full border-[0.5px] border-black/15 text-[13px] font-medium text-black touch-manipulation"
            onClick={() => setGymCardOpen(false)}
          >
            Close
          </button>
          <div className="flex flex-col items-center justify-center flex-1 w-full max-w-md gap-6">
            {gymBarcode.gymName ? (
              <p className="text-[15px] font-medium text-black/70 text-center">{gymBarcode.gymName}</p>
            ) : null}
            {gymBarcodeRenderError ? (
              <p className="text-[13px] font-medium text-red-600 text-center">{gymBarcodeRenderError}</p>
            ) : (
              <canvas
                ref={gymBarcodeCanvasRef}
                className="max-w-full h-auto"
                aria-label="Membership barcode"
              />
            )}
            <p className="text-[22px] sm:text-[26px] font-medium tabular-nums text-black text-center tracking-wide break-all">
              {gymBarcode.number}
            </p>
          </div>
        </div>
      ) : null}

      {postWorkoutCheckinOpen ? (
        <PostWorkoutCheckinScreen
          open={postWorkoutCheckinOpen}
          todayKey={todayKey}
          trainingMode={endedSessionTrainingMode}
          onDone={finishPostWorkoutCheckin}
          onSkip={finishPostWorkoutCheckin}
        />
      ) : null}

      {moodCheckinOpen ? (
        <WorkoutMoodCheckinModal
          open={moodCheckinOpen}
          userId={userId}
          todayKey={todayKey}
          onClose={finishMoodCheckin}
          onComplete={finishMoodCheckin}
        />
      ) : null}

      <SleepLogSheet
        open={sleepSheetOpen}
        sleepHours={sleepHours}
        sleepMinutes={sleepMinutes}
        bedtime={sleepBedtime}
        wakeTime={sleepWakeTime}
        appleHealthHint={Boolean(appleHealthToday?.sleepMinutes && !sleepTodayLog)}
        onBedtimeChange={setSleepBedtime}
        onWakeTimeChange={setSleepWakeTime}
        onSleepHoursChange={setSleepHours}
        onSleepMinutesChange={setSleepMinutes}
        onClose={() => setSleepSheetOpen(false)}
        onLog={submitSleepLog}
      />

      <WaterLogSheet
        open={waterSheetOpen}
        waterTodayOz={waterTodayOz}
        waterGoalOz={waterGoalOz}
        customMode={waterCustomMode}
        customOz={waterCustomOz}
        onCustomMode={setWaterCustomMode}
        onCustomOzChange={setWaterCustomOz}
        onClose={() => setWaterSheetOpen(false)}
        onAddOz={addWaterFromSheet}
      />

    </div>
    </>
  )
}
