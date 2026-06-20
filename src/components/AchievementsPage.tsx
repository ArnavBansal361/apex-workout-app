import { ACHIEVEMENT_DEFS } from '../types'
import { getAchievementProgress } from '../lib/achievements'
import { useWorkout } from '../context/WorkoutContext'
import { ApexLogo } from './ApexLogo'

type Props = { onClose: () => void; standalone?: boolean }


const ACHIEVEMENT_ICON: Record<string, string> = {
  'first-pr': '★',
  'streak-7': '7',
  'sets-100': '100',
  'workouts-30': '30',
  'six-groups': '6',
  'bw-7': '+',
  'first-workout': '1',
  'night-owl': '☽',
  'early-bird': '☀',
  'streak-30': '30',
  'sets-1000': '1k',
  'workouts-100': '100',
  'volume-50k': '50k',
  'streak-14': '14',
  'iron-will': '7',
  'consistency-4w': '4',
  'pr-machine': '10',
  'variety-pack': '5',
  'marathon-session': '2h',
  'volume-king': '50k',
}

const ACCENT = '#c0582a'
const ACCENT_BG = 'rgba(192,88,42,0.18)'

function AchievementList({ standalone }: { standalone?: boolean }) {
  const { state } = useWorkout()
  const earned = new Set(state.achievements)
  const sorted = [...ACHIEVEMENT_DEFS].sort((a, b) => {
    const aOk = earned.has(a.id) ? 0 : 1
    const bOk = earned.has(b.id) ? 0 : 1
    return aOk - bOk
  })
  const unlockedCount = sorted.filter((a) => earned.has(a.id)).length

  return (
    <div className={standalone
      ? 'overflow-y-auto px-8 pb-10'
      : 'flex-1 min-h-0 overflow-y-auto p-4 pb-28'
    }>
      {standalone && (
        <p className="text-[13px] text-[var(--apex-text-tertiary)] mb-6">
          {unlockedCount} of {sorted.length} unlocked · keep showing up.
        </p>
      )}
      <div className={standalone ? 'grid grid-cols-4 gap-3' : 'grid grid-cols-2 gap-3'}>
        {sorted.map((a) => {
          const ok = earned.has(a.id)
          const prog = getAchievementProgress(state, a.id)
          const icon = ACHIEVEMENT_ICON[a.id] ?? '·'
          return (
            <div
              key={a.id}
              className="rounded-[12px] border-[0.5px] p-5 flex flex-col items-center text-center"
              style={{
                background: '#13181f',
                border: ok ? `0.5px solid rgba(192,88,42,0.3)` : '0.5px solid rgba(255,255,255,0.08)',
                opacity: ok ? 1 : 0.65,
              }}
            >
              {/* Icon circle */}
              <div
                className="flex items-center justify-center rounded-full mb-4"
                style={{
                  width: 72,
                  height: 72,
                  background: ok ? ACCENT_BG : 'rgba(255,255,255,0.05)',
                  border: ok ? `0.5px solid rgba(192,88,42,0.35)` : '0.5px solid rgba(255,255,255,0.08)',
                  color: ok ? ACCENT : 'rgba(255,255,255,0.2)',
                  fontSize: icon.length > 2 ? 22 : icon.length > 1 ? 26 : 30,
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                }}
              >
                {icon}
              </div>

              {/* Name */}
              <p className="text-[14px] font-medium leading-snug mb-1" style={{ color: ok ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)' }}>
                {a.title}
              </p>

              {/* Description */}
              <p className="text-[12px] leading-snug mb-3" style={{ color: ok ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.25)' }}>
                {a.description}
              </p>

              {/* Status */}
              {ok ? (
                <p className="text-[12px] font-medium" style={{ color: '#4ade80' }}>
                  ✓ Unlocked
                </p>
              ) : (
                <p className="text-[11px] tabular-nums" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {prog.current} / {prog.target}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function AchievementsPage({ onClose, standalone }: Props) {
  if (standalone) {
    return <AchievementList standalone />
  }

  return (
    <div
      role="presentation"
      className="apex-modal-overlay fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[min(92dvh,44rem)] flex flex-col rounded-t-[12px] sm:rounded-[12px] bg-[var(--apex-surface-page)] border-[0.5px] border-white/[0.08] overflow-hidden apex-theme-shell"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-4 border-b border-[0.5px] border-[var(--apex-border)] shrink-0">
          <ApexLogo />
          <button
            type="button"
            className="min-h-11 min-w-11 rounded-[8px] border-[0.5px] border-[var(--apex-border)] bg-[var(--apex-surface-card)] text-[13px] text-[var(--apex-text-primary)]"
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        <p className="px-4 pt-3 text-[13px] font-normal text-[var(--apex-text-secondary)] shrink-0">Achievements</p>
        <AchievementList />
      </div>
    </div>
  )
}
