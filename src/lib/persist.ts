import type { AppPersisted, CardioEntry, CardioTimerPersist, Exercise, MuscleGroup, SetLog, ChatMessage } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { dateKey, weekStartMonday } from './dates'
import { normalizeTodayLayout } from './todayLayout'

const STORAGE_KEY = 'workout-app-v1'
/** One-time: reset coach chat to welcome (clears legacy duplicate messages). */
const CLAUDE_CHAT_RESET_KEY = 'apex-claude-coach-chat-reset-v2'

const COACH_WELCOME_ID = 'apex-claude-welcome-v1'
const COACH_WELCOME_PREFIX = "Hi — I'm your Apex AI coach"

function coachWelcomeMessages(): ChatMessage[] {
  return [
    {
      id: COACH_WELCOME_ID,
      role: 'model',
      text: "Hi — I'm your Apex AI coach. I can see your goals, this week's logged work, your schedule, and your streak. Ask me anything about training, recovery, or programming.",
      at: Date.now(),
    },
  ]
}

/** Strip accidental debug lines (e.g. leaked model ids) from assistant bubbles. */
export function sanitizeCoachBubbleText(text: string): string {
  return text
    .split(/\n/)
    .map((l) => l.trimEnd())
    .filter((line) => {
      const t = line.trim()
      if (!t) return false
      if (/^model:\s*claude/i.test(t)) return false
      if (/^model:\s*/i.test(t) && /claude|sonnet|anthropic/i.test(t)) return false
      return true
    })
    .join('\n')
    .trim()
}

function isJunkCoachMessage(m: ChatMessage): boolean {
  const t = m.text.trim()
  if (!t) return m.role === 'model'
  if (/^\s*model:\s*claude/i.test(t)) return true
  if (/^\s*model:\s*[^\s]+\s*$/i.test(t) && /claude|sonnet|anthropic/i.test(t)) return true
  return false
}

function isCoachWelcomeMessage(m: ChatMessage): boolean {
  const text = sanitizeCoachBubbleText(m.text)
  return (
    m.role === 'model' &&
    (m.id === COACH_WELCOME_ID ||
      text.startsWith(COACH_WELCOME_PREFIX) ||
      text.startsWith("Hi — I'm your Apex coach"))
  )
}

function isValidChatMessage(m: unknown): m is ChatMessage {
  if (!m || typeof m !== 'object') return false
  const o = m as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    (o.role === 'user' || o.role === 'model') &&
    typeof o.text === 'string' &&
    typeof o.at === 'number'
  )
}

const MUSCLE_GROUPS = new Set<MuscleGroup>([
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
  'Cardio',
  'Stretches',
])

export function migrateCustomExercises(raw: unknown): Exercise[] {
  if (!Array.isArray(raw)) return []
  const out: Exercise[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = typeof o.id === 'string' && o.id.startsWith('custom-') ? o.id : null
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 120) : ''
    const mg = o.muscleGroup
    if (!id || !name || typeof mg !== 'string' || !MUSCLE_GROUPS.has(mg as MuscleGroup)) continue
    let gifUrl: string | undefined
    if (typeof o.gifUrl === 'string') {
      const g = o.gifUrl.trim().slice(0, 2048)
      if (/^https?:\/\//i.test(g)) gifUrl = g
    }
    out.push({ id, name, muscleGroup: mg as MuscleGroup, ...(gifUrl ? { gifUrl } : {}) })
  }
  return out
}

/**
 * Coach chat: drop debug/junk rows, at most one canonical welcome (preserving timeline order),
 * strip duplicate welcome-like model bubbles, collapse adjacent duplicate bubbles.
 */
export function normalizeCoachChatMessages(messages: ChatMessage[]): ChatMessage[] {
  const raw = (Array.isArray(messages) ? messages : []).filter(isValidChatMessage).filter((m) => !isJunkCoachMessage(m))

  const welcomeCanon = coachWelcomeMessages()[0]!
  let welcomeUsed = false

  const shaped: ChatMessage[] = []
  for (const m of raw) {
    let next: ChatMessage = m
    if (m.role === 'model') {
      const cleaned = sanitizeCoachBubbleText(m.text)
      if (!cleaned.trim()) continue
      next = cleaned === m.text ? m : { ...m, text: cleaned }
    }

    if (isCoachWelcomeMessage(next)) {
      if (welcomeUsed) continue
      welcomeUsed = true
      shaped.push({ ...welcomeCanon, at: next.at })
      continue
    }

    shaped.push(next)
  }

  const out: ChatMessage[] = []
  for (const m of shaped) {
    const prev = out[out.length - 1]
    if (prev && prev.role === m.role && prev.text === m.text) continue
    out.push(m)
  }

  return out.length ? out : [{ ...welcomeCanon, at: 1 }]
}

function migrateCardioTimer(
  old: Partial<CardioTimerPersist> & {
    startedAt?: number | null
    accumulatedMs?: number
    pauseStartedAt?: number | null
  } | undefined,
): Partial<CardioTimerPersist> {
  if (!old) return {}
  if ('baseMs' in old && old.baseMs != null) return old
  const accumulated = old.accumulatedMs ?? 0
  return {
    running: old.running,
    baseMs: accumulated,
    segmentStartAt: old.running && old.startedAt ? old.startedAt : null,
  }
}

export function normalizeImportedCardio(raw: unknown): CardioEntry[] {
  return migrateCardioEntries(raw)
}

function migrateCardioEntries(raw: unknown): CardioEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item: unknown) => {
    const c = item as Record<string, unknown> & { durationSec?: number; durationMinutes?: number }
    const id = typeof c.id === 'string' ? c.id : crypto.randomUUID()
    const name = typeof c.name === 'string' ? c.name : 'Cardio'
    const at = typeof c.at === 'number' ? c.at : Date.now()
    let durationMinutes: number | null = null
    if (typeof c.durationMinutes === 'number' && Number.isFinite(c.durationMinutes)) {
      durationMinutes = c.durationMinutes
    } else if (typeof c.durationSec === 'number' && Number.isFinite(c.durationSec)) {
      durationMinutes = Math.round((c.durationSec / 60) * 100) / 100
    }
    return { id, name, durationMinutes, at }
  })
}

function migrateSetLogs(logs: SetLog[]): SetLog[] {
  return logs.map((l) =>
    (l.muscleGroup as string) === 'Flexibility'
      ? { ...l, muscleGroup: 'Stretches' as MuscleGroup }
      : l,
  )
}

function migrateAppState(s: AppPersisted): AppPersisted {
  return {
    ...s,
    setLogs: migrateSetLogs(s.setLogs),
    friends: s.friends ?? [],
    cardioEntries: migrateCardioEntries(s.cardioEntries),
    customExercises: migrateCustomExercises(s.customExercises),
    favoriteExerciseIds: s.favoriteExerciseIds ?? [],
    lifetimeXp: typeof s.lifetimeXp === 'number' && Number.isFinite(s.lifetimeXp) ? s.lifetimeXp : 0,
    todayLayout: normalizeTodayLayout(s.todayLayout),
    notificationPromptDone:
      typeof s.notificationPromptDone === 'boolean' ? s.notificationPromptDone : false,
    lastWeeklySummaryNotifWeekStart:
      typeof s.lastWeeklySummaryNotifWeekStart === 'string' || s.lastWeeklySummaryNotifWeekStart === null
        ? s.lastWeeklySummaryNotifWeekStart
        : null,
    schedule: s.schedule.map((d) => ({
      ...d,
      plannedExerciseIds: Array.isArray(d.plannedExerciseIds) ? d.plannedExerciseIds : [],
    })),
  }
}

function emptyScheduleForWeek(weekStart: string): AppPersisted['schedule'] {
  const start = new Date(weekStart + 'T12:00:00')
  const keys: string[] = []
  for (let i = 0; i < 7; i++) {
    const x = new Date(start)
    x.setDate(start.getDate() + i)
    keys.push(dateKey(x))
  }
  return keys.map((dateKeyVal) => ({
    dateKey: dateKeyVal,
    workoutName: '',
    notes: '',
    plannedExerciseIds: [],
  }))
}

export function defaultState(): AppPersisted {
  const ws = dateKey(weekStartMonday(new Date()))
  return {
    version: 1,
    setLogs: [],
    todayPlanExerciseIds: [],
    favoriteExerciseIds: [],
    hiddenExerciseIds: [],
    customExercises: [],
    schedule: emptyScheduleForWeek(ws),
    templates: [],
    settings: { ...DEFAULT_SETTINGS },
    bodyweightLogs: [],
    cardioEntries: [],
    gymSession: {
      active: false,
      mode: 'stopwatch',
      startedAt: null,
      manualStartedAt: null,
      pauseStartedAt: null,
      accumulatedPauseMs: 0,
    },
    cardioTimer: {
      running: false,
      baseMs: 0,
      segmentStartAt: null,
    },
    achievements: [],
    restTimer: { endAt: null, dismissed: true },
    chatMessages: coachWelcomeMessages(),
    scheduleWeekStart: ws,
    friends: [],
    onboardingComplete: false,
    lifetimeXp: 0,
    todayLayout: normalizeTodayLayout(undefined),
    notificationPromptDone: false,
    lastWeeklySummaryNotifWeekStart: null,
  }
}

export function loadState(): AppPersisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      try {
        localStorage.setItem(CLAUDE_CHAT_RESET_KEY, '1')
      } catch {
        /* ignore */
      }
      return defaultState()
    }
    const rawObj = JSON.parse(raw) as Record<string, unknown>
    if (rawObj.version !== 1) return defaultState()
    delete rawObj.geminiApiKey
    const parsed = rawObj as unknown as AppPersisted

    const onboardingComplete =
      typeof parsed.onboardingComplete === 'boolean'
        ? parsed.onboardingComplete
        : (parsed.setLogs?.length ?? 0) > 0

    let merged = migrateAppState({
      ...defaultState(),
      ...parsed,
      onboardingComplete,
      hiddenExerciseIds: parsed.hiddenExerciseIds ?? [],
      favoriteExerciseIds: parsed.favoriteExerciseIds ?? [],
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      gymSession: { ...defaultState().gymSession, ...parsed.gymSession },
      cardioTimer: {
        ...defaultState().cardioTimer,
        ...migrateCardioTimer(parsed.cardioTimer),
      },
      restTimer: { ...defaultState().restTimer, ...parsed.restTimer },
      setLogs: migrateSetLogs(parsed.setLogs ?? []),
      friends: parsed.friends ?? [],
      cardioEntries: migrateCardioEntries(parsed.cardioEntries ?? []),
      lifetimeXp:
        typeof parsed.lifetimeXp === 'number' && Number.isFinite(parsed.lifetimeXp)
          ? Math.max(0, parsed.lifetimeXp)
          : 0,
    })

    try {
      if (!localStorage.getItem(CLAUDE_CHAT_RESET_KEY)) {
        merged = { ...merged, chatMessages: coachWelcomeMessages() }
        localStorage.setItem(CLAUDE_CHAT_RESET_KEY, '1')
      }
    } catch {
      /* ignore */
    }

    merged = { ...merged, chatMessages: normalizeCoachChatMessages(merged.chatMessages) }

    return merged
  } catch {
    return defaultState()
  }
}

export function saveState(state: AppPersisted): void {
  try {
    const chatMessages = normalizeCoachChatMessages(state.chatMessages)
    const json = JSON.stringify({ ...state, chatMessages })
    localStorage.setItem(STORAGE_KEY, json)
    if (import.meta.env.DEV) {
      console.log('[Apex] saveState ok —', state.setLogs.length, 'set logs,', state.cardioEntries.length, 'cardio')
    }
  } catch (e) {
    console.error('[Apex] saveState failed', e)
  }
}

/** Ensure schedule matches current week; migrate if week changed */
export function alignScheduleWeek(state: AppPersisted): AppPersisted {
  const ws = dateKey(weekStartMonday(new Date()))
  if (state.scheduleWeekStart === ws && state.schedule.length === 7) {
    const expected = emptyScheduleForWeek(ws).map((s) => s.dateKey)
    const ok = state.schedule.every((s, i) => s.dateKey === expected[i])
    if (ok) return state
  }
  const base = emptyScheduleForWeek(ws)
  const next = base.map((slot) => {
    const old = state.schedule.find((s) => s.dateKey === slot.dateKey)
    return old
      ? { ...old, dateKey: slot.dateKey, plannedExerciseIds: old.plannedExerciseIds ?? [] }
      : { dateKey: slot.dateKey, workoutName: '', notes: '', plannedExerciseIds: [] }
  })
  return { ...state, schedule: next, scheduleWeekStart: ws }
}
