import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useWorkout, useWorkoutTick } from '../context/WorkoutContext'
import { dateKey, formatLong, getNow } from '../lib/dates'
import { formatDuration } from '../lib/timers'
import { progressiveOverloadBanner } from '../lib/overload'
import {
  getWeightedPrefillForExercise,
  isDeloadBannerDismissed,
  isDeloadWeekActive,
  shouldSuggestDeloadWeek,
} from '../lib/deload'
import {
  formatExerciseLastHistoryLine,
  formatLastSessionLine,
  type LastWeightedSetDefaults,
} from '../lib/lastSession'
import { AiWorkoutTemplatesSection } from './AiWorkoutTemplatesSection'
import { PLAN_PRESETS } from '../data/planPresets'
import { computeWeekSummary, isMondayMorningLocal, isSundayLocal } from '../lib/weekSummary'
import { ConfirmDialog } from './ConfirmDialog'
import { EditSetLogModal } from './EditSetLogModal'
import { GymModeView } from './GymModeView'
import { WorkoutInProgressView } from './WorkoutInProgressView'
import { LogSetModal } from './LogSetModal'
import { QuickLogModal } from './QuickLogModal'
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
import { sleepHoursFromHealthMinutes } from '../lib/appleHealth'
import { scheduledTrainingModeForDay, trainingModeDef } from '../lib/trainingMode'
import { TodayMoreQuickGrid } from './TodayMoreQuickGrid'
import { TodayMuscleBalanceSection, TodayWeeklyVolumeSection } from './TodayVolumeCharts'
import { TODAY_SECTION_LABELS } from '../lib/todayLayout'
import { requestNotificationPermission } from '../lib/desktopNotifications'
import { streakCurrent } from '../lib/achievements'
import { buildSessionSummaryExtras } from '../lib/sessionSummary'
import {
  formatSleepDuration,
  macroTotalsForDateKey,
  mealLogsForDateKey,
  sleepLogForDateKey,
  sleepWeeklyAverages,
  waterOzForDateKey,
  waterWeeklyAverageOz,
} from '../lib/stats'
import {
  DEFAULT_MACRO_GOAL_CALORIES,
  DEFAULT_MACRO_GOAL_CARBS_G,
  DEFAULT_MACRO_GOAL_FAT_G,
  DEFAULT_MACRO_GOAL_PROTEIN_G,
  DEFAULT_WATER_GOAL_OZ,
  WATER_LOG_INCREMENT_OZ,
} from '../types'
import {
  migrateDailyMotivationFromSession,
  readDailyMotivationForDay,
  readRecentDailyMotivationTexts,
  writeDailyMotivationForDay,
} from '../lib/dailyMotivation'
import { buildDailyMotivationInput, claudeParseMeal, fetchDailyMotivation } from '../lib/anthropicCoach'
import {
  readGymBarcode,
  renderGymBarcodeToCanvas,
  requestGymCardScreenWakeLock,
  type GymBarcodeStored,
} from '../lib/gymBarcode'
import { PostWorkoutStretchesCard, stretchSuggestionsForSummary } from './PostWorkoutStretchesCard'
import { SessionSummaryModal, type SessionSummaryData } from './SessionSummaryModal'
import { SpotifyPlayerCard } from './SpotifyPlayerCard'
import type { Exercise, SetLog, TodaySectionId, TodaySupersetPair } from '../types'

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

function timeToMsSinceMidnight(time: string): number {
  const [h, m] = time.split(':').map((x) => Number(x))
  return ((h || 0) * 3600 + (m || 0) * 60) * 1000
}

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

type PlanRow =
  | { kind: 'single'; id: string }
  | { kind: 'superset'; ids: [string, string] }

function buildPlanRows(ids: string[], pairs: TodaySupersetPair[]): PlanRow[] {
  const used = new Set<string>()
  const partnerOf = new Map<string, string>()
  for (const [a, b] of pairs) {
    partnerOf.set(a, b)
    partnerOf.set(b, a)
  }
  const rows: PlanRow[] = []
  for (const id of ids) {
    if (used.has(id)) continue
    const partner = partnerOf.get(id)
    if (partner && ids.includes(partner)) {
      const ordered: [string, string] =
        ids.indexOf(id) < ids.indexOf(partner) ? [id, partner] : [partner, id]
      rows.push({ kind: 'superset', ids: ordered })
      used.add(ordered[0])
      used.add(ordered[1])
    } else {
      rows.push({ kind: 'single', id })
      used.add(id)
    }
  }
  return rows
}

type PlanExerciseSwipeRowProps = {
  ex: Exercise
  lastHistoryLine?: string | null
  logged: boolean
  flash: boolean
  linkPickActive: boolean
  onSwipeLog: () => void
  onOpenLog: () => void
  onRemove: () => void
  onLongPress: () => void
  onTapWhileLinking: () => void
}

function PlanExerciseSwipeRow({
  ex,
  lastHistoryLine,
  logged,
  flash,
  linkPickActive,
  onSwipeLog,
  onOpenLog,
  onRemove,
  onLongPress,
  onTapWhileLinking,
}: PlanExerciseSwipeRowProps) {
  const rowRef = useRef<HTMLLIElement>(null)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const widthRef = useRef(280)

  useEffect(() => {
    if (rowRef.current) widthRef.current = rowRef.current.offsetWidth || 280
  }, [])

  function endDrag(clientX: number) {
    const dx = clientX - startX.current
    const w = widthRef.current
    if (dx >= w * 0.4) onSwipeLog()
    setOffset(0)
    setDragging(false)
  }

  const longPressTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)

  function onPointerDown(e: ReactPointerEvent) {
    if (linkPickActive) {
      onTapWhileLinking()
      return
    }
    if ((e.target as HTMLElement).closest('button')) return
    startX.current = e.clientX
    setDragging(true)
    if (rowRef.current) widthRef.current = rowRef.current.offsetWidth || 280
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!dragging || linkPickActive) return
    const dx = e.clientX - startX.current
    if (dx > 8) setOffset(Math.min(dx, widthRef.current))
    else if (dx < -4) setOffset(0)
  }

  function onPointerUp(e: ReactPointerEvent) {
    if (!dragging) return
    endDrag(e.clientX)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  return (
    <li
      ref={rowRef}
      className={`relative overflow-hidden transition-colors duration-150 ${
        flash ? 'bg-white/[0.15]' : ''
      } ${logged ? 'opacity-40' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault()
        onLongPress()
      }}
    >
      <div
        className="absolute inset-y-0 left-0 flex items-center overflow-hidden"
        style={{
          width: Math.max(offset, 0),
          background: 'rgba(255,255,255,0.08)',
        }}
        aria-hidden
      >
        <i
          className="ti ti-check shrink-0 ml-3 text-white text-[18px] leading-none"
          style={{ opacity: offset > 24 ? 1 : offset / 24 }}
        />
      </div>
      <div
        className={`flex items-center gap-3 px-4 py-3.5 bg-transparent touch-pan-y ${
          dragging ? '' : 'transition-transform duration-200 ease-out'
        }`}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={() => {
          longPressTimerRef.current = window.setTimeout(() => onLongPress(), 520)
        }}
        onTouchEnd={() => {
          if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current)
        }}
        onTouchMove={() => {
          if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current)
        }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-[#f0f0f2] truncate tracking-tight">{ex.name}</p>
          {lastHistoryLine ? (
            <p className="text-[11px] font-medium text-[#a0a0a8] mt-0.5 truncate">{lastHistoryLine}</p>
          ) : (
            <p className="text-[11px] font-medium text-[#a0a0a8] mt-0.5 uppercase tracking-wider">
              {ex.muscleGroup}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            className="apex-btn-primary rounded-[12px] min-h-10 px-3.5 text-[12px]"
            onClick={onOpenLog}
          >
            Log Set
          </button>
          <button
            type="button"
            className="text-[11px] font-normal text-red-500 px-1"
            onClick={onRemove}
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  )
}

function fmtCardioMin(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return 'No duration'
  return `${m} min`
}

type SectionEditShellProps = {
  label: string
  editing: boolean
  hidden: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onToggleHidden: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  dragging: boolean
  children: ReactNode
}

function SectionEditShell({
  label,
  editing,
  hidden,
  canMoveUp,
  canMoveDown,
  onToggleHidden,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  dragging,
  children,
}: SectionEditShellProps) {
  if (!editing) return children
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', label)
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`rounded-[20px] border-2 border-dashed p-3 transition-opacity ${
        hidden ? 'border-white/[0.12]' : 'border-white/[0.22]'
      } ${dragging ? 'opacity-60' : ''}`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#a0a0a8]">{label}</p>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            className="min-h-9 rounded-[10px] border border-white/[0.1] bg-[#141414] px-2.5 text-[12px] text-[#e0e0e0] disabled:opacity-35"
            disabled={!canMoveUp}
            onClick={onMoveUp}
          >
            Up
          </button>
          <button
            type="button"
            className="min-h-9 rounded-[10px] border border-white/[0.1] bg-[#141414] px-2.5 text-[12px] text-[#e0e0e0] disabled:opacity-35"
            disabled={!canMoveDown}
            onClick={onMoveDown}
          >
            Down
          </button>
          <button
            type="button"
            className="min-h-9 rounded-[10px] border border-white/[0.1] bg-[#141414] px-2.5 text-[12px] font-medium text-[#e0e0e0]"
            onClick={onToggleHidden}
          >
            {hidden ? 'Show' : 'Hide'}
          </button>
        </div>
      </div>
      {hidden ? (
        <p className="py-6 text-center text-[13px] font-medium text-[#a0a0a8]">
          Hidden on Today — tap Show to bring it back.
        </p>
      ) : (
        children
      )}
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
  planOpen,
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
    addPlanExercise,
    removePlanExercise,
    clearTodayPlan,
    saveTemplate,
    deleteTemplate,
    applyPresetPlan,
    loadTemplate,
    updateScheduleDay,
    linkSuperset,
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
    visibleExercises,
    resolveExerciseById,
    updateTodayLayout,
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

  const weekRecap = useMemo(() => computeWeekSummary(state, clock), [state, clock])
  const showSundayRecap = isSundayLocal(clock) && !isMondayMorningLocal(clock)
  const weekRecapEmpty =
    weekRecap.totalSets === 0 && weekRecap.totalVolumeLbs === 0 && weekRecap.prCount === 0

  const sched = state.schedule.find((d) => d.dateKey === todayKey)
  const planName = sched?.workoutName?.trim() ?? ''
  const isRestDay = !planName
  const headerDateLabel = useMemo(
    () =>
      new Date(clock).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
    [clock],
  )

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

  const [planSearch, setPlanSearch] = useState('')
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
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
  const [gymTime, setGymTime] = useState('09:00')
  const [gymManualOpen, setGymManualOpen] = useState(false)
  const [cardioName, setCardioName] = useState('')
  const [cardioManualMin, setCardioManualMin] = useState('')
  const [confirmCardioId, setConfirmCardioId] = useState<string | null>(null)
  const [sleepHoursDraft, setSleepHoursDraft] = useState('')
  const [sleepQualityDraft, setSleepQualityDraft] = useState<1 | 2 | 3 | 4 | 5>(3)

  const waterGoalOz = state.settings.waterGoalOz ?? DEFAULT_WATER_GOAL_OZ
  const waterTodayOz = useMemo(
    () => waterOzForDateKey(state, todayKey),
    [state.waterLogs, todayKey],
  )
  const waterWeeklyAvgOz = useMemo(() => waterWeeklyAverageOz(state, clock), [state.waterLogs, clock])
  const waterProgress = Math.min(1, waterGoalOz > 0 ? waterTodayOz / waterGoalOz : 0)

  const sleepTodayLog = useMemo(
    () => sleepLogForDateKey(state, todayKey),
    [state.sleepLogs, todayKey],
  )
  const sleepWeekly = useMemo(() => sleepWeeklyAverages(state, clock), [state.sleepLogs, clock])

  const appleHealthToday = useMemo(() => {
    const h = state.appleHealthToday
    if (!h || h.dateKey !== todayKey || !state.settings.appleHealthSyncEnabled) return null
    return h
  }, [state.appleHealthToday, state.settings.appleHealthSyncEnabled, todayKey])

  useEffect(() => {
    if (sleepTodayLog) {
      setSleepHoursDraft(String(Math.round((sleepTodayLog.durationMinutes / 60) * 100) / 100))
      setSleepQualityDraft(sleepTodayLog.quality)
      return
    }
    if (appleHealthToday?.sleepMinutes) {
      setSleepHoursDraft(sleepHoursFromHealthMinutes(appleHealthToday.sleepMinutes))
      setSleepQualityDraft(3)
      return
    }
    setSleepHoursDraft('')
    setSleepQualityDraft(3)
  }, [
    sleepTodayLog?.id,
    sleepTodayLog?.durationMinutes,
    sleepTodayLog?.quality,
    todayKey,
    appleHealthToday?.sleepMinutes,
  ])

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

  const [templateDeleteId, setTemplateDeleteId] = useState<string | null>(null)
  const [planRemoveId, setPlanRemoveId] = useState<string | null>(null)
  const [editLog, setEditLog] = useState<SetLog | null>(null)
  const [confirmDeleteSetId, setConfirmDeleteSetId] = useState<string | null>(null)
  const [confirmClearAllPlan, setConfirmClearAllPlan] = useState(false)
  const [quickLogOpen, setQuickLogOpen] = useState(false)
  const [moodCheckinOpen, setMoodCheckinOpen] = useState(false)
  const [postWorkoutCheckinOpen, setPostWorkoutCheckinOpen] = useState(false)
  const [endedSessionTrainingMode, setEndedSessionTrainingMode] = useState<
    import('../lib/trainingMode').TrainingMode | null
  >(null)
  const [gymCardOpen, setGymCardOpen] = useState(false)
  const [gymBarcodeRenderError, setGymBarcodeRenderError] = useState<string | null>(null)
  const gymBarcodeCanvasRef = useRef<HTMLCanvasElement>(null)
  const [layoutEditing, setLayoutEditing] = useState(false)
  const [flashPlanId, setFlashPlanId] = useState<string | null>(null)
  const [supersetLinkFrom, setSupersetLinkFrom] = useState<string | null>(null)
  const [planActionMenuId, setPlanActionMenuId] = useState<string | null>(null)
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
  const [dragId, setDragId] = useState<TodaySectionId | null>(null)

  const layout = state.todayLayout
  const hiddenSet = useMemo(() => new Set(layout.hidden), [layout.hidden])
  const orderedSectionIds = useMemo(() => {
    if (layoutEditing) return layout.order
    return layout.order.filter((id) => !hiddenSet.has(id))
  }, [layoutEditing, layout.order, hiddenSet])

  const moreSectionIds = useMemo(
    () => orderedSectionIds.filter((id) => id !== 'daily-motivation'),
    [orderedSectionIds],
  )

  const moreListSectionIds = useMemo(
    () =>
      moreSectionIds.filter((id) => layoutEditing || !MORE_QUICK_SECTION_IDS.includes(id)),
    [moreSectionIds, layoutEditing],
  )

  const [moreQuickPanel, setMoreQuickPanel] = useState<TodaySectionId | null>(null)

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

  const filteredAdd = useMemo(() => {
    const q = planSearch.trim().toLowerCase()
    return visibleExercises
      .filter((e) => !state.todayPlanExerciseIds.includes(e.id))
      .filter(
        (e) =>
          !q ||
          e.name.toLowerCase().includes(q) ||
          e.muscleGroup.toLowerCase().includes(q),
      )
      .slice(0, 40)
  }, [visibleExercises, planSearch, state.todayPlanExerciseIds])

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

  const planRows = useMemo(
    () => buildPlanRows(state.todayPlanExerciseIds, state.todaySupersetPairs ?? []),
    [state.todayPlanExerciseIds, state.todaySupersetPairs],
  )

  function flashPlanCard(planId: string) {
    setFlashPlanId(planId)
    window.setTimeout(() => setFlashPlanId(null), 150)
  }

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

  function toggleGymMode(enabled: boolean) {
    setGymModeEnabled(enabled)
    writeGymModeEnabled(enabled)
    if (enabled) {
      setGymModeStandardOnce(false)
    } else {
      setGymModeEnteredAt(null)
      setGymModeEditOpen(false)
    }
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
    flashPlanCard(ex.id)
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
    flashPlanCard(ex.id)
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
          flashPlanCard(next.id)
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

  function handlePlanLinkTap(targetId: string) {
    if (supersetLinkFrom && supersetLinkFrom !== targetId) {
      linkSuperset(supersetLinkFrom, targetId)
      setSupersetLinkFrom(null)
      return
    }
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

  function reorderSectionDrag(fromId: TodaySectionId, toId: TodaySectionId) {
    if (fromId === toId) return
    const o = [...layout.order]
    const from = o.indexOf(fromId)
    const to = o.indexOf(toId)
    if (from < 0 || to < 0) return
    const [item] = o.splice(from, 1)
    o.splice(to, 0, item!)
    updateTodayLayout({ ...layout, order: o })
  }

  function moveSectionStep(id: TodaySectionId, dir: -1 | 1) {
    const o = [...layout.order]
    const i = o.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= o.length) return
    ;[o[i], o[j]] = [o[j]!, o[i]!]
    updateTodayLayout({ ...layout, order: o })
  }

  function toggleSectionHidden(id: TodaySectionId) {
    const nextHidden = hiddenSet.has(id)
      ? layout.hidden.filter((h) => h !== id)
      : [...layout.hidden, id]
    updateTodayLayout({ ...layout, hidden: nextHidden })
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
        return <TodayWeeklyVolumeSection />
      case 'muscle-balance':
        return <TodayMuscleBalanceSection />
      case 'gym-tracker':
        return (
          <div className="apex-card flex flex-col gap-3 min-h-[158px]">
            <p className="apex-section-label">Gym</p>
            {!state.gymSession.active ? (
              <>
                <button
                  type="button"
                  className={`${btnNeutral} w-full text-[13px]`}
                  onClick={() => startGymSession('stopwatch')}
                >
                  Start stopwatch
                </button>
                {!gymManualOpen ? (
                  <button
                    type="button"
                    className="text-[12px] font-medium text-[#a0a0a8] underline-offset-2 hover:underline self-start"
                    onClick={() => setGymManualOpen(true)}
                  >
                    Enter time manually
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <input
                      type="time"
                      className={`${inp} w-full min-h-10`}
                      value={gymTime}
                      onChange={(e) => setGymTime(e.target.value)}
                    />
                    <button
                      type="button"
                      className={`${btnNeutral} w-full text-[13px]`}
                      onClick={() => startGymSession('manual', timeToMsSinceMidnight(gymTime))}
                    >
                      From time
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="apex-stat-num tabular-nums">{formatDuration(gymSec)}</p>
                <div className="flex flex-col gap-2 mt-auto">
                  {state.gymSession.pauseStartedAt ? (
                    <button type="button" className={`${btnNeutral} w-full`} onClick={resumeGymSession}>
                      Resume
                    </button>
                  ) : (
                    <button type="button" className={`${btnNeutral} w-full`} onClick={pauseGymSession}>
                      Pause
                    </button>
                  )}
                  <button type="button" className={`${btnNeutral} w-full`} onClick={endGym}>
                    End session
                  </button>
                </div>
              </>
            )}
          </div>
        )
      case 'cardio-tracker':
        return (
          <div className="space-y-4">
            <div className="apex-card p-4 flex flex-col gap-3 min-h-[158px]">
              <div className="flex items-center justify-between gap-2">
                <p className="apex-section-label">Cardio</p>
                {appleHealthToday?.restingHeartRateBpm != null ? <AppleHealthBadge /> : null}
              </div>
              {appleHealthToday?.restingHeartRateBpm != null ? (
                <p className="text-[28px] font-medium tabular-nums text-[#f4f4f5] leading-none">
                  {appleHealthToday.restingHeartRateBpm}
                  <span className="text-[14px] font-medium text-[#a0a0a8] ml-1">bpm resting</span>
                </p>
              ) : null}
              <p className="text-[12px] font-medium text-[#a0a0a8]">Session timer</p>
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
                  className="apex-btn-primary min-h-11 px-4 shrink-0 text-[13px] rounded-[14px]"
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
                      className="flex items-center justify-between gap-2 rounded-[14px] border border-white/[0.07] px-4 py-3 apex-card-interactive"
                    >
                      <div>
                        <p className="text-[13px] font-normal text-[#e0e0e0]">{c.name}</p>
                        <p className="text-[11px] text-[#a8a8b0]">{fmtCardioMin(c.durationMinutes)}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button type="button" className={btnNeutral} onClick={() => applyCardioTimerToEntry(c.id)}>
                          Timer
                        </button>
                        <button
                          type="button"
                          className="rounded-[12px] border border-red-900/50 bg-[#161616] min-h-10 px-3 text-[12px] text-red-500"
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
        return (
          <button
            type="button"
            className="apex-card p-5 w-full text-left touch-manipulation hover:border-white/[0.14] active:scale-[0.99] transition-transform"
            onClick={() => addWaterOz(WATER_LOG_INCREMENT_OZ)}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="apex-section-label">Water</p>
                <p className="mt-2 text-[28px] font-black tabular-nums text-[#f4f4f5] leading-none">
                  {waterTodayOz}
                  <span className="text-[14px] font-semibold text-[#a0a0a8] ml-1">/ {waterGoalOz} oz</span>
                </p>
              </div>
              <span className="rounded-full border border-white/[0.12] bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-[#ececee] shrink-0">
                +{WATER_LOG_INCREMENT_OZ} oz
              </span>
            </div>
            <div className="mt-4 h-2 rounded-full bg-[#1a1a1e] overflow-hidden border border-white/[0.05]">
              <div
                className="h-full rounded-full bg-[#ececee] transition-all duration-300"
                style={{ width: `${Math.round(waterProgress * 100)}%` }}
              />
            </div>
            <p className="mt-3 text-[12px] font-medium text-[#a0a0a8]">
              Tap to log {WATER_LOG_INCREMENT_OZ} oz · Avg {waterWeeklyAvgOz} oz/day this week
            </p>
          </button>
        )
      case 'sleep-tracker':
        return (
          <div className="apex-card p-5 space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="apex-section-label">Sleep</p>
                {appleHealthToday?.sleepMinutes ? <AppleHealthBadge /> : null}
              </div>
              <p className="text-[12px] font-medium text-[#a0a0a8] mt-1">
                {appleHealthToday?.sleepMinutes && !sleepTodayLog
                  ? 'Imported from Apple Health — adjust quality and save'
                  : "Log last night's rest"}
              </p>
            </div>
            {sleepTodayLog ? (
              <p className="text-[14px] font-medium text-[#ececee]">
                Logged · {formatSleepDuration(sleepTodayLog.durationMinutes)} · {sleepTodayLog.quality}/5 quality
                {appleHealthToday?.sleepMinutes ? (
                  <span className="text-[#a0a0a8]"> · synced from Health</span>
                ) : null}
              </p>
            ) : null}
            <div className="flex gap-2">
              <input
                inputMode="decimal"
                className={`min-h-11 flex-1 ${inp}`}
                placeholder="Hours slept"
                value={sleepHoursDraft}
                onChange={(e) => setSleepHoursDraft(e.target.value)}
              />
              <button
                type="button"
                className="apex-btn-primary min-h-11 px-4 shrink-0 text-[13px] font-semibold rounded-[14px]"
                onClick={() => {
                  const hours = Number(sleepHoursDraft)
                  if (!Number.isFinite(hours) || hours <= 0) return
                  logSleep(Math.round(hours * 60), sleepQualityDraft)
                  notify('Sleep logged')
                }}
              >
                Save
              </button>
            </div>
            <div>
              <p className="text-[11px] font-medium text-[#7d7d88] mb-2 uppercase tracking-wide">Quality</p>
              <div className="flex gap-2">
                {([1, 2, 3, 4, 5] as const).map((q) => {
                  const active = sleepQualityDraft === q
                  return (
                    <button
                      key={q}
                      type="button"
                      aria-label={`Sleep quality ${q} of 5`}
                      aria-pressed={active}
                      className={`flex-1 min-h-10 rounded-[12px] border text-[13px] font-semibold tabular-nums touch-manipulation ${
                        active
                          ? 'border-white/25 bg-white/[0.14] text-[#ececee]'
                          : 'border-white/[0.08] text-[#a0a0a8] hover:border-white/[0.14]'
                      }`}
                      onClick={() => setSleepQualityDraft(q)}
                    >
                      {q}
                    </button>
                  )
                })}
              </div>
            </div>
            <p className="text-[12px] font-medium text-[#a0a0a8] pt-1 border-t border-white/[0.06]">
              {sleepWeekly
                ? `Avg ${formatSleepDuration(sleepWeekly.durationMinutes)} · ${sleepWeekly.quality.toFixed(1)}/5 quality this week`
                : 'Log sleep to see your weekly average'}
            </p>
          </div>
        )
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
              <p className="text-[12px] font-medium text-[#a0a0a8] mt-1">Today&apos;s macros</p>
            </div>
            <div className="space-y-3">
              {macroRows.map((row) => {
                const pct = row.goal > 0 ? Math.min(1, row.current / row.goal) : 0
                return (
                  <div key={row.key}>
                    <div className="flex justify-between gap-2 text-[12px] font-medium mb-1.5">
                      <span className="text-[#a0a0a8]">{row.label}</span>
                      <span className="text-[#ececee] tabular-nums">
                        {row.current}
                        {row.unit} / {row.goal}
                        {row.unit}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#1a1a1e] overflow-hidden border border-white/[0.05]">
                      <div
                        className="h-full rounded-full bg-[#ececee] transition-all duration-300"
                        style={{ width: `${Math.round(pct * 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="space-y-2 pt-2 border-t border-white/[0.06]">
              <p className="text-[11px] font-medium text-[#7d7d88] uppercase tracking-wide">AI meal parser</p>
              <textarea
                className={`w-full min-h-16 px-3 py-2.5 resize-y ${inp}`}
                placeholder="e.g. 2 eggs, toast with butter, black coffee"
                value={mealAiText}
                onChange={(e) => setMealAiText(e.target.value)}
              />
              <button
                type="button"
                disabled={!mealAiText.trim() || mealAiBusy}
                className="apex-btn w-full min-h-10 text-[13px] font-semibold disabled:opacity-50"
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
              <p className="text-[11px] font-medium text-[#7d7d88] uppercase tracking-wide">Log meal</p>
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
                className="apex-btn-primary w-full min-h-11 text-[13px] font-semibold rounded-[14px]"
                onClick={submitMealDraft}
              >
                Add meal
              </button>
            </div>
            {mealsToday.length > 0 ? (
              <ul className="space-y-2 pt-2 border-t border-white/[0.06]">
                {mealsToday.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-start justify-between gap-2 rounded-[14px] border border-white/[0.07] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[#ececee] truncate">{m.name}</p>
                      <p className="text-[11px] font-medium text-[#a0a0a8] mt-1 tabular-nums">
                        {m.calories} cal · P {m.proteinG}g · C {m.carbsG}g · F {m.fatG}g
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-[12px] border border-red-900/50 bg-[#161616] min-h-9 px-3 text-[12px] text-red-500 shrink-0"
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
        return (
          <section className="apex-card overflow-hidden">
            <button
              type="button"
              className="w-full min-h-14 flex items-center justify-between px-5 py-3 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]"
              onClick={() => onPlanOpenChange(!planOpen)}
            >
              <span className="apex-section-title">My plan</span>
              <span className="text-[15px] font-light text-[#a0a0a8]">{planOpen ? '−' : '+'}</span>
            </button>
            {planOpen ? (
              <div className="px-5 pb-5 space-y-4 border-t border-white/[0.06] pt-4">
                <label className="flex items-center justify-between gap-4 min-h-14 px-4 rounded-[14px] border border-white/[0.08] bg-white/[0.03] touch-manipulation">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-[#f0f0f2]">Gym mode</p>
                    <p className="text-[12px] font-medium text-[#a0a0a8] mt-0.5 leading-snug">
                      Full-screen logging with large controls
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={gymModeEnabled}
                    onChange={(e) => toggleGymMode(e.target.checked)}
                    className="apex-checkbox scale-125 shrink-0"
                    aria-label="Enable gym mode"
                  />
                </label>
                {gymModeEnabled && state.todayPlanExerciseIds.length > 0 ? (
                  <button
                    type="button"
                    className="apex-btn-primary w-full min-h-14 rounded-[14px] text-[15px] font-semibold touch-manipulation"
                    onClick={() => {
                      const first =
                        state.todayPlanExerciseIds
                          .map((id) => resolveExerciseById(id))
                          .find((ex): ex is Exercise => Boolean(ex)) ?? null
                      if (first) enterGymMode(first)
                    }}
                  >
                    Open gym mode
                  </button>
                ) : null}
                <AiWorkoutTemplatesSection enabled={planOpen} />
                <p className="apex-section-label">Quick presets</p>
                <div className="grid grid-cols-2 gap-3">
                  {PLAN_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="rounded-[18px] border border-white/[0.07] bg-white/[0.03] apex-card-interactive p-4 text-left min-h-[6rem]"
                      onClick={() => applyPresetPlan(p.exerciseIds)}
                    >
                      <p className="text-[15px] font-semibold text-[#f0f0f2] leading-tight tracking-tight">
                        {p.title}
                      </p>
                      <p className="text-[11px] text-[#8e8e96] mt-2 leading-snug font-medium">{p.subtitle}</p>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={`${btnNeutral} w-full min-h-11 text-[13px]`}
                  onClick={() => setTemplatesOpen(true)}
                >
                  My templates
                </button>
                <div className="relative">
                  <p className="apex-section-label mb-2">Add exercise</p>
                  <input
                    className={`w-full min-h-11 ${inp}`}
                    placeholder="Search exercises to add"
                    value={planSearch}
                    onChange={(e) => setPlanSearch(e.target.value)}
                    autoComplete="off"
                  />
                  {planSearch.trim() ? (
                    <ul className="absolute z-20 left-0 right-0 mt-2 max-h-48 overflow-y-auto rounded-[14px] border border-white/[0.08] bg-[var(--apex-surface-card)]">
                      {filteredAdd.length === 0 ? (
                        <li className="px-4 py-3 text-[13px] text-[#a0a0a8]">No matches</li>
                      ) : (
                        filteredAdd.map((e) => (
                          <li key={e.id}>
                            <button
                              type="button"
                              className="w-full min-h-12 text-left px-4 text-[14px] font-medium text-[#ececee] hover:bg-white/[0.06] active:scale-[0.99] transition-colors"
                              onClick={() => {
                                addPlanExercise(e.id)
                                setPlanSearch('')
                              }}
                            >
                              <span className="block">{e.name}</span>
                              {formatExerciseLastHistoryLine(
                                state.setLogs,
                                e.id,
                                state.settings.unit,
                              ) ? (
                                <span className="block text-[11px] font-medium text-[#a8a8b0] mt-0.5">
                                  {formatExerciseLastHistoryLine(
                                    state.setLogs,
                                    e.id,
                                    state.settings.unit,
                                  )}
                                </span>
                              ) : (
                                <span className="text-[#a8a8b0]"> · {e.muscleGroup}</span>
                              )}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                </div>

                {supersetLinkFrom ? (
                  <p className="text-[12px] font-medium text-[#a0a0a8] mb-2">
                    Tap a second exercise to link as superset
                  </p>
                ) : null}

                <ul className="space-y-3">
                  {planRows.map((row) => {
                    if (row.kind === 'single') {
                      const ex = resolveExerciseById(row.id)
                      if (!ex) return null
                      const logged = todaysLogs.some((l) => l.exerciseId === row.id)
                      return (
                        <div
                          key={row.id}
                          className="border border-white/[0.08] rounded-[16px] overflow-hidden"
                        >
                          <ul className="divide-y divide-white/[0.06]">
                            <PlanExerciseSwipeRow
                              ex={ex}
                              lastHistoryLine={formatExerciseLastHistoryLine(
                                state.setLogs,
                                ex.id,
                                state.settings.unit,
                              )}
                              logged={logged}
                              flash={flashPlanId === row.id}
                              linkPickActive={!!supersetLinkFrom}
                              onSwipeLog={() => swipeQuickLog(ex)}
                              onOpenLog={() => openExerciseLog(ex)}
                              onRemove={() => setPlanRemoveId(row.id)}
                              onLongPress={() => setPlanActionMenuId(row.id)}
                              onTapWhileLinking={() => handlePlanLinkTap(row.id)}
                            />
                          </ul>
                        </div>
                      )
                    }
                    const exA = resolveExerciseById(row.ids[0])
                    const exB = resolveExerciseById(row.ids[1])
                    if (!exA || !exB) return null
                    return (
                      <li
                        key={`${row.ids[0]}-${row.ids[1]}`}
                        className="rounded-[12px] p-3"
          style={{
                          background: 'var(--apex-surface-nested)',
                          border: '0.5px solid var(--apex-border)',
                        }}
                      >
                        <div className="flex items-center gap-2 mb-2 min-w-0">
                          <p className="flex-1 min-w-0 text-[14px] font-semibold text-[#f0f0f2] truncate">
                            {exA.name}
                          </p>
                          <span
                            className="shrink-0 text-[9px] font-normal uppercase tracking-wider"
                            style={{
                              color: 'rgba(255,255,255,0.4)',
                              border: '0.5px solid rgba(255,255,255,0.2)',
                              borderRadius: 4,
                              padding: '2px 5px',
                              background: 'transparent',
                            }}
                          >
                            SS
                          </span>
                          <p className="flex-1 min-w-0 text-[14px] font-semibold text-[#f0f0f2] truncate text-right">
                            {exB.name}
                          </p>
                        </div>
                        <div
                          className="mb-2"
                          style={{ height: 0.5, background: 'rgba(255,255,255,0.1)' }}
                        />
                        <ul className="divide-y divide-white/[0.06]">
                          {[exA, exB].map((ex) => {
                            const logged = todaysLogs.some((l) => l.exerciseId === ex.id)
                            return (
                              <PlanExerciseSwipeRow
                                key={ex.id}
                                ex={ex}
                                lastHistoryLine={formatExerciseLastHistoryLine(
                                  state.setLogs,
                                  ex.id,
                                  state.settings.unit,
                                )}
                                logged={logged}
                                flash={flashPlanId === ex.id}
                                linkPickActive={!!supersetLinkFrom}
                                onSwipeLog={() => swipeQuickLog(ex)}
                                onOpenLog={() => openExerciseLog(ex)}
                                onRemove={() => setPlanRemoveId(ex.id)}
                                onLongPress={() => setPlanActionMenuId(ex.id)}
                                onTapWhileLinking={() => handlePlanLinkTap(ex.id)}
                              />
                            )
                          })}
                        </ul>
                      </li>
                    )
                  })}
                </ul>

                {planActionMenuId ? (
                  <div
                    role="presentation"
                    className="fixed inset-0 z-[62] flex items-end justify-center p-4 bg-black/50"
                    onClick={() => setPlanActionMenuId(null)}
                  >
                    <div
                      className="w-full max-w-sm apex-card p-4 space-y-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="apex-btn w-full min-h-11 text-[13px]"
                        onClick={() => {
                          setSupersetLinkFrom(planActionMenuId)
                          setPlanActionMenuId(null)
                        }}
                      >
                        Link as superset
                      </button>
                      <button
                        type="button"
                        className="apex-btn-muted w-full min-h-11 text-[13px]"
                        onClick={() => setPlanActionMenuId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {state.todayPlanExerciseIds.length > 0 ? (
                  <button
                    type="button"
                    className="w-full min-h-11 rounded-[12px] border border-red-900/45 bg-[#121212] text-[13px] font-normal text-red-400"
                    onClick={() => setConfirmClearAllPlan(true)}
                  >
                    Clear all
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        )
      case 'todays-log':
        return (
          <section>
            <h2 className="apex-page-sub mb-1">Session</h2>
            <p className="text-xl font-bold text-[#f4f4f5] tracking-tight mb-4">Today&apos;s log</p>
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
                      <p className="text-[15px] font-semibold text-[#f0f0f2] min-w-0 tracking-tight">
                        {l.exerciseName}
                      </p>
                    </div>
                    {l.isPr ? (
                      <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-black">
                        PR
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[14px] font-medium text-[#c8c8ce] mt-2">
                    {l.kind === 'weighted'
                      ? `${l.bodyweight ? 'Bodyweight' : `${l.weight ?? 0} ${state.settings.unit}`} × ${l.reps} · ${l.sets} sets`
                      : `${l.durationSec}s timed`}
                  </p>
                  {l.note ? <p className="text-[12px] text-[#a0a0a8] mt-2 leading-relaxed">{l.note}</p> : null}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                    <p className="apex-section-label opacity-80">
                      {new Date(l.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        className="apex-btn-primary min-h-9 rounded-[12px] px-3 text-[12px]"
                        onClick={() => {
                          setEditLog(l)
                          setLogTarget(null)
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="apex-btn min-h-9 rounded-[12px] border-red-500/35 bg-red-950/20 px-3 text-[12px] font-medium text-red-400"
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
                    <p className="text-[14px] font-medium text-[#a0a0a8]">No sets logged yet today.</p>
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
      <header className="apex-card px-6 py-6 relative">
        <button
          type="button"
          className="absolute top-4 right-4 z-[1] flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/[0.12] bg-black/30 text-[#ececee] touch-manipulation active:scale-[0.98]"
          aria-label={
            gymBarcode ? 'Open gym membership barcode' : 'Set up gym membership barcode'
          }
          onClick={() => {
            const saved = readGymBarcode()
            setGymBarcode(saved)
            if (saved) {
              setGymCardOpen(true)
            } else {
              onOpenGymMembershipSetup?.()
            }
          }}
        >
          <i className="ti ti-barcode text-[20px] leading-none" aria-hidden />
        </button>
        <div className="apex-today-header-meta pr-14" aria-label="Today">
          <span>{headerDateLabel}</span>
          <span className="apex-today-header-meta__sep" aria-hidden>
            ·
          </span>
          <span className="tabular-nums">
            {streakDays} day{streakDays === 1 ? '' : 's'} streak
          </span>
        </div>
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
            <span className="apex-today-btn-workout__arrow" aria-hidden>
              →
            </span>
          </button>
        </div>
      </header>

      {state.gymSession.active ? (
        <div
          className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-white/[0.1] bg-[var(--apex-surface-page)]/95 backdrop-blur-md px-4 py-3 -mt-px"
          role="status"
          aria-live="polite"
        >
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#a0a0a8]">
              Gym session
            </p>
            <p className="text-[1.75rem] font-black tabular-nums text-[#f4f4f5] leading-none tracking-tight">
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
              className="apex-btn-primary min-h-11 px-4 text-[13px] font-semibold touch-manipulation"
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
          <p className="mt-2 text-[14px] font-medium text-[#ececee] leading-relaxed">
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

      {sectionBody('daily-motivation')}

      <div className="apex-today-more">
        <div className="apex-today-more__head">
          <p className="apex-today-more__label">More</p>
          <span className="apex-today-more__week">This week</span>
        </div>

        <TodayMoreQuickGrid
          activeId={moreQuickPanel}
          onSelect={(id) => setMoreQuickPanel((p) => (p === id ? null : id))}
        />

        {moreQuickPanel && !layoutEditing ? (
          <div className="apex-today-more__panel">{sectionBody(moreQuickPanel)}</div>
        ) : null}

        <div className="apex-tab-stack">
      {showSundayRecap ? (
        <div className="apex-card px-5 py-5 ">
          <p className="text-[0.8125rem] font-medium text-[#7d7d88] mb-1">Sunday week recap</p>
          <h2 className="text-lg font-bold text-[#f4f4f5] tracking-tight">This week · {weekRecap.weekLabel}</h2>
          {weekRecapEmpty ? (
            <p className="mt-4 text-[14px] font-medium text-[#a0a0a8] leading-relaxed">
              Start logging to see your week take shape
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {weekRecap.totalSets > 0 ? (
                <div className="rounded-[12px] border border-white/[0.06] px-3 py-3">
                  <p className="text-[0.75rem] font-medium text-[#7d7d88]">Sets</p>
                  <p className="mt-1 text-xl font-black tabular-nums text-[#ececee]">{weekRecap.totalSets}</p>
                </div>
              ) : null}
              {weekRecap.totalVolumeLbs > 0 ? (
                <div className="rounded-[12px] border border-white/[0.06] px-3 py-3">
                  <p className="text-[0.75rem] font-medium text-[#7d7d88]">Volume</p>
                  <p className="mt-1 text-xl font-black tabular-nums text-[#ececee]">
                    {weekRecap.totalVolumeLbs.toLocaleString()} lb
                  </p>
                </div>
              ) : null}
              {weekRecap.muscleGroups.length > 0 ? (
                <div
                  className={`rounded-[12px] border border-white/[0.06] px-3 py-3 ${
                    weekRecap.totalSets > 0 && weekRecap.totalVolumeLbs > 0 ? 'col-span-2' : ''
                  }`}
                >
                  <p className="text-[0.75rem] font-medium text-[#7d7d88]">Muscle groups</p>
                  <p className="mt-1 text-[13px] font-semibold text-[#c8c8ce] leading-snug">
                    {weekRecap.muscleGroups.join(', ')}
                  </p>
                </div>
              ) : null}
              {weekRecap.prCount > 0 ? (
                <div className="rounded-[12px] border border-white/[0.06] px-3 py-3 col-span-2">
                  <p className="text-[0.75rem] font-medium text-[#7d7d88]">PRs hit</p>
                  <p className="mt-1 text-xl font-black tabular-nums text-[#ececee]">{weekRecap.prCount}</p>
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
        <div className="apex-card px-5 py-4 border border-amber-500/20 bg-amber-950/15">
          <p className="apex-section-label mb-2">Recovery</p>
          <p className="apex-lead text-[14px] leading-relaxed">
            Your body may benefit from a deload this week — volume has climbed for several weeks in
            a row.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              className="apex-btn-primary min-h-11 px-4 text-[13px] font-semibold rounded-[12px]"
              onClick={() => applyDeloadWeek()}
            >
              Generate lighter workout
            </button>
            <button
              type="button"
              className="apex-btn min-h-11 px-4 text-[13px] rounded-[12px]"
              onClick={() => dismissDeloadSuggestion()}
            >
              Not this week
            </button>
          </div>
          <p className="mt-3 text-[11px] font-medium text-[#9898a0] leading-relaxed">
            Keeps the same exercises and reps; logging prefills at 60% of your last weights (−40%).
          </p>
        </div>
      ) : null}

      {deloadWeekActive ? (
        <div className="apex-card px-5 py-3 border border-white/[0.08]">
          <p className="text-[13px] font-medium text-[#c8c8ce] leading-relaxed">
            <span className="font-semibold text-[#ececee]">Deload week active.</span> Same plan and
            reps — weights prefill at 60% of your last session.
          </p>
        </div>
      ) : null}

      {state.onboardingComplete && !state.notificationPromptDone ? (
        <div className="apex-card p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border border-white/[0.08]">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#a0a0a8] mb-1.5">Stay in the loop</p>
            <p className="text-[14px] font-medium text-[#d4d4d8] leading-snug">
              Enable notifications for Sunday evening week summaries and when your rest timer finishes while Apex is in the background.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              className="apex-btn-primary min-h-11 px-4 shrink-0 text-[13px] rounded-[14px]"
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

      <div className="flex justify-end">
        <button
          type="button"
          className={`${btnNeutral} min-h-10 ${layoutEditing ? 'border-white/20 text-white' : ''}`}
          onClick={() => {
            setLayoutEditing((v) => !v)
            setDragId(null)
          }}
        >
          {layoutEditing ? 'Done editing' : 'Edit layout'}
        </button>
      </div>

      {layoutEditing ? (
        <p className="text-[12px] font-medium text-[#a0a0a8] -mt-5 text-right">
          Drag a section onto another to reorder. Use Hide to remove blocks from Today.
        </p>
      ) : null}

      <div className="apex-tab-stack">
        {moreListSectionIds.map((sid) => {
          const label = TODAY_SECTION_LABELS[sid]
          const hidden = hiddenSet.has(sid)
          const idx = layout.order.indexOf(sid)
          const body = layoutEditing && hidden ? null : sectionBody(sid)
          return (
            <div key={sid}>
              {layoutEditing ? (
                <SectionEditShell
                  label={label}
                  editing={layoutEditing}
                  hidden={hidden}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < layout.order.length - 1}
                  onToggleHidden={() => toggleSectionHidden(sid)}
                  onMoveUp={() => moveSectionStep(sid, -1)}
                  onMoveDown={() => moveSectionStep(sid, 1)}
                  onDragStart={() => setDragId(sid)}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => {
                    if (layoutEditing) e.preventDefault()
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragId && dragId !== sid) reorderSectionDrag(dragId, sid)
                    setDragId(null)
                  }}
                  dragging={dragId === sid}
                >
                  {body}
                </SectionEditShell>
              ) : (
                body
              )}
            </div>
          )
        })}
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

      {templatesOpen ? (
        <div
          role="presentation"
          className="apex-modal-overlay fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
          onClick={() => setTemplatesOpen(false)}
        >
          <div
            className="w-full max-w-md apex-card p-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <h3 className="apex-section-label">Templates</h3>
              <button
                type="button"
                className="min-h-10 min-w-10 rounded-[12px] border border-[#1e1e1e] bg-[#121212] text-[#e0e0e0]"
                onClick={() => setTemplatesOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className={`min-h-11 flex-1 ${inp}`}
                placeholder="Template name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
              <button
                type="button"
                className={`${btnNeutral} min-h-11 px-4`}
                onClick={() => {
                  saveTemplate(templateName)
                  setTemplateName('')
                }}
              >
                Save
              </button>
            </div>
            <ul className="mt-4 space-y-2">
              {state.templates.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-[12px] border border-[#1e1e1e] bg-[#121212] p-3"
                >
                  <div>
                    <p className="text-[13px] font-normal text-[#e0e0e0]">{t.name}</p>
                    <p className="text-[11px] text-[#a8a8b0]">{t.exerciseIds.length} exercises</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className={btnNeutral} onClick={() => loadTemplate(t.id)}>
                      Load
                    </button>
                    <button
                      type="button"
                      className="rounded-[12px] border border-red-900/50 min-h-10 px-3 text-[12px] text-red-500"
                      onClick={() => setTemplateDeleteId(t.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

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
        open={confirmClearAllPlan}
        title="Clear today's plan?"
        message="Remove every exercise from My Plan. Your logged sets and templates are not deleted."
        confirmLabel="Clear all"
       
        destructive
        onCancel={() => setConfirmClearAllPlan(false)}
        onConfirm={() => {
          clearTodayPlan()
          setConfirmClearAllPlan(false)
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

      <ConfirmDialog
        open={!!templateDeleteId}
        title="Delete template?"
        message="This template will be removed permanently."
        confirmLabel="Delete"
       
        onCancel={() => setTemplateDeleteId(null)}
        onConfirm={() => {
          if (templateDeleteId) deleteTemplate(templateDeleteId)
          setTemplateDeleteId(null)
        }}
      />

      <ConfirmDialog
        open={!!planRemoveId}
        title="Remove from plan?"
        message="This exercise will be removed from today's plan."
        confirmLabel="Remove"
       
        onCancel={() => setPlanRemoveId(null)}
        onConfirm={() => {
          if (planRemoveId) removePlanExercise(planRemoveId)
          setPlanRemoveId(null)
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
            className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 min-h-10 px-4 rounded-full border border-black/15 text-[13px] font-semibold text-black touch-manipulation"
            onClick={() => setGymCardOpen(false)}
          >
            Close
          </button>
          <div className="flex flex-col items-center justify-center flex-1 w-full max-w-md gap-6">
            {gymBarcode.gymName ? (
              <p className="text-[15px] font-semibold text-black/70 text-center">{gymBarcode.gymName}</p>
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
            <p className="text-[22px] sm:text-[26px] font-bold tabular-nums text-black text-center tracking-wide break-all">
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

      {quickLogOpen ? <QuickLogModal onClose={() => setQuickLogOpen(false)} /> : null}

      {!state.gymSession.active && !useGymModeView && !postWorkoutCheckinOpen ? (
      <button
        type="button"
        aria-label="Quick log a set"
        className="apex-fab fixed z-[56] flex h-14 w-14 items-center justify-center rounded-full bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-5 transition-transform active:scale-90 touch-manipulation"
        onClick={() => {
          setQuickLogOpen(true)
          setLogTarget(null)
          setEditLog(null)
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </button>
      ) : null}
    </div>
    </>
  )
}
