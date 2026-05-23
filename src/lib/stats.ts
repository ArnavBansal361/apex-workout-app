import { useEffect, useMemo, useState } from 'react'
import type { AppPersisted } from '../types'
import { dateKey, weekStartMonday } from './dates'
import { APEX_THEME_STORAGE_KEY, type ApexThemeMode } from './persist'

export type ApexChartColors = {
  tick: string
  grid: string
  bar: string
  line: string
  radarStroke: string
  radarFill: string
  radarFillOpacity: number
  label: string
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
}

export function readApexThemeMode(): ApexThemeMode {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-apex-theme')
    if (attr === 'light' || attr === 'dark') return attr
  }
  try {
    return localStorage.getItem(APEX_THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function apexChartColors(theme: ApexThemeMode): ApexChartColors {
  if (theme === 'light') {
    return {
      tick: 'rgba(0,0,0,0.4)',
      grid: 'rgba(0,0,0,0.06)',
      bar: 'rgba(0,0,0,0.7)',
      line: 'rgba(0,0,0,0.55)',
      radarStroke: 'rgba(0,0,0,0.55)',
      radarFill: 'rgba(0,0,0,0.1)',
      radarFillOpacity: 1,
      label: 'rgba(0,0,0,0.4)',
      tooltipBg: '#f5f9f7',
      tooltipBorder: 'rgba(0,0,0,0.08)',
      tooltipText: 'rgba(0,0,0,0.9)',
    }
  }
  return {
    tick: 'rgba(255,255,255,0.7)',
    grid: 'rgba(255,255,255,0.12)',
    bar: '#ffffff',
    line: 'rgba(255,255,255,0.55)',
    radarStroke: '#ffffff',
    radarFill: '#ffffff',
    radarFillOpacity: 0.35,
    label: 'rgba(255,255,255,0.7)',
    tooltipBg: '#161616',
    tooltipBorder: 'rgba(255,255,255,0.1)',
    tooltipText: '#e0e0e0',
  }
}

/** Theme-aware palette for Recharts (updates when `data-apex-theme` changes). */
export function useApexChartColors(): ApexChartColors {
  const [theme, setTheme] = useState<ApexThemeMode>(readApexThemeMode)

  useEffect(() => {
    const sync = () => setTheme(readApexThemeMode())
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-apex-theme'] })
    window.addEventListener('storage', sync)
    return () => {
      obs.disconnect()
      window.removeEventListener('storage', sync)
    }
  }, [])

  return useMemo(() => apexChartColors(theme), [theme])
}

/** Last 8 weeks Mon–Sun blocks, label + total volume (weight × reps × sets, lbs equivalent) */
export function weeklyVolumeSeries(
  state: AppPersisted,
  nowMs: number = Date.now(),
): { label: string; volume: number }[] {
  const factor = state.settings.unit === 'kg' ? 2.20462 : 1
  const thisMonday = weekStartMonday(new Date(nowMs))
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

export type PlateChip = { label: string; opacity: number }

const PLATE_OPACITY_LBS: Record<number, number> = {
  45: 0.7,
  35: 0.5,
  25: 0.4,
  10: 0.3,
  5: 0.2,
  2.5: 0.15,
}

const PLATE_OPACITY_KG: Record<number, number> = {
  25: 0.7,
  20: 0.55,
  15: 0.5,
  10: 0.4,
  5: 0.3,
  2.5: 0.2,
  1.25: 0.15,
}

/** Greedy plate breakdown per side for bar + plates display. */
export function platesPerSide(
  totalWeight: number,
  unit: 'lbs' | 'kg',
): { barLabel: string; chips: PlateChip[] } | null {
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return null
  const bar = unit === 'lbs' ? 45 : 20
  const barLabel = unit === 'lbs' ? '45lb bar' : '20kg bar'
  const sizes = unit === 'lbs' ? [45, 35, 25, 10, 5, 2.5] : [25, 20, 15, 10, 5, 2.5, 1.25]
  const opacityMap = unit === 'lbs' ? PLATE_OPACITY_LBS : PLATE_OPACITY_KG
  let perSide = (totalWeight - bar) / 2
  if (perSide < 0.01) return { barLabel, chips: [] }
  const chips: PlateChip[] = []
  for (const size of sizes) {
    const count = Math.floor(perSide / size + 0.0001)
    for (let i = 0; i < count; i++) {
      chips.push({
        label: unit === 'lbs' ? `${size}lb` : `${size}kg`,
        opacity: opacityMap[size] ?? 0.3,
      })
    }
    perSide = Math.round((perSide - count * size) * 100) / 100
  }
  return { barLabel, chips }
}

export function muscleCountsToday(state: AppPersisted, dayKey: string): Record<string, number> {
  const m: Record<string, number> = {}
  for (const l of state.setLogs) {
    if (dateKey(new Date(l.at)) !== dayKey) continue
    m[l.muscleGroup] = (m[l.muscleGroup] ?? 0) + 1
  }
  return m
}
