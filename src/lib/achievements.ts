import type { AppPersisted, SetLog } from '../types'
import { dateKey, parseDateKey, weekDatesFromStart, weekStartMonday } from './dates'
import { streakDaysWithShield } from './streakShield'

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

/** Distinct local calendar days with logged strength/timed work or cardio. */
export function workoutDaysFromActivity(state: AppPersisted): Set<string> {
  const d = workoutDaysFromLogs(state.setLogs)
  for (const c of state.cardioEntries) {
    d.add(dateKey(new Date(c.at)))
  }
  return d
}

function muscleGroupsOnDay(logs: SetLog[], dayKey: string): Set<string> {
  const g = new Set<string>()
  for (const l of logs) {
    if (dateKey(new Date(l.at)) === dayKey) g.add(l.muscleGroup)
  }
  return g
}

function setCountOnLog(l: SetLog): number {
  if (l.kind === 'weighted') return Math.max(1, Math.floor(l.sets))
  return 1
}

function setsOnDay(logs: SetLog[], dayKey: string): number {
  let n = 0
  for (const l of logs) {
    if (dateKey(new Date(l.at)) === dayKey) n += setCountOnLog(l)
  }
  return n
}

function weekVolumeLbs(state: AppPersisted, weekStart: Date): number {
  const ws = new Date(weekStart)
  const we = new Date(ws)
  we.setDate(ws.getDate() + 7)
  const factor = state.settings.unit === 'kg' ? 2.20462 : 1
  let vol = 0
  for (const l of state.setLogs) {
    if (l.kind !== 'weighted' || l.bodyweight) continue
    const t = new Date(l.at)
    if (t < ws || t >= we) continue
    vol += (l.weight ?? 0) * factor * l.reps * Math.max(1, l.sets)
  }
  return vol
}

function maxWeeklyVolumeLbs(state: AppPersisted): number {
  if (!state.setLogs.length) return 0
  let minT = Infinity
  let maxT = -Infinity
  for (const l of state.setLogs) {
    minT = Math.min(minT, l.at)
    maxT = Math.max(maxT, l.at)
  }
  const startMonday = weekStartMonday(new Date(minT))
  const endMonday = weekStartMonday(new Date(maxT))
  let max = 0
  for (let d = new Date(startMonday); d <= endMonday; d.setDate(d.getDate() + 7)) {
    max = Math.max(max, weekVolumeLbs(state, d))
  }
  return max
}

function consecutiveWeeksWithActivity(state: AppPersisted): number {
  let streak = 0
  const thisMon = weekStartMonday(new Date())
  for (let back = 0; back < 52; back++) {
    const ws = new Date(thisMon)
    ws.setDate(thisMon.getDate() - back * 7)
    const we = new Date(ws)
    we.setDate(ws.getDate() + 7)
    let active = false
    for (const l of state.setLogs) {
      const t = new Date(l.at)
      if (t >= ws && t < we) {
        active = true
        break
      }
    }
    if (!active) {
      for (const c of state.cardioEntries) {
        const t = new Date(c.at)
        if (t >= ws && t < we) {
          active = true
          break
        }
      }
    }
    if (active) streak++
    else break
  }
  return streak
}

function muscleGroupsInCurrentWeek(state: AppPersisted): number {
  const ws = weekStartMonday(new Date())
  const we = new Date(ws)
  we.setDate(ws.getDate() + 7)
  const g = new Set<string>()
  for (const l of state.setLogs) {
    const t = new Date(l.at)
    if (t >= ws && t < we) g.add(l.muscleGroup)
  }
  return g.size
}

function maxSetsSingleSession(logs: SetLog[]): number {
  const byDay = new Map<string, number>()
  for (const l of logs) {
    const k = dateKey(new Date(l.at))
    byDay.set(k, (byDay.get(k) ?? 0) + setCountOnLog(l))
  }
  return byDay.size ? Math.max(...byDay.values()) : 0
}

function hasMarathonSession(logs: SetLog[]): boolean {
  const byDay = new Map<string, number[]>()
  for (const l of logs) {
    const k = dateKey(new Date(l.at))
    const arr = byDay.get(k) ?? []
    arr.push(l.at)
    byDay.set(k, arr)
  }
  for (const times of byDay.values()) {
    if (times.length < 2) continue
    const spanH = (Math.max(...times) - Math.min(...times)) / 3_600_000
    if (spanH >= 2) return true
  }
  return false
}

function hasComebackKid(logs: SetLog[], workoutDays: Set<string>): boolean {
  const sorted = [...workoutDays].sort()
  if (sorted.length < 2) return false
  let maxGap = 0
  for (let i = 1; i < sorted.length; i++) {
    const a = parseDateKey(sorted[i - 1]!)
    const b = parseDateKey(sorted[i]!)
    const gap = Math.round((b.getTime() - a.getTime()) / 86_400_000)
    maxGap = Math.max(maxGap, gap)
  }
  if (maxGap < 7) return false
  const last = sorted[sorted.length - 1]!
  return setsOnDay(logs, last) >= 3
}

function hasPerfectWeek(state: AppPersisted): boolean {
  const ws = weekStartMonday(new Date())
  const keys = weekDatesFromStart(ws)
  const active = new Set<string>()
  for (const l of state.setLogs) active.add(dateKey(new Date(l.at)))
  for (const c of state.cardioEntries) active.add(dateKey(new Date(c.at)))
  return keys.every((k) => active.has(k))
}

export function evaluateAchievements(state: AppPersisted): string[] {
  const earned = new Set(state.achievements)
  const logs = state.setLogs
  const totalSets = logs.length
  const workoutDays = workoutDaysFromLogs(logs)
  const streak = streakCurrent(state)

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

  if (streak >= 7) earned.add('iron-will')
  if (maxWeeklyVolumeLbs(state) > 50_000) earned.add('volume-king')
  if (consecutiveWeeksWithActivity(state) >= 4) earned.add('consistency')
  if (logs.filter((l) => l.isPr).length >= 10) earned.add('pr-machine')
  if (muscleGroupsInCurrentWeek(state) >= 5) earned.add('variety-pack')
  if (hasMarathonSession(logs)) earned.add('marathon-session')
  if (workoutDays.size >= 100) earned.add('century-club')
  if (maxSetsSingleSession(logs) >= 20) earned.add('beast-mode')
  if (hasComebackKid(logs, workoutDays)) earned.add('comeback-kid')
  if (hasPerfectWeek(state)) earned.add('perfect-week')

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
  let total = 0
  for (const l of state.setLogs) {
    const t = new Date(l.at)
    if (t < ws || t >= we) continue
    if (l.kind === 'weighted') {
      const n = Math.floor(l.sets)
      total += n > 0 ? n : 1
    } else {
      total += 1
    }
  }
  return total
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

export function streakCurrent(state: AppPersisted, nowMs: number = Date.now()): number {
  return streakDaysWithShield(
    workoutDaysFromActivity(state),
    state.streakShieldUsedWeekStart ?? null,
    nowMs,
  )
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
    case 'iron-will': {
      const cur = Math.min(streak, 7)
      return {
        current: cur,
        target: 7,
        percent: pct(streak, 7),
        detail: `${streak} day streak`,
      }
    }
    case 'volume-king': {
      const vol = Math.round(maxWeeklyVolumeLbs(state))
      const cur = Math.min(vol, 50_000)
      return {
        current: cur,
        target: 50_000,
        percent: pct(vol, 50_000),
        detail: `Best week: ${vol.toLocaleString()} lbs`,
      }
    }
    case 'consistency': {
      const w = consecutiveWeeksWithActivity(state)
      const cur = Math.min(w, 4)
      return {
        current: cur,
        target: 4,
        percent: pct(w, 4),
        detail: `${w} consecutive weeks`,
      }
    }
    case 'pr-machine': {
      const prs = logs.filter((l) => l.isPr).length
      const cur = Math.min(prs, 10)
      return {
        current: cur,
        target: 10,
        percent: pct(prs, 10),
        detail: `${prs} PRs logged`,
      }
    }
    case 'variety-pack': {
      const g = muscleGroupsInCurrentWeek(state)
      const cur = Math.min(g, 5)
      return {
        current: cur,
        target: 5,
        percent: pct(g, 5),
        detail: `${g} groups this week`,
      }
    }
    case 'marathon-session': {
      const has = hasMarathonSession(logs)
      return {
        current: has ? 1 : 0,
        target: 1,
        percent: has ? 100 : 0,
        detail: has ? '2+ hour session logged' : 'Log a session over 2 hours',
      }
    }
    case 'century-club': {
      const n = workoutDays.size
      const cur = Math.min(n, 100)
      return {
        current: cur,
        target: 100,
        percent: pct(n, 100),
        detail: `${n} workout days`,
      }
    }
    case 'beast-mode': {
      const max = maxSetsSingleSession(logs)
      const cur = Math.min(max, 20)
      return {
        current: cur,
        target: 20,
        percent: pct(max, 20),
        detail: `Best day: ${max} sets`,
      }
    }
    case 'comeback-kid': {
      const has = hasComebackKid(logs, workoutDays)
      return {
        current: has ? 1 : 0,
        target: 1,
        percent: has ? 100 : 0,
        detail: has ? 'Comeback complete' : 'Return after 7+ days off',
      }
    }
    case 'perfect-week': {
      const keys = weekDatesFromStart(weekStartMonday(new Date()))
      const active = daysWithActivityThisWeek(state)
      const cur = active.size
      return {
        current: cur,
        target: 7,
        percent: pct(cur, 7),
        detail: `${cur} of ${keys.length} days this week`,
      }
    }
    default:
      return { current: 0, target: 1, percent: 0, detail: '' }
  }
}
