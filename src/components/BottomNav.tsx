import type { FC } from 'react'
import type { TabId } from '../types'

type Props = {
  tab: TabId
  onChange: (t: TabId) => void
  accent: string
}

const ITEMS: {
  id: TabId
  label: string
  Icon: FC<{ active: boolean; accent: string }>
}[] = [
  {
    id: 'today',
    label: 'Today',
    Icon: ({ active, accent }) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke={active ? accent : '#4b4b52'} strokeWidth="2" />
        <path
          d="M12 7v5l3 2"
          stroke={active ? accent : '#4b4b52'}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'exercises',
    label: 'Exercises',
    Icon: ({ active, accent }) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M8 10h8M8 14h5"
          stroke={active ? accent : '#4b4b52'}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <rect x="5" y="6" width="14" height="12" rx="2" stroke={active ? accent : '#4b4b52'} strokeWidth="2" />
      </svg>
    ),
  },
  {
    id: 'schedule',
    label: 'Schedule',
    Icon: ({ active, accent }) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="4" y="5" width="16" height="15" rx="2" stroke={active ? accent : '#4b4b52'} strokeWidth="2" />
        <path d="M8 3v4M16 3v4M4 11h16" stroke={active ? accent : '#4b4b52'} strokeWidth="2" />
      </svg>
    ),
  },
  {
    id: 'profile',
    label: 'Profile',
    Icon: ({ active, accent }) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="9" r="3.5" stroke={active ? accent : '#4b4b52'} strokeWidth="2" />
        <path
          d="M6 19c1.2-2.5 3.5-4 6-4s4.8 1.5 6 4"
          stroke={active ? accent : '#4b4b52'}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
]

export function BottomNav({ tab, onChange, accent }: Props) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 pb-[env(safe-area-inset-bottom)] pointer-events-none">
      <div className="pointer-events-auto max-w-lg mx-auto px-4 pb-4">
        <div
          className="grid grid-cols-4 gap-1 rounded-[18px] p-1.5 border border-white/[0.08] touch-manipulation"
          style={{
            background:
              'linear-gradient(180deg, rgba(32,32,38,0.92) 0%, rgba(16,16,20,0.96) 100%)',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          {ITEMS.map((it) => {
            const on = tab === it.id
            const Icon = it.Icon
            return (
              <button
                key={it.id}
                type="button"
                className={`relative flex flex-col items-center justify-center gap-1 min-h-[3.5rem] rounded-[14px] transition-all duration-200 ease-out active:scale-[0.96] ${
                  on ? 'shadow-inner' : 'hover:bg-white/[0.04]'
                }`}
                style={{
                  color: on ? accent : '#73737a',
                  background: on
                    ? `linear-gradient(180deg, color-mix(in srgb, ${accent} 18%, transparent) 0%, rgba(20,20,24,0.6) 100%)`
                    : undefined,
                  boxShadow: on
                    ? `inset 0 0 0 1px color-mix(in srgb, ${accent} 35%, transparent)`
                    : undefined,
                }}
                onClick={() => onChange(it.id)}
              >
                <span className="flex items-center justify-center h-[22px]">
                  <Icon active={on} accent={accent} />
                </span>
                <span className="text-[10px] font-semibold tracking-wide leading-none">{it.label}</span>
                {on ? (
                  <span
                    className="absolute bottom-1 left-1/2 h-1 w-6 -translate-x-1/2 rounded-full opacity-90"
                    style={{ backgroundColor: accent }}
                  />
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
