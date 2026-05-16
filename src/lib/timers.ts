import type { CardioTimerPersist, GymSessionPersist } from '../types'

export function cardioElapsedMs(c: CardioTimerPersist, now: number): number {
  if (!c.running || c.segmentStartAt == null) return c.baseMs
  return c.baseMs + (now - c.segmentStartAt)
}

export function gymElapsedMs(g: GymSessionPersist, now: number): number {
  const start = g.mode === 'manual' ? g.manualStartedAt : g.startedAt
  if (!start) return 0
  let paused = g.accumulatedPauseMs
  if (g.pauseStartedAt) paused += now - g.pauseStartedAt
  return Math.max(0, now - start - paused)
}

export function formatDuration(totalSec: number): string {
  const s = Math.floor(totalSec % 60)
  const m = Math.floor((totalSec / 60) % 60)
  const h = Math.floor(totalSec / 3600)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
