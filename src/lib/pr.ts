import { dateKey } from './dates'
import type { SetLog, TimedSetLog, WeightedSetLog } from '../types'

/** PRs require the exercise on at least two separate calendar days (prior day + today). */
function hasTwoSessionsForExercise(
  prior: SetLog[],
  entryAt: number,
): boolean {
  const sessionDays = new Set(prior.map((l) => dateKey(new Date(l.at))))
  sessionDays.add(dateKey(new Date(entryAt)))
  return sessionDays.size >= 2
}

export function computeIsPr(
  logs: SetLog[],
  entry: Omit<WeightedSetLog, 'isPr' | 'id'> | Omit<TimedSetLog, 'isPr' | 'id'>,
): boolean {
  const prior = logs.filter((l) => l.exerciseId === entry.exerciseId && l.at < entry.at)
  if (prior.length === 0) return false
  if (!hasTwoSessionsForExercise(prior, entry.at)) return false

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

/** True when logged weight exceeds the previous best weight for this exercise (any prior session). */
export function beatsStoredWeightPr(
  logs: SetLog[],
  entry: Omit<WeightedSetLog, 'isPr' | 'id' | 'at'>,
): boolean {
  if (entry.bodyweight) return false
  const ew = entry.weight
  if (ew == null || !Number.isFinite(ew)) return false
  const prior = logs.filter((l) => l.exerciseId === entry.exerciseId)
  const weights = prior
    .filter((l): l is WeightedSetLog => l.kind === 'weighted' && !l.bodyweight && l.weight != null)
    .map((l) => l.weight!)
    .filter((w) => Number.isFinite(w))
  if (weights.length === 0) return false
  return ew > Math.max(...weights)
}
