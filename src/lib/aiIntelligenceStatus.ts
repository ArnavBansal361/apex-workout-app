import type { AppPersisted } from '../types'
import { workoutDaysFromActivity } from './achievements'

const UPDATED_KEY = 'apex-ai-intelligence-updated-at'

/** Call when any Apex AI feature returns fresh model output. */
export function touchAiIntelligenceUpdated(nowMs = Date.now()): void {
  try {
    localStorage.setItem(UPDATED_KEY, String(nowMs))
  } catch {
    /* ignore */
  }
}

export function readAiIntelligenceUpdatedAt(): number | null {
  try {
    const raw = localStorage.getItem(UPDATED_KEY)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export function workoutSessionCount(state: AppPersisted): number {
  return workoutDaysFromActivity(state).size
}

export function lastAiIntelligenceUpdatedMs(state: AppPersisted): number {
  let max = readAiIntelligenceUpdatedAt() ?? 0
  for (const m of state.chatMessages) {
    if (m.role === 'model' && m.at > max) max = m.at
  }
  return max
}

export function formatAiUpdatedAgo(updatedMs: number, nowMs = Date.now()): string {
  const hours = Math.floor((nowMs - updatedMs) / (60 * 60 * 1000))
  if (hours < 1) return '<1h ago'
  return `${hours}h ago`
}
