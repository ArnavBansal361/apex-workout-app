import type { AppPersisted } from '../types'

export const APEX_TRAINER_MODE_KEY = 'apex-trainer-mode'
export const APEX_TRAINER_CODE_KEY = 'apex-trainer-code'

export type TrainerShareType = 'workout_logs' | 'bodyweight' | 'personal_records'

export type TrainerSharePrefs = {
  workoutLogs: boolean
  bodyweight: boolean
  personalRecords: boolean
}

const SHARE_KEYS: Record<TrainerShareType, string> = {
  workout_logs: 'apex-trainer-share-workout_logs',
  bodyweight: 'apex-trainer-share-bodyweight',
  personal_records: 'apex-trainer-share-personal_records',
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateTrainerCode(): string {
  const out: string[] = []
  const buf = new Uint8Array(6)
  crypto.getRandomValues(buf)
  for (let i = 0; i < 6; i++) {
    out.push(CODE_CHARS[buf[i]! % CODE_CHARS.length]!)
  }
  return out.join('')
}

export function readTrainerModeEnabled(): boolean {
  try {
    if (localStorage.getItem(APEX_TRAINER_MODE_KEY) === '1') return true
  } catch {
    /* ignore */
  }
  return false
}

export function writeTrainerModeEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(APEX_TRAINER_MODE_KEY, '1')
    else localStorage.removeItem(APEX_TRAINER_MODE_KEY)
  } catch {
    /* ignore */
  }
}

export function readTrainerCode(): string {
  try {
    return localStorage.getItem(APEX_TRAINER_CODE_KEY)?.trim().toUpperCase() ?? ''
  } catch {
    return ''
  }
}

export function writeTrainerCode(code: string): void {
  try {
    const c = code.trim().toUpperCase()
    if (c) localStorage.setItem(APEX_TRAINER_CODE_KEY, c)
    else localStorage.removeItem(APEX_TRAINER_CODE_KEY)
  } catch {
    /* ignore */
  }
}

export function ensureTrainerCode(): string {
  let code = readTrainerCode()
  if (!code || code.length !== 6) {
    code = generateTrainerCode()
    writeTrainerCode(code)
  }
  return code
}

export function readTrainerSharePrefs(): TrainerSharePrefs {
  const read = (type: TrainerShareType, defaultOn: boolean): boolean => {
    try {
      const v = localStorage.getItem(SHARE_KEYS[type])
      if (v === '0') return false
      if (v === '1') return true
    } catch {
      /* ignore */
    }
    return defaultOn
  }
  return {
    workoutLogs: read('workout_logs', true),
    bodyweight: read('bodyweight', true),
    personalRecords: read('personal_records', true),
  }
}

export function writeTrainerSharePref(type: TrainerShareType, enabled: boolean): void {
  try {
    localStorage.setItem(SHARE_KEYS[type], enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function trainerShareForCloud(): TrainerSharePrefs {
  return readTrainerSharePrefs()
}

export function applyTrainerShareToState(state: AppPersisted): AppPersisted {
  return { ...state, trainerShare: trainerShareForCloud() }
}

/** After cloud hydrate, align localStorage share toggles with persisted state. */
export function syncTrainerShareFromState(state: AppPersisted): void {
  const share = state.trainerShare
  if (!share) return
  writeTrainerSharePref('workout_logs', share.workoutLogs)
  writeTrainerSharePref('bodyweight', share.bodyweight)
  writeTrainerSharePref('personal_records', share.personalRecords)
}

export function trainerConnectErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message
    if (msg === 'ALREADY_CONNECTED') {
      return 'You are already connected to a trainer. Disconnect in Settings before using a new code.'
    }
    if (msg === 'ALREADY_CONNECTED_SAME') {
      return 'You are already connected with this trainer code.'
    }
    if (msg === 'INVALID_TRAINER_CODE') {
      return 'That code is not valid. Check the 6 characters and try again.'
    }
    if (msg.includes('cannot connect to yourself') || msg.includes('You cannot connect to yourself')) {
      return 'You cannot connect to your own trainer code.'
    }
    if (msg.includes('Invalid trainer code')) {
      return 'That code is not valid. Check the 6 characters and try again.'
    }
    if (/duplicate|unique|23505/i.test(msg)) {
      return 'You are already connected to a trainer.'
    }
    return msg
  }
  return 'Could not connect. Try again.'
}

export function lastActiveFromState(state: AppPersisted): number | null {
  let max = 0
  for (const l of state.setLogs) {
    if (l.at > max) max = l.at
  }
  for (const c of state.cardioEntries) {
    if (c.at > max) max = c.at
  }
  for (const b of state.bodyweightLogs) {
    if (b.at > max) max = b.at
  }
  return max > 0 ? max : null
}

/** Strip data the client has not shared with their trainer. */
export function filterClientStateForTrainer(
  state: AppPersisted,
): AppPersisted & { trainerShare: TrainerSharePrefs } {
  const share = state.trainerShare ?? {
    workoutLogs: true,
    bodyweight: true,
    personalRecords: true,
  }
  return {
    ...state,
    trainerShare: share,
    setLogs: share.workoutLogs ? state.setLogs : [],
    cardioEntries: share.workoutLogs ? state.cardioEntries : [],
    bodyweightLogs: share.bodyweight ? state.bodyweightLogs : [],
  }
}

export function formatLastActive(ms: number | null): string {
  if (ms == null) return 'No activity yet'
  const d = new Date(ms)
  const now = Date.now()
  const days = Math.floor((now - ms) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
