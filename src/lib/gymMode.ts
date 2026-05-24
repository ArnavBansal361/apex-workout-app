import type { SetLog } from '../types'
import { dateKey } from './dates'

export const APEX_GYM_MODE_KEY = 'apex-gym-mode'

export function readGymModeEnabled(): boolean {
  try {
    return localStorage.getItem(APEX_GYM_MODE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeGymModeEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(APEX_GYM_MODE_KEY, '1')
    else localStorage.removeItem(APEX_GYM_MODE_KEY)
  } catch {
    /* ignore */
  }
}

function setsOnLog(l: SetLog): number {
  if (l.kind === 'weighted') return Math.max(1, Math.floor(l.sets))
  return 1
}

/** Total sets logged today for one exercise (weighted + timed entries). */
export function setsLoggedTodayForExercise(
  logs: SetLog[],
  exerciseId: string,
  todayKey: string,
): number {
  let n = 0
  for (const l of logs) {
    if (l.exerciseId !== exerciseId) continue
    if (dateKey(new Date(l.at)) !== todayKey) n += setsOnLog(l)
  }
  return n
}
