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
} from '../lib/persist'
import { dateKey, weekStartMonday } from '../lib/dates'
import { computeWeekSummary } from '../lib/weekSummary'
import { normalizeTodayLayout } from '../lib/todayLayout'
import { showWeeklySummaryNotification } from '../lib/desktopNotifications'
import { computeIsPr } from '../lib/pr'
import { evaluateAchievements, streakCurrent } from '../lib/achievements'
import { cardioElapsedMs, gymElapsedMs } from '../lib/timers'
import { currentWeekStartKey } from '../lib/volumeStats'
import { claudeOneSentenceWorkoutSummary } from '../lib/anthropicCoach'
import { applyTrainerShareToState } from '../lib/trainer'
import {
  fetchLatestCoachNoteForClient,
  fetchUserWorkoutState,
  pickWorkoutStateForHydrate,
  supabase,
  upsertLeaderboardEntry,
  upsertUserWorkoutState,
} from '../lib/supabase'
import { XP_PER_PR, XP_PER_SET, XP_PER_WORKOUT_COMPLETE } from '../lib/xpLevel'
import type {
  AppPersisted,
  CardioEntry,
  ChatMessage,
  Exercise,
  FriendEntry,
  MuscleGroup,
  ScheduleDay,
  SetLog,
  SetLogEditPayload,
  Settings,
  TimedSetLog,
  TodayLayoutPersist,
  TodaySupersetPair,
  WeightedSetLog,
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
  prCelebration: { exerciseName: string } | null
  dismissPrCelebration: () => void
  addSetLog: (
    partial: Omit<WeightedSetLog, 'id' | 'at' | 'isPr'> | Omit<TimedSetLog, 'id' | 'at' | 'isPr'>,
    options?: { deferRestTimer?: boolean },
  ) => void
  linkSuperset: (exerciseIdA: string, exerciseIdB: string) => void
  getSupersetPartner: (exerciseId: string) => string | null
  addCardioEntry: (name: string, durationMinutes: number | null) => void
  completeOnboarding: () => void
  resetAppData: () => Promise<void>
  startCardioTimer: () => void
  pauseCardioTimer: () => void
  resetCardioTimer: () => void
  applyCardioTimerToEntry: (entryId: string) => void
  startGymSession: (mode: 'stopwatch' | 'manual', manualMsSinceMidnight?: number) => void
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
  updateScheduleDay: (dateKeyVal: string, patch: Partial<ScheduleDay>) => void
  batchPatchSchedule: (patches: { dateKey: string; patch: Partial<ScheduleDay> }[]) => void
  disconnectGoogleCalendar: () => void
  updateSettings: (patch: Partial<Settings>) => void
  pushChat: (role: 'user' | 'model', text: string) => void
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
  toggleFavoriteExercise: (exerciseId: string) => void
  addBodyweight: (value: number) => void
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
  coachNote: string | null
  refreshCoachNote: () => Promise<void>
}

const WorkoutContext = createContext<Ctx | null>(null)
const WorkoutTickContext = createContext<TickCtx | null>(null)

function withAchievements(prev: AppPersisted): AppPersisted {
  return { ...prev, achievements: evaluateAchievements(prev) }
}

export function WorkoutProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const [state, setState] = useState<AppPersisted>(() => alignScheduleWeek(loadState()))
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [prCelebration, setPrCelebration] = useState<{ exerciseName: string } | null>(null)
  const [clock, setClock] = useState(() => Date.now())
  const [coachNote, setCoachNote] = useState<string | null>(null)
  const stateRef = useRef(state)
  const notifyClearTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const cloudReadyRef = useRef(false)
  const cloudSaveTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
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
        synced = withAchievements(
          alignScheduleWeek(
            pickWorkoutStateForHydrate(synced, remote.state, remote.updatedAt),
          ),
        )
        setState(synced)
      } else if (isAppOnline()) {
        await upsertUserWorkoutState(userId, applyTrainerShareToState(synced))
      }
      const { data: authData } = await supabase.auth.getUser()
      await upsertLeaderboardEntry(userId, synced, authData.user)
      cloudReadyRef.current = true
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
    const id = window.setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const todayKey = dateKey(new Date(clock))

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
    const customs = state.customExercises
      .filter((e) => !hidden.has(e.id))
      .map((e) => ({
        id: e.id,
        name: e.name,
        muscleGroup: e.muscleGroup,
        ...(e.gifUrl?.trim() ? { gifUrl: e.gifUrl.trim() } : {}),
      }))
    return [...builtIn, ...customs]
  }, [state.hiddenExerciseIds, state.customExercises])

  const resolveExerciseById = useCallback(
    (exerciseId: string): Exercise | null => {
      if (state.hiddenExerciseIds.includes(exerciseId)) return null
      const built = EXERCISES.find((e) => e.id === exerciseId)
      if (built) return built
      const c = state.customExercises.find((e) => e.id === exerciseId)
      if (!c) return null
      return {
        id: c.id,
        name: c.name,
        muscleGroup: c.muscleGroup,
        ...(c.gifUrl?.trim() ? { gifUrl: c.gifUrl.trim() } : {}),
      }
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

  const addSetLog: Ctx['addSetLog'] = useCallback((partial, options) => {
    const at = Date.now()
    const id = crypto.randomUUID()
    let normalized = partial
    if (partial.kind === 'weighted' && !partial.bodyweight) {
      const w = partial.weight
      if (w != null && !Number.isFinite(w)) {
        normalized = { ...partial, weight: 0 }
      }
    }
    let isPrFlag = false
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
      isPrFlag = isPr
      const log = { ...base, isPr } as SetLog
      const setLogs = [...s.setLogs, log]
      const sec = Math.max(1, Math.floor(s.settings.restTimerSeconds) || 90)
      const deferRest = options?.deferRestTimer === true
      const rest =
        deferRest || !s.settings.restTimerEnabled
          ? { endAt: null, dismissed: true }
          : { endAt: at + sec * 1000, dismissed: false }
      const xpGain = XP_PER_SET + (isPr ? XP_PER_PR : 0)
      try {
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
    if (import.meta.env.DEV) {
      console.log('[Apex] addSetLog saved', id)
    }
    requestAnimationFrame(() => {
      if (isPrFlag) {
        const name = 'exerciseName' in normalized ? normalized.exerciseName : 'Exercise'
        setPrCelebration({ exerciseName: name })
      }
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

  const startGymSession: Ctx['startGymSession'] = useCallback((mode, manualMsSinceMidnight) => {
    const d = new Date()
    let manualStartedAt: number | null = null
    if (mode === 'manual' && manualMsSinceMidnight != null) {
      const start = new Date(d)
      start.setHours(0, 0, 0, 0)
      manualStartedAt = start.getTime() + manualMsSinceMidnight
    }
    setState((s) => ({
      ...s,
      gymSession: {
        active: true,
        mode,
        startedAt: mode === 'stopwatch' ? Date.now() : null,
        manualStartedAt: mode === 'manual' ? manualStartedAt : null,
        pauseStartedAt: null,
        accumulatedPauseMs: 0,
      },
    }))
    notify('Gym session started')
  }, [notify])

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
    const payload = `Duration about ${mins} minutes. Exercises: ${names.join(', ')}. Sets: ${logsToday.length}.`

    const hadActiveSession = snapshot.gymSession.active
    const earnedWorkoutXp = hadActiveSession && logsToday.length > 0
    setState((s) => ({
      ...s,
      gymSession: {
        active: false,
        mode: 'stopwatch',
        startedAt: null,
        manualStartedAt: null,
        pauseStartedAt: null,
        accumulatedPauseMs: 0,
      },
      lifetimeXp: earnedWorkoutXp ? (s.lifetimeXp ?? 0) + XP_PER_WORKOUT_COMPLETE : (s.lifetimeXp ?? 0),
    }))
    notify('Gym session ended')

    try {
      const sentence = await claudeOneSentenceWorkoutSummary(snapshot, payload)
      setState((s) => ({
        ...s,
        schedule: s.schedule.map((d) =>
          d.dateKey === today ? { ...d, aiSummary: sentence } : d,
        ),
      }))
    } catch {
      notify('Could not generate workout summary right now.')
    }
  }, [notify])

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

  const pushChat = useCallback((role: 'user' | 'model', text: string) => {
    if (role === 'user' && isCoachUiPromptLine(text)) return
    const cleanedModel =
      role === 'model' ? limitCoachReplySentences(sanitizeCoachBubbleText(text)) : ''
    if (role === 'model' && !cleanedModel.trim()) return
    const body =
      role === 'model' ? cleanedModel : redactLeakedApiMetadataFromText(text.trim())
    if (role === 'user' && !body) return
    const msg: ChatMessage = { id: crypto.randomUUID(), role, text: body, at: Date.now() }
    setState((s) => ({
      ...s,
      chatMessages: normalizeCoachChatMessages([...s.chatMessages, msg]),
    }))
  }, [])

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
          { id, name: trimmed, muscleGroup, ...(g ? { gifUrl: g } : {}), ...tips },
        ],
      }))
      notify('Custom exercise added')
    },
    [notify],
  )

  const dismissBurnoutWarnings = useCallback(() => {
    setState((s) => ({ ...s, burnoutDismissedWeekStart: currentWeekStartKey() }))
  }, [])

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

  const mergeImport = useCallback((partial: Partial<AppPersisted>, options?: { silent?: boolean }) => {
    setState((s) => {
      const importedCardio = partial.cardioEntries
        ? normalizeImportedCardio(partial.cardioEntries)
        : []
      const next: AppPersisted = {
        ...s,
        setLogs: partial.setLogs ? [...s.setLogs, ...partial.setLogs] : s.setLogs,
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

  const completeOnboarding = useCallback(() => {
    setOnboardingCompleteLocal(true)
    setState((s) => ({ ...s, onboardingComplete: true }))
  }, [])

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
          base = {
            ...prev,
            kind: 'weighted',
            weight: payload.bodyweight ? null : w,
            bodyweight: payload.bodyweight,
            reps: Math.max(0, Math.floor(payload.reps)),
            sets: Math.max(1, Math.floor(payload.sets)),
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
    const head = sched?.workoutName ? `${sched.workoutName} — ${t}` : `Apex — ${t}`
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
      updateScheduleDay,
      batchPatchSchedule,
      disconnectGoogleCalendar,
      updateSettings,
      pushChat,
      clearChat,
      hideExercise,
      resolveExerciseById,
      addCustomExercise,
      dismissBurnoutWarnings,
      toggleFavoriteExercise,
      addBodyweight,
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
      updateScheduleDay,
      batchPatchSchedule,
      disconnectGoogleCalendar,
      updateSettings,
      pushChat,
      clearChat,
      hideExercise,
      resolveExerciseById,
      addCustomExercise,
      dismissBurnoutWarnings,
      toggleFavoriteExercise,
      addBodyweight,
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
