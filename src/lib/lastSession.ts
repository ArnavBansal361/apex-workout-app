import type { SetLog } from '../types'

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
