import type { AppPersisted } from '../types'
import { computeWeekSummary } from './weekSummary'

export type WeeklyInsight = {
  insight: string
  week_start: string
  stats: { sessions: number; sets: number; reps: number; prs: number } | null
}

function mondayOfWeek(d: Date): string {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  return monday.toISOString().split('T')[0]!
}

function weekBounds(nowMs: number): { start: Date; end: Date } {
  const start = new Date(nowMs)
  const day = start.getDay()
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day))
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 7)
  return { start, end }
}

function weekSessionCount(state: AppPersisted, nowMs: number): number {
  const { start, end } = weekBounds(nowMs)
  const days = new Set(
    state.setLogs
      .filter((l) => l.at >= start.getTime() && l.at < end.getTime())
      .map((l) => new Date(l.at).toDateString()),
  )
  return days.size
}

function weekReps(state: AppPersisted, nowMs: number): number {
  const { start, end } = weekBounds(nowMs)
  return state.setLogs
    .filter((l) => l.at >= start.getTime() && l.at < end.getTime())
    .reduce((acc, l) => acc + ('reps' in l ? (l.reps ?? 0) : 0), 0)
}

function generateInsight(state: AppPersisted, nowMs: number): string {
  const summary = computeWeekSummary(state, nowMs)
  const sessions = weekSessionCount(state, nowMs)
  const muscles = summary.muscleGroups

  if (sessions === 0) return ''

  // PR callout
  if (summary.prCount >= 3) return `${summary.prCount} PRs this week — strong performance across the board.`
  if (summary.prCount === 2) return `2 PRs hit this week. Keep the momentum going.`
  if (summary.prCount === 1) return `PR logged this week. One step closer to your ceiling.`

  // Volume milestone
  const vol = summary.totalVolumeLbs
  if (vol >= 100000) return `Over 100K lbs moved this week. Elite output.`
  if (vol >= 50000) return `50K+ lbs of volume this week — serious work.`

  // Muscle balance
  const hasLegs = muscles.some(m => m === 'Legs')
  const hasPush = muscles.some(m => m === 'Chest' || m === 'Shoulders')
  const hasPull = muscles.some(m => m === 'Back')
  if (sessions >= 4 && hasLegs && hasPush && hasPull) return `Full coverage this week — push, pull, and legs all hit.`
  if (sessions >= 3 && !hasLegs) return `${sessions} sessions in, but legs haven't been hit yet this week.`
  if (sessions >= 3 && !hasPull) return `Good pushing work this week — don't forget to balance with pulls.`

  // Session count
  if (sessions === 1) return `1 session logged. Every week starts with one.`
  if (sessions === 2) return `2 sessions down this week. Halfway to a solid week.`
  if (sessions >= 5) return `${sessions} sessions this week — high frequency, make sure recovery matches.`

  // Sets
  if (summary.totalSets >= 60) return `${summary.totalSets} sets this week. High volume — watch for fatigue.`
  if (summary.totalSets >= 30) return `${summary.totalSets} sets across ${sessions} sessions. Solid week.`

  return `${sessions} session${sessions > 1 ? 's' : ''}, ${summary.totalSets} sets. Keep building.`
}

export async function fetchWeeklyInsight(state?: AppPersisted): Promise<WeeklyInsight | null> {
  if (!state) return null
  const nowMs = Date.now()
  const summary = computeWeekSummary(state, nowMs)
  if (summary.totalSets === 0) return null

  const insight = generateInsight(state, nowMs)
  if (!insight) return null

  const sessions = weekSessionCount(state, nowMs)
  const stats = {
    sessions,
    sets: summary.totalSets,
    reps: weekReps(state, nowMs),
    prs: summary.prCount,
  }

  return {
    insight,
    week_start: mondayOfWeek(new Date(nowMs)),
    stats,
  }
}
