import type { SetLog, WeightedSetLog } from '../types'
import { dateKey } from './dates'
import { getLastWeightedSetForExercise } from './lastSession'

export const APEX_GYM_MODE_KEY = 'apex-gym-mode'
export const APEX_WORKOUT_SWIPE_HINT_KEY = 'apex-workout-swipe-hint-dismissed'

export function readWorkoutSwipeHintDismissed(): boolean {
  try {
    return localStorage.getItem(APEX_WORKOUT_SWIPE_HINT_KEY) === '1'
  } catch {
    return false
  }
}

export function writeWorkoutSwipeHintDismissed(): void {
  try {
    localStorage.setItem(APEX_WORKOUT_SWIPE_HINT_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function readGymModeEnabled(): boolean {
  try {
    return localStorage.getItem(APEX_GYM_MODE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeGymModeEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(APEX_GYM_MODE_KEY, '1')
    else localStorage.removeItem(APEX_GYM_MODE_KEY)
  } catch {
    /* ignore */
  }
}

function setsOnLog(l: SetLog): number {
  if (l.kind === 'weighted') return Math.max(1, Math.floor(l.sets))
  return 1
}

/** Total sets logged today for one exercise (weighted + timed entries). */
export function setsLoggedTodayForExercise(
  logs: SetLog[],
  exerciseId: string,
  todayKey: string,
): number {
  let n = 0
  for (const l of logs) {
    if (l.exerciseId !== exerciseId) continue
    if (dateKey(new Date(l.at)) !== todayKey) n += setsOnLog(l)
  }
  return n
}

const DEFAULT_TARGET_SETS = 3

/** Planned set count for progress dots (last logged scheme or default). */
export function targetSetsForExercise(logs: SetLog[], exerciseId: string): number {
  const last = getLastWeightedSetForExercise(logs, exerciseId)
  if (last && last.sets > 0) return Math.max(1, Math.floor(last.sets))
  return DEFAULT_TARGET_SETS
}

/** Compact history for workout rows: "last 135 lbs × 8". */
export function formatLastCompactLine(
  logs: SetLog[],
  exerciseId: string,
  unit: 'lbs' | 'kg',
): string | null {
  const last = logs
    .filter((l): l is WeightedSetLog => l.exerciseId === exerciseId && l.kind === 'weighted')
    .sort((a, b) => b.at - a.at)[0]
  if (!last) return null
  const load = last.bodyweight ? 'BW' : `${last.weight ?? 0} ${unit}`
  return `last ${load} × ${last.reps}`
}

export function pickActiveExerciseId(
  planExerciseIds: string[],
  logs: SetLog[],
  todayKey: string,
  preferredId: string | null,
): string | null {
  if (preferredId && planExerciseIds.includes(preferredId)) return preferredId
  for (const id of planExerciseIds) {
    const done = setsLoggedTodayForExercise(logs, id, todayKey)
    const target = targetSetsForExercise(logs, id)
    if (done < target) return id
  }
  return planExerciseIds[0] ?? null
}

export type ExerciseRowStatus = 'pending' | 'active' | 'complete'

export function exerciseRowStatus(
  exerciseId: string,
  activeId: string | null,
  setsDone: number,
  targetSets: number,
): ExerciseRowStatus {
  if (setsDone >= targetSets) return 'complete'
  if (exerciseId === activeId || (setsDone > 0 && setsDone < targetSets)) return 'active'
  return 'pending'
}
