import type { FC } from 'react'
import type { TabId } from '../types'

type Props = {
  tab: TabId
  onChange: (t: TabId) => void
}

const ink = (active: boolean) => (active ? '#ffffff' : '#7d7d88')

const ITEMS: {
  id: TabId
  label: string
  Icon: FC<{ active: boolean }>
}[] = [
  {
    id: 'today',
    label: 'Today',
    Icon: ({ active }) => (
      <svg className="apex-bottom-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke={ink(active)} strokeWidth="1.6" />
        <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" stroke={ink(active)} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'library',
    label: 'Library',
    Icon: ({ active }) => (
      <svg className="apex-bottom-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" stroke={ink(active)} strokeWidth="1.6" />
        <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" stroke={ink(active)} strokeWidth="1.6" />
        <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" stroke={ink(active)} strokeWidth="1.6" />
        <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" stroke={ink(active)} strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    id: 'plan',
    label: 'Plan',
    Icon: ({ active }) => (
      <svg className="apex-bottom-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M9 6h11M9 12h11M9 18h11" stroke={ink(active)} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M3.6 6l1 1 2-2.2M3.6 12l1 1 2-2.2M3.6 18l1 1 2-2.2" stroke={ink(active)} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'ai',
    label: 'AI',
    Icon: ({ active }) => (
      <svg className="apex-bottom-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3c.45 4 1.55 5.1 5.5 5.5-3.95.4-5.05 1.5-5.5 5.5-.45-4-1.55-5.1-5.5-5.5 3.95-.4 5.05-1.5 5.5-5.5z"
          fill={ink(active)}
        />
        <circle cx="18.5" cy="17" r="2" fill={ink(active)} />
      </svg>
    ),
  },
  {
    id: 'me',
    label: 'Me',
    Icon: ({ active }) => (
      <svg className="apex-bottom-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="9" r="3.5" stroke={ink(active)} strokeWidth="1.6" />
        <path
          d="M6 19c1.2-2.5 3.5-4 6-4s4.8 1.5 6 4"
          stroke={ink(active)}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
]

export function BottomNav({ tab, onChange }: Props) {
  return (
    <nav className="apex-bottom-nav-shell fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-[480px] px-2 pb-3 pt-2">
        <div className="apex-bottom-nav grid grid-cols-5 touch-manipulation">
          {ITEMS.map((it) => {
            const on = tab === it.id
            const Icon = it.Icon
            return (
              <button
                key={it.id}
                type="button"
                className={`apex-bottom-nav-btn transition-opacity duration-200 ease-out active:opacity-90 ${
                  on ? 'apex-bottom-nav-btn--active' : ''
                }`}
                onClick={() => onChange(it.id)}
              >
                <span
                  className="block mx-auto mb-1.5"
                  style={{
                    width: 18,
                    height: 2,
                    borderRadius: 2,
                    background: on ? 'var(--apex-accent)' : 'transparent',
                  }}
                />
                <span className="flex items-center justify-center">
                  <Icon active={on} />
                </span>
                <span className="apex-bottom-nav-label font-medium tracking-tight leading-none">
                  {it.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
