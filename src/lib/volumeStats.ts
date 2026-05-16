import type { AppPersisted, MuscleGroup, WeightedSetLog } from '../types'
import { weekStartMonday } from './dates'

const RADAR_GROUPS: MuscleGroup[] = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core']

/** Convert stored weight to pounds for volume math. */
export function weightToLbs(weight: number, unit: 'lbs' | 'kg'): number {
  return unit === 'kg' ? weight * 2.2046226218 : weight
}

function isThisWeek(at: number, now: number): boolean {
  const ws = weekStartMonday(new Date(now))
  const we = new Date(ws)
  we.setDate(ws.getDate() + 7)
  const t = new Date(at)
  return t >= ws && t < we
}

/** Sum of sets × reps × weight (lbs) per muscle group for current week. */
export function weeklyVolumeLoadByMuscleLbs(state: AppPersisted, nowMs: number): Record<MuscleGroup, number> {
  const out = {} as Record<MuscleGroup, number>
  for (const g of RADAR_GROUPS) out[g] = 0
  out.Cardio = 0
  out.Stretches = 0

  for (const l of state.setLogs) {
    if (!isThisWeek(l.at, nowMs)) continue
    if (l.kind !== 'weighted') continue
    const w = l as WeightedSetLog
    if (w.bodyweight || w.weight == null || !Number.isFinite(w.weight)) continue
    const lbs = weightToLbs(w.weight, state.settings.unit)
    const vol = w.sets * w.reps * lbs
    if (out[w.muscleGroup] != null) out[w.muscleGroup] += vol
  }
  return out
}

export function weeklyVolumeHorizontalBarData(
  state: AppPersisted,
  nowMs: number,
): { muscle: string; volume: number; label: string }[] {
  const vol = weeklyVolumeLoadByMuscleLbs(state, nowMs)
  return RADAR_GROUPS.map((muscle) => ({
    muscle,
    volume: Math.round(vol[muscle] ?? 0),
    label: `${Math.round(vol[muscle] ?? 0)} lbs`,
  }))
}

/** Radar data: relative 0–100 scale vs max axis among the 6. */
export function weeklyVolumeRadarData(
  state: AppPersisted,
  nowMs: number,
): { subject: string; volume: number; fullMark: number }[] {
  const vol = weeklyVolumeLoadByMuscleLbs(state, nowMs)
  const vals = RADAR_GROUPS.map((g) => vol[g] ?? 0)
  const max = Math.max(1, ...vals)
  return RADAR_GROUPS.map((g) => ({
    subject: g,
    volume: Math.round(((vol[g] ?? 0) / max) * 100),
    fullMark: 100,
  }))
}
