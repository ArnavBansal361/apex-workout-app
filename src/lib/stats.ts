import type { AppPersisted } from '../types'
import { dateKey, weekStartMonday } from './dates'

/** Last 8 weeks Mon–Sun blocks, label + total volume (weight × reps × sets, lbs equivalent) */
export function weeklyVolumeSeries(state: AppPersisted): { label: string; volume: number }[] {
  const factor = state.settings.unit === 'kg' ? 2.20462 : 1
  const thisMonday = weekStartMonday(new Date())
  const out: { label: string; volume: number }[] = []
  for (let back = 7; back >= 0; back--) {
    const ws = new Date(thisMonday)
    ws.setDate(thisMonday.getDate() - back * 7)
    const we = new Date(ws)
    we.setDate(ws.getDate() + 7)
    let vol = 0
    for (const l of state.setLogs) {
      if (l.kind !== 'weighted' || l.bodyweight) continue
      const t = new Date(l.at)
      if (t < ws || t >= we) continue
      const w = (l.weight ?? 0) * factor
      vol += w * l.reps * Math.max(1, l.sets)
    }
    out.push({
      label: `${ws.getMonth() + 1}/${ws.getDate()}`,
      volume: Math.round(vol),
    })
  }
  return out
}

export function bodyweightSeries(state: AppPersisted): { at: string; value: number }[] {
  return [...state.bodyweightLogs]
    .sort((a, b) => a.at - b.at)
    .map((b) => ({ at: dateKey(new Date(b.at)), value: b.value }))
}

export function muscleCountsToday(state: AppPersisted, dayKey: string): Record<string, number> {
  const m: Record<string, number> = {}
  for (const l of state.setLogs) {
    if (dateKey(new Date(l.at)) !== dayKey) continue
    m[l.muscleGroup] = (m[l.muscleGroup] ?? 0) + 1
  }
  return m
}
