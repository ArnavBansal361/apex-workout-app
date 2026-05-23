import type { AppPersisted, MuscleGroup, WeightedSetLog } from '../types'
import { dateKey, weekStartMonday } from './dates'

const RADAR_GROUPS: MuscleGroup[] = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core']

/** Convert stored weight to pounds for volume math. */
export function weightToLbs(weight: number, unit: 'lbs' | 'kg'): number {
  return unit === 'kg' ? weight * 2.2046226218 : weight
}

function volumeInWeek(
  state: AppPersisted,
  weekStart: Date,
): Record<MuscleGroup, number> {
  const out = {} as Record<MuscleGroup, number>
  for (const g of RADAR_GROUPS) out[g] = 0
  out.Cardio = 0
  out.Stretches = 0
  const we = new Date(weekStart)
  we.setDate(weekStart.getDate() + 7)
  for (const l of state.setLogs) {
    if (l.kind !== 'weighted') continue
    const t = new Date(l.at)
    if (t < weekStart || t >= we) continue
    const w = l as WeightedSetLog
    if (w.bodyweight || w.weight == null || !Number.isFinite(w.weight)) continue
    const lbs = weightToLbs(w.weight, state.settings.unit)
    const vol = w.sets * w.reps * lbs
    if (out[w.muscleGroup] != null) out[w.muscleGroup] += vol
  }
  return out
}

/** Sum of sets × reps × weight (lbs) per muscle group for current week. */
export function weeklyVolumeLoadByMuscleLbs(state: AppPersisted, nowMs: number): Record<MuscleGroup, number> {
  return volumeInWeek(state, weekStartMonday(new Date(nowMs)))
}

export type BurnoutWarning = {
  muscle: MuscleGroup
  pctAbove: number
  thisWeekVol: number
  avgVol: number
}

/** Muscles with this week volume ≥150% of prior 4-week average (RADAR_GROUPS only). */
export function detectBurnoutWarnings(state: AppPersisted, nowMs: number): BurnoutWarning[] {
  const thisMonday = weekStartMonday(new Date(nowMs))
  const thisWeek = volumeInWeek(state, thisMonday)
  const warnings: BurnoutWarning[] = []

  for (const muscle of RADAR_GROUPS) {
    let sum = 0
    for (let back = 1; back <= 4; back++) {
      const ws = new Date(thisMonday)
      ws.setDate(thisMonday.getDate() - back * 7)
      sum += volumeInWeek(state, ws)[muscle] ?? 0
    }
    const avg = sum / 4
    const current = thisWeek[muscle] ?? 0
    if (avg <= 0 || current <= 0) continue
    if (current >= avg * 1.5) {
      const pctAbove = Math.round(((current - avg) / avg) * 100)
      warnings.push({ muscle, pctAbove, thisWeekVol: Math.round(current), avgVol: Math.round(avg) })
    }
  }
  return warnings.sort((a, b) => b.pctAbove - a.pctAbove)
}

export function currentWeekStartKey(nowMs = Date.now()): string {
  return dateKey(weekStartMonday(new Date(nowMs)))
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
