import { useMemo } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import { detectInjuryRiskWarnings } from '../lib/volumeStats'
import { workoutDaysFromLogs } from '../lib/achievements'

const MIN_SESSIONS = 3

type RiskLevel = 'low' | 'moderate' | 'high'

function riskLevel(warningCount: number): RiskLevel {
  if (warningCount === 0) return 'low'
  if (warningCount === 1) return 'moderate'
  return 'high'
}

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bg: string; border: string; score: number }> = {
  low: {
    label: 'Low',
    color: '#6db87a',
    bg: 'rgba(109,184,122,0.08)',
    border: 'rgba(109,184,122,0.25)',
    score: 92,
  },
  moderate: {
    label: 'Moderate',
    color: '#d4956a',
    bg: 'rgba(196,122,58,0.08)',
    border: 'rgba(196,122,58,0.25)',
    score: 55,
  },
  high: {
    label: 'High',
    color: '#e07070',
    bg: 'rgba(224,112,112,0.08)',
    border: 'rgba(224,112,112,0.25)',
    score: 20,
  },
}

export function InjuryRiskScoreCard({ className = '' }: { className?: string }) {
  const { state } = useWorkout()

  const sessionDays = useMemo(
    () => workoutDaysFromLogs(state.setLogs).size,
    [state.setLogs],
  )

  const warnings = useMemo(
    () => detectInjuryRiskWarnings(state, Date.now()),
    [state.setLogs, state.settings.unit],
  )

  if (sessionDays < MIN_SESSIONS) {
    return (
      <div className={`apex-card p-5 ${className}`.trim()}>
        <p className="apex-section-label mb-1">Injury risk</p>
        <p className="text-[12px] font-medium text-[var(--apex-text-secondary)] leading-relaxed">
          Log at least {MIN_SESSIONS} workout sessions to unlock your injury risk score based on
          volume spikes and muscle imbalances.
        </p>
      </div>
    )
  }

  const level = riskLevel(warnings.length)
  const cfg = RISK_CONFIG[level]

  return (
    <div className={`apex-card p-5 ${className}`.trim()}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="apex-section-label mb-1">Injury risk</p>
          <p className="text-[11px] font-medium text-[var(--apex-text-tertiary)]">Based on this week's volume</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[36px] font-medium tabular-nums leading-none" style={{ color: cfg.color }}>
            {cfg.label}
          </p>
        </div>
      </div>

      {/* Risk bar */}
      <div className="relative h-2 rounded-full bg-white/[0.08] overflow-hidden mb-4">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{
            width: level === 'low' ? '20%' : level === 'moderate' ? '55%' : '90%',
            background: cfg.color,
          }}
        />
      </div>

      {warnings.length === 0 ? (
        <div
          className="rounded-[8px] p-3"
          style={{ background: cfg.bg, border: `0.5px solid ${cfg.border}` }}
        >
          <p className="text-[13px] font-medium leading-relaxed" style={{ color: cfg.color }}>
            Your training load looks balanced. Keep up the gradual progression.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {warnings.map((w) => (
            <div
              key={`${w.kind}-${w.muscle ?? 'imbalance'}`}
              className="rounded-[8px] p-3 flex gap-2"
              style={{ background: cfg.bg, border: `0.5px solid ${cfg.border}` }}
            >
              <i
                className="ti ti-alert-triangle shrink-0 mt-0.5 text-[14px]"
                style={{ color: cfg.color }}
                aria-hidden
              />
              <p className="text-[12px] font-medium text-[var(--apex-text-primary)] leading-relaxed">
                {w.message}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-3 text-[11px] font-medium text-[var(--apex-text-tertiary)]">
        <span style={{ color: RISK_CONFIG.low.color }}>● Low</span>
        <span style={{ color: RISK_CONFIG.moderate.color }}>● Moderate</span>
        <span style={{ color: RISK_CONFIG.high.color }}>● High</span>
      </div>
    </div>
  )
}
