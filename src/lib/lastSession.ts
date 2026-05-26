import type { SetLog, WeightedSetLog } from '../types'
import { dateKey, parseDateKey } from './dates'

export type LastWeightedSetDefaults = {
  bodyweight: boolean
  weight: number | null
  reps: number
  sets: number
}

/** Most recent weighted log for quick-log / modal prefill. */
export function getLastWeightedSetForExercise(
  logs: SetLog[],
  exerciseId: string,
): LastWeightedSetDefaults | null {
  const last = logs
    .filter((l): l is WeightedSetLog => l.exerciseId === exerciseId && l.kind === 'weighted')
    .sort((a, b) => b.at - a.at)[0]
  if (!last) return null
  return {
    bodyweight: last.bodyweight,
    weight: last.weight,
    reps: last.reps,
    sets: last.sets,
  }
}

function calendarDaysBetween(earlierDayKey: string, laterDayKey: string): number {
  const a = parseDateKey(earlierDayKey).getTime()
  const b = parseDateKey(laterDayKey).getTime()
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

/** e.g. "Last: 135 lbs × 8 reps · 3 days ago" — weighted logs only; null if never logged. */
export function formatExerciseLastHistoryLine(
  logs: SetLog[],
  exerciseId: string,
  unit: 'lbs' | 'kg',
  nowMs: number = Date.now(),
): string | null {
  const last = logs
    .filter((l): l is WeightedSetLog => l.exerciseId === exerciseId && l.kind === 'weighted')
    .sort((a, b) => b.at - a.at)[0]
  if (!last) return null

  const todayKey = dateKey(new Date(nowMs))
  const logDayKey = dateKey(new Date(last.at))
  const days = calendarDaysBetween(logDayKey, todayKey)
  const daysLabel =
    days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`

  const load = last.bodyweight ? 'Bodyweight' : `${last.weight ?? 0} ${unit}`
  return `Last: ${load} × ${last.reps} reps · ${daysLabel}`
}

/** Summary line for log modal / exercise cards. */
export function formatLastSessionLine(
  logs: SetLog[],
  exerciseId: string,
  unit: 'lbs' | 'kg',
  nowMs?: number,
): string | null {
  return formatExerciseLastHistoryLine(logs, exerciseId, unit, nowMs)
}

export type WorkoutSessionSnapshot = {
  dayKey: string
  logs: SetLog[]
  /** Exercise ids in first-seen order for that session. */
  exerciseIds: string[]
}

/** Most recent calendar day before `todayKey` that has logged sets. */
export function getLastWorkoutSession(
  logs: SetLog[],
  todayKey: string,
): WorkoutSessionSnapshot | null {
  const byDay = new Map<string, SetLog[]>()
  for (const l of logs) {
    const dk = dateKey(new Date(l.at))
    const arr = byDay.get(dk) ?? []
    arr.push(l)
    byDay.set(dk, arr)
  }
  const priorDays = [...byDay.keys()].filter((d) => d < todayKey).sort().reverse()
  const sessionDay = priorDays[0]
  if (!sessionDay) return null
  const dayLogs = (byDay.get(sessionDay) ?? []).sort((a, b) => a.at - b.at)
  if (!dayLogs.length) return null
  const exerciseIds: string[] = []
  const seen = new Set<string>()
  for (const l of dayLogs) {
    if (seen.has(l.exerciseId)) continue
    seen.add(l.exerciseId)
    exerciseIds.push(l.exerciseId)
  }
  return { dayKey: sessionDay, logs: dayLogs, exerciseIds }
}
