import type { SetLog, WeightedSetLog } from '../types'

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
