import type { SetLog } from '../types'
import { dateKey } from './dates'

/** Max weight used on a calendar day for exercise (non-bodyweight only) */
function maxWeightOnDay(logs: SetLog[], exerciseId: string, dayKey: string): number | null {
  let m: number | null = null
  for (const l of logs) {
    if (l.exerciseId !== exerciseId || l.kind !== 'weighted' || l.bodyweight) continue
    if (dateKey(new Date(l.at)) !== dayKey) continue
    const w = l.weight ?? 0
    m = m === null ? w : Math.max(m, w)
  }
  return m
}

/** Distinct workout days for exercise with weighted non-BW sets, most recent first */
function recentSessionMaxWeights(logs: SetLog[], exerciseId: string): number[] {
  const days = new Set<string>()
  for (const l of logs) {
    if (l.exerciseId !== exerciseId || l.kind !== 'weighted' || l.bodyweight) continue
    days.add(dateKey(new Date(l.at)))
  }
  const sorted = [...days].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  return sorted.map((d) => maxWeightOnDay(logs, exerciseId, d)).filter((w): w is number => w != null)
}

/** Legacy long message for inline card hints */
export function progressiveOverloadMessage(
  logs: SetLog[],
  exerciseId: string,
  exerciseName: string,
): string | null {
  const series = recentSessionMaxWeights(logs, exerciseId)
  if (series.length < 3) return null
  const a = series[0]
  const b = series[1]
  const c = series[2]
  if (a === b && b === c && a > 0) {
    return `You've used ${a} on ${exerciseName} for three sessions in a row. Try adding a small amount of weight or one more rep if form stays perfect.`
  }
  return null
}

/** First exercise in plan that hit same weight 3 sessions — for top banner */
export function progressiveOverloadBanner(
  logs: SetLog[],
  planExerciseIds: string[],
  exerciseNames: Record<string, string>,
  unitLabel: string,
): { weight: number; unitLabel: string; exerciseName: string } | null {
  for (const id of planExerciseIds) {
    const series = recentSessionMaxWeights(logs, id)
    if (series.length < 3) continue
    const a = series[0]
    const b = series[1]
    const c = series[2]
    if (a === b && b === c && a > 0) {
      return {
        weight: a,
        unitLabel,
        exerciseName: exerciseNames[id] ?? 'Exercise',
      }
    }
  }
  return null
}
