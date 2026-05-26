import { useMemo, type ReactNode } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import { dateKey } from '../lib/dates'
import {
  formatSleepDuration,
  sleepLogForDateKey,
  waterOzForDateKey,
  weeklyVolumeSeries,
} from '../lib/stats'
import type { TodaySectionId } from '../types'
import { DEFAULT_WATER_GOAL_OZ } from '../types'

export type MoreQuickTileId =
  | 'weekly-volume'
  | 'cardio-tracker'
  | 'water-tracker'
  | 'sleep-tracker'

export type MoreQuickTile = {
  id: MoreQuickTileId
  label: string
  icon: string
}

export const MORE_QUICK_TILES: MoreQuickTile[] = [
  { id: 'weekly-volume', label: 'Charts', icon: 'ti-chart-bar' },
  { id: 'cardio-tracker', label: 'Cardio', icon: 'ti-heartbeat' },
  { id: 'water-tracker', label: 'Water', icon: 'ti-droplet' },
  { id: 'sleep-tracker', label: 'Sleep', icon: 'ti-moon' },
]

function last7DayKeys(nowMs: number): string[] {
  const keys: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(nowMs)
    d.setDate(d.getDate() - i)
    keys.push(dateKey(d))
  }
  return keys
}

function normalizeSeries(values: number[]): number[] {
  const max = Math.max(1, ...values)
  return values.map((v) => v / max)
}

function MiniSparkline({ values, stroke = '#3d7ab5' }: { values: number[]; stroke?: string }) {
  const norm = normalizeSeries(values)
  const w = 56
  const h = 28
  const pts = norm
    .map((v, i) => {
      const x = norm.length <= 1 ? w / 2 : (i / (norm.length - 1)) * w
      const y = h - v * (h - 2) - 1
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function WaterRing({ progress }: { progress: number }) {
  const r = 14
  const c = 2 * Math.PI * r
  const p = Math.min(1, Math.max(0, progress))
  return (
    <svg width={36} height={36} viewBox="0 0 36 36" className="shrink-0" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="#3d7ab5"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${c * p} ${c}`}
        transform="rotate(-90 18 18)"
      />
    </svg>
  )
}

function SleepBars({ hours }: { hours: number[] }) {
  const norm = normalizeSeries(hours)
  return (
    <div className="flex items-end gap-[3px] h-7 shrink-0" aria-hidden>
      {norm.map((v, i) => (
        <span
          key={i}
          className="w-[5px] rounded-[2px] bg-[#3d7ab5]"
          style={{ height: `${Math.max(4, Math.round(v * 28))}px`, opacity: hours[i]! > 0 ? 1 : 0.25 }}
        />
      ))}
    </div>
  )
}

function formatVolumeShort(lbs: number, unit: 'lbs' | 'kg'): string {
  const display = unit === 'kg' ? lbs / 2.20462 : lbs
  if (display >= 1000) return `${(display / 1000).toFixed(1)}k ${unit}`
  return `${Math.round(display)} ${unit}`
}

function ozToLiters(oz: number): string {
  return `${(oz * 0.0295735).toFixed(1)} L`
}

type Props = {
  activeId: TodaySectionId | null
  onSelect: (id: TodaySectionId) => void
}

export function TodayMoreQuickGrid({ activeId, onSelect }: Props) {
  const { state } = useWorkout()
  const nowMs = Date.now()
  const todayKey = dateKey(new Date(nowMs))
  const unit = state.settings.unit
  const dayKeys = useMemo(() => last7DayKeys(nowMs), [nowMs])

  const volumeSeries = useMemo(() => weeklyVolumeSeries(state, nowMs).slice(-7), [state, nowMs])
  const volumeSpark = useMemo(() => volumeSeries.map((w) => w.volume), [volumeSeries])
  const weekVolume = volumeSeries[volumeSeries.length - 1]?.volume ?? 0

  const cardioSpark = useMemo(() => {
    return dayKeys.map((dk) => {
      let min = 0
      for (const c of state.cardioEntries) {
        if (dateKey(new Date(c.at)) !== dk) continue
        min += c.durationMinutes ?? 0
      }
      return min
    })
  }, [state.cardioEntries, dayKeys])

  const cardioTodayMin = useMemo(() => {
    return state.cardioEntries
      .filter((c) => dateKey(new Date(c.at)) === todayKey)
      .reduce((s, c) => s + (c.durationMinutes ?? 0), 0)
  }, [state.cardioEntries, todayKey])

  const waterGoalOz = state.settings.waterGoalOz ?? DEFAULT_WATER_GOAL_OZ
  const waterTodayOz = waterOzForDateKey(state, todayKey)
  const waterProgress = waterGoalOz > 0 ? waterTodayOz / waterGoalOz : 0

  const sleepHours = useMemo(() => {
    return dayKeys.map((dk) => {
      const log = sleepLogForDateKey(state, dk)
      return log ? log.durationMinutes / 60 : 0
    })
  }, [state.sleepLogs, dayKeys])

  const sleepStat = useMemo(() => {
    const last = sleepLogForDateKey(state, todayKey)
    if (last) return formatSleepDuration(last.durationMinutes)
    const logs = dayKeys
      .map((k) => sleepLogForDateKey(state, k))
      .filter((l): l is NonNullable<typeof l> => l != null)
    if (!logs.length) return '—'
    const avgMin = logs.reduce((sum, l) => sum + l.durationMinutes, 0) / logs.length
    return formatSleepDuration(avgMin)
  }, [state, todayKey, dayKeys])

  const tileVisuals: Record<MoreQuickTileId, { stat: string; visual: ReactNode }> = {
    'weekly-volume': {
      stat: formatVolumeShort(weekVolume, unit),
      visual: <MiniSparkline values={volumeSpark.length ? volumeSpark : [0]} />,
    },
    'cardio-tracker': {
      stat: cardioTodayMin > 0 ? `${Math.round(cardioTodayMin)} min` : '—',
      visual: <MiniSparkline values={cardioSpark} stroke="#3d7ab5" />,
    },
    'water-tracker': {
      stat: ozToLiters(waterTodayOz),
      visual: <WaterRing progress={waterProgress} />,
    },
    'sleep-tracker': {
      stat: sleepStat,
      visual: <SleepBars hours={sleepHours} />,
    },
  }

  return (
    <div className="apex-today-quick-grid" role="group" aria-label="Quick access">
      {MORE_QUICK_TILES.map((tile) => {
        const active = activeId === tile.id
        const v = tileVisuals[tile.id]
        return (
          <button
            key={tile.id}
            type="button"
            className={`apex-today-quick-card${active ? ' apex-today-quick-card--active' : ''}`}
            aria-pressed={active}
            onClick={() => onSelect(tile.id)}
          >
            <div className="apex-today-quick-card__top">
              <i className={`${tile.icon} apex-today-quick-card__icon`} aria-hidden />
              {v.visual}
            </div>
            <div className="apex-today-quick-card__bottom">
              <span className="apex-today-quick-card__label">{tile.label}</span>
              <span className="apex-today-quick-card__stat tabular-nums">{v.stat}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
