import { useMemo } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import { computeLongevityScore } from '../lib/longevityScore'

export function LongevityScoreCard({ className = '' }: { className?: string }) {
  const { state } = useWorkout()

  const result = useMemo(
    () => computeLongevityScore(state),
    [
      state.setLogs,
      state.cardioEntries,
      state.sleepLogs,
      state.settings.unit,
    ],
  )

  if (!result.hasEnoughData) {
    return (
      <div className={`apex-card p-5 ${className}`.trim()}>
        <p className="apex-section-label mb-1">Longevity score</p>
        <p className="text-[12px] font-medium text-[#a0a0a8] leading-relaxed">
          Log workouts over a few weeks to unlock a weekly score based on training consistency,
          cardio, muscle balance, and sleep.
        </p>
      </div>
    )
  }

  return (
    <div className={`apex-card p-5 ${className}`.trim()}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="apex-section-label mb-1">Longevity score</p>
          <p className="text-[11px] font-medium text-[#9898a0]">
            Updated weekly · week of {result.weekLabel}
          </p>
        </div>
        <p className="text-[36px] font-bold tabular-nums text-[#ececee] leading-none">
          {result.score}
          <span className="text-[14px] font-semibold text-[#9898a0]">/100</span>
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {(
          [
            ['Workouts', result.pillars.workoutConsistency],
            ['Cardio', result.pillars.cardioConsistency],
            ['Balance', result.pillars.strengthBalance],
            ['Sleep', result.pillars.sleep],
          ] as const
        ).map(([label, pts]) => (
          <div
            key={label}
            className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-3 py-2"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9898a0]">
              {label}
            </p>
            <p className="text-[15px] font-semibold tabular-nums text-[#ececee] mt-0.5">
              {pts}
              <span className="text-[11px] font-medium text-[#7d7d88]">/25</span>
            </p>
          </div>
        ))}
      </div>

      {result.drivers.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {result.drivers.map((d) => (
            <li
              key={d.text}
              className={`text-[13px] font-medium leading-relaxed pl-3 border-l-2 ${
                d.direction === 'up'
                  ? 'border-emerald-500/60 text-[#d8e8de]'
                  : 'border-amber-500/50 text-[#e8e0d0]'
              }`}
            >
              {d.direction === 'up' ? '↑ ' : '↓ '}
              {d.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
