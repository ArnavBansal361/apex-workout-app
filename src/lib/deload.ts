import type { SetLog } from '../types'
import { dateKey, weekStartMonday } from './dates'
import { workoutDaysFromLogs } from './achievements'

/** Monday dates (YYYY-MM-DD) for last `count` weeks including current */
function recentWeekStarts(count: number): string[] {
  const mon = weekStartMonday(new Date())
  const keys: string[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(mon)
    d.setDate(mon.getDate() - i * 7)
    keys.push(dateKey(d))
  }
  return keys
}

function weekHasWorkout(workoutDays: Set<string>, weekMondayKey: string): boolean {
  const start = new Date(weekMondayKey + 'T12:00:00')
  for (let i = 0; i < 7; i++) {
    const x = new Date(start)
    x.setDate(start.getDate() + i)
    if (workoutDays.has(dateKey(x))) return true
  }
  return false
}

/** True if user logged at least one workout in each of the last 4 calendar weeks */
export function shouldSuggestDeload(logs: SetLog[]): boolean {
  const workoutDays = workoutDaysFromLogs(logs)
  const weeks = recentWeekStarts(4)
  return weeks.every((wk) => weekHasWorkout(workoutDays, wk))
}
