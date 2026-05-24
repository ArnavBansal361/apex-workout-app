import type { SetLog, WeightedSetLog } from '../types'
import { dateKey } from './dates'

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

/** Summary line for “last time” in log modal — most recent prior log for exercise */
export function formatLastSessionLine(
  logs: SetLog[],
  exerciseId: string,
  unit: 'lbs' | 'kg',
): string | null {
  const prior = logs
    .filter((l) => l.exerciseId === exerciseId)
    .sort((a, b) => b.at - a.at)
  const last = prior[0]
  if (!last) return null
  const when = new Date(last.at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
  if (last.kind === 'weighted') {
    const w = last.bodyweight ? 'Bodyweight' : `${last.weight ?? 0} ${unit}`
    return `Last time (${when}): ${w} × ${last.reps} · ${last.sets} set(s)`
  }
  return `Last time (${when}): ${last.durationSec}s hold`
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
