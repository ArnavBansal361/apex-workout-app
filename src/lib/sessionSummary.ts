import {
  comebackMessageForGap,
  daysSinceLastWorkout,
  sessionBadgesFor,
  type SessionBadge,
} from './streakShield'
import type { AppPersisted } from '../types'

export type SessionSummaryExtras = {
  badges: SessionBadge[]
  comebackMessage: string | null
  headline: string
}

export function buildSessionSummaryExtras(
  state: AppPersisted,
  todayKey: string,
  exerciseCount: number,
  durationSec: number,
): SessionSummaryExtras {
  const gapDays = daysSinceLastWorkout(state, todayKey)
  const comebackMessage = comebackMessageForGap(gapDays)
  const badges = sessionBadgesFor({ exerciseCount, durationSec })

  let headline = 'Session complete'
  if (comebackMessage) {
    headline = 'Welcome back'
  } else if (badges.some((b) => b.id === 'efficient-session')) {
    headline = '20 minutes counts'
  } else if (badges.some((b) => b.id === 'short-session')) {
    headline = 'Session logged'
  }

  return { badges, comebackMessage, headline }
}
