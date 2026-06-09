import { useMemo } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import { computePerformanceInsights } from '../lib/performanceInsights'

export function PerformanceInsightsCard({ className = '' }: { className?: string }) {
  const { state } = useWorkout()

  const { eligible, insights } = useMemo(
    () => computePerformanceInsights(state),
    [state.setLogs, state.sleepLogs, state.mealLogs, state.settings.unit],
  )

  return (
    <div className={`apex-card p-5 ${className}`.trim()}>
      <p className="apex-section-label mb-1">Performance insights</p>
      {!eligible ? (
        <>
          <p className="text-[12px] font-medium text-[#a0a0a8] mb-3 leading-relaxed">
            Patterns from your sleep, nutrition, and logged strength work.
          </p>
          <div className="rounded-[10px] p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-[13px] font-medium text-[#a0a0a8] leading-relaxed">
              Log sleep, meals, and workouts consistently for 2+ weeks — your performance patterns will appear here.
            </p>
          </div>
        </>
      ) : (
        <>
          <p className="text-[12px] font-medium text-[#a0a0a8] mb-4 leading-relaxed">
            Patterns from your sleep, nutrition, and logged strength work (2+ weeks of combined data).
          </p>
          {insights.length > 0 ? (
            <ul className="space-y-3">
              {insights.map((insight) => (
                <li
                  key={insight.id}
                  className="text-[13px] font-medium text-[#ececee] leading-relaxed pl-3 border-l-2 border-[var(--apex-accent)]"
                >
                  {insight.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[13px] font-medium text-[#a0a0a8] leading-relaxed">
              Keep logging sleep, meals, and workouts on the same days — we&apos;ll surface trends as
              patterns emerge.
            </p>
          )}
        </>
      )}
    </div>
  )
}
