import type { AppPersisted, SetLog } from '../types'
import { dateKey, startOfDay, weekStartMonday } from './dates'

function hasLogAtHour(logs: SetLog[], hourAfter: number, hourBefore: number): boolean {
  for (const l of logs) {
    const d = new Date(l.at)
    const h = d.getHours() + d.getMinutes() / 60
    if (h >= hourAfter && h < hourBefore) return true
  }
  return false
}

export function workoutDaysFromLogs(logs: SetLog[]): Set<string> {
  const d = new Set<string>()
  for (const l of logs) d.add(dateKey(new Date(l.at)))
  return d
}

function streakDays(workoutDays: Set<string>): number {
  let count = 0
  const cur = startOfDay(new Date())
  if (!workoutDays.has(dateKey(cur))) {
    cur.setDate(cur.getDate() - 1)
    if (!workoutDays.has(dateKey(cur))) return 0
  }
  while (workoutDays.has(dateKey(cur))) {
    count++
    cur.setDate(cur.getDate() - 1)
  }
  return count
}

function muscleGroupsOnDay(logs: SetLog[], dayKey: string): Set<string> {
  const g = new Set<string>()
  for (const l of logs) {
    if (dateKey(new Date(l.at)) === dayKey) g.add(l.muscleGroup)
  }
  return g
}

export function evaluateAchievements(state: AppPersisted): string[] {
  const earned = new Set(state.achievements)
  const logs = state.setLogs
  const totalSets = logs.length
  const workoutDays = workoutDaysFromLogs(logs)
  const streak = streakDays(workoutDays)

  if (logs.some((l) => l.isPr)) earned.add('first-pr')
  if (streak >= 7) earned.add('streak-7')
  if (totalSets >= 100) earned.add('sets-100')
  if (workoutDays.size >= 30) earned.add('workouts-30')

  for (const day of workoutDays) {
    if (muscleGroupsOnDay(logs, day).size >= 6) {
      earned.add('six-groups')
      break
    }
  }

  if (state.bodyweightLogs.length >= 7) earned.add('bw-7')
  if (logs.length >= 1) earned.add('first-workout')
  if (hasLogAtHour(logs, 21, 24)) earned.add('night-owl')
  if (hasLogAtHour(logs, 0, 7)) earned.add('early-bird')

  return [...earned]
}

function daysWithActivityThisWeek(state: AppPersisted): Set<string> {
  const ws = weekStartMonday(new Date())
  const we = new Date(ws)
  we.setDate(ws.getDate() + 7)
  const days = new Set<string>()
  for (const l of state.setLogs) {
    const t = new Date(l.at)
    if (t >= ws && t < we) days.add(dateKey(t))
  }
  for (const c of state.cardioEntries) {
    const t = new Date(c.at)
    if (t >= ws && t < we) days.add(dateKey(t))
  }
  return days
}

export function sessionsThisWeek(state: AppPersisted): number {
  return daysWithActivityThisWeek(state).size
}

export function setsThisWeek(state: AppPersisted): number {
  const ws = weekStartMonday(new Date())
  const we = new Date(ws)
  we.setDate(ws.getDate() + 7)
  return state.setLogs.filter((l) => {
    const t = new Date(l.at)
    return t >= ws && t < we
  }).length
}

export function minutesThisWeek(state: AppPersisted): number {
  const ws = weekStartMonday(new Date())
  const we = new Date(ws)
  we.setDate(ws.getDate() + 7)
  let sec = 0
  for (const l of state.setLogs) {
    const t = new Date(l.at)
    if (t >= ws && t < we && l.kind === 'timed') sec += l.durationSec
  }
  for (const c of state.cardioEntries) {
    const t = new Date(c.at)
    if (t >= ws && t < we && c.durationMinutes != null) sec += c.durationMinutes * 60
  }
  return Math.round(sec / 60)
}

export function muscleGroupsThisWeek(state: AppPersisted): string[] {
  const ws = weekStartMonday(new Date())
  const we = new Date(ws)
  we.setDate(ws.getDate() + 7)
  const g = new Set<string>()
  for (const l of state.setLogs) {
    const t = new Date(l.at)
    if (t >= ws && t < we) g.add(l.muscleGroup)
  }
  return [...g].sort()
}

export function streakCurrent(state: AppPersisted): number {
  return streakDays(workoutDaysFromLogs(state.setLogs))
}

function maxMuscleGroupsSingleDay(logs: SetLog[]): number {
  const byDay = new Map<string, Set<string>>()
  for (const l of logs) {
    const k = dateKey(new Date(l.at))
    if (!byDay.has(k)) byDay.set(k, new Set())
    byDay.get(k)!.add(l.muscleGroup)
  }
  let max = 0
  for (const s of byDay.values()) max = Math.max(max, s.size)
  return max
}

export type AchievementProgressInfo = {
  current: number
  target: number
  /** 0–100 */
  percent: number
  detail: string
}

export function getAchievementProgress(state: AppPersisted, achievementId: string): AchievementProgressInfo {
  const logs = state.setLogs
  const totalSets = logs.length
  const workoutDays = workoutDaysFromLogs(logs)
  const streak = streakCurrent(state)
  const bw = state.bodyweightLogs.length
  const maxGroupsDay = maxMuscleGroupsSingleDay(logs)

  const pct = (cur: number, tgt: number) =>
    tgt <= 0 ? 0 : Math.min(100, Math.round((Math.min(cur, tgt) / tgt) * 100))

  switch (achievementId) {
    case 'first-pr': {
      const has = logs.some((l) => l.isPr)
      return {
        current: has ? 1 : 0,
        target: 1,
        percent: has ? 100 : 0,
        detail: has ? 'PR logged' : 'Log a personal record',
      }
    }
    case 'streak-7': {
      const cur = Math.min(streak, 7)
      return {
        current: cur,
        target: 7,
        percent: pct(streak, 7),
        detail: `${streak} day streak`,
      }
    }
    case 'sets-100': {
      const cur = Math.min(totalSets, 100)
      return {
        current: cur,
        target: 100,
        percent: pct(totalSets, 100),
        detail: `${totalSets} sets logged`,
      }
    }
    case 'workouts-30': {
      const n = workoutDays.size
      const cur = Math.min(n, 30)
      return {
        current: cur,
        target: 30,
        percent: pct(n, 30),
        detail: `${n} workout days`,
      }
    }
    case 'six-groups': {
      const cur = Math.min(maxGroupsDay, 6)
      return {
        current: cur,
        target: 6,
        percent: pct(maxGroupsDay, 6),
        detail: `Most groups in one day: ${maxGroupsDay}`,
      }
    }
    case 'bw-7': {
      const cur = Math.min(bw, 7)
      return {
        current: cur,
        target: 7,
        percent: pct(bw, 7),
        detail: `${bw} bodyweight entries`,
      }
    }
    case 'first-workout': {
      const has = totalSets >= 1
      return {
        current: has ? 1 : 0,
        target: 1,
        percent: has ? 100 : 0,
        detail: has ? 'First set logged' : 'Log your first set',
      }
    }
    case 'night-owl': {
      const has = hasLogAtHour(logs, 21, 24)
      return {
        current: has ? 1 : 0,
        target: 1,
        percent: has ? 100 : 0,
        detail: has ? 'Late session logged' : 'Train between 9pm and midnight',
      }
    }
    case 'early-bird': {
      const has = hasLogAtHour(logs, 0, 7)
      return {
        current: has ? 1 : 0,
        target: 1,
        percent: has ? 100 : 0,
        detail: has ? 'Early session logged' : 'Train before 7am',
      }
    }
    default:
      return { current: 0, target: 1, percent: 0, detail: '' }
  }
}
