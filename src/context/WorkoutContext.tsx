import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { EXERCISES } from '../data/exercises'
import { applyWorkoutHistorySeedIfNeeded } from '../data/seedWorkoutHistory'
import { normalizeImportedSetLogs } from '../lib/parseWorkoutImport'
import { clearStoredTokens } from '../lib/googleCalendar'
import {
  APEX_COACH_INIT_FLAG,
  alignScheduleWeek,
  clearAllAppData,
  coachWelcomeMessages,
  loadState,
  migrateCustomExercises,
  setOnboardingCompleteLocal,
  normalizeCoachChatMessages,
  normalizeImportedCardio,
  redactLeakedApiMetadataFromText,
  limitCoachReplySentences,
  sanitizeCoachBubbleText,
  isCoachUiPromptLine,
  isAppOnline,
  OFFLINE_SYNC_TOAST,
  saveState,
  stripNotificationMessage,
  writePostWorkoutCheckinEnabled,
} from '../lib/persist'
import { dateKey, weekStartMonday } from '../lib/dates'
import { computeWeekSummary } from '../lib/weekSummary'
import { normalizeTodayLayout } from '../lib/todayLayout'
import {
  POST_WORKOUT_PROTEIN_DELAY_MS,
  POST_WORKOUT_PROTEIN_MEAL_LOOKBACK_MS,
  POST_WORKOUT_PROTEIN_MESSAGE,
  showGymArrivalNotification,
  showGymLeaveNotification,
  showPostWorkoutProteinNotification,
  showWeeklySummaryNotification,
} from '../lib/desktopNotifications'
import { startGymGeofenceWatch } from '../lib/gymLocation'
import { hasMealLoggedWithin } from '../lib/stats'
import { beatsStoredWeightPr, computeIsPr } from '../lib/pr'
import { evaluateAchievements, streakCurrent } from '../lib/achievements'
import { scheduledTrainingModeForDay, type TrainingMode } from '../lib/trainingMode'
import { detectStreakShieldConsumption } from '../lib/streakShield'
import { cardioElapsedMs, gymElapsedMs } from '../lib/timers'
import { preserveLocalOnlyFields } from '../lib/cycleTracking'
import { equipmentForExercise } from '../lib/equipment'
import { pickDeloadExerciseIds } from '../lib/deload'
import { saveExerciseLastWeight } from '../lib/exerciseLastWeight'
import {
  buildSchedulePatchesFromTemplate,
  todayPlanIdsFromTemplate,
  type AiWeeklyWorkoutTemplate,
} from '../lib/aiWorkoutTemplates'
import { buildTendedUserStateDaySnapshot, syncTendedUserStateSnapshots } from '../lib/tendedUserState'
import { currentWeekStartKey } from '../lib/volumeStats'
import {
  hapticOnSetLogged,
  hapticOnWorkoutComplete,
} from '../lib/haptics'
import { touchAiIntelligenceUpdated } from '../lib/aiIntelligenceStatus'
import {
  estimateWorkoutCaloriesKcal,
  gymSessionStartedAtMs,
  isAppleHealthAvailable,
  readAppleHealthTodayMetrics,
  requestAppleHealthAuthorization,
  shouldAutoFillSleepFromHealth,
  writeGymSessionToAppleHealth,
} from '../lib/appleHealth'
import { applyTrainerShareToState, syncTrainerShareFromState } from '../lib/trainer'
import {
  completeWorkoutSession,
  ensureFriendProfile,
  fetchLatestCoachNoteForClient,
  fetchTendedOnboardingComplete,
  fetchTendedPostWorkoutCheckin,
  fetchUserWorkoutState,
  upsertTendedOnboardingComplete,
  upsertTendedUserState,
  updateLatestWorkoutSessionRatings,
  insertDeloadWeekEvent,
  pickWorkoutStateForHydrate,
  supabase,
  upsertLeaderboardEntry,
  upsertUserWorkoutState,
} from '../lib/supabase'
import { XP_PER_PR, XP_PER_SET, XP_PER_WORKOUT_COMPLETE } from '../lib/xpLevel'
import { weeklyVolumeLoadByMuscleLbs } from '../lib/volumeStats'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import type {
  AppPersisted,
  CardioEntry,
  ChatMessage,
  CoachChatImage,
  Exercise,
  FriendEntry,
  MuscleGroup,
  PrCelebrationData,
  ScheduleDay,
  SetLog,
  SetLogEditPayload,
  Settings,
  ReadinessLogEntry,
  TimedSetLog,
  TodayLayoutPersist,
  TodaySupersetPair,
  WeightedSetLog,
  PostWorkoutCheckinLogEntry,
  WorkoutMoodLogEntry,
  WorkoutTemplate,
} from '../types'
type Notification = { id: string; message: string }

type TickCtx = {
  clock: number
  cardioElapsedMs: number
  gymElapsedMs: number
}

type Ctx = {
  userId: string
  state: AppPersisted
  visibleExercises: Exercise[]
  todayKey: string
  notifications: Notification[]
  notify: (message: string, durationMs?: number) => void
  dismissNotification: (id: string) => void
  dismissRestTimer: () => void
  prCelebration: PrCelebrationData | null
  dismissPrCelebration: () => void
  gymSpotifyPromptOpen: boolean
  dismissGymSpotifyPrompt: () => void
  addSetLog: (
    partial: Omit<WeightedSetLog, 'id' | 'at' | 'isPr'> | Omit<TimedSetLog, 'id' | 'at' | 'isPr'>,
    options?: { deferRestTimer?: boolean; skipRestTimer?: boolean },
  ) => void
  linkSuperset: (exerciseIdA: string, exerciseIdB: string) => void
  getSupersetPartner: (exerciseId: string) => string | null
  addCardioEntry: (name: string, durationMinutes: number | null) => void
  completeOnboarding: (opts?: { markHealthPromptDone?: boolean }) => void
  resetAppData: () => Promise<void>
  startCardioTimer: () => void
  pauseCardioTimer: () => void
  resetCardioTimer: () => void
  applyCardioTimerToEntry: (entryId: string) => void
  startGymSession: (
    mode: 'stopwatch' | 'manual',
    manualMsSinceMidnight?: number,
    trainingMode?: TrainingMode | null,
  ) => void
  pauseGymSession: () => void
  resumeGymSession: () => void
  stopGymSession: () => Promise<void>
  addPlanExercise: (exerciseId: string) => void
  removePlanExercise: (exerciseId: string) => void
  clearTodayPlan: () => void
  saveTemplate: (name: string) => void
  deleteTemplate: (id: string) => void
  loadTemplate: (id: string) => void
  applyPresetPlan: (exerciseIds: string[]) => void
  applyAiWeeklyTemplate: (template: AiWeeklyWorkoutTemplate) => void
  applyCoachPlanToToday: (exerciseIds: string[]) => void
  updateScheduleDay: (dateKeyVal: string, patch: Partial<ScheduleDay>) => void
  batchPatchSchedule: (patches: { dateKey: string; patch: Partial<ScheduleDay> }[]) => void
  disconnectGoogleCalendar: () => void
  updateSettings: (patch: Partial<Settings>) => void
  setCycleStartDateKey: (dateKeyVal: string) => void
  pushChat: (
    role: 'user' | 'model',
    text: string,
    opts?: { workoutPlan?: boolean; image?: CoachChatImage },
  ) => void
  clearChat: () => void
  hideExercise: (exerciseId: string) => void
  resolveExerciseById: (exerciseId: string) => Exercise | null
  addCustomExercise: (
    name: string,
    muscleGroup: MuscleGroup,
    gifUrl?: string,
    help?: { formTips: string; commonMistakes: string; beginnerAdvice: string },
  ) => void
  dismissBurnoutWarnings: () => void
  applyDeloadWeek: () => void
  dismissDeloadSuggestion: () => void
  toggleFavoriteExercise: (exerciseId: string) => void
  addBodyweight: (value: number) => void
  saveDailyCheckin: (dateKey: string, weightLbs: number | null, foodNote: string) => void
  addWaterOz: (oz?: number) => void
  logSleep: (durationMinutes: number, quality: number) => void
  logReadinessCheck: (entry: Omit<ReadinessLogEntry, 'at'> & { at?: number }) => void
  logWorkoutMoodCheckin: (entry: Omit<WorkoutMoodLogEntry, 'at'> & { at?: number }) => void
  logPostWorkoutCheckin: (
    entry: Omit<PostWorkoutCheckinLogEntry, 'at'> & { at?: number },
  ) => void
  addMealLog: (meal: {
    name: string
    calories: number
    proteinG: number
    carbsG: number
    fatG: number
  }) => void
  deleteMealLog: (id: string) => void
  mergeImport: (partial: Partial<AppPersisted>, options?: { silent?: boolean }) => void
  deleteSetLog: (id: string) => void
  updateSetLog: (id: string, payload: SetLogEditPayload) => void
  deleteCardio: (id: string) => void
  deleteBodyweight: (id: string) => void
  buildTodayShareText: () => string
  addFriend: (username: string, weeklySets: number) => void
  removeFriend: (id: string) => void
  setFriendWeeklySets: (id: string, weeklySets: number) => void
  updateTodayLayout: (layout: TodayLayoutPersist) => void
  completeNotificationPrompt: () => void
  appleHealthAvailable: boolean
  syncAppleHealth: () => Promise<void>
  enableAppleHealthSync: () => Promise<void>
  coachNote: string | null
  refreshCoachNote: () => Promise<void>
}

const WorkoutContext = createContext<Ctx | null>(null)
const WorkoutTickContext = createContext<TickCtx | null>(null)
const WIDGET_GROUP = 'group.com.arnav.apex'
const WIDGET_MUSCLES = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'] as const

function buildWidgetVolumeBalance(state: AppPersisted, nowMs: number): Record<string, number> {
  const vols = weeklyVolumeLoadByMuscleLbs(state, nowMs)
  const maxVol = Math.max(1, ...WIDGET_MUSCLES.map((muscle) => vols[muscle] ?? 0))
  const out: Record<string, number> = {}
  for (const muscle of WIDGET_MUSCLES) {
    const ratio = (vols[muscle] ?? 0) / maxVol
    out[muscle] = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0))
  }
  return out
}

function buildWidgetPayload(state: AppPersisted, nowMs: number, todayKey: string) {
  const ws = weekStartMonday(new Date(nowMs))
  const we = new Date(ws)
  we.setDate(ws.getDate() + 7)
  const setLogsThisWeek = state.setLogs.filter((l) => {
    const at = new Date(l.at)
    return at >= ws && at < we
  })
  const sessionDays = new Set(setLogsThisWeek.map((l) => dateKey(new Date(l.at))))
  const todayHasWorkout = state.setLogs.some((l) => dateKey(new Date(l.at)) === todayKey)
  const streakCount = Math.max(0, streakCurrent(state, nowMs))
  const volumeByMuscle = weeklyVolumeLoadByMuscleLbs(state, nowMs)
  const weeklyVolume = Math.round(
    WIDGET_MUSCLES.reduce((sum, muscle) => sum + (volumeByMuscle[muscle] ?? 0), 0),
  )

  const todayIndex = state.schedule.findIndex((d) => d.dateKey === todayKey)
  const scheduleWithFallback =
    todayIndex >= 0
      ? [...state.schedule.slice(todayIndex), ...state.schedule.slice(0, todayIndex)]
      : state.schedule
  const nextPlanned = scheduleWithFallback.find(
    (d) => d.workoutName.trim().length > 0 || (d.plannedExerciseIds?.length ?? 0) > 0,
  )
  const allExercises = [...EXERCISES, ...state.customExercises]
  const nextWorkoutTags = (nextPlanned?.plannedExerciseIds ?? [])
    .map((id) => allExercises.find((e) => e.id === id)?.name?.trim())
    .filter((name): name is string => Boolean(name))
    .slice(0, 4)

  return {
    streakCount,
    todayStatus: todayHasWorkout ? 'Workout day' : 'Rest day',
    sessionsThisWeek: sessionDays.size,
    setsThisWeek: setLogsThisWeek.length,
    weeklyVolume,
    volumeBalance: buildWidgetVolumeBalance(state, nowMs),
    nextWorkoutName: nextPlanned?.workoutName?.trim() || null,
    nextWorkoutTags,
  }
}

function withAchievements(prev: AppPersisted): AppPersisted {
  return { ...prev, achievements: evaluateAchievements(prev) }
}

function formatPrNum(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function buildPrCelebration(setLogs: SetLog[], entry: SetLog, unit: 'lbs' | 'kg'): PrCelebrationData {
  const dateLabel = new Date().toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const prior = setLogs.filter((l) => l.exerciseId === entry.exerciseId && l.at < entry.at)

  if (entry.kind === 'timed') {
    const prevTimed = prior.filter((l): l is TimedSetLog => l.kind === 'timed')
    const lastBest = prevTimed.length ? Math.max(...prevTimed.map((l) => l.durationSec)) : 0
    const detail = `${entry.durationSec}s hold`
    return {
      exerciseName: entry.exerciseName,
      detail,
      dateLabel,
      headlineValue: String(entry.durationSec),
      headlineUnit: 's',
      pillLast: lastBest > 0 ? `Last: ${lastBest}s` : null,
      pillDelta:
        entry.durationSec > lastBest ? `+${entry.durationSec - lastBest}s` : null,
    }
  }

  if (entry.bodyweight) {
    const prevBw = prior.filter(
      (l): l is WeightedSetLog => l.kind === 'weighted' && l.bodyweight,
    )
    const lastReps = prevBw.length ? Math.max(...prevBw.map((l) => l.reps)) : 0
    const detail = `BW × ${entry.reps} reps · ${entry.sets} sets`
    return {
      exerciseName: entry.exerciseName,
      detail,
      dateLabel,
      headlineValue: String(entry.reps),
      headlineUnit: 'reps',
      pillLast: lastReps > 0 ? `Last: ${lastReps} reps` : null,
      pillDelta: entry.reps > lastReps ? `+${entry.reps - lastReps} reps` : null,
    }
  }

  const prevWeighted = prior.filter(
    (l): l is WeightedSetLog => l.kind === 'weighted' && !l.bodyweight && l.weight != null,
  )
  const weights = prevWeighted.map((l) => l.weight!).filter((w) => Number.isFinite(w))
  const maxW = weights.length ? Math.max(...weights) : null
  const ew = entry.weight ?? 0
  const detail = `${ew} ${unit} × ${entry.reps} reps · ${entry.sets} sets`

  let pillLast: string | null = null
  let pillDelta: string | null = null
  if (maxW != null && Number.isFinite(maxW)) {
    if (ew > maxW) {
      pillLast = `Last: ${formatPrNum(maxW)} ${unit}`
      pillDelta = `+${formatPrNum(ew - maxW)} ${unit}`
    } else if (ew === maxW) {
      const atMax = prevWeighted.filter((l) => l.weight === maxW)
      const maxRepsAtW = atMax.length ? Math.max(...atMax.map((l) => l.reps)) : 0
      pillLast = `Last: ${formatPrNum(maxW)} ${unit}`
      if (entry.reps > maxRepsAtW) {
        pillDelta = `+${entry.reps - maxRepsAtW} reps`
      }
    }
  }

  return {
    exerciseName: entry.exerciseName,
    detail,
    dateLabel,
    headlineValue: formatPrNum(ew),
    headlineUnit: unit,
    pillLast,
    pillDelta,
  }
}

export function WorkoutProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const [state, setState] = useState<AppPersisted>(() => alignScheduleWeek(loadState()))
  const [appleHealthAvailable, setAppleHealthAvailable] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [prCelebration, setPrCelebration] = useState<PrCelebrationData | null>(null)
  const [gymSpotifyPromptOpen, setGymSpotifyPromptOpen] = useState(false)
  const [clock, setClock] = useState(() => Date.now())
  const [coachNote, setCoachNote] = useState<string | null>(null)
  const stateRef = useRef(state)
  const notifyClearTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const proteinNotifyTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const cloudReadyRef = useRef(false)
  const cloudSaveTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const tendedStateTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const offlineSyncToastShownRef = useRef(false)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    function onOnline() {
      offlineSyncToastShownRef.current = false
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  useLayoutEffect(() => {
    setState((s) => {
      let hasFlag = false
      try {
        hasFlag = localStorage.getItem(APEX_COACH_INIT_FLAG) === '1'
      } catch {
        /* ignore */
      }

      let next = normalizeCoachChatMessages(s.chatMessages)

      if (!hasFlag) {
        if (next.length === 0) {
          next = coachWelcomeMessages()
        }
        try {
          localStorage.setItem(APEX_COACH_INIT_FLAG, '1')
        } catch {
          /* ignore */
        }
      }

      const cur = JSON.stringify(s.chatMessages.map((x) => ({ id: x.id, role: x.role, text: x.text })))
      const norm = JSON.stringify(next.map((x) => ({ id: x.id, role: x.role, text: x.text })))
      if (cur === norm) return s
      return { ...s, chatMessages: next }
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    cloudReadyRef.current = false
    void (async () => {
      const remote = await fetchUserWorkoutState(userId)
      if (cancelled) return
      let synced = stateRef.current
      if (remote) {
        const localBefore = stateRef.current
        synced = preserveLocalOnlyFields(
          localBefore,
          withAchievements(
            alignScheduleWeek(
              pickWorkoutStateForHydrate(localBefore, remote.state, remote.updatedAt),
            ),
          ),
        )
        setState(synced)
        syncTrainerShareFromState(synced)
      } else if (isAppOnline()) {
        await upsertUserWorkoutState(userId, applyTrainerShareToState(synced))
      }
      const { data: authData } = await supabase.auth.getUser()
      await upsertLeaderboardEntry(userId, synced, authData.user)
      void ensureFriendProfile(userId).catch(() => {})
      const tendedOnboardingDone = await fetchTendedOnboardingComplete(userId).catch(() => false)
      if (tendedOnboardingDone && !synced.onboardingComplete) {
        setOnboardingCompleteLocal(true)
        synced = { ...synced, onboardingComplete: true }
        setState(synced)
      }
      const tendedPostCheckin = await fetchTendedPostWorkoutCheckin(userId).catch(() => null)
      if (tendedPostCheckin != null) {
        writePostWorkoutCheckinEnabled(tendedPostCheckin)
      }
      cloudReadyRef.current = true
      void syncTendedUserStateSnapshots(userId, synced, Date.now()).catch((e) => {
        if (import.meta.env.DEV) console.warn('[Tended state] initial sync failed', e)
      })
      const note = await fetchLatestCoachNoteForClient(userId)
      setCoachNote(note?.trim() ? note : null)
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    saveState(state)
    if (!cloudReadyRef.current) return
    if (cloudSaveTimerRef.current != null) {
      window.clearTimeout(cloudSaveTimerRef.current)
    }
    cloudSaveTimerRef.current = window.setTimeout(() => {
      if (!isAppOnline()) {
        if (!offlineSyncToastShownRef.current) {
          offlineSyncToastShownRef.current = true
          notify(OFFLINE_SYNC_TOAST)
        }
        return
      }
      void (async () => {
        await upsertUserWorkoutState(userId, applyTrainerShareToState(stateRef.current))
        const { data: authData } = await supabase.auth.getUser()
        await upsertLeaderboardEntry(userId, stateRef.current, authData.user)
      })()
    }, 1200)
    return () => {
      if (cloudSaveTimerRef.current != null) {
        window.clearTimeout(cloudSaveTimerRef.current)
      }
    }
  }, [state, userId])

  const refreshCoachNote = useCallback(async () => {
    const note = await fetchLatestCoachNoteForClient(userId)
    setCoachNote(note?.trim() ? note : null)
  }, [userId])

  useEffect(() => {
    if (!cloudReadyRef.current) return
    void refreshCoachNote()
  }, [refreshCoachNote, state.setLogs.length])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshCoachNote()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refreshCoachNote])

  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const todayKey = dateKey(new Date(clock))

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return
    const payload = buildWidgetPayload(state, clock, todayKey)
    void (async () => {
      try {
        await Preferences.configure({ group: WIDGET_GROUP })
        await Preferences.set({ key: 'streakCount', value: String(payload.streakCount) })
        await Preferences.set({ key: 'todayStatus', value: payload.todayStatus })
        await Preferences.set({ key: 'sessionsThisWeek', value: String(payload.sessionsThisWeek) })
        await Preferences.set({ key: 'setsThisWeek', value: String(payload.setsThisWeek) })
        await Preferences.set({ key: 'weeklyVolume', value: String(payload.weeklyVolume) })
        await Preferences.set({ key: 'volumeBalance', value: JSON.stringify(payload.volumeBalance) })
        if (payload.nextWorkoutName) {
          await Preferences.set({ key: 'nextWorkoutName', value: payload.nextWorkoutName })
        } else {
          await Preferences.remove({ key: 'nextWorkoutName' })
        }
        if (payload.nextWorkoutTags.length) {
          await Preferences.set({
            key: 'nextWorkoutTags',
            value: JSON.stringify(payload.nextWorkoutTags),
          })
        } else {
          await Preferences.remove({ key: 'nextWorkoutTags' })
        }
      } catch {
        /* ignore widget sync failures */
      }
    })()
  }, [state, clock, todayKey])

  useEffect(() => {
    if (!cloudReadyRef.current || !isAppOnline()) return
    if (tendedStateTimerRef.current != null) {
      window.clearTimeout(tendedStateTimerRef.current)
    }
    tendedStateTimerRef.current = window.setTimeout(() => {
      void syncTendedUserStateSnapshots(userId, stateRef.current, clock).catch((e) => {
        if (import.meta.env.DEV) console.warn('[Tended state] sync failed', e)
      })
    }, 2500)
    return () => {
      if (tendedStateTimerRef.current != null) {
        window.clearTimeout(tendedStateTimerRef.current)
      }
    }
  }, [userId, todayKey, state, clock])

  useEffect(() => {
    setState((s) => alignScheduleWeek(s))
  }, [todayKey])

  const notify = useCallback((message: string, durationMs = 3000) => {
    if (notifyClearTimeoutRef.current != null) {
      window.clearTimeout(notifyClearTimeoutRef.current)
      notifyClearTimeoutRef.current = null
    }
    const id = crypto.randomUUID()
    setNotifications([{ id, message: stripNotificationMessage(message) }])
    notifyClearTimeoutRef.current = window.setTimeout(() => {
      setNotifications([])
      notifyClearTimeoutRef.current = null
    }, durationMs)
  }, [])

  const clearPostWorkoutProteinTimer = useCallback(() => {
    if (proteinNotifyTimeoutRef.current != null) {
      window.clearTimeout(proteinNotifyTimeoutRef.current)
      proteinNotifyTimeoutRef.current = null
    }
  }, [])

  const schedulePostWorkoutProteinNotification = useCallback(() => {
    clearPostWorkoutProteinTimer()
    proteinNotifyTimeoutRef.current = window.setTimeout(() => {
      proteinNotifyTimeoutRef.current = null
      const s = stateRef.current
      if (!s.settings.postWorkoutProteinNotificationEnabled) return
      if (hasMealLoggedWithin(s, POST_WORKOUT_PROTEIN_MEAL_LOOKBACK_MS)) return
      if (!showPostWorkoutProteinNotification()) {
        notify(POST_WORKOUT_PROTEIN_MESSAGE, 5000)
      }
    }, POST_WORKOUT_PROTEIN_DELAY_MS)
  }, [clearPostWorkoutProteinTimer, notify])

  useEffect(() => () => clearPostWorkoutProteinTimer(), [clearPostWorkoutProteinTimer])

  const streakMilestonePrevRef = useRef<number | null>(null)
  useEffect(() => {
    const s = streakCurrent(state, clock)
    const prev = streakMilestonePrevRef.current
    if (prev === null) {
      streakMilestonePrevRef.current = s
      return
    }
    if (s !== prev) {
      for (const m of [3, 7, 14, 30]) {
        if (s === m && prev < m) {
          notify(`${m} day streak! Keep it up.`)
          break
        }
      }
      streakMilestonePrevRef.current = s
    }
  }, [state.setLogs, notify])

  useEffect(() => {
    const weekToConsume = detectStreakShieldConsumption(state, clock)
    if (weekToConsume && state.streakShieldUsedWeekStart !== weekToConsume) {
      setState((s) => ({ ...s, streakShieldUsedWeekStart: weekToConsume }))
    }
  }, [state.setLogs, state.cardioEntries, state.streakShieldUsedWeekStart, clock])

  useEffect(() => {
    return () => {
      if (notifyClearTimeoutRef.current != null) {
        window.clearTimeout(notifyClearTimeoutRef.current)
      }
    }
  }, [])

  const dismissNotification = useCallback((id: string) => {
    setNotifications((n) => n.filter((x) => x.id !== id))
  }, [])

  const visibleExercises = useMemo(() => {
    const hidden = new Set(state.hiddenExerciseIds)
    const builtIn = EXERCISES.filter((e) => !hidden.has(e.id))
    const customs = state.customExercises.filter((e) => !hidden.has(e.id))
    return [...builtIn, ...customs]
  }, [state.hiddenExerciseIds, state.customExercises])

  const resolveExerciseById = useCallback(
    (exerciseId: string): Exercise | null => {
      if (state.hiddenExerciseIds.includes(exerciseId)) return null
      const built = EXERCISES.find((e) => e.id === exerciseId)
      if (built) return built
      const c = state.customExercises.find((e) => e.id === exerciseId)
      if (!c) return null
      return c
    },
    [state.customExercises, state.hiddenExerciseIds],
  )

  const tickValue = useMemo<TickCtx>(
    () => ({
      clock,
      cardioElapsedMs: cardioElapsedMs(state.cardioTimer, clock),
      gymElapsedMs: gymElapsedMs(state.gymSession, clock),
    }),
    [clock, state.cardioTimer, state.gymSession],
  )

  const dismissRestTimer = useCallback(() => {
    setState((s) => ({ ...s, restTimer: { ...s.restTimer, dismissed: true } }))
  }, [])

  const dismissPrCelebration = useCallback(() => {
    setPrCelebration(null)
  }, [])

  const addSetLog: Ctx['addSetLog'] = useCallback((partial, _options) => {
    const at = Date.now()
    const id = crypto.randomUUID()
    let normalized = partial
    if (partial.kind === 'weighted' && !partial.bodyweight) {
      const w = partial.weight
      if (w != null && !Number.isFinite(w)) {
        normalized = { ...partial, weight: 0 }
      }
    }
    let showPrCelebrationFlag = false
    let saved = false
    setState((s) => {
      const base = { ...normalized, id, at } as Omit<SetLog, 'isPr'>
      let isPr = false
      try {
        isPr = computeIsPr(
          s.setLogs,
          base as Parameters<typeof computeIsPr>[1],
        )
      } catch (e) {
        console.error('[Apex] computeIsPr failed; saving set without PR flag', e)
      }
      if (normalized.kind === 'weighted' && !normalized.bodyweight) {
        showPrCelebrationFlag = beatsStoredWeightPr(
          s.setLogs,
          base as Omit<WeightedSetLog, 'isPr' | 'id' | 'at'>,
        )
      } else {
        showPrCelebrationFlag = isPr
      }
      const log = { ...base, isPr } as SetLog
      const setLogs = [...s.setLogs, log]
      const sec = Math.max(1, Math.floor(s.settings.restTimerSeconds) || 90)
      const rest = !s.settings.restTimerEnabled
        ? { endAt: null, startedAt: null, durationSec: sec, dismissed: true }
        : {
            endAt: at + sec * 1000,
            startedAt: at,
            durationSec: sec,
            dismissed: false,
          }
      const xpGain = XP_PER_SET + (isPr ? XP_PER_PR : 0)
      try {
        saved = true
        return withAchievements({
          ...s,
          setLogs,
          restTimer: rest,
          lifetimeXp: (s.lifetimeXp ?? 0) + xpGain,
        })
      } catch (e) {
        console.error('[Apex] withAchievements failed; set not saved', e)
        window.setTimeout(() => {
          notify(e instanceof Error ? e.message : 'Could not save set')
        }, 0)
        return s
      }
    })
    if (!saved) return
    if (normalized.kind === 'weighted') {
      saveExerciseLastWeight(normalized.exerciseId, {
        bodyweight: normalized.bodyweight,
        weight: normalized.weight,
        reps: normalized.reps,
        sets: normalized.sets,
      })
    }
    if (import.meta.env.DEV) {
      console.log('[Apex] addSetLog saved', id)
    }
    hapticOnSetLogged()
    requestAnimationFrame(() => {
      if (!showPrCelebrationFlag) return
      const unit = stateRef.current.settings.unit
      const log = stateRef.current.setLogs.find((l) => l.id === id)
      if (!log) return
      setPrCelebration(buildPrCelebration(stateRef.current.setLogs, log, unit))
      void upsertUserWorkoutState(userId, applyTrainerShareToState(stateRef.current)).catch(
        () => {},
      )
    })
  }, [notify])

  const addCardioEntry: Ctx['addCardioEntry'] = useCallback((name, durationMinutes) => {
    const entry: CardioEntry = {
      id: crypto.randomUUID(),
      name: name.trim() || 'Cardio',
      durationMinutes,
      at: Date.now(),
    }
    setState((s) => withAchievements({ ...s, cardioEntries: [...s.cardioEntries, entry] }))
  }, [])

  const startCardioTimer = useCallback(() => {
    setState((s) => {
      const t = s.cardioTimer
      if (t.running) return s
      return {
        ...s,
        cardioTimer: {
          running: true,
          baseMs: t.baseMs,
          segmentStartAt: Date.now(),
        },
      }
    })
  }, [])

  const pauseCardioTimer = useCallback(() => {
    setState((s) => {
      const t = s.cardioTimer
      if (!t.running || t.segmentStartAt == null) {
        return { ...s, cardioTimer: { ...t, running: false, segmentStartAt: null } }
      }
      const baseMs = t.baseMs + (Date.now() - t.segmentStartAt)
      return { ...s, cardioTimer: { running: false, baseMs, segmentStartAt: null } }
    })
  }, [])

  const resetCardioTimer = useCallback(() => {
    setState((s) => ({
      ...s,
      cardioTimer: { running: false, baseMs: 0, segmentStartAt: null },
    }))
  }, [])

  const applyCardioTimerToEntry = useCallback(
    (entryId: string) => {
      setState((s) => {
        const ms = cardioElapsedMs(s.cardioTimer, Date.now())
        const minutes = Math.round((ms / 60000) * 100) / 100
        return {
          ...s,
          cardioEntries: s.cardioEntries.map((c) =>
            c.id === entryId ? { ...c, durationMinutes: minutes } : c,
          ),
        }
      })
      notify('Duration saved to cardio entry')
    },
    [notify],
  )

  const startGymSession: Ctx['startGymSession'] = useCallback((mode, manualMsSinceMidnight, trainingMode = null) => {
    clearPostWorkoutProteinTimer()
    const d = new Date()
    let manualStartedAt: number | null = null
    if (mode === 'manual' && manualMsSinceMidnight != null) {
      const start = new Date(d)
      start.setHours(0, 0, 0, 0)
      manualStartedAt = start.getTime() + manualMsSinceMidnight
    }
    const today = dateKey(d)
    setState((s) => {
      const fromPlan = scheduledTrainingModeForDay(s.schedule, today)
      const resolvedMode = trainingMode ?? fromPlan ?? s.gymSession.trainingMode ?? null
      return {
        ...s,
        gymSession: {
          active: true,
          mode,
          startedAt: mode === 'stopwatch' ? Date.now() : null,
          manualStartedAt: mode === 'manual' ? manualStartedAt : null,
          pauseStartedAt: null,
          accumulatedPauseMs: 0,
          trainingMode: resolvedMode,
        },
      }
    })
    notify('Gym session started')
    if (stateRef.current.settings.gymSessionSpotifyPromptEnabled) {
      setGymSpotifyPromptOpen(true)
    }
  }, [clearPostWorkoutProteinTimer, notify])

  const dismissGymSpotifyPrompt = useCallback(() => {
    setGymSpotifyPromptOpen(false)
  }, [])

  useEffect(() => {
    const { gymLocationDetectionEnabled, gymLocationLat, gymLocationLng, gymLocationLabel } =
      state.settings
    if (!gymLocationDetectionEnabled || gymLocationLat == null || gymLocationLng == null) {
      return
    }

    return startGymGeofenceWatch(
      { lat: gymLocationLat, lng: gymLocationLng, label: gymLocationLabel },
      true,
      {
        onEnterGym: () => {
          if (stateRef.current.gymSession.active) return
          const shown = showGymArrivalNotification(() => {
            startGymSession('stopwatch')
          })
          if (!shown) {
            notify(
              'Are you at the gym? Open Today and tap Start gym session.',
              8000,
            )
          }
        },
        onLeaveGym: () => {
          if (!stateRef.current.gymSession.active) return
          showGymLeaveNotification()
          notify('You left the gym area — end your session when you are done.', 8000)
        },
        isSessionActive: () => stateRef.current.gymSession.active,
      },
    )
  }, [
    state.settings.gymLocationDetectionEnabled,
    state.settings.gymLocationLat,
    state.settings.gymLocationLng,
    state.settings.gymLocationLabel,
    startGymSession,
    notify,
  ])

  const pauseGymSession = useCallback(() => {
    setState((s) => {
      if (!s.gymSession.active || s.gymSession.pauseStartedAt) return s
      return { ...s, gymSession: { ...s.gymSession, pauseStartedAt: Date.now() } }
    })
  }, [])

  const resumeGymSession = useCallback(() => {
    setState((s) => {
      const g = s.gymSession
      if (!g.pauseStartedAt) return s
      const add = Date.now() - g.pauseStartedAt
      return {
        ...s,
        gymSession: {
          ...g,
          pauseStartedAt: null,
          accumulatedPauseMs: g.accumulatedPauseMs + add,
        },
      }
    })
  }, [])

  const stopGymSession: Ctx['stopGymSession'] = useCallback(async () => {
    const snapshot = stateRef.current
    const endMs = gymElapsedMs(snapshot.gymSession, Date.now())
    const mins = Math.round(endMs / 60000)
    const today = dateKey(new Date())
    const logsToday = snapshot.setLogs.filter((l) => dateKey(new Date(l.at)) === today)
    const names = [...new Set(logsToday.map((l) => l.exerciseName))].slice(0, 8)

    const hadActiveSession = snapshot.gymSession.active
    const sessionTrainingMode = snapshot.gymSession.trainingMode
    const endedAtMs = Date.now()
    const sessionStartedAt = gymSessionStartedAtMs(snapshot.gymSession, endedAtMs)
    const earnedWorkoutXp = hadActiveSession && logsToday.length > 0
    setGymSpotifyPromptOpen(false)
    setState((s) => ({
      ...s,
      gymSession: {
        active: false,
        mode: 'stopwatch',
        startedAt: null,
        manualStartedAt: null,
        pauseStartedAt: null,
        accumulatedPauseMs: 0,
        trainingMode: null,
      },
      lifetimeXp: earnedWorkoutXp ? (s.lifetimeXp ?? 0) + XP_PER_WORKOUT_COMPLETE : (s.lifetimeXp ?? 0),
    }))
    notify('Gym session ended')

    if (hadActiveSession && logsToday.length > 0) {
      hapticOnWorkoutComplete(snapshot.settings.celebrationsEnabled)
    }

    if (
      hadActiveSession &&
      snapshot.settings.appleHealthSyncEnabled &&
      sessionStartedAt != null &&
      endedAtMs > sessionStartedAt
    ) {
      const durationSec = Math.round((endedAtMs - sessionStartedAt) / 1000)
      const kcal = estimateWorkoutCaloriesKcal(durationSec, logsToday.length)
      void writeGymSessionToAppleHealth({
        startedAt: sessionStartedAt,
        endedAt: endedAtMs,
        caloriesKcal: kcal,
      })
    }

    if (hadActiveSession) {
      schedulePostWorkoutProteinNotification()
    }

    if (sessionTrainingMode) {
      try {
        await completeWorkoutSession(userId, today, sessionTrainingMode)
      } catch {
        /* ignore cloud sync errors */
      }
    }

    const topExercises = names.slice(0, 3).join(', ')
    const sentence = mins > 0
      ? `${mins} min · ${topExercises}${names.length > 3 ? ` +${names.length - 3} more` : ''} · ${logsToday.length} sets`
      : `${topExercises}${names.length > 3 ? ` +${names.length - 3} more` : ''} · ${logsToday.length} sets`
    setState((s) => ({
      ...s,
      schedule: s.schedule.map((d) =>
        d.dateKey === today ? { ...d, aiSummary: sentence } : d,
      ),
    }))
  }, [notify, schedulePostWorkoutProteinNotification, userId])

  const addPlanExercise = useCallback((exerciseId: string) => {
    setState((s) => {
      if (s.todayPlanExerciseIds.includes(exerciseId)) return s
      return { ...s, todayPlanExerciseIds: [...s.todayPlanExerciseIds, exerciseId] }
    })
  }, [])

  const removePlanExercise = useCallback((exerciseId: string) => {
    setState((s) => ({
      ...s,
      todayPlanExerciseIds: s.todayPlanExerciseIds.filter((id) => id !== exerciseId),
      todaySupersetPairs: s.todaySupersetPairs.filter(([a, b]) => a !== exerciseId && b !== exerciseId),
    }))
  }, [])

  const clearTodayPlan = useCallback(() => {
    setState((s) => ({ ...s, todayPlanExerciseIds: [], todaySupersetPairs: [] }))
    notify('Plan cleared')
  }, [notify])

  const linkSuperset = useCallback(
    (exerciseIdA: string, exerciseIdB: string) => {
      if (exerciseIdA === exerciseIdB) return
      setState((s) => {
        if (
          !s.todayPlanExerciseIds.includes(exerciseIdA) ||
          !s.todayPlanExerciseIds.includes(exerciseIdB)
        ) {
          return s
        }
        const pairs = s.todaySupersetPairs.filter(
          ([a, b]) =>
            a !== exerciseIdA &&
            b !== exerciseIdA &&
            a !== exerciseIdB &&
            b !== exerciseIdB,
        )
        const ordered: TodaySupersetPair =
          s.todayPlanExerciseIds.indexOf(exerciseIdA) <= s.todayPlanExerciseIds.indexOf(exerciseIdB)
            ? [exerciseIdA, exerciseIdB]
            : [exerciseIdB, exerciseIdA]
        return { ...s, todaySupersetPairs: [...pairs, ordered] }
      })
      notify('Superset linked')
    },
    [notify],
  )

  const getSupersetPartner = useCallback(
    (exerciseId: string): string | null => {
      for (const [a, b] of state.todaySupersetPairs) {
        if (a === exerciseId) return b
        if (b === exerciseId) return a
      }
      return null
    },
    [state.todaySupersetPairs],
  )

  const saveTemplate = useCallback((name: string) => {
    const t: WorkoutTemplate = {
      id: crypto.randomUUID(),
      name: name.trim() || 'Template',
      exerciseIds: [...state.todayPlanExerciseIds],
      createdAt: Date.now(),
    }
    setState((s) => ({ ...s, templates: [...s.templates, t] }))
    notify('Template saved')
  }, [notify, state.todayPlanExerciseIds])

  const deleteTemplate = useCallback((id: string) => {
    setState((s) => ({ ...s, templates: s.templates.filter((t) => t.id !== id) }))
  }, [])

  const loadTemplate = useCallback((id: string) => {
    const t = state.templates.find((x) => x.id === id)
    if (!t) return
    setState((s) => ({
      ...s,
      todayPlanExerciseIds: [...t.exerciseIds],
      todaySupersetPairs: [],
    }))
    notify('Template loaded into My Plan')
  }, [notify, state.templates])

  const applyPresetPlan = useCallback((exerciseIds: string[]) => {
    const validIds = new Set(EXERCISES.map((e) => e.id))
    const uniq = [...new Set(exerciseIds.filter((id) => validIds.has(id)))]
    setState((s) => {
      const hidden = new Set(s.hiddenExerciseIds)
      const plan = uniq.filter((id) => !hidden.has(id))
      return { ...s, todayPlanExerciseIds: plan, todaySupersetPairs: [] }
    })
    notify('Preset loaded into My Plan')
  }, [notify])

  const applyAiWeeklyTemplate = useCallback(
    (template: AiWeeklyWorkoutTemplate) => {
      setState((s) => {
        const patches = buildSchedulePatchesFromTemplate(
          template,
          s.schedule,
          s.hiddenExerciseIds,
          s.customExercises,
        )
        const schedule = s.schedule.map((d) => {
          const hit = patches.find((p) => p.dateKey === d.dateKey)
          return hit?.patch ? { ...d, ...hit.patch } : d
        })
        const todayIds = todayPlanIdsFromTemplate(
          template,
          todayKey,
          s.hiddenExerciseIds,
          s.customExercises,
        )
        return {
          ...s,
          schedule,
          todayPlanExerciseIds: todayIds,
          todaySupersetPairs: [],
        }
      })
      notify(`${template.name} applied to this week`)
    },
    [notify, todayKey],
  )

  const applyCoachPlanToToday = useCallback((exerciseIds: string[]) => {
    setState((s) => {
      const validIds = new Set([
        ...EXERCISES.map((e) => e.id),
        ...s.customExercises.map((e) => e.id),
      ])
      const hidden = new Set(s.hiddenExerciseIds)
      const merged = [...s.todayPlanExerciseIds]
      for (const id of exerciseIds) {
        if (!validIds.has(id) || hidden.has(id) || merged.includes(id)) continue
        merged.push(id)
      }
      return { ...s, todayPlanExerciseIds: merged }
    })
  }, [])

  const updateScheduleDay = useCallback((dateKeyVal: string, patch: Partial<ScheduleDay>) => {
    setState((s) => ({
      ...s,
      schedule: s.schedule.map((d) => (d.dateKey === dateKeyVal ? { ...d, ...patch } : d)),
    }))
  }, [])

  const batchPatchSchedule = useCallback((patches: { dateKey: string; patch: Partial<ScheduleDay> }[]) => {
    if (!patches.length) return
    setState((s) => ({
      ...s,
      schedule: s.schedule.map((d) => {
        const hit = patches.find((p) => p.dateKey === d.dateKey)
        return hit ? { ...d, ...hit.patch } : d
      }),
    }))
  }, [])

  const disconnectGoogleCalendar = useCallback(() => {
    clearStoredTokens()
    setState((s) => ({
      ...s,
      schedule: s.schedule.map((d) => {
        const { googleCalendarEventId: _id, ...rest } = d
        void _id
        return rest as ScheduleDay
      }),
    }))
    notify('Google Calendar disconnected')
  }, [notify])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
  }, [])

  const setCycleStartDateKey = useCallback((dateKeyVal: string) => {
    const dk = dateKeyVal.trim()
    if (!dk) return
    setState((s) => ({ ...s, cycleStartDateKey: dk }))
  }, [])

  const pushChat = useCallback(
    (
      role: 'user' | 'model',
      text: string,
      opts?: { workoutPlan?: boolean; image?: ChatMessage['image'] },
    ) => {
      if (role === 'user' && isCoachUiPromptLine(text) && !opts?.image) return
      let cleanedModel = role === 'model' ? sanitizeCoachBubbleText(text) : ''
      if (role === 'model' && !opts?.workoutPlan) {
        cleanedModel = limitCoachReplySentences(cleanedModel)
      }
      if (role === 'model' && !cleanedModel.trim()) return
      const body =
        role === 'model' ? cleanedModel : redactLeakedApiMetadataFromText(text.trim())
      if (role === 'user' && !body && !opts?.image) return
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role,
        text: body,
        at: Date.now(),
        ...(opts?.workoutPlan ? { workoutPlan: true } : {}),
        ...(opts?.image ? { image: opts.image } : {}),
      }
      setState((s) => ({
        ...s,
        chatMessages: normalizeCoachChatMessages([...s.chatMessages, msg]),
      }))
      if (role === 'model') touchAiIntelligenceUpdated(msg.at)
    },
    [],
  )

  const clearChat = useCallback(() => {
    try {
      localStorage.removeItem(APEX_COACH_INIT_FLAG)
    } catch {
      /* ignore */
    }
    setState((s) => ({ ...s, chatMessages: coachWelcomeMessages() }))
  }, [])

  const addCustomExercise = useCallback(
    (
      name: string,
      muscleGroup: MuscleGroup,
      gifUrl?: string,
      help?: { formTips: string; commonMistakes: string; beginnerAdvice: string },
    ) => {
      const trimmed = name.trim().slice(0, 120)
      if (!trimmed) return
      const id = `custom-${crypto.randomUUID()}`
      let g: string | undefined
      const rawG = gifUrl?.trim().slice(0, 2048)
      if (rawG && /^https?:\/\//i.test(rawG)) g = rawG
      const tips =
        help?.formTips?.trim() && help.commonMistakes?.trim() && help.beginnerAdvice?.trim()
          ? {
              formTips: help.formTips.trim(),
              commonMistakes: help.commonMistakes.trim(),
              beginnerAdvice: help.beginnerAdvice.trim(),
            }
          : {}
      setState((s) => ({
        ...s,
        customExercises: [
          ...s.customExercises,
          {
            id,
            name: trimmed,
            muscleGroup,
            equipment: equipmentForExercise(trimmed, muscleGroup),
            ...(g ? { gifUrl: g } : {}),
            ...tips,
          },
        ],
      }))
      notify('Custom exercise added')
    },
    [notify],
  )

  const dismissBurnoutWarnings = useCallback(() => {
    setState((s) => ({ ...s, burnoutDismissedWeekStart: currentWeekStartKey() }))
  }, [])

  const applyDeloadWeek = useCallback(() => {
    const wk = currentWeekStartKey()
    const dk = dateKey(new Date())
    const s = stateRef.current
    const validIds = new Set([
      ...EXERCISES.map((e) => e.id),
      ...s.customExercises.map((e) => e.id),
    ])
    const hidden = new Set(s.hiddenExerciseIds)
    const plan = pickDeloadExerciseIds(s, dk).filter((id) => validIds.has(id) && !hidden.has(id))
    setState({
      ...s,
      todayPlanExerciseIds: plan,
      todaySupersetPairs: [],
      deloadActiveWeekStart: wk,
      deloadDismissedWeekStart: null,
    })
    void insertDeloadWeekEvent(userId, wk, 'applied', plan, 40).catch(() => {})
    notify('Deload week — same exercises, weights prefill at 60% of last session')
  }, [notify, userId])

  const dismissDeloadSuggestion = useCallback(() => {
    const wk = currentWeekStartKey()
    setState((s) => ({ ...s, deloadDismissedWeekStart: wk }))
    void insertDeloadWeekEvent(userId, wk, 'dismissed', [], 40).catch(() => {})
  }, [userId])

  const hideExercise = useCallback((exerciseId: string) => {
    setState((s) => ({
      ...s,
      hiddenExerciseIds: s.hiddenExerciseIds.includes(exerciseId)
        ? s.hiddenExerciseIds
        : [...s.hiddenExerciseIds, exerciseId],
      todayPlanExerciseIds: s.todayPlanExerciseIds.filter((id) => id !== exerciseId),
      todaySupersetPairs: s.todaySupersetPairs.filter(([a, b]) => a !== exerciseId && b !== exerciseId),
      favoriteExerciseIds: s.favoriteExerciseIds.filter((id) => id !== exerciseId),
      schedule: s.schedule.map((d) => ({
        ...d,
        plannedExerciseIds: (d.plannedExerciseIds ?? []).filter((id) => id !== exerciseId),
      })),
    }))
  }, [])

  const toggleFavoriteExercise = useCallback((exerciseId: string) => {
    setState((s) => {
      const has = s.favoriteExerciseIds.includes(exerciseId)
      return {
        ...s,
        favoriteExerciseIds: has
          ? s.favoriteExerciseIds.filter((id) => id !== exerciseId)
          : [...s.favoriteExerciseIds, exerciseId],
      }
    })
  }, [])

  const addBodyweight = useCallback((value: number) => {
    setState((s) =>
      withAchievements({
        ...s,
        bodyweightLogs: [
          ...s.bodyweightLogs,
          { id: crypto.randomUUID(), at: Date.now(), value },
        ],
      }),
    )
  }, [])

  const saveDailyCheckin = useCallback((dateKey: string, weightLbs: number | null, foodNote: string) => {
    setState((s) => {
      const existing = s.dailyCheckins.findIndex((c) => c.dateKey === dateKey)
      const entry = {
        id: existing >= 0 ? s.dailyCheckins[existing].id : crypto.randomUUID(),
        dateKey,
        weightLbs,
        foodNote,
        createdAt: Date.now(),
      }
      const updated = existing >= 0
        ? s.dailyCheckins.map((c, i) => (i === existing ? entry : c))
        : [...s.dailyCheckins, entry]
      return { ...s, dailyCheckins: updated }
    })
  }, [])

  const addWaterOz = useCallback((oz = 8) => {
    const amount = Math.max(0, Math.round(oz))
    if (amount <= 0) return
    const dk = dateKey(new Date())
    setState((s) => ({
      ...s,
      waterLogs: [
        ...(s.waterLogs ?? []),
        { id: crypto.randomUUID(), dateKey: dk, oz: amount, at: Date.now() },
      ],
    }))
  }, [])

  const logReadinessCheck = useCallback(
    (entry: Omit<ReadinessLogEntry, 'at'> & { at?: number }) => {
      setState((s) => {
        const rest = (s.readinessLogs ?? []).filter((l) => l.dateKey !== entry.dateKey)
        return {
          ...s,
          readinessLogs: [
            ...rest,
            {
              ...entry,
              at: entry.at ?? Date.now(),
            },
          ],
        }
      })
    },
    [],
  )

  const logWorkoutMoodCheckin = useCallback(
    (entry: Omit<WorkoutMoodLogEntry, 'at'> & { at?: number }) => {
      setState((s) => ({
        ...s,
        workoutMoodLogs: [
          ...(s.workoutMoodLogs ?? []),
          {
            ...entry,
            at: entry.at ?? Date.now(),
          },
        ],
      }))
    },
    [],
  )

  const logPostWorkoutCheckin = useCallback(
    (entry: Omit<PostWorkoutCheckinLogEntry, 'at'> & { at?: number }) => {
      const full: PostWorkoutCheckinLogEntry = {
        ...entry,
        feelRating: Math.min(5, Math.max(1, Math.round(entry.feelRating))),
        energyRating: Math.min(5, Math.max(1, Math.round(entry.energyRating))),
        at: entry.at ?? Date.now(),
      }
      setState((s) => ({
        ...s,
        postWorkoutCheckins: [...(s.postWorkoutCheckins ?? []), full],
      }))
      requestAnimationFrame(() => {
        const snap = applyTrainerShareToState(stateRef.current)
        void upsertUserWorkoutState(userId, snap).catch(() => {})
        void updateLatestWorkoutSessionRatings(
          userId,
          full.dateKey,
          full.feelRating,
          full.energyRating,
        ).catch(() => {})
        void upsertTendedUserState(userId, buildTendedUserStateDaySnapshot(snap, full.dateKey)).catch(
          () => {},
        )
      })
    },
    [userId],
  )

  const logSleep = useCallback((durationMinutes: number, quality: number) => {
    const minutes = Math.max(0, Math.round(durationMinutes))
    if (minutes <= 0) return
    const q = Math.min(5, Math.max(1, Math.round(quality))) as 1 | 2 | 3 | 4 | 5
    const dk = dateKey(new Date())
    setState((s) => {
      const rest = (s.sleepLogs ?? []).filter((l) => l.dateKey !== dk)
      return {
        ...s,
        sleepLogs: [
          ...rest,
          {
            id: crypto.randomUUID(),
            dateKey: dk,
            durationMinutes: minutes,
            quality: q,
            at: Date.now(),
          },
        ],
      }
    })
  }, [])

  const addMealLog = useCallback(
    (meal: {
      name: string
      calories: number
      proteinG: number
      carbsG: number
      fatG: number
    }) => {
      const name = meal.name.trim().slice(0, 120)
      if (!name) return
      const dk = dateKey(new Date())
      setState((s) => ({
        ...s,
        mealLogs: [
          ...(s.mealLogs ?? []),
          {
            id: crypto.randomUUID(),
            dateKey: dk,
            name,
            calories: Math.max(0, Math.round(meal.calories)),
            proteinG: Math.max(0, Math.round(meal.proteinG)),
            carbsG: Math.max(0, Math.round(meal.carbsG)),
            fatG: Math.max(0, Math.round(meal.fatG)),
            at: Date.now(),
          },
        ],
      }))
    },
    [],
  )

  const deleteMealLog = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      mealLogs: (s.mealLogs ?? []).filter((m) => m.id !== id),
    }))
  }, [])

  const mergeImport = useCallback((partial: Partial<AppPersisted>, options?: { silent?: boolean }) => {
    setState((s) => {
      const importedCardio = partial.cardioEntries
        ? normalizeImportedCardio(partial.cardioEntries)
        : []
      const importedSets = partial.setLogs
        ? normalizeImportedSetLogs(partial.setLogs, {
            customExercises: s.customExercises,
            atMs: Date.now(),
          })
        : []
      const next: AppPersisted = {
        ...s,
        setLogs: importedSets.length ? [...s.setLogs, ...importedSets] : s.setLogs,
        bodyweightLogs: partial.bodyweightLogs
          ? [...s.bodyweightLogs, ...partial.bodyweightLogs]
          : s.bodyweightLogs,
        cardioEntries: partial.cardioEntries
          ? [...s.cardioEntries, ...importedCardio]
          : s.cardioEntries,
        friends: partial.friends ? [...s.friends, ...partial.friends] : s.friends,
        schedule: partial.schedule
          ? partial.schedule.map((d) => ({
              ...d,
              plannedExerciseIds: d.plannedExerciseIds ?? [],
            }))
          : s.schedule,
        settings: { ...s.settings, ...(partial.settings ?? {}) },
        lifetimeXp:
          typeof partial.lifetimeXp === 'number' && Number.isFinite(partial.lifetimeXp)
            ? partial.lifetimeXp
            : s.lifetimeXp,
        customExercises:
          partial.customExercises != null
            ? [...s.customExercises, ...migrateCustomExercises(partial.customExercises)]
            : s.customExercises,
      }
      return withAchievements(alignScheduleWeek(next))
    })
    if (!options?.silent) notify('Import merged')
  }, [notify])

  useEffect(() => {
    applyWorkoutHistorySeedIfNeeded(mergeImport)
  }, [mergeImport])

  const syncAppleHealth = useCallback(async () => {
    if (!(await isAppleHealthAvailable())) return
    const metrics = await readAppleHealthTodayMetrics()
    if (!metrics) return
    const dk = dateKey(new Date())
    setState((s) => {
      const hasSleep = (s.sleepLogs ?? []).some((l) => l.dateKey === dk)
      let sleepLogs = s.sleepLogs ?? []
      if (shouldAutoFillSleepFromHealth(metrics, dk, hasSleep) && metrics.sleepMinutes) {
        const rest = sleepLogs.filter((l) => l.dateKey !== dk)
        sleepLogs = [
          ...rest,
          {
            id: crypto.randomUUID(),
            dateKey: dk,
            durationMinutes: metrics.sleepMinutes,
            quality: 3,
            at: Date.now(),
          },
        ]
      }
      return { ...s, appleHealthToday: metrics, sleepLogs }
    })
  }, [])

  const enableAppleHealthSync = useCallback(async () => {
    const granted = await requestAppleHealthAuthorization()
    setState((s) => ({
      ...s,
      settings: { ...s.settings, appleHealthSyncEnabled: granted },
    }))
    if (granted) {
      await syncAppleHealth()
      notify('Apple Health sync enabled')
    } else {
      notify('Allow Apple Health access in Settings to sync')
    }
  }, [notify, syncAppleHealth])

  const completeOnboarding = useCallback(
    (opts?: { markHealthPromptDone?: boolean }) => {
      setOnboardingCompleteLocal(true)
      setState((s) => ({
        ...s,
        onboardingComplete: true,
        appleHealthPermissionPromptDone: opts?.markHealthPromptDone
          ? true
          : s.appleHealthPermissionPromptDone,
      }))
      const next = {
        ...stateRef.current,
        onboardingComplete: true,
        appleHealthPermissionPromptDone: opts?.markHealthPromptDone
          ? true
          : stateRef.current.appleHealthPermissionPromptDone,
      }
      void upsertUserWorkoutState(userId, applyTrainerShareToState(next)).catch(() => {})
      void upsertTendedOnboardingComplete(userId).catch(() => {})
    },
    [userId],
  )

  useEffect(() => {
    void isAppleHealthAvailable().then(setAppleHealthAvailable)
  }, [])

  useEffect(() => {
    if (!state.onboardingComplete || state.appleHealthPermissionPromptDone) return
    void (async () => {
      const granted = await requestAppleHealthAuthorization()
      setState((s) => ({
        ...s,
        appleHealthPermissionPromptDone: true,
        settings: {
          ...s.settings,
          appleHealthSyncEnabled: granted ? true : s.settings.appleHealthSyncEnabled,
        },
      }))
      if (granted) await syncAppleHealth()
    })()
  }, [state.onboardingComplete, state.appleHealthPermissionPromptDone, syncAppleHealth])

  useEffect(() => {
    if (!state.onboardingComplete || !state.settings.appleHealthSyncEnabled) return
    void syncAppleHealth()
    const intervalId = window.setInterval(() => void syncAppleHealth(), 5 * 60 * 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncAppleHealth()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [state.onboardingComplete, state.settings.appleHealthSyncEnabled, todayKey, syncAppleHealth])

  const resetAppData = useCallback(async () => {
    try {
      localStorage.removeItem(APEX_COACH_INIT_FLAG)
    } catch {
      /* ignore */
    }
    const fresh = clearAllAppData()
    setState(fresh)
    setNotifications([])
    setPrCelebration(null)
    cloudReadyRef.current = true
    try {
      await upsertUserWorkoutState(userId, fresh)
      const { data: authData } = await supabase.auth.getUser()
      await upsertLeaderboardEntry(userId, fresh, authData.user)
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[Apex] resetAppData cloud sync', e)
    }
  }, [userId])

  const updateTodayLayout = useCallback((layout: TodayLayoutPersist) => {
    setState((s) => ({ ...s, todayLayout: normalizeTodayLayout(layout) }))
  }, [])

  const completeNotificationPrompt = useCallback(() => {
    setState((s) => ({ ...s, notificationPromptDone: true }))
  }, [])

  useEffect(() => {
    function maybeWeeklySummaryNotif() {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      const s = stateRef.current
      const now = Date.now()
      const d = new Date(now)
      if (d.getDay() !== 0) return
      if (d.getHours() < 18 || d.getHours() > 21) return
      const ws = dateKey(weekStartMonday(d))
      if (s.lastWeeklySummaryNotifWeekStart === ws) return
      const summary = computeWeekSummary(s, now)
      showWeeklySummaryNotification(summary)
      setState((prev) => ({ ...prev, lastWeeklySummaryNotifWeekStart: ws }))
    }
    maybeWeeklySummaryNotif()
    const id = window.setInterval(maybeWeeklySummaryNotif, 60_000)
    return () => clearInterval(id)
  }, [])

  const deleteSetLog = useCallback((id: string) => {
    setState((s) => withAchievements({ ...s, setLogs: s.setLogs.filter((l) => l.id !== id) }))
  }, [])

  const updateSetLog = useCallback(
    (id: string, payload: SetLogEditPayload) => {
      setState((s) => {
        const prev = s.setLogs.find((l) => l.id === id)
        if (!prev || prev.kind !== payload.kind) return s
        const others = s.setLogs.filter((l) => l.id !== id)
        let base: Omit<SetLog, 'isPr'>
        if (payload.kind === 'weighted' && prev.kind === 'weighted') {
          let w = payload.weight
          if (!payload.bodyweight && w != null && !Number.isFinite(w)) {
            w = 0
          }
          const reps = Math.max(0, Math.floor(payload.reps))
          const sets = Math.max(1, Math.floor(payload.sets))
          saveExerciseLastWeight(prev.exerciseId, {
            bodyweight: payload.bodyweight,
            weight: payload.bodyweight ? null : w,
            reps,
            sets,
          })
          base = {
            ...prev,
            kind: 'weighted',
            weight: payload.bodyweight ? null : w,
            bodyweight: payload.bodyweight,
            reps,
            sets,
            note: payload.note,
          } as Omit<SetLog, 'isPr'>
        } else if (payload.kind === 'timed' && prev.kind === 'timed') {
          base = {
            ...prev,
            kind: 'timed',
            durationSec: Math.max(0, Math.floor(payload.durationSec)),
            note: payload.note,
          } as Omit<SetLog, 'isPr'>
        } else {
          return s
        }
        let isPr = false
        try {
          isPr = computeIsPr(others, base as Parameters<typeof computeIsPr>[1])
        } catch (e) {
          console.error('[Apex] computeIsPr on edit failed', e)
        }
        const log = { ...base, isPr } as SetLog
        const setLogs = s.setLogs.map((l) => (l.id === id ? log : l))
        try {
          return withAchievements({ ...s, setLogs })
        } catch (e) {
          console.error('[Apex] updateSetLog withAchievements failed', e)
          window.setTimeout(() => {
            notify(e instanceof Error ? e.message : 'Could not update set')
          }, 0)
          return s
        }
      })
    },
    [notify],
  )

  const deleteCardio = useCallback((id: string) => {
    setState((s) => ({ ...s, cardioEntries: s.cardioEntries.filter((c) => c.id !== id) }))
  }, [])

  const deleteBodyweight = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      bodyweightLogs: s.bodyweightLogs.filter((b) => b.id !== id),
    }))
  }, [])

  const addFriend = useCallback((username: string, weeklySets: number) => {
    const u = username.trim()
    if (!u) return
    const entry: FriendEntry = {
      id: crypto.randomUUID(),
      username: u,
      weeklySets: Math.max(0, Math.floor(weeklySets) || 0),
    }
    setState((s) => ({ ...s, friends: [...s.friends, entry] }))
    notify('Friend added')
  }, [notify])

  const removeFriend = useCallback((id: string) => {
    setState((s) => ({ ...s, friends: s.friends.filter((f) => f.id !== id) }))
  }, [])

  const setFriendWeeklySets = useCallback((id: string, weeklySets: number) => {
    setState((s) => ({
      ...s,
      friends: s.friends.map((f) =>
        f.id === id ? { ...f, weeklySets: Math.max(0, Math.floor(weeklySets) || 0) } : f,
      ),
    }))
  }, [])

  const buildTodayShareText = useCallback(() => {
    const t = todayKey
    const logs = state.setLogs.filter((l) => dateKey(new Date(l.at)) === t)
    const lines = logs.map((l) => {
      if (l.kind === 'weighted') {
        const w = l.bodyweight ? 'BW' : `${l.weight ?? 0} ${state.settings.unit}`
        return `${l.exerciseName}: ${w} × ${l.reps} (${l.sets} sets)${l.isPr ? ' PR' : ''}`
      }
      return `${l.exerciseName}: ${l.durationSec}s timed${l.isPr ? ' PR' : ''}`
    })
    const sched = state.schedule.find((d) => d.dateKey === t)
    const head = sched?.workoutName ? `${sched.workoutName} — ${t}` : `Lift — ${t}`
    return [head, ...lines].join('\n')
  }, [state.setLogs, state.schedule, state.settings.unit, todayKey])

  const value: Ctx = useMemo(
    () => ({
      userId,
      state,
      visibleExercises,
      todayKey,
      notifications,
      notify,
      dismissNotification,
      dismissRestTimer,
      prCelebration,
      dismissPrCelebration,
      gymSpotifyPromptOpen,
      dismissGymSpotifyPrompt,
      addSetLog,
      addCardioEntry,
      startCardioTimer,
      pauseCardioTimer,
      resetCardioTimer,
      applyCardioTimerToEntry,
      startGymSession,
      pauseGymSession,
      resumeGymSession,
      stopGymSession,
      addPlanExercise,
      removePlanExercise,
      linkSuperset,
      getSupersetPartner,
      clearTodayPlan,
      saveTemplate,
      deleteTemplate,
      loadTemplate,
      applyPresetPlan,
      applyAiWeeklyTemplate,
      applyCoachPlanToToday,
      updateScheduleDay,
      batchPatchSchedule,
      disconnectGoogleCalendar,
      updateSettings,
      setCycleStartDateKey,
      pushChat,
      clearChat,
      hideExercise,
      resolveExerciseById,
      addCustomExercise,
      dismissBurnoutWarnings,
      applyDeloadWeek,
      dismissDeloadSuggestion,
      toggleFavoriteExercise,
      addBodyweight,
      saveDailyCheckin,
      addWaterOz,
      logSleep,
      logReadinessCheck,
      logWorkoutMoodCheckin,
      logPostWorkoutCheckin,
      addMealLog,
      deleteMealLog,
      mergeImport,
      deleteSetLog,
      updateSetLog,
      deleteCardio,
      deleteBodyweight,
      buildTodayShareText,
      addFriend,
      removeFriend,
      setFriendWeeklySets,
      completeOnboarding,
      resetAppData,
      updateTodayLayout,
      completeNotificationPrompt,
      appleHealthAvailable,
      syncAppleHealth,
      enableAppleHealthSync,
      coachNote,
      refreshCoachNote,
    }),
    [
      userId,
      state,
      visibleExercises,
      todayKey,
      notifications,
      notify,
      dismissNotification,
      dismissRestTimer,
      prCelebration,
      dismissPrCelebration,
      gymSpotifyPromptOpen,
      dismissGymSpotifyPrompt,
      addSetLog,
      addCardioEntry,
      startCardioTimer,
      pauseCardioTimer,
      resetCardioTimer,
      applyCardioTimerToEntry,
      startGymSession,
      pauseGymSession,
      resumeGymSession,
      stopGymSession,
      addPlanExercise,
      removePlanExercise,
      linkSuperset,
      getSupersetPartner,
      clearTodayPlan,
      saveTemplate,
      deleteTemplate,
      loadTemplate,
      applyPresetPlan,
      applyAiWeeklyTemplate,
      applyCoachPlanToToday,
      updateScheduleDay,
      batchPatchSchedule,
      disconnectGoogleCalendar,
      updateSettings,
      setCycleStartDateKey,
      pushChat,
      clearChat,
      hideExercise,
      resolveExerciseById,
      addCustomExercise,
      dismissBurnoutWarnings,
      applyDeloadWeek,
      dismissDeloadSuggestion,
      toggleFavoriteExercise,
      addBodyweight,
      saveDailyCheckin,
      addWaterOz,
      logSleep,
      logReadinessCheck,
      logWorkoutMoodCheckin,
      logPostWorkoutCheckin,
      addMealLog,
      deleteMealLog,
      mergeImport,
      deleteSetLog,
      updateSetLog,
      deleteCardio,
      deleteBodyweight,
      buildTodayShareText,
      addFriend,
      removeFriend,
      setFriendWeeklySets,
      completeOnboarding,
      resetAppData,
      updateTodayLayout,
      completeNotificationPrompt,
      appleHealthAvailable,
      syncAppleHealth,
      enableAppleHealthSync,
      coachNote,
      refreshCoachNote,
    ],
  )

  return (
    <WorkoutContext.Provider value={value}>
      <WorkoutTickContext.Provider value={tickValue}>{children}</WorkoutTickContext.Provider>
    </WorkoutContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with provider
export function useWorkout(): Ctx {
  const c = useContext(WorkoutContext)
  if (!c) throw new Error('useWorkout outside provider')
  return c
}

/** Live clock + running timers — isolated so charts and static views do not re-render every second. */
// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with provider
export function useWorkoutTick(): TickCtx {
  const c = useContext(WorkoutTickContext)
  if (!c) throw new Error('useWorkoutTick outside provider')
  return c
}
