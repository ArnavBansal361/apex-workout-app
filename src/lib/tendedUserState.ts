import type { AppPersisted } from '../types'
import { workoutDaysFromActivity } from './achievements'
import { addDaysToDateKey, dateKey } from './dates'
import {
  sleepLogForDateKey,
  waterOzForDateKey,
} from './stats'
import {
  upsertTendedUserState,
  type TendedUserStateSnapshot,
} from './supabase'
import { weightToLbs } from './volumeStats'

export type { TendedUserStateSnapshot } from './supabase'

const CURSOR_KEY = 'apex-tended-user-state-cursor'
const MAX_BACKFILL_DAYS = 14
const SOURCE_APP = 'apex'

function readSnapshotCursor(): string | null {
  try {
    const v = localStorage.getItem(CURSOR_KEY)?.trim()
    return v || null
  } catch {
    return null
  }
}

function writeSnapshotCursor(dateKey: string): void {
  try {
    localStorage.setItem(CURSOR_KEY, dateKey)
  } catch {
    /* ignore */
  }
}

function dailyVolumeLbs(state: AppPersisted, dayKey: string): number {
  let vol = 0
  for (const l of state.setLogs) {
    if (l.kind !== 'weighted' || l.bodyweight) continue
    if (dateKey(new Date(l.at)) !== dayKey) continue
    if (l.weight == null || !Number.isFinite(l.weight)) continue
    const lbs = weightToLbs(l.weight, state.settings.unit)
    vol += lbs * l.reps * Math.max(1, l.sets)
  }
  return Math.round(vol * 10) / 10
}

function muscleGroupsTrainedOnDay(state: AppPersisted, dayKey: string): string[] {
  const groups = new Set<string>()
  for (const l of state.setLogs) {
    if (dateKey(new Date(l.at)) !== dayKey) continue
    groups.add(l.muscleGroup)
  }
  for (const c of state.cardioEntries) {
    if (dateKey(new Date(c.at)) === dayKey) groups.add('Cardio')
  }
  return [...groups].sort()
}

function moodSignalsForDay(
  state: AppPersisted,
  dayKey: string,
): Pick<TendedUserStateSnapshot, 'readinessScore' | 'energyLevel' | 'stressLevel'> {
  const post = (state.postWorkoutCheckins ?? []).filter((c) => c.dateKey === dayKey)
  if (post.length) {
    const latest = [...post].sort((a, b) => b.at - a.at)[0]!
    return {
      readinessScore: latest.feelRating,
      energyLevel: latest.energyRating,
      stressLevel: null,
    }
  }
  const logs = (state.workoutMoodLogs ?? []).filter((m) => m.dateKey === dayKey)
  if (!logs.length) {
    return { readinessScore: null, energyLevel: null, stressLevel: null }
  }
  const latest = [...logs].sort((a, b) => b.at - a.at)[0]!
  return {
    readinessScore: latest.moodLift,
    energyLevel: latest.moodBefore,
    stressLevel: 6 - latest.moodAfter,
  }
}

function moodScoreForDay(state: AppPersisted, dayKey: string): number | null {
  const post = (state.postWorkoutCheckins ?? []).filter((c) => c.dateKey === dayKey)
  if (post.length) {
    const latest = [...post].sort((a, b) => b.at - a.at)[0]!
    return latest.feelRating
  }
  const logs = (state.workoutMoodLogs ?? []).filter((m) => m.dateKey === dayKey)
  if (!logs.length) return null
  const latest = [...logs].sort((a, b) => b.at - a.at)[0]!
  return latest.moodAfter
}

/** Build one calendar day's physical-state snapshot from local Apex data. */
export function buildTendedUserStateDaySnapshot(
  state: AppPersisted,
  dayKey: string,
): TendedUserStateSnapshot {
  const activityDays = workoutDaysFromActivity(state)
  const moodSignals = moodSignalsForDay(state, dayKey)
  const sleep = sleepLogForDateKey(state, dayKey)

  return {
    dateKey: dayKey,
    workoutDone: activityDays.has(dayKey),
    volumeLbs: dailyVolumeLbs(state, dayKey),
    muscleGroupsTrained: muscleGroupsTrainedOnDay(state, dayKey),
    moodScore: moodScoreForDay(state, dayKey),
    sleepHours: sleep ? Math.round((sleep.durationMinutes / 60) * 100) / 100 : null,
    waterOz: waterOzForDateKey(state, dayKey),
    readinessScore: moodSignals.readinessScore,
    energyLevel: moodSignals.energyLevel,
    stressLevel: moodSignals.stressLevel,
  }
}

function enumerateDaysToSync(cursor: string | null, todayKey: string): string[] {
  const yesterdayKey = addDaysToDateKey(todayKey, -1)
  const earliest = addDaysToDateKey(todayKey, -MAX_BACKFILL_DAYS)
  let start = cursor ? addDaysToDateKey(cursor, 1) : earliest
  if (start < earliest) start = earliest

  const days: string[] = []
  let d = start
  while (d <= yesterdayKey) {
    days.push(d)
    d = addDaysToDateKey(d, 1)
  }

  if (!days.includes(yesterdayKey)) days.push(yesterdayKey)
  return [...new Set(days)].sort()
}

/**
 * Upserts completed-day snapshots to tended_user_state (through yesterday).
 * Re-writes yesterday on each call so late sleep/mood logs still land.
 */
export async function syncTendedUserStateSnapshots(
  userId: string,
  state: AppPersisted,
  nowMs: number = Date.now(),
): Promise<void> {
  const todayKey = dateKey(new Date(nowMs))
  const days = enumerateDaysToSync(readSnapshotCursor(), todayKey)
  if (!days.length) return

  let lastOk: string | null = readSnapshotCursor()
  for (const dayKey of days) {
    const snapshot = buildTendedUserStateDaySnapshot(state, dayKey)
    await upsertTendedUserState(userId, snapshot, SOURCE_APP)
    lastOk = dayKey
  }

  if (lastOk) writeSnapshotCursor(lastOk)
}
