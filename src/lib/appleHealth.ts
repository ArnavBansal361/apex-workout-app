import { Capacitor } from '@capacitor/core'
import { Health } from '@capgo/capacitor-health'
import type { HealthDataType, HealthSample, SleepState } from '@capgo/capacitor-health'
import { dateKey } from './dates'
import type { AppleHealthTodayMetrics } from '../types'

export type { AppleHealthTodayMetrics }

const READ_TYPES: HealthDataType[] = [
  'steps',
  'calories',
  'heartRate',
  'sleep',
  'restingHeartRate',
  'heartRateVariability',
]

const WRITE_TYPES: HealthDataType[] = ['calories', 'exerciseTime']

const ASLEEP_STATES = new Set<SleepState>(['asleep', 'rem', 'deep', 'light'])

export function isAppleHealthPlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

export async function isAppleHealthAvailable(): Promise<boolean> {
  if (!isAppleHealthPlatform()) return false
  try {
    const { available } = await Health.isAvailable()
    return available
  } catch {
    return false
  }
}

export async function requestAppleHealthAuthorization(): Promise<boolean> {
  if (!(await isAppleHealthAvailable())) return false
  try {
    const status = await Health.requestAuthorization({
      read: READ_TYPES,
      write: WRITE_TYPES,
    })
    const granted =
      status.readAuthorized.length > 0 || status.writeAuthorized.length > 0
    return granted
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[Apple Health] authorization failed', e)
    return false
  }
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function sleepWindowStart(now: Date): Date {
  const x = new Date(now)
  x.setDate(x.getDate() - 1)
  x.setHours(18, 0, 0, 0)
  return x
}

async function sumAggregatedToday(
  dataType: 'steps' | 'calories',
  dayStart: Date,
  dayEnd: Date,
): Promise<number | null> {
  const { samples } = await Health.queryAggregated({
    dataType,
    startDate: dayStart.toISOString(),
    endDate: dayEnd.toISOString(),
    bucket: 'day',
    aggregation: 'sum',
  })
  if (!samples.length) return null
  const total = samples.reduce((a, s) => a + s.value, 0)
  return Number.isFinite(total) ? Math.round(total) : null
}

async function averageSamplesToday(
  dataType: HealthDataType,
  dayStart: Date,
  dayEnd: Date,
): Promise<number | null> {
  const { samples } = await Health.readSamples({
    dataType,
    startDate: dayStart.toISOString(),
    endDate: dayEnd.toISOString(),
    limit: 200,
  })
  if (!samples.length) return null
  const avg = samples.reduce((a, s) => a + s.value, 0) / samples.length
  return Number.isFinite(avg) ? Math.round(avg) : null
}

function sumSleepMinutes(samples: HealthSample[]): number {
  let total = 0
  for (const s of samples) {
    if (s.dataType !== 'sleep') continue
    if (s.sleepState && !ASLEEP_STATES.has(s.sleepState)) continue
    total += s.value
  }
  return Math.round(total)
}

/** Pull today's Apple Health metrics for display and sleep auto-fill. */
export async function readAppleHealthTodayMetrics(
  nowMs: number = Date.now(),
): Promise<AppleHealthTodayMetrics | null> {
  if (!(await isAppleHealthAvailable())) return null

  const now = new Date(nowMs)
  const dk = dateKey(now)
  const dayStart = startOfLocalDay(now)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  try {
    const [steps, activeCalories, heartRateBpm, restingHeartRateBpm, hrvMs, sleepResult] =
      await Promise.all([
        sumAggregatedToday('steps', dayStart, dayEnd),
        sumAggregatedToday('calories', dayStart, dayEnd),
        averageSamplesToday('heartRate', dayStart, dayEnd),
        averageSamplesToday('restingHeartRate', dayStart, dayEnd),
        averageSamplesToday('heartRateVariability', dayStart, dayEnd),
        Health.readSamples({
          dataType: 'sleep',
          startDate: sleepWindowStart(now).toISOString(),
          endDate: now.toISOString(),
          limit: 300,
        }),
      ])

    const sleepMinutes = sumSleepMinutes(sleepResult.samples)
    const sleepOut = sleepMinutes > 0 ? sleepMinutes : null

    return {
      dateKey: dk,
      steps,
      activeCalories,
      heartRateBpm,
      restingHeartRateBpm,
      hrvMs,
      sleepMinutes: sleepOut,
      syncedAt: nowMs,
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[Apple Health] read today failed', e)
    return null
  }
}

export function estimateWorkoutCaloriesKcal(durationSec: number, setCount: number): number {
  const mins = Math.max(1, Math.round(durationSec / 60))
  const base = mins * 6
  const fromSets = setCount * 8
  return Math.max(50, Math.round(base + fromSets * 0.25))
}

/** Write gym session as active energy + exercise time (HealthKit workout proxy). */
export async function writeGymSessionToAppleHealth(opts: {
  startedAt: number
  endedAt: number
  caloriesKcal: number
}): Promise<void> {
  if (!(await isAppleHealthAvailable())) return
  const startIso = new Date(opts.startedAt).toISOString()
  const endIso = new Date(opts.endedAt).toISOString()
  const mins = Math.max(1, Math.round((opts.endedAt - opts.startedAt) / 60000))

  try {
    await Health.saveSample({
      dataType: 'calories',
      value: opts.caloriesKcal,
      unit: 'kilocalorie',
      startDate: startIso,
      endDate: endIso,
    })
    await Health.saveSample({
      dataType: 'exerciseTime',
      value: mins,
      unit: 'minute',
      startDate: startIso,
      endDate: endIso,
    })
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[Apple Health] write workout failed', e)
  }
}

export function gymSessionStartedAtMs(
  gym: { startedAt: number | null; manualStartedAt: number | null; mode: 'stopwatch' | 'manual' },
  endedAtMs: number,
): number | null {
  if (gym.mode === 'manual' && gym.manualStartedAt != null) return gym.manualStartedAt
  if (gym.startedAt != null) return gym.startedAt
  return endedAtMs - 45 * 60 * 1000
}

/** Apply Health sleep to local log when user has not entered sleep today. */
export function shouldAutoFillSleepFromHealth(
  metrics: AppleHealthTodayMetrics | null,
  todayKey: string,
  hasSleepLogToday: boolean,
): boolean {
  if (!metrics || metrics.dateKey !== todayKey) return false
  if (hasSleepLogToday) return false
  return metrics.sleepMinutes != null && metrics.sleepMinutes > 0
}

export function sleepHoursFromHealthMinutes(minutes: number): string {
  return String(Math.round((minutes / 60) * 100) / 100)
}
