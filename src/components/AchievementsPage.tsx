import { ACHIEVEMENT_DEFS } from '../types'
import { getAchievementProgress } from '../lib/achievements'
import { useWorkout } from '../context/WorkoutContext'
import { ApexLogo } from './ApexLogo'

type Props = { onClose: () => void }

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 11V8a5 5 0 0110 0v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="16" r="1" fill="currentColor" />
    </svg>
  )
}

function AchievementGlyph({ id, className }: { id: string; className?: string }) {
  const c = className ?? ''
  switch (id) {
    case 'first-pr':
      return (
        <svg className={c} width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3l1.8 5.5h5.8l-4.7 3.4 1.8 5.5-4.7-3.4-4.7 3.4 1.8-5.5-4.7-3.4h5.8L12 3z"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'streak-7':
      return (
        <svg className={c} width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.35" />
          <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
          <path d="M8 15h2M12 15h2M16 15h2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        </svg>
      )
    case 'sets-100':
      return (
        <svg className={c} width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M7 8h10M7 12h10M7 16h6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
          <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.35" />
        </svg>
      )
    case 'workouts-30':
      return (
        <svg className={c} width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M9 11l2 2 4-4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.35" />
          <path d="M8 3v3M16 3v3" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        </svg>
      )
    case 'six-groups':
      return (
        <svg className={c} width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.25" />
          <circle cx="7" cy="15" r="2.5" stroke="currentColor" strokeWidth="1.25" />
          <circle cx="17" cy="15" r="2.5" stroke="currentColor" strokeWidth="1.25" />
          <path
            d="M12 10.5L7 13M12 10.5l5 2.5M7 13l5 2.5 5-2.5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'bw-7':
      return (
        <svg className={c} width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 5v14M8 9h8" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
          <path d="M7 20h10" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        </svg>
      )
    case 'first-workout':
      return (
        <svg className={c} width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.35" />
          <path d="M10 9l5 3-5 3V9z" fill="currentColor" />
        </svg>
      )
    case 'night-owl':
      return (
        <svg className={c} width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M18 14a7 7 0 11-8-10 6 6 0 008 10z"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'early-bird':
      return (
        <svg className={c} width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.35" />
          <path d="M12 4v2M12 18v2M4 12h2M18 12h2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        </svg>
      )
    default:
      return (
        <svg className={c} width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.35" />
        </svg>
      )
  }
}

export function AchievementsPage({ onClose }: Props) {
  const { state } = useWorkout()
  const earned = new Set(state.achievements)

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
        <header className="flex items-center justify-between px-4 py-4 border-b border-[#1e1e1e] shrink-0">
          <ApexLogo />
          <button
            type="button"
            className="min-h-11 min-w-11 rounded-[8px] border-[0.5px] border-[#1e1e1e] bg-[#161616] text-[13px] text-[#e0e0e0]"
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        <p className="px-4 pt-3 text-[13px] font-normal text-[#a0a0a8] shrink-0">Achievements</p>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 pb-28">
        {ACHIEVEMENT_DEFS.map((a) => {
          const ok = earned.has(a.id)
          const prog = getAchievementProgress(state, a.id)
          return (
            <div
              key={a.id}
              className={`rounded-[12px] border-[0.5px] p-4 ${
                ok
                  ? 'bg-[#161616] border-white/[0.1]'
                  : 'bg-[#101012] border-[#252528] opacity-90'
              }`}
            >
              <div className="flex gap-4">
                <div
                  className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[12px] border-[0.5px] ${
                    ok ? 'border-transparent' : 'border-[#2a2a2e] bg-[#0d0d0f]'
                  }`}
                  style={ok ? { color: '#ffffff', background: '#1a1a1a' } : { color: '#909098' }}
                >
                  <AchievementGlyph id={a.id} />
                  {!ok ? (
                    <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-[0.5px] border-[#2a2a2e] bg-[#141416] text-[#a0a0a8]">
                      <LockIcon className="text-[#a0a0a8]" />
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-[14px] font-medium leading-snug ${ok ? 'text-[#ececee]' : 'text-[#a0a0a8]'}`}>
                      {a.title}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.5px] ${
                        ok ? 'text-[#0c0c0c]' : 'text-[#9898a0] bg-[#1a1a1e] border-[0.5px] border-[#2a2a2e]'
                      }`}
                      style={ok ? { backgroundColor: '#ffffff' } : undefined}
                    >
                      {ok ? 'Unlocked' : 'Locked'}
                    </span>
                  </div>
                  <p
                    className={`mt-2 text-[13px] font-medium leading-relaxed ${
                      ok ? 'text-[#a0a0a8]' : 'text-[#909098]'
                    }`}
                  >
                    {a.description}
                  </p>
                  <div className="mt-3">
                    <div className="flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-wide text-[#9898a0]">
                      <span>Progress</span>
                      <span className="tabular-nums text-[#a0a0a8]">
                        {prog.current} / {prog.target}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full rounded-full bg-[#1a1a1e] overflow-hidden border-[0.5px] border-white/[0.04]">
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{
                          width: `${prog.percent}%`,
                          backgroundColor: ok ? '#ffffff' : '#3f3f46',
                        }}
                      />
                    </div>
                    <p className={`mt-1.5 text-[11px] font-medium ${ok ? 'text-[#a0a0a8]' : 'text-[#909098]'}`}>
                      {prog.detail}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}
