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
import { weeklyVolumeHorizontalBarData, weeklyVolumeRadarData, detectInjuryRiskWarnings } from '../lib/volumeStats'

const MIN_SESSIONS_FOR_VOLUME_CHART = 3

const SLIDE_LABELS = ['Weekly volume', 'Muscle balance'] as const

/** Shared chart panel wrapper (padding comes from .apex-card). */
const CHART_BODY_CLASS = 'min-w-0'

/** Radar wedge fill — 12% opacity (within 10–15% spec). */
const RADAR_FILL_OPACITY = 0.12

/** Horizontal bar fill: medium gray on dark cards, equivalent on light. */
function todayVolumeBarFill(chart: ReturnType<typeof useApexChartColors>): string {
  return chart.radarStroke === '#ffffff'
    ? 'rgba(255,255,255,0.4)'
    : 'rgba(0,0,0,0.4)'
}

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
const MUSCLE_GROUP_COUNT = 6

/** Plot area height shared by weekly volume bars and muscle balance radar. */
function weekVolumePlotHeight(muscleCount = MUSCLE_GROUP_COUNT): number {
  return Math.max(200, muscleCount * BAR_ROW_HEIGHT + BAR_CHART_PAD)
}

const RADAR_CHART_MARGIN = { top: 24, right: 28, bottom: 24, left: 28 }

const WeeklyVolumePanel = memo(function WeeklyVolumePanel({ state, weekKey }: ChartProps) {
  const chart = useApexChartColors()
  const anchorMs = useMemo(() => weekAnchorMs(weekKey), [weekKey])
  const barData = useMemo(
    () => weeklyVolumeHorizontalBarData(state, anchorMs),
    [state.setLogs, state.settings.unit, anchorMs],
  )
  const maxVol = Math.max(1, ...barData.map((d) => d.volume))
  const chartHeight = weekVolumePlotHeight(barData.length)
  const labelMargin = useMemo(() => {
    const longest = barData.reduce((m, d) => Math.max(m, d.label.length), 8)
    return Math.min(120, Math.max(72, longest * 6.5))
  }, [barData])

  return (
    <div className={CHART_BODY_CLASS}>
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
            margin={{ top: 8, right: labelMargin, left: 8, bottom: 8 }}
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
              fill={todayVolumeBarFill(chart)}
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
    </div>
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
    plotHeight,
  }: {
    data: RadarPoint[]
    gridStroke: string
    labelFill: string
    radarStroke: string
    radarFill: string
    radarFillOpacity: number
    plotHeight: number
  }) {
    const renderAngleTick = useMemo(
      () =>
        (props: {
          x?: string | number
          y?: string | number
          cx?: string | number
          cy?: string | number
          payload?: { value?: string }
        }) => {
          const x = Number(props.x ?? 0)
          const y = Number(props.y ?? 0)
          const cx = Number(props.cx ?? 0)
          const cy = Number(props.cy ?? 0)
          const { payload } = props
          const angle = Math.atan2(y - cy, x - cx)
          const pad = 14
          const tx = x + Math.cos(angle) * pad
          const ty = y + Math.sin(angle) * pad
          return (
            <text
              x={tx}
              y={ty}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={labelFill}
              fontSize={10}
              fontWeight={500}
            >
              {payload?.value ?? ''}
            </text>
          )
        },
      [labelFill],
    )
    const radiusDomain = useMemo(() => [0, 100] as const, [])

    return (
      <ResponsiveContainer width="100%" height={plotHeight} debounce={1}>
        <RadarChart
          data={data}
          cx="50%"
          cy="50%"
          outerRadius="78%"
          margin={RADAR_CHART_MARGIN}
        >
          <PolarGrid stroke={gridStroke} strokeWidth={0.5} />
          <PolarAngleAxis
            dataKey="subject"
            tick={renderAngleTick}
            tickLine={false}
          />
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
    prev.radarFillOpacity === next.radarFillOpacity &&
    prev.plotHeight === next.plotHeight,
)

const MuscleBalancePanel = memo(function MuscleBalancePanel({ state, weekKey }: ChartProps) {
  const chart = useApexChartColors()
  const anchorMs = useMemo(() => weekAnchorMs(weekKey), [weekKey])
  const radarData = useMemo(
    () => weeklyVolumeRadarData(state, anchorMs),
    [state.setLogs, state.settings.unit, anchorMs],
  )
  const injuryWarnings = useMemo(
    () => detectInjuryRiskWarnings(state, anchorMs),
    [state.setLogs, state.settings.unit, anchorMs],
  )
  const darkRadar = chart.radarStroke === '#ffffff'
  const radarFill = darkRadar ? '#ffffff' : 'rgba(0,0,0,0.12)'
  const radarFillOpacity = darkRadar ? RADAR_FILL_OPACITY : 1
  const plotHeight = weekVolumePlotHeight()

  return (
    <div className={CHART_BODY_CLASS}>
      <p className="text-[12px] text-[#a0a0a8] mb-3 leading-relaxed font-medium">
        Relative volume across six groups. A shrunken wedge means less load than your strongest
        group this week.
      </p>
      {injuryWarnings.length > 0 ? (
        <div className="mb-3 rounded-[12px] border border-[#c47a3a]/35 bg-[#c47a3a]/[0.08] p-3 space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#d4956a]">
            Injury risk
          </p>
          {injuryWarnings.map((warning) => (
            <p
              key={`${warning.kind}-${warning.muscle ?? warning.message}`}
              className="text-[12px] font-medium text-[#ececee] leading-relaxed flex gap-2"
            >
              <i className="ti ti-alert-triangle shrink-0 mt-0.5 text-[14px] text-[#d4956a]" aria-hidden />
              <span>{warning.message}</span>
            </p>
          ))}
        </div>
      ) : null}
      <div
        className="apex-muscle-balance-plot w-full min-w-0 overflow-visible"
        style={{ height: plotHeight }}
      >
        <MuscleBalanceRadar
          data={radarData}
          gridStroke={chart.grid}
          labelFill={chart.label}
          radarStroke={chart.radarStroke}
          radarFill={radarFill}
          radarFillOpacity={radarFillOpacity}
          plotHeight={plotHeight}
        />
      </div>
    </div>
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
      <div className="apex-card min-w-0 overflow-visible">
        <p className="apex-section-label mb-2">Weekly volume</p>
        <WeeklyVolumePanel state={state} weekKey={weekKey} />
      </div>
      <div className="apex-card min-w-0 overflow-visible">
        <p className="apex-section-label mb-2">Muscle balance</p>
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
  const plotHeight = weekVolumePlotHeight(barData.length)
  const barBlockHeight = plotHeight + 56
  const radarBlockHeight = plotHeight + 56
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
    <div className="apex-card min-w-0 overflow-visible">
      <p className="apex-section-label mb-2">This week</p>
      <p className="text-[12px] font-medium text-[#a0a0a8] mb-2">{SLIDE_LABELS[slide]}</p>

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

export const TodayWeeklyVolumeSection = memo(function TodayWeeklyVolumeSection() {
  const { state } = useWorkout()
  const weekKey = weekAnchorKey()
  const sessionDays = workoutDaysFromLogs(state.setLogs).size

  if (sessionDays < MIN_SESSIONS_FOR_VOLUME_CHART) {
    return null
  }

  return (
    <div className="apex-card min-w-0 overflow-visible">
      <p className="apex-section-label mb-2">This week</p>
      <p className="text-[12px] font-medium text-[#a0a0a8] mb-2">Weekly volume by muscle group.</p>
      <WeeklyVolumePanel state={state} weekKey={weekKey} />
    </div>
  )
})

/** Standalone muscle balance card (Today layout section). Includes injury risk warnings. */
export const TodayMuscleBalanceSection = memo(function TodayMuscleBalanceSection() {
  const { state } = useWorkout()
  const weekKey = weekAnchorKey()
  const sessionDays = workoutDaysFromLogs(state.setLogs).size

  if (sessionDays < MIN_SESSIONS_FOR_VOLUME_CHART) {
    return null
  }

  return (
    <div className="apex-card min-w-0 overflow-visible">
      <p className="apex-section-label mb-2">Muscle balance</p>
      <MuscleBalancePanel state={state} weekKey={weekKey} />
    </div>
  )
})

/** Combined week charts (single card). */
export function TodayVolumeCharts() {
  return <TodayWeeklyVolumeSection />
}
