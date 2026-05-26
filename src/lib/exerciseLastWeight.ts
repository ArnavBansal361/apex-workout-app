import type { LastWeightedSetDefaults } from './lastSession'
import type { SetLog, WeightedSetLog } from '../types'

export const APEX_EXERCISE_LAST_WEIGHT_KEY = 'apex-exercise-last-weight'

type CachedExerciseWeight = LastWeightedSetDefaults & { at: number }

function readCache(): Record<string, CachedExerciseWeight> {
  try {
    const raw = localStorage.getItem(APEX_EXERCISE_LAST_WEIGHT_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, CachedExerciseWeight> = {}
    for (const [id, v] of Object.entries(parsed)) {
      if (!v || typeof v !== 'object') continue
      const row = v as Partial<CachedExerciseWeight>
      if (typeof row.at !== 'number' || !Number.isFinite(row.at)) continue
      out[id] = {
        at: row.at,
        bodyweight: Boolean(row.bodyweight),
        weight:
          row.weight == null || !Number.isFinite(Number(row.weight))
            ? null
            : Number(row.weight),
        reps: Math.max(0, Math.floor(Number(row.reps) || 0)),
        sets: Math.max(1, Math.floor(Number(row.sets) || 1)),
      }
    }
    return out
  } catch {
    return {}
  }
}

function writeCache(cache: Record<string, CachedExerciseWeight>): void {
  try {
    localStorage.setItem(APEX_EXERCISE_LAST_WEIGHT_KEY, JSON.stringify(cache))
  } catch {
    /* ignore */
  }
}

/** Persist last load for an exercise (localStorage). */
export function saveExerciseLastWeight(
  exerciseId: string,
  data: LastWeightedSetDefaults,
  at = Date.now(),
): void {
  const cache = readCache()
  cache[exerciseId] = { ...data, at }
  writeCache(cache)
}

export function readExerciseLastWeight(exerciseId: string): LastWeightedSetDefaults | null {
  const row = readCache()[exerciseId]
  if (!row) return null
  const { at: _at, ...defaults } = row
  return defaults
}

function lastWeightedFromLogs(
  logs: SetLog[],
  exerciseId: string,
): (LastWeightedSetDefaults & { at: number }) | null {
  const last = logs
    .filter((l): l is WeightedSetLog => l.exerciseId === exerciseId && l.kind === 'weighted')
    .sort((a, b) => b.at - a.at)[0]
  if (!last) return null
  return {
    at: last.at,
    bodyweight: last.bodyweight,
    weight: last.weight,
    reps: last.reps,
    sets: last.sets,
  }
}

/** Newest weighted defaults from localStorage cache and set logs. */
export function getExerciseWeightPrefill(
  logs: SetLog[],
  exerciseId: string,
): LastWeightedSetDefaults | null {
  const fromLogs = lastWeightedFromLogs(logs, exerciseId)
  const cached = readCache()[exerciseId] ?? null
  if (!fromLogs && !cached) return null
  if (!fromLogs) {
    const { at: _a, ...d } = cached!
    return d
  }
  if (!cached) {
    const { at: _a, ...d } = fromLogs
    return d
  }
  const pick = cached.at >= fromLogs.at ? cached : fromLogs
  const { at: _a, ...d } = pick
  return d
}
