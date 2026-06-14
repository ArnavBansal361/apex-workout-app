import type { AppPersisted, MuscleGroup } from '../types'
import { dateKey, weekStartMonday } from './dates'
import { weeklyVolumeLoadByMuscleLbs } from './volumeStats'

function inWeek(at: number, weekStart: Date, weekEnd: Date): boolean {
  const t = new Date(at)
  return t >= weekStart && t < weekEnd
}

export function isSundayLocal(nowMs: number): boolean {
  return new Date(nowMs).getDay() === 0
}

/** Monday before noon — hide prior-week recap when a new week has started. */
export function isMondayMorningLocal(nowMs: number): boolean {
  const d = new Date(nowMs)
  return d.getDay() === 1 && d.getHours() < 12
}

export type WeekSummary = {
  totalSets: number
  totalVolumeLbs: number
  muscleGroups: MuscleGroup[]
  prCount: number
  weekLabel: string
}

/** Monday–Sunday week containing `nowMs` (matches schedule / volume helpers). */
export function computeWeekSummary(state: AppPersisted, nowMs: number): WeekSummary {
  const ws = weekStartMonday(new Date(nowMs))
  const we = new Date(ws)
  we.setDate(ws.getDate() + 7)

  const sets = state.setLogs.filter((l) => inWeek(l.at, ws, we))
  const prCount = sets.filter((l) => l.isPr).length

  const volMap = weeklyVolumeLoadByMuscleLbs(state, nowMs)
  let totalVolumeLbs = 0
  for (const v of Object.values(volMap)) {
    totalVolumeLbs += v
  }
  totalVolumeLbs = Math.round(totalVolumeLbs)

  const mg = new Set<MuscleGroup>()
  for (const l of sets) {
    mg.add(l.muscleGroup)
  }
  const muscleGroups = [...mg].sort()

  const wk6 = new Date(ws)
  wk6.setDate(ws.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const weekLabel = `${fmt(ws)} – ${fmt(wk6)}`

  return {
    totalSets: sets.length,
    totalVolumeLbs,
    muscleGroups,
    prCount,
    weekLabel,
  }
}
