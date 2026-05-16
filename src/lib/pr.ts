import type { SetLog, TimedSetLog, WeightedSetLog } from '../types'

export function computeIsPr(
  logs: SetLog[],
  entry: Omit<WeightedSetLog, 'isPr' | 'id'> | Omit<TimedSetLog, 'isPr' | 'id'>,
): boolean {
  const prior = logs.filter((l) => l.exerciseId === entry.exerciseId && l.at < entry.at)
  if (prior.length === 0) return false

  if (entry.kind === 'timed') {
    const best = Math.max(
      0,
      ...prior.filter((l) => l.kind === 'timed').map((l) => l.durationSec),
    )
    return entry.durationSec > best
  }

  const weightedPrior = prior.filter((l): l is WeightedSetLog => l.kind === 'weighted')

  if (entry.bodyweight) {
    const bwPrior = weightedPrior.filter((l) => l.bodyweight)
    if (bwPrior.length === 0) return false
    const maxReps = Math.max(...bwPrior.map((l) => l.reps))
    return entry.reps > maxReps
  }

  const priorNonBw = weightedPrior.filter((l) => !l.bodyweight && l.weight != null)
  if (priorNonBw.length === 0) {
    return false
  }

  const ew = entry.weight
  if (ew != null && !Number.isFinite(ew)) {
    return false
  }

  const weights = priorNonBw.map((l) => l.weight!).filter((w) => Number.isFinite(w))
  if (weights.length === 0) return false

  const maxW = Math.max(...weights)

  const comp = (entry.weight ?? 0)
  if (!Number.isFinite(comp)) return false

  if (comp > maxW) return true
  if (comp < maxW) return false

  const atMax = priorNonBw.filter((l) => l.weight === maxW)
  if (atMax.length === 0) return false
  const maxRepsAtW = Math.max(...atMax.map((l) => l.reps))
  return entry.reps > maxRepsAtW
}
