import type { AppPersisted, MuscleGroup, ScheduleDay } from '../types'
import { dateKey, weekStartMonday } from './dates'
import { EXERCISE_BY_ID } from '../data/exercises'

export const SCHEDULE_VOLUME_GROUPS: MuscleGroup[] = [
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
]

const DEFAULT_SETS_PER_PLANNED_EXERCISE = 3

export type MuscleVolumeBalanceRow = {
  group: MuscleGroup
  done: number
  target: number
}

/** Logged sets this week per muscle (weighted set count + 1 per timed set). */
export function weeklySetsDoneByMuscle(
  state: AppPersisted,
  nowMs = Date.now(),
): Record<MuscleGroup, number> {
  const weekStart = weekStartMonday(new Date(nowMs))
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const out = {} as Record<MuscleGroup, number>
  for (const g of SCHEDULE_VOLUME_GROUPS) out[g] = 0

  for (const l of state.setLogs) {
    const t = new Date(l.at)
    if (t < weekStart || t >= weekEnd) continue
    if (!(l.muscleGroup in out)) continue
    if (l.kind === 'weighted') {
      out[l.muscleGroup] += Math.max(1, l.sets)
    } else {
      out[l.muscleGroup] += 1
    }
  }
  return out
}

/** Planned set targets from this week's schedule (3 sets per planned exercise). */
export function weeklySetsTargetByMuscle(
  schedule: ScheduleDay[],
  customExercises: AppPersisted['customExercises'],
): Record<MuscleGroup, number> {
  const out = {} as Record<MuscleGroup, number>
  for (const g of SCHEDULE_VOLUME_GROUPS) out[g] = 0

  for (const day of schedule) {
    for (const id of day.plannedExerciseIds ?? []) {
      const ex =
        EXERCISE_BY_ID[id] ?? customExercises.find((e) => e.id === id)
      if (!ex || !(ex.muscleGroup in out)) continue
      out[ex.muscleGroup] += DEFAULT_SETS_PER_PLANNED_EXERCISE
    }
  }
  return out
}

export function muscleVolumeBalanceRows(
  state: AppPersisted,
  nowMs = Date.now(),
): MuscleVolumeBalanceRow[] {
  const done = weeklySetsDoneByMuscle(state, nowMs)
  const target = weeklySetsTargetByMuscle(state.schedule, state.customExercises)
  return SCHEDULE_VOLUME_GROUPS.map((group) => ({
    group,
    done: done[group] ?? 0,
    target: Math.max(done[group] ?? 0, target[group] ?? 0),
  }))
}

export function totalSetsLoggedThisWeek(state: AppPersisted, nowMs = Date.now()): number {
  const done = weeklySetsDoneByMuscle(state, nowMs)
  return SCHEDULE_VOLUME_GROUPS.reduce((sum, g) => sum + (done[g] ?? 0), 0)
}

export function dayHasLoggedWork(state: AppPersisted, dayKey: string): boolean {
  for (const l of state.setLogs) {
    if (dateKey(new Date(l.at)) === dayKey) return true
  }
  for (const c of state.cardioEntries) {
    if (dateKey(new Date(c.at)) === dayKey) return true
  }
  return false
}

/** Rough session length from planned exercises. */
export function estimateDayDurationMinutes(
  day: ScheduleDay,
  customExercises: AppPersisted['customExercises'],
): number {
  const ids = day.plannedExerciseIds ?? []
  const name = day.workoutName.trim()
  if (!ids.length && (!name || /^rest$/i.test(name))) return 20
  if (!ids.length) return 35
  let n = 0
  for (const id of ids) {
    if (EXERCISE_BY_ID[id] || customExercises.find((e) => e.id === id)) n++
  }
  return Math.min(120, Math.max(30, n * 8 + 12))
}
