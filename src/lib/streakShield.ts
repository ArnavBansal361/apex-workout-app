import type { AppPersisted } from '../types'
import { workoutDaysFromActivity } from './achievements'
import { dateKey, parseDateKey, startOfDay, weekStartMonday } from './dates'

export type StreakInfo = {
  days: number
  /** Shield not yet consumed this calendar week (Mon–Sun). */
  shieldAvailable: boolean
  shieldUsedThisWeek: boolean
}

function shieldUsedForWeek(shieldUsedWeekStart: string | null, weekMondayKey: string): boolean {
  return shieldUsedWeekStart === weekMondayKey
}

function canUseShieldOnDay(
  day: Date,
  shieldUsedWeekStart: string | null,
  shieldsInWalk: Set<string>,
): boolean {
  const wk = dateKey(weekStartMonday(day))
  if (shieldUsedForWeek(shieldUsedWeekStart, wk)) return false
  if (shieldsInWalk.has(wk)) return false
  return true
}

/** Consecutive-day streak; one missed day per week can be bridged by the streak shield. */
export function streakDaysWithShield(
  workoutDays: Set<string>,
  shieldUsedWeekStart: string | null,
  nowMs: number = Date.now(),
): number {
  const today = startOfDay(new Date(nowMs))
  const todayKey = dateKey(today)
  const shieldsInWalk = new Set<string>()

  let cur = new Date(today)
  if (!workoutDays.has(todayKey)) {
    cur.setDate(cur.getDate() - 1)
    if (!workoutDays.has(dateKey(cur))) {
      return 0
    }
  }

  let count = 0
  while (true) {
    const key = dateKey(cur)
    if (workoutDays.has(key)) {
      count++
      cur.setDate(cur.getDate() - 1)
      continue
    }

    if (!canUseShieldOnDay(cur, shieldUsedWeekStart, shieldsInWalk)) break

    const prev = new Date(cur)
    prev.setDate(prev.getDate() - 1)
    if (!workoutDays.has(dateKey(prev))) break

    shieldsInWalk.add(dateKey(weekStartMonday(cur)))
    count++
    cur = prev
  }

  return count
}

export function streakInfo(state: AppPersisted, nowMs: number = Date.now()): StreakInfo {
  const workoutDays = workoutDaysFromActivity(state)
  const shieldUsedWeekStart = state.streakShieldUsedWeekStart ?? null
  const thisWeek = dateKey(weekStartMonday(new Date(nowMs)))
  return {
    days: streakDaysWithShield(workoutDays, shieldUsedWeekStart, nowMs),
    shieldAvailable: !shieldUsedForWeek(shieldUsedWeekStart, thisWeek),
    shieldUsedThisWeek: shieldUsedForWeek(shieldUsedWeekStart, thisWeek),
  }
}

/** If the shield is bridging a missed day this week, return that week's Monday key for persistence. */
export function detectStreakShieldConsumption(
  state: AppPersisted,
  nowMs: number = Date.now(),
): string | null {
  const workoutDays = workoutDaysFromActivity(state)
  const shieldUsedWeekStart = state.streakShieldUsedWeekStart ?? null
  const today = startOfDay(new Date(nowMs))

  let cur = new Date(today)
  if (!workoutDays.has(dateKey(cur))) {
    cur.setDate(cur.getDate() - 1)
    if (!workoutDays.has(dateKey(cur))) return null
  }

  const shieldsInWalk = new Set<string>()
  while (true) {
    const key = dateKey(cur)
    if (workoutDays.has(key)) {
      cur.setDate(cur.getDate() - 1)
      continue
    }

    const wk = dateKey(weekStartMonday(cur))
    if (shieldUsedForWeek(shieldUsedWeekStart, wk) || shieldsInWalk.has(wk)) break

    const prev = new Date(cur)
    prev.setDate(prev.getDate() - 1)
    if (!workoutDays.has(dateKey(prev))) break

    if (cur.getTime() < today.getTime()) {
      return wk
    }

    shieldsInWalk.add(wk)
    cur = prev
  }

  return null
}

/** Calendar days since the last logged workout before `beforeDayKey` (exclusive). */
export function daysSinceLastWorkout(state: AppPersisted, beforeDayKey: string): number | null {
  const workoutDays = workoutDaysFromActivity(state)
  const before = parseDateKey(beforeDayKey)
  let cur = new Date(before)
  cur.setDate(cur.getDate() - 1)

  for (let i = 0; i < 400; i++) {
    const key = dateKey(cur)
    if (workoutDays.has(key)) {
      const last = parseDateKey(key)
      return Math.round((before.getTime() - last.getTime()) / 86_400_000)
    }
    cur.setDate(cur.getDate() - 1)
  }
  return null
}

const COMEBACK_MESSAGES = [
  'Welcome back — showing up today is the win.',
  'Great to see you again. Start light and build from here.',
  'Every comeback starts with one session. You made it.',
  'The break is over. One set at a time.',
  'Consistency beats perfection — glad you\'re here.',
  'Your muscles remember. Ease in and enjoy the session.',
] as const

export function comebackMessageForGap(gapDays: number | null): string | null {
  if (gapDays == null || gapDays < 5) return null
  return COMEBACK_MESSAGES[gapDays % COMEBACK_MESSAGES.length]!
}

export type SessionBadge = {
  id: 'short-session' | 'efficient-session'
  label: string
}

const EFFICIENT_SESSION_MAX_SEC = 25 * 60
const SHORT_SESSION_MAX_EXERCISES = 2

export function sessionBadgesFor(input: {
  exerciseCount: number
  durationSec: number
}): SessionBadge[] {
  const badges: SessionBadge[] = []
  if (input.exerciseCount > 0 && input.exerciseCount <= SHORT_SESSION_MAX_EXERCISES) {
    badges.push({ id: 'short-session', label: 'Short session' })
  }
  if (input.durationSec > 0 && input.durationSec < EFFICIENT_SESSION_MAX_SEC) {
    badges.push({ id: 'efficient-session', label: 'Efficient session' })
  }
  return badges
}
