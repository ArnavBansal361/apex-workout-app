import type { FC } from 'react'
import type { TabId } from '../types'

type Props = {
  tab: TabId
  onChange: (t: TabId) => void
}

const navStroke = (active: boolean) => (active ? '#ffffff' : '#7d7d88')

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
        <circle cx="12" cy="12" r="9" stroke={navStroke(active)} strokeWidth="1.75" />
        <path
          d="M12 7v5l3 2"
          stroke={navStroke(active)}
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'library',
    label: 'Library',
    Icon: ({ active }) => (
      <svg className="apex-bottom-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M7 6h4v12H7zM13 6h4v12h-4zM11 6h2v12h-2z"
          stroke={navStroke(active)}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: 'plan',
    label: 'Plan',
    Icon: ({ active }) => (
      <svg className="apex-bottom-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="4" y="5" width="16" height="15" rx="2" stroke={navStroke(active)} strokeWidth="1.75" />
        <path d="M8 3v4M16 3v4M4 11h16" stroke={navStroke(active)} strokeWidth="1.75" />
      </svg>
    ),
  },
  {
    id: 'ai',
    label: 'AI',
    Icon: ({ active }) => (
      <svg className="apex-bottom-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3l1.2 3.6h3.8l-3.1 2.2 1.2 3.6L12 9.2 8.9 12.4l1.2-3.6-3.1-2.2h3.8L12 3z"
          stroke={navStroke(active)}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="17" r="2.5" stroke={navStroke(active)} strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: 'me',
    label: 'Me',
    Icon: ({ active }) => (
      <svg className="apex-bottom-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="9" r="3.5" stroke={navStroke(active)} strokeWidth="1.75" />
        <path
          d="M6 19c1.2-2.5 3.5-4 6-4s4.8 1.5 6 4"
          stroke={navStroke(active)}
          strokeWidth="1.75"
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
