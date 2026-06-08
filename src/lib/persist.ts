import { useCallback, useState } from 'react'
import { equipmentForExercise, isEquipmentType } from './equipment'
import type {
  AppPersisted,
  CardioEntry,
  CardioTimerPersist,
  CoachChatImage,
  Exercise,
  MuscleGroup,
  SetLog,
  ChatMessage,
} from '../types'
import { DEFAULT_SETTINGS, DEFAULT_WATER_GOAL_OZ, DEFAULT_MACRO_GOAL_CALORIES, DEFAULT_MACRO_GOAL_PROTEIN_G, DEFAULT_MACRO_GOAL_CARBS_G, DEFAULT_MACRO_GOAL_FAT_G } from '../types'
import { stripCoachPlanMachineLine } from './coachWorkoutPlan'
import { dateKey, weekStartMonday } from './dates'
import { normalizeTodayLayout } from './todayLayout'
import { isTrainingMode } from './trainingMode'

const STORAGE_KEY = 'workout-app-v1'

/** Set when user finishes first-launch onboarding. */
export const APEX_ONBOARDING_COMPLETE_KEY = 'apex-onboarding-complete'

/** Set after first coach welcome is applied (see WorkoutContext mount). */
export const APEX_COACH_INIT_FLAG = 'apex_coach_initialized'

/** Coach / planner profile (fitness goal, etc.). */
export const APEX_COACH_PROFILE_KEY = 'apex-coach-profile'

/** PWA install banner dismissed (show at most once). */
export const APEX_PWA_DISMISSED_KEY = 'apex-pwa-dismissed'

/** Last calendar day the in-progress workout session was tied to (`dateKey`). */
export const APEX_LAST_SESSION_DATE_KEY = 'apex-last-session-date'

export const OFFLINE_SYNC_TOAST = "You're offline — data will sync when reconnected"

export function isPwaInstallDismissed(): boolean {
  try {
    return localStorage.getItem(APEX_PWA_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export function setPwaInstallDismissed(): void {
  try {
    localStorage.setItem(APEX_PWA_DISMISSED_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function isAppOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}

export function readFitnessGoalFromCoachProfile(fallback = ''): string {
  try {
    const raw = localStorage.getItem(APEX_COACH_PROFILE_KEY)
    if (!raw) return fallback
    const o = JSON.parse(raw) as Record<string, unknown>
    if (typeof o.fitnessGoal === 'string' && o.fitnessGoal.trim()) return o.fitnessGoal.trim()
    if (typeof o.goal === 'string' && o.goal.trim()) return o.goal.trim()
    if (typeof o.fitnessGoals === 'string' && o.fitnessGoals.trim()) return o.fitnessGoals.trim()
  } catch {
    /* ignore */
  }
  return fallback
}

export function isOnboardingCompleteLocal(): boolean {
  try {
    return localStorage.getItem(APEX_ONBOARDING_COMPLETE_KEY) === '1'
  } catch {
    return false
  }
}

export function setOnboardingCompleteLocal(complete: boolean): void {
  try {
    if (complete) localStorage.setItem(APEX_ONBOARDING_COMPLETE_KEY, '1')
    else localStorage.removeItem(APEX_ONBOARDING_COMPLETE_KEY)
  } catch {
    /* ignore */
  }
}

const COACH_WELCOME_ID = 'apex-claude-welcome-v1'
const COACH_WELCOME_PREFIX = "Hi — I'm your Lift AI coach"

/** Lines duplicated by the suggestion chips — never show inside a bubble. */
const COACH_UI_PROMPT_LINES = new Set([
  'What should I work on today?',
  'Review my progress this week',
  'Design me a workout plan',
])

export function isCoachUiPromptLine(text: string): boolean {
  return COACH_UI_PROMPT_LINES.has(text.trim())
}

/** Remove leaked API/model metadata from a single line. */
function isLeakedModelMetadataLine(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  if (/^model:\s*/i.test(t)) return true
  if (/model:\s*\S+/i.test(t) && /claude|sonnet|anthropic/i.test(t)) return true
  if (/\bclaude-sonnet-4[\w-]*/i.test(t)) return true
  if (/^anthropic-version\s*:/i.test(t)) return true
  return false
}

/** Strip model ids / API debug from any user-visible string. */
export function redactLeakedApiMetadataFromText(text: string): string {
  return text
    .split(/\n/)
    .map((l) => l.trimEnd())
    .filter((line) => !isLeakedModelMetadataLine(line))
    .join('\n')
    .replace(/\bclaude-sonnet-4[\w-]*/gi, '')
    .replace(/model:\s*[^\n]*/gi, '')
    .replace(/anthropic-version\s*:\s*[^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Remove chip prompt echoes (whole lines or trailing duplicates) so they only appear in the chip row. */
function stripCoachUiPromptEchoes(text: string): string {
  let s = text
  for (const phrase of COACH_UI_PROMPT_LINES) {
    const esc = escapeRegExp(phrase)
    s = s.replace(new RegExp(`(^|\\n)\\s*${esc}\\s*(?=\\n|$)`, 'gi'), '\n')
    s = s.replace(new RegExp(`([.!?])\\s*${esc}\\s*$`, 'gi'), '$1')
    s = s.replace(new RegExp(`\\s*${esc}\\s*$`, 'gi'), '')
    // Standalone prompt line embedded without newlines (e.g. after welcome copy).
    s = s.replace(new RegExp(`\\s+${esc}\\s+`, 'gi'), ' ')
    if (s.trim().toLowerCase() === phrase.toLowerCase()) s = ''
  }
  return s.replace(/\n{3,}/g, '\n\n').trim()
}

export function coachWelcomeMessages(): ChatMessage[] {
  return [
    {
      id: COACH_WELCOME_ID,
      role: 'model',
      text: "Hi — I'm your Lift AI coach. I can see your goals, this week's logged work, your schedule, and your streak. Ask me anything about training, recovery, or programming.",
      at: Date.now(),
    },
  ]
}

/** Strip accidental debug / API metadata from user-visible notification text. */
export function stripNotificationMessage(message: string): string {
  const out = redactLeakedApiMetadataFromText(message)
  if (out) return out.length > 360 ? `${out.slice(0, 360)}…` : out
  return 'Something went wrong.'
}

function shouldLimitCoachReplySentences(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (t.startsWith('{') || t.startsWith('[')) return false
  if (/"suggestedDays"\s*:/.test(t)) return false
  return true
}

/** Cap coach chat replies at N sentences (client-side; matches API instruction). */
export function limitCoachReplySentences(text: string, maxSentences = 3): string {
  const t = text.trim()
  if (!t || !shouldLimitCoachReplySentences(t)) return t

  const parts = t.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)
  if (!parts || parts.length <= maxSentences) return t
  return parts
    .slice(0, maxSentences)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ')
}

/** Strip accidental debug lines (e.g. leaked model ids) from assistant bubbles. */
export function sanitizeCoachBubbleText(text: string): string {
  const lineCleaned = redactLeakedApiMetadataFromText(text)
    .split(/\n/)
    .filter((line) => {
      const t = line.trim()
      if (!t) return false
      if (COACH_UI_PROMPT_LINES.has(t)) return false
      return true
    })
    .join('\n')
    .trim()
  return stripCoachUiPromptEchoes(lineCleaned)
}

/** Display text for a coach chat row; null means do not render a bubble. */
export function getCoachMessageDisplayText(m: ChatMessage): string | null {
  if (m.role === 'user' && isCoachUiPromptLine(m.text)) return null
  let display = sanitizeCoachBubbleText(m.text)
  if (m.role === 'model' && !m.workoutPlan) {
    display = limitCoachReplySentences(display)
  }
  display = stripCoachPlanMachineLine(display)
  return display.trim() ? display : null
}

function isValidCoachChatImage(raw: unknown): raw is CoachChatImage {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  const mt = o.mediaType
  if (mt !== 'image/jpeg' && mt !== 'image/png' && mt !== 'image/gif' && mt !== 'image/webp') {
    return false
  }
  return typeof o.data === 'string' && o.data.length > 0 && o.data.length <= 5_000_000
}

function isJunkCoachMessage(m: ChatMessage): boolean {
  const t = m.text.trim()
  if (!t && !m.image) return m.role === 'model'
  if (!t && m.image) return m.role !== 'user'
  if (isLeakedModelMetadataLine(t)) return true
  if (m.role === 'user' && isCoachUiPromptLine(t)) return true
  return false
}

function isCoachWelcomeMessage(m: ChatMessage): boolean {
  const text = sanitizeCoachBubbleText(m.text)
  return (
    m.role === 'model' &&
    (m.id === COACH_WELCOME_ID ||
      text.startsWith(COACH_WELCOME_PREFIX) ||
      text.startsWith("Hi — I'm your Lift coach"))
  )
}

function isValidChatMessage(m: unknown): m is ChatMessage {
  if (!m || typeof m !== 'object') return false
  const o = m as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    (o.role === 'user' || o.role === 'model') &&
    typeof o.text === 'string' &&
    typeof o.at === 'number' &&
    (o.workoutPlan === undefined || o.workoutPlan === true) &&
    (o.image === undefined || isValidCoachChatImage(o.image))
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
    const muscleGroup = mg as MuscleGroup
    const equipment = isEquipmentType(o.equipment)
      ? o.equipment
      : equipmentForExercise(name, muscleGroup)
    out.push({
      id,
      name,
      muscleGroup,
      equipment,
      ...(gifUrl ? { gifUrl } : {}),
    })
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
    } else {
      const cleaned = redactLeakedApiMetadataFromText(m.text)
      if (!cleaned.trim()) continue
      if (isCoachUiPromptLine(cleaned)) continue
      next = cleaned === m.text ? m : { ...m, text: cleaned }
    }

    if (m.role === 'user' && isCoachUiPromptLine(next.text)) continue

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

  return out
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

function migrateSleepLogs(raw: unknown): AppPersisted['sleepLogs'] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item: unknown) => {
      const e = item as Record<string, unknown>
      const dateKeyVal = typeof e.dateKey === 'string' ? e.dateKey : ''
      const durationMinutes =
        typeof e.durationMinutes === 'number' && Number.isFinite(e.durationMinutes)
          ? Math.max(0, Math.round(e.durationMinutes))
          : 0
      const qRaw =
        typeof e.quality === 'number' && Number.isFinite(e.quality) ? Math.round(e.quality) : 3
      const quality = Math.min(5, Math.max(1, qRaw)) as 1 | 2 | 3 | 4 | 5
      if (!dateKeyVal || durationMinutes <= 0) return null
      return {
        id: typeof e.id === 'string' ? e.id : crypto.randomUUID(),
        dateKey: dateKeyVal,
        durationMinutes,
        quality,
        at: typeof e.at === 'number' ? e.at : Date.now(),
      }
    })
    .filter((x): x is AppPersisted['sleepLogs'][number] => x != null)
}

function migrateWaterLogs(raw: unknown): AppPersisted['waterLogs'] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item: unknown) => {
      const e = item as Record<string, unknown>
      const dateKeyVal = typeof e.dateKey === 'string' ? e.dateKey : ''
      const oz = typeof e.oz === 'number' && Number.isFinite(e.oz) ? Math.max(0, e.oz) : 0
      if (!dateKeyVal || oz <= 0) return null
      return {
        id: typeof e.id === 'string' ? e.id : crypto.randomUUID(),
        dateKey: dateKeyVal,
        oz,
        at: typeof e.at === 'number' ? e.at : Date.now(),
      }
    })
    .filter((x): x is AppPersisted['waterLogs'][number] => x != null)
}

function migrateMealLogs(raw: unknown): AppPersisted['mealLogs'] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item: unknown) => {
      const e = item as Record<string, unknown>
      const dateKeyVal = typeof e.dateKey === 'string' ? e.dateKey : ''
      const name = typeof e.name === 'string' ? e.name.trim().slice(0, 120) : ''
      const num = (k: string) => {
        const v = e[k]
        return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0
      }
      if (!dateKeyVal || !name) return null
      return {
        id: typeof e.id === 'string' ? e.id : crypto.randomUUID(),
        dateKey: dateKeyVal,
        name,
        calories: num('calories'),
        proteinG: num('proteinG'),
        carbsG: num('carbsG'),
        fatG: num('fatG'),
        at: typeof e.at === 'number' ? e.at : Date.now(),
      }
    })
    .filter((x): x is AppPersisted['mealLogs'][number] => x != null)
}

function migrateAppState(s: AppPersisted): AppPersisted {
  const settings = {
    ...DEFAULT_SETTINGS,
    ...s.settings,
    waterGoalOz:
      typeof s.settings.waterGoalOz === 'number' &&
      Number.isFinite(s.settings.waterGoalOz) &&
      s.settings.waterGoalOz > 0
        ? Math.round(s.settings.waterGoalOz)
        : DEFAULT_WATER_GOAL_OZ,
    macroGoalCalories:
      typeof s.settings.macroGoalCalories === 'number' &&
      Number.isFinite(s.settings.macroGoalCalories) &&
      s.settings.macroGoalCalories > 0
        ? Math.round(s.settings.macroGoalCalories)
        : DEFAULT_MACRO_GOAL_CALORIES,
    macroGoalProteinG:
      typeof s.settings.macroGoalProteinG === 'number' &&
      Number.isFinite(s.settings.macroGoalProteinG) &&
      s.settings.macroGoalProteinG > 0
        ? Math.round(s.settings.macroGoalProteinG)
        : DEFAULT_MACRO_GOAL_PROTEIN_G,
    macroGoalCarbsG:
      typeof s.settings.macroGoalCarbsG === 'number' &&
      Number.isFinite(s.settings.macroGoalCarbsG) &&
      s.settings.macroGoalCarbsG > 0
        ? Math.round(s.settings.macroGoalCarbsG)
        : DEFAULT_MACRO_GOAL_CARBS_G,
    macroGoalFatG:
      typeof s.settings.macroGoalFatG === 'number' &&
      Number.isFinite(s.settings.macroGoalFatG) &&
      s.settings.macroGoalFatG > 0
        ? Math.round(s.settings.macroGoalFatG)
        : DEFAULT_MACRO_GOAL_FAT_G,
    cycleTrackingEnabled:
      typeof s.settings.cycleTrackingEnabled === 'boolean'
        ? s.settings.cycleTrackingEnabled
        : false,
    postWorkoutProteinNotificationEnabled:
      typeof s.settings.postWorkoutProteinNotificationEnabled === 'boolean'
        ? s.settings.postWorkoutProteinNotificationEnabled
        : true,
    gymSessionSpotifyPromptEnabled:
      typeof s.settings.gymSessionSpotifyPromptEnabled === 'boolean'
        ? s.settings.gymSessionSpotifyPromptEnabled
        : true,
    gymLocationDetectionEnabled:
      typeof s.settings.gymLocationDetectionEnabled === 'boolean'
        ? s.settings.gymLocationDetectionEnabled
        : false,
    gymLocationLat:
      typeof s.settings.gymLocationLat === 'number' && Number.isFinite(s.settings.gymLocationLat)
        ? s.settings.gymLocationLat
        : null,
    gymLocationLng:
      typeof s.settings.gymLocationLng === 'number' && Number.isFinite(s.settings.gymLocationLng)
        ? s.settings.gymLocationLng
        : null,
    gymLocationLabel:
      typeof s.settings.gymLocationLabel === 'string' ? s.settings.gymLocationLabel : '',
    appleHealthSyncEnabled:
      typeof s.settings.appleHealthSyncEnabled === 'boolean'
        ? s.settings.appleHealthSyncEnabled
        : false,
  }
  return {
    ...s,
    settings,
    waterLogs: migrateWaterLogs(s.waterLogs),
    sleepLogs: migrateSleepLogs(s.sleepLogs),
    readinessLogs: Array.isArray(s.readinessLogs) ? s.readinessLogs : [],
    workoutMoodLogs: Array.isArray(s.workoutMoodLogs) ? s.workoutMoodLogs : [],
    postWorkoutCheckins: Array.isArray(s.postWorkoutCheckins) ? s.postWorkoutCheckins : [],
    mealLogs: migrateMealLogs(s.mealLogs),
    setLogs: migrateSetLogs(s.setLogs),
    friends: s.friends ?? [],
    cardioEntries: migrateCardioEntries(s.cardioEntries),
    customExercises: migrateCustomExercises(s.customExercises),
    favoriteExerciseIds: s.favoriteExerciseIds ?? [],
    lifetimeXp: typeof s.lifetimeXp === 'number' && Number.isFinite(s.lifetimeXp) ? s.lifetimeXp : 0,
    todayLayout: normalizeTodayLayout(s.todayLayout),
    notificationPromptDone:
      typeof s.notificationPromptDone === 'boolean' ? s.notificationPromptDone : false,
    appleHealthPermissionPromptDone:
      typeof s.appleHealthPermissionPromptDone === 'boolean'
        ? s.appleHealthPermissionPromptDone
        : false,
    appleHealthToday:
      s.appleHealthToday &&
      typeof s.appleHealthToday === 'object' &&
      typeof s.appleHealthToday.dateKey === 'string'
        ? s.appleHealthToday
        : null,
    lastWeeklySummaryNotifWeekStart:
      typeof s.lastWeeklySummaryNotifWeekStart === 'string' || s.lastWeeklySummaryNotifWeekStart === null
        ? s.lastWeeklySummaryNotifWeekStart
        : null,
    schedule: s.schedule.map((d) => ({
      ...d,
      plannedExerciseIds: Array.isArray(d.plannedExerciseIds) ? d.plannedExerciseIds : [],
      trainingMode: isTrainingMode(d.trainingMode) ? d.trainingMode : undefined,
    })),
    burnoutDismissedWeekStart:
      typeof s.burnoutDismissedWeekStart === 'string' || s.burnoutDismissedWeekStart === null
        ? s.burnoutDismissedWeekStart
        : null,
    deloadActiveWeekStart:
      typeof s.deloadActiveWeekStart === 'string' || s.deloadActiveWeekStart === null
        ? s.deloadActiveWeekStart
        : null,
    deloadDismissedWeekStart:
      typeof s.deloadDismissedWeekStart === 'string' || s.deloadDismissedWeekStart === null
        ? s.deloadDismissedWeekStart
        : null,
    cycleStartDateKey:
      typeof s.cycleStartDateKey === 'string' || s.cycleStartDateKey === null
        ? s.cycleStartDateKey
        : null,
    todaySupersetPairs: Array.isArray(s.todaySupersetPairs)
      ? s.todaySupersetPairs.filter(
          (p): p is [string, string] =>
            Array.isArray(p) &&
            p.length === 2 &&
            typeof p[0] === 'string' &&
            typeof p[1] === 'string' &&
            p[0] !== p[1],
        )
      : [],
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

function readLastSessionDateKey(): string | null {
  try {
    const v = localStorage.getItem(APEX_LAST_SESSION_DATE_KEY)
    return typeof v === 'string' && v.length > 0 ? v : null
  } catch {
    return null
  }
}

function writeLastSessionDateKey(key: string): void {
  try {
    localStorage.setItem(APEX_LAST_SESSION_DATE_KEY, key)
  } catch {
    /* ignore */
  }
}

/** Clear in-progress workout + today's plan when the calendar day changes. */
export function applyDailySessionReset(state: AppPersisted): AppPersisted {
  const today = dateKey(new Date())
  const stored = readLastSessionDateKey()
  if (stored === today) return state

  writeLastSessionDateKey(today)
  return {
    ...state,
    todayPlanExerciseIds: [],
    todaySupersetPairs: [],
    gymSession: { ...defaultState().gymSession },
  }
}

export function defaultState(): AppPersisted {
  const ws = dateKey(weekStartMonday(new Date()))
  return {
    version: 1,
    setLogs: [],
    todayPlanExerciseIds: [],
    todaySupersetPairs: [],
    favoriteExerciseIds: [],
    hiddenExerciseIds: [],
    customExercises: [],
    schedule: emptyScheduleForWeek(ws),
    templates: [],
    settings: { ...DEFAULT_SETTINGS },
    bodyweightLogs: [],
    waterLogs: [],
    sleepLogs: [],
    readinessLogs: [],
    workoutMoodLogs: [],
    postWorkoutCheckins: [],
    mealLogs: [],
    cardioEntries: [],
    gymSession: {
      active: false,
      mode: 'stopwatch',
      startedAt: null,
      manualStartedAt: null,
      pauseStartedAt: null,
      accumulatedPauseMs: 0,
      trainingMode: null,
    },
    cardioTimer: {
      running: false,
      baseMs: 0,
      segmentStartAt: null,
    },
    achievements: [],
    restTimer: { endAt: null, startedAt: null, durationSec: 90, dismissed: true },
    chatMessages: [],
    scheduleWeekStart: ws,
    friends: [],
    onboardingComplete: false,
    lifetimeXp: 0,
    todayLayout: normalizeTodayLayout(undefined),
    notificationPromptDone: false,
    appleHealthPermissionPromptDone: false,
    appleHealthToday: null,
    lastWeeklySummaryNotifWeekStart: null,
    burnoutDismissedWeekStart: null,
    streakShieldUsedWeekStart: null,
    deloadActiveWeekStart: null,
    deloadDismissedWeekStart: null,
    cycleStartDateKey: null,
  }
}

export function loadState(): AppPersisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return applyDailySessionReset(defaultState())
    }
    const rawObj = JSON.parse(raw) as Record<string, unknown>
    if (!rawObj || typeof rawObj !== 'object') {
      return applyDailySessionReset(defaultState())
    }

    const hasAppData =
      Array.isArray(rawObj.setLogs) ||
      Array.isArray(rawObj.schedule) ||
      Array.isArray(rawObj.achievements) ||
      Array.isArray(rawObj.templates) ||
      (typeof rawObj.settings === 'object' && rawObj.settings !== null)

    if (!hasAppData) {
      return applyDailySessionReset(defaultState())
    }

    const v = rawObj.version
    if (v != null && typeof v === 'number' && v !== 1) {
      console.warn('[Apex] Storage version is not 1 — preserving data and merging fields', v)
    }

    delete rawObj.geminiApiKey
    const parsed = rawObj as unknown as AppPersisted

    const onboardingComplete =
      isOnboardingCompleteLocal() ||
      (typeof parsed.onboardingComplete === 'boolean'
        ? parsed.onboardingComplete
        : (parsed.setLogs?.length ?? 0) > 0)

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
      waterLogs: migrateWaterLogs(parsed.waterLogs ?? []),
      sleepLogs: migrateSleepLogs(parsed.sleepLogs ?? []),
      readinessLogs: Array.isArray(parsed.readinessLogs) ? parsed.readinessLogs : [],
      workoutMoodLogs: Array.isArray(parsed.workoutMoodLogs) ? parsed.workoutMoodLogs : [],
      postWorkoutCheckins: Array.isArray(parsed.postWorkoutCheckins)
        ? parsed.postWorkoutCheckins
        : [],
      mealLogs: migrateMealLogs(parsed.mealLogs ?? []),
      lifetimeXp:
        typeof parsed.lifetimeXp === 'number' && Number.isFinite(parsed.lifetimeXp)
          ? Math.max(0, parsed.lifetimeXp)
          : 0,
    })

    merged = { ...merged, chatMessages: normalizeCoachChatMessages(merged.chatMessages) }

    return applyDailySessionReset(merged)
  } catch {
    return applyDailySessionReset(defaultState())
  }
}

/** Wipe local workout storage and return a fresh default state (onboarding not complete). */
export function clearAllAppData(): AppPersisted {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(APEX_COACH_INIT_FLAG)
    localStorage.removeItem(APEX_ONBOARDING_COMPLETE_KEY)
  } catch {
    /* ignore */
  }
  return defaultState()
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

export const APEX_THEME_STORAGE_KEY = 'apex_theme'
export const APEX_FONT_SIZE_STORAGE_KEY = 'apex_font_size'
export const APEX_DISTANCE_UNIT_KEY = 'apex_distance_unit'
export const APEX_WORKOUT_REMINDERS_KEY = 'apex_workout_reminders'
export const APEX_WEEKLY_SUMMARY_KEY = 'apex_weekly_summary'
export const APEX_POST_WORKOUT_CHECKIN_KEY = 'apex_post_workout_checkin'

export function readPostWorkoutCheckinEnabled(): boolean {
  try {
    const v = localStorage.getItem(APEX_POST_WORKOUT_CHECKIN_KEY)
    if (v === '0') return false
  } catch {
    /* ignore */
  }
  return true
}

export function writePostWorkoutCheckinEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(APEX_POST_WORKOUT_CHECKIN_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export type ApexDistanceUnit = 'km' | 'mi'

export function readDistanceUnit(): ApexDistanceUnit {
  try {
    return localStorage.getItem(APEX_DISTANCE_UNIT_KEY) === 'km' ? 'km' : 'mi'
  } catch {
    return 'mi'
  }
}

export function writeDistanceUnit(unit: ApexDistanceUnit): void {
  try {
    localStorage.setItem(APEX_DISTANCE_UNIT_KEY, unit)
  } catch {
    /* ignore */
  }
}

export function readWorkoutRemindersEnabled(): boolean {
  try {
    const v = localStorage.getItem(APEX_WORKOUT_REMINDERS_KEY)
    if (v === '0') return false
  } catch {
    /* ignore */
  }
  return true
}

export function writeWorkoutRemindersEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(APEX_WORKOUT_REMINDERS_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function readWeeklySummaryEnabled(): boolean {
  try {
    return localStorage.getItem(APEX_WEEKLY_SUMMARY_KEY) === '1'
  } catch {
    return false
  }
}

export function writeWeeklySummaryEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(APEX_WEEKLY_SUMMARY_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** Today tab collapsible sections (persist across tab switches). */
export const APEX_TODAY_MORE_OPEN_KEY = 'apex-today-more-open'
export const APEX_TODAY_PLAN_OPEN_KEY = 'apex-today-plan-open'

export function readTodaySectionOpen(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export function writeTodaySectionOpen(key: string, open: boolean): void {
  try {
    localStorage.setItem(key, open ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** Persisted open state for Today tab sections (use in App/Dashboard shell, not inside TodayTab). */
export function useTodaySectionOpen(
  key: string,
): readonly [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const [open, setOpen] = useState(() => readTodaySectionOpen(key))
  const setOpenPersist = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setOpen((prev) => {
        const next = typeof value === 'function' ? value(prev) : value
        writeTodaySectionOpen(key, next)
        return next
      })
    },
    [key],
  )
  return [open, setOpenPersist] as const
}

export type ApexThemeMode = 'dark' | 'light'
export type ApexFontSizeMode = 'small' | 'medium' | 'large' | 'xlarge'

const FONT_SCALE: Record<ApexFontSizeMode, number> = {
  small: 0.88,
  medium: 1,
  large: 1.14,
  xlarge: 1.28,
}

export function fontScaleForMode(size: ApexFontSizeMode): number {
  return FONT_SCALE[size] ?? 1
}

/** Read localStorage and set data attributes on `<html>` (theme + font size). */
export function applyApexAppearanceFromStorage(): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  try {
    const theme = localStorage.getItem(APEX_THEME_STORAGE_KEY)
    root.setAttribute('data-apex-theme', theme === 'light' ? 'light' : 'dark')
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      meta.setAttribute('content', theme === 'light' ? '#eef2f8' : '#0a0a0a')
    }
    const fs = localStorage.getItem(APEX_FONT_SIZE_STORAGE_KEY)
    const size: ApexFontSizeMode =
      fs === 'small' || fs === 'large' || fs === 'xlarge' ? fs : 'medium'
    root.setAttribute('data-apex-font-size', size)
    const scale = String(fontScaleForMode(size))
    root.style.setProperty('--font-scale', scale)
    root.style.setProperty('--apex-font-scale', scale)
  } catch {
    root.setAttribute('data-apex-theme', 'dark')
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', '#0a0a0a')
    root.setAttribute('data-apex-font-size', 'medium')
    root.style.setProperty('--font-scale', '1')
    root.style.setProperty('--apex-font-scale', '1')
  }
}

/** Ensure schedule matches current week; migrate if week changed */
export function alignScheduleWeek(state: AppPersisted): AppPersisted {
  const ws = dateKey(weekStartMonday(new Date()))
  if (state.scheduleWeekStart === ws && state.schedule.length === 7) {
    const expected = emptyScheduleForWeek(ws).map((s) => s.dateKey)
    const ok = state.schedule.every((s, i) => s.dateKey === expected[i])
    if (ok) return applyDailySessionReset(state)
  }
  const base = emptyScheduleForWeek(ws)
  const next = base.map((slot) => {
    const old = state.schedule.find((s) => s.dateKey === slot.dateKey)
    return old
      ? { ...old, dateKey: slot.dateKey, plannedExerciseIds: old.plannedExerciseIds ?? [] }
      : { dateKey: slot.dateKey, workoutName: '', notes: '', plannedExerciseIds: [] }
  })
  return applyDailySessionReset({ ...state, schedule: next, scheduleWeekStart: ws })
}
