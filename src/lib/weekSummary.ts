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

  const wk0 = dateKey(ws)
  const wk6 = new Date(ws)
  wk6.setDate(ws.getDate() + 6)
  const weekLabel = `${wk0.slice(5)} → ${dateKey(wk6).slice(5)}`

  return {
    totalSets: sets.length,
    totalVolumeLbs,
    muscleGroups,
    prCount,
    weekLabel,
  }
}
