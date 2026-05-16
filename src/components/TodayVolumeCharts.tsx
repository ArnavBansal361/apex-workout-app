import { useMemo } from 'react'
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
import { weeklyVolumeHorizontalBarData, weeklyVolumeRadarData } from '../lib/volumeStats'

type Props = {
  state: AppPersisted
  clock: number
  accent: string
}

/** Weekly volume bar chart, or empty-state card when no sets logged yet. */
export function TodayWeeklyVolumeChart({ state, clock, accent }: Props) {
  const barData = useMemo(() => weeklyVolumeHorizontalBarData(state, clock), [state, clock])
  const maxVol = Math.max(1, ...barData.map((d) => d.volume))
  const noSetsYet = state.setLogs.length === 0

  if (noSetsYet) {
    return (
      <div className="apex-card p-8 sm:p-10 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6b6b73] mb-3">
          Weekly volume
        </p>
        <p className="text-[17px] font-semibold text-[#ececee] leading-snug max-w-sm mx-auto">
          Your charts will show up here once you log a few sets.
        </p>
        <p className="mt-4 text-[13px] font-medium text-[#7c7c84] leading-relaxed max-w-md mx-auto">
          Log weighted or timed sets from Today — then you&apos;ll see load by muscle for the week.
        </p>
      </div>
    )
  }

  return (
    <div className="apex-card p-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9a9aa3] mb-1">
        Weekly volume by muscle (lbs)
      </h3>
      <p className="text-[12px] text-[#7c7c84] mb-4 leading-relaxed font-medium">
        Load = sets × reps × weight (converted to lb). Cardio not included.
      </p>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={barData}
            margin={{ top: 4, right: 56, left: 4, bottom: 4 }}
          >
            <XAxis type="number" domain={[0, maxVol]} hide />
            <YAxis
              type="category"
              dataKey="muscle"
              width={72}
              tick={{ fill: '#e0e0e0', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Bar dataKey="volume" fill={accent} radius={[0, 6, 6, 0]} barSize={16} isAnimationActive={false}>
              <LabelList dataKey="label" position="right" fill="#e0e0e0" fontSize={11} offset={6} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** Muscle balance radar for the week. */
export function TodayMuscleBalanceChart({ state, clock, accent }: Props) {
  const radarData = useMemo(() => weeklyVolumeRadarData(state, clock), [state, clock])
  const noSetsYet = state.setLogs.length === 0

  if (noSetsYet) {
    return (
      <div className="apex-card p-6 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6b6b73] mb-2">
          Muscle balance
        </p>
        <p className="text-[14px] font-medium text-[#7c7c84] leading-relaxed">
          Log sets to see how volume is spread across muscle groups this week.
        </p>
      </div>
    )
  }

  return (
    <div className="apex-card p-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9a9aa3] mb-1">
        Muscle balance (this week)
      </h3>
      <p className="text-[12px] text-[#7c7c84] mb-4 leading-relaxed font-medium">
        Relative volume across six groups. A shrunken wedge means less load than your strongest
        group this week.
      </p>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="78%">
            <PolarGrid stroke="#2a2a2a" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: '#e0e0e0', fontSize: 11 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar
              name="Relative load"
              dataKey="volume"
              stroke={accent}
              fill={accent}
              fillOpacity={0.35}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** Both charts stacked (legacy convenience). */
export function TodayVolumeCharts({ state, clock, accent }: Props) {
  return (
    <div className="space-y-4">
      <TodayWeeklyVolumeChart state={state} clock={clock} accent={accent} />
      <TodayMuscleBalanceChart state={state} clock={clock} accent={accent} />
    </div>
  )
}
