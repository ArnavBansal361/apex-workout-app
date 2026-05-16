import type { ProfileAvatarId } from '../types'

/* eslint-disable react-refresh/only-export-components -- co-export PROFILE_AVATAR_IDS with glyph component */
const cls = 'h-7 w-7 text-[#0a0a0c]'

export const PROFILE_AVATAR_IDS: ProfileAvatarId[] = [
  'dumbbell',
  'flame',
  'lightning',
  'mountain',
  'trophy',
  'star',
  'shield',
  'crown',
]

export function ProfileAvatarGlyph({ id, className }: { id: ProfileAvatarId; className?: string }) {
  const c = className ?? cls
  switch (id) {
    case 'dumbbell':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 10h2v4H6V10zm10 0h2v4h-2V10zM8 11h8v2H8v-1z"
            fill="currentColor"
          />
          <path d="M4 12h2M18 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'flame':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3c2 4 1 6-1 8 2-1 3 1 2 4 3-3 1-7-1-12z"
            fill="currentColor"
            opacity="0.9"
          />
          <path d="M12 9c-1 2-2 5 0 8-2-2-2-5 0-8z" fill="currentColor" opacity="0.55" />
        </svg>
      )
    case 'lightning':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M13 2L4 14h7l-1 8 10-12h-6l1-8z" fill="currentColor" />
        </svg>
      )
    case 'mountain':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M3 18l6-8 4 5 3-4 5 7H3z" fill="currentColor" />
        </svg>
      )
    case 'trophy':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M8 4h8v3a4 4 0 01-8 0V4zM6 7H4v2a3 3 0 003 3h1M18 7h2v2a3 3 0 01-3 3h-1M12 12v3M9 20h6l-1-3h-4l-1 3z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'star':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 2l2.2 6.8h7l-5.7 4.1 2.2 6.8-5.7-4.1-5.7 4.1 2.2-6.8L4.8 8.8h7L12 2z"
            fill="currentColor"
          />
        </svg>
      )
    case 'shield':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="currentColor"
            fillOpacity="0.25"
          />
        </svg>
      )
    case 'crown':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 10l3-5 3 4 2-6 2 6 3-4 3 5v2H4v-2zM5 18h14v2H5v-2z"
            fill="currentColor"
          />
        </svg>
      )
    default:
      return null
  }
}
