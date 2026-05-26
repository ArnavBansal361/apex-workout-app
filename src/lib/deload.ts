import type { AppPersisted, SetLog } from '../types'
import type { LastWeightedSetDefaults } from './lastSession'
import { getExerciseWeightPrefill } from './exerciseLastWeight'
import { getLastWorkoutSession } from './lastSession'
import { weeklyVolumeSeries } from './stats'
import { currentWeekStartKey } from './volumeStats'

/** Load multiplier after a 40% reduction. */
export const DELOAD_WEIGHT_MULTIPLIER = 0.6

const MIN_WEEK_VOLUME_LBS = 2_000
const MIN_INCREASE_RATIO = 1.02

/** Volumes for the 4 most recently completed weeks (oldest → newest), excluding the current partial week. */
export function lastFourCompletedWeekVolumes(
  state: AppPersisted,
  nowMs = Date.now(),
): number[] | null {
  const series = weeklyVolumeSeries(state, nowMs)
  if (series.length < 7) return null
  const completed = series.slice(3, 7).map((w) => w.volume)
  const factor = state.settings.unit === 'kg' ? 2.20462 : 1
  if (completed.some((v) => v < MIN_WEEK_VOLUME_LBS / factor)) return null
  return completed
}

/** Count consecutive week-over-week volume increases at the end of the completed-week window. */
export function consecutiveProgressiveVolumeIncreases(
  state: AppPersisted,
  nowMs = Date.now(),
): number {
  const vols = lastFourCompletedWeekVolumes(state, nowMs)
  if (!vols || vols.length < 2) return 0
  let streak = 0
  for (let i = 1; i < vols.length; i++) {
    if (vols[i]! > vols[i - 1]! * MIN_INCREASE_RATIO) streak++
    else streak = 0
  }
  return streak
}

/**
 * Suggest deload after 3–4 weeks of rising volume:
 * - 3 weeks rising = 2 consecutive increases among last 4 completed weeks
 * - 4 weeks rising = 3 consecutive increases among last 4 completed weeks
 */
export function shouldSuggestDeloadWeek(state: AppPersisted, nowMs = Date.now()): boolean {
  const increases = consecutiveProgressiveVolumeIncreases(state, nowMs)
  return increases >= 2
}

/** @deprecated Use {@link shouldSuggestDeloadWeek}. */
export function shouldSuggestDeload(logs: SetLog[]): boolean {
  return shouldSuggestDeloadWeek({ setLogs: logs, settings: { unit: 'lbs' } } as AppPersisted)
}

export function isDeloadWeekActive(
  deloadActiveWeekStart: string | null,
  nowMs = Date.now(),
): boolean {
  if (!deloadActiveWeekStart) return false
  return deloadActiveWeekStart === currentWeekStartKey(nowMs)
}

export function isDeloadBannerDismissed(
  deloadDismissedWeekStart: string | null,
  nowMs = Date.now(),
): boolean {
  if (!deloadDismissedWeekStart) return false
  return deloadDismissedWeekStart === currentWeekStartKey(nowMs)
}

export function roundDeloadWeight(weight: number, unit: 'lbs' | 'kg'): number {
  const step = unit === 'kg' ? 2.5 : 5
  const reduced = weight * DELOAD_WEIGHT_MULTIPLIER
  return Math.max(step, Math.round(reduced / step) * step)
}

export function applyDeloadToPrefill(
  prefill: LastWeightedSetDefaults | null,
  unit: 'lbs' | 'kg',
  deloadActiveWeekStart: string | null,
  nowMs = Date.now(),
): LastWeightedSetDefaults | null {
  if (!prefill || !isDeloadWeekActive(deloadActiveWeekStart, nowMs)) return prefill
  if (prefill.bodyweight || prefill.weight == null) return prefill
  return {
    ...prefill,
    weight: roundDeloadWeight(prefill.weight, unit),
  }
}

export function getWeightedPrefillForExercise(
  logs: SetLog[],
  exerciseId: string,
  unit: 'lbs' | 'kg',
  deloadActiveWeekStart: string | null,
): LastWeightedSetDefaults | null {
  const base = getExerciseWeightPrefill(logs, exerciseId)
  return applyDeloadToPrefill(base, unit, deloadActiveWeekStart)
}

/** Exercise ids for a deload session: today’s plan, else last session, else schedule. */
export function pickDeloadExerciseIds(state: AppPersisted, todayKey: string): string[] {
  if (state.todayPlanExerciseIds.length > 0) {
    return [...state.todayPlanExerciseIds]
  }
  const last = getLastWorkoutSession(state.setLogs, todayKey)
  if (last?.exerciseIds.length) return [...last.exerciseIds]
  const sched = state.schedule.find((d) => d.dateKey === todayKey)
  if (sched?.plannedExerciseIds?.length) return [...sched.plannedExerciseIds]
  return []
}
