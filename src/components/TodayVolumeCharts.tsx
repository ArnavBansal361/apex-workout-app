import { memo, useMemo, useRef, useState, type TouchEvent } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import {
  Bar,
  BarChart,
  LabelList,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import type { AppPersisted } from '../types'
import { dateKey, parseDateKey, weekStartMonday } from '../lib/dates'
import { useApexChartColors } from '../lib/stats'
import { workoutDaysFromLogs } from '../lib/achievements'
import { weeklyVolumeHorizontalBarData, weeklyVolumeRadarData } from '../lib/volumeStats'

const MIN_SESSIONS_FOR_VOLUME_CHART = 3

const SLIDE_LABELS = ['Weekly volume', 'Muscle balance'] as const

/** Stable for the current calendar week. */
export function weekAnchorKey(clockMs: number = Date.now()): string {
  return dateKey(weekStartMonday(new Date(clockMs)))
}

function weekAnchorMs(weekKey: string): number {
  const d = parseDateKey(weekKey)
  d.setHours(12, 0, 0, 0)
  return d.getTime()
}

type ChartProps = {
  state: AppPersisted
  weekKey: string
}

const BAR_ROW_HEIGHT = 36
const BAR_CHART_PAD = 16

const WeeklyVolumePanel = memo(function WeeklyVolumePanel({ state, weekKey }: ChartProps) {
  const chart = useApexChartColors()
  const anchorMs = useMemo(() => weekAnchorMs(weekKey), [weekKey])
  const barData = useMemo(
    () => weeklyVolumeHorizontalBarData(state, anchorMs),
    [state.setLogs, state.settings.unit, anchorMs],
  )
  const maxVol = Math.max(1, ...barData.map((d) => d.volume))
  const chartHeight = Math.max(200, barData.length * BAR_ROW_HEIGHT + BAR_CHART_PAD)
  const labelMargin = useMemo(() => {
    const longest = barData.reduce((m, d) => Math.max(m, d.label.length), 8)
    return Math.min(120, Math.max(72, longest * 6.5))
  }, [barData])

  return (
    <>
      <p className="text-[12px] text-[#a0a0a8] mb-3 leading-relaxed font-medium">
        Load = sets × reps × weight (converted to lb). Cardio not included.
      </p>
      <div
        className="w-full min-w-0 overflow-visible"
        style={{ height: chartHeight }}
      >
        <ResponsiveContainer width="100%" height={chartHeight} debounce={1}>
          <BarChart
            layout="vertical"
            data={barData}
            margin={{ top: 4, right: labelMargin, left: 4, bottom: 4 }}
            barCategoryGap={6}
            barGap={2}
          >
            <XAxis type="number" domain={[0, maxVol]} hide />
            <YAxis
              type="category"
              dataKey="muscle"
              width={76}
              scale="band"
              tick={{ fill: chart.label, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Bar
              dataKey="volume"
              fill={chart.bar}
              radius={[0, 4, 4, 0]}
              maxBarSize={18}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="label"
                position="right"
                fill={chart.label}
                fontSize={10}
                offset={6}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
})

type RadarPoint = { subject: string; volume: number; fullMark: number }

const MuscleBalanceRadar = memo(
  function MuscleBalanceRadar({
    data,
    gridStroke,
    labelFill,
    radarStroke,
    radarFill,
    radarFillOpacity,
  }: {
    data: RadarPoint[]
    gridStroke: string
    labelFill: string
    radarStroke: string
    radarFill: string
    radarFillOpacity: number
  }) {
    const angleTick = useMemo(
      () => ({ fill: labelFill, fontSize: 10, fontWeight: 500 as const }),
      [labelFill],
    )
    const radiusDomain = useMemo(() => [0, 100] as const, [])

    const radarHeight = 280

    return (
      <ResponsiveContainer width="100%" height={radarHeight} debounce={1}>
        <RadarChart
          data={data}
          cx="50%"
          cy="50%"
          outerRadius="56%"
          margin={{ top: 28, right: 36, bottom: 28, left: 36 }}
        >
          <PolarGrid stroke={gridStroke} strokeWidth={0.5} />
          <PolarAngleAxis dataKey="subject" tick={angleTick} tickLine={false} />
          <PolarRadiusAxis angle={30} domain={radiusDomain} tick={false} axisLine={false} />
          <Radar
            name="Relative load"
            dataKey="volume"
            stroke={radarStroke}
            fill={radarFill}
            fillOpacity={radarFillOpacity}
            strokeWidth={2}
            isAnimationActive={false}
            animationDuration={0}
          />
        </RadarChart>
      </ResponsiveContainer>
    )
  },
  (prev, next) =>
    prev.data === next.data &&
    prev.gridStroke === next.gridStroke &&
    prev.labelFill === next.labelFill &&
    prev.radarStroke === next.radarStroke &&
    prev.radarFill === next.radarFill &&
    prev.radarFillOpacity === next.radarFillOpacity,
)

const MuscleBalancePanel = memo(function MuscleBalancePanel({ state, weekKey }: ChartProps) {
  const chart = useApexChartColors()
  const anchorMs = useMemo(() => weekAnchorMs(weekKey), [weekKey])
  const radarData = useMemo(
    () => weeklyVolumeRadarData(state, anchorMs),
    [state.setLogs, state.settings.unit, anchorMs],
  )
  const fillOpacity = Math.max(chart.radarFillOpacity, 0.42)

  return (
    <>
      <p className="text-[12px] text-[#a0a0a8] mb-3 leading-relaxed font-medium">
        Relative volume across six groups. A shrunken wedge means less load than your strongest
        group this week.
      </p>
      <div className="w-full min-w-0 overflow-visible" style={{ height: 280 }}>
        <MuscleBalanceRadar
          data={radarData}
          gridStroke={chart.grid}
          labelFill={chart.label}
          radarStroke={chart.radarStroke}
          radarFill={chart.radarFill}
          radarFillOpacity={fillOpacity}
        />
      </div>
    </>
  )
})

/** Desktop: weekly volume and muscle balance side by side. */
export const TodayWeekChartsSideBySide = memo(function TodayWeekChartsSideBySide() {
  const { state } = useWorkout()
  const weekKey = weekAnchorKey()
  const sessionDays = workoutDaysFromLogs(state.setLogs).size

  if (sessionDays < MIN_SESSIONS_FOR_VOLUME_CHART) {
    return null
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="apex-card p-5 min-w-0 overflow-visible">
        <p className="apex-section-label mb-3">Weekly volume</p>
        <WeeklyVolumePanel state={state} weekKey={weekKey} />
      </div>
      <div className="apex-card p-5 min-w-0 overflow-visible">
        <p className="apex-section-label mb-3">Muscle balance</p>
        <MuscleBalancePanel state={state} weekKey={weekKey} />
      </div>
    </div>
  )
})

/** Swipeable weekly volume + muscle balance in one card. */
export const TodayWeekChartsSection = memo(function TodayWeekChartsSection() {
  const { state } = useWorkout()
  const weekKey = weekAnchorKey()
  const sessionDays = workoutDaysFromLogs(state.setLogs).size
  const [slide, setSlide] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const barData = useMemo(
    () => weeklyVolumeHorizontalBarData(state, weekAnchorMs(weekKey)),
    [state.setLogs, state.settings.unit, weekKey],
  )
  const barBlockHeight = Math.max(200, barData.length * BAR_ROW_HEIGHT + BAR_CHART_PAD) + 56
  const radarBlockHeight = 280 + 56
  const chartBlockHeight = slide === 0 ? barBlockHeight : radarBlockHeight

  if (sessionDays < MIN_SESSIONS_FOR_VOLUME_CHART) {
    return null
  }

  function goTo(index: number) {
    setSlide(Math.max(0, Math.min(1, index)))
  }

  function onTouchStart(e: TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }

  function onTouchEnd(e: TouchEvent) {
    const start = touchStartX.current
    touchStartX.current = null
    if (start == null) return
    const end = e.changedTouches[0]?.clientX
    if (end == null) return
    const delta = end - start
    if (Math.abs(delta) < 40) return
    if (delta < 0) goTo(slide + 1)
    else goTo(slide - 1)
  }

  return (
    <div className="apex-card p-5 min-w-0 overflow-visible">
      <p className="apex-section-label mb-1">This week</p>
      <p className="text-[12px] font-medium text-[#a0a0a8] mb-3">{SLIDE_LABELS[slide]}</p>

      <div
        className="w-full min-w-0 overflow-visible touch-pan-y"
        style={{ minHeight: chartBlockHeight }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {slide === 0 ? (
          <WeeklyVolumePanel state={state} weekKey={weekKey} />
        ) : (
          <MuscleBalancePanel state={state} weekKey={weekKey} />
        )}
      </div>

      <div className="flex justify-center gap-2 mt-4" role="tablist" aria-label="Chart view">
        {SLIDE_LABELS.map((label, i) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={slide === i}
            aria-label={label}
            className={`h-2 w-2 rounded-full transition-opacity apex-week-chart-dot ${
              slide === i ? 'apex-week-chart-dot--active' : ''
            }`}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </div>
  )
})

/** @deprecated Use TodayWeekChartsSection — volume only slice */
export const TodayWeeklyVolumeSection = TodayWeekChartsSection

/** Muscle balance is included in TodayWeekChartsSection */
export function TodayMuscleBalanceSection() {
  return null
}

/** Combined week charts (single card). */
export function TodayVolumeCharts() {
  return <TodayWeekChartsSection />
}
