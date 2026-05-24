import { workoutDaysFromActivity } from './achievements'
import { dateKey, weekStartMonday } from './dates'
import { sleepLogForDateKey } from './stats'
import { currentWeekStartKey, weightToLbs } from './volumeStats'
import type { AppPersisted, MuscleGroup, WeightedSetLog } from '../types'

const RADAR_GROUPS: MuscleGroup[] = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core']
const WEEKS_IN_WINDOW = 4
const DAYS_IN_WINDOW = WEEKS_IN_WINDOW * 7

export type LongevityDriver = {
  direction: 'up' | 'down'
  text: string
}

export type LongevityScoreResult = {
  score: number
  weekStartKey: string
  weekLabel: string
  pillars: {
    workoutConsistency: number
    cardioConsistency: number
    strengthBalance: number
    sleep: number
  }
  drivers: LongevityDriver[]
  hasEnoughData: boolean
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

function weekStartsInWindow(nowMs: number): Date[] {
  const mon = weekStartMonday(new Date(nowMs))
  const out: Date[] = []
  for (let i = 0; i < WEEKS_IN_WINDOW; i++) {
    const d = new Date(mon)
    d.setDate(mon.getDate() - i * 7)
    out.push(d)
  }
  return out.reverse()
}

function daysInWeek(weekStart: Date): string[] {
  const keys: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    keys.push(dateKey(d))
  }
  return keys
}

function countWorkoutDaysInWeek(activityDays: Set<string>, weekStart: Date): number {
  const keys = daysInWeek(weekStart)
  return keys.filter((k) => activityDays.has(k)).length
}

function countCardioSessionsInWeek(state: AppPersisted, weekStart: Date): number {
  const keys = new Set(daysInWeek(weekStart))
  let n = 0
  for (const c of state.cardioEntries) {
    if (keys.has(dateKey(new Date(c.at)))) n++
  }
  for (const l of state.setLogs) {
    if (l.muscleGroup !== 'Cardio') continue
    if (keys.has(dateKey(new Date(l.at)))) n++
  }
  return n
}

function strengthVolumeByMuscle4Weeks(state: AppPersisted, nowMs: number): Record<MuscleGroup, number> {
  const out = {} as Record<MuscleGroup, number>
  for (const g of RADAR_GROUPS) out[g] = 0
  const windowStart = new Date(weekStartMonday(new Date(nowMs)))
  windowStart.setDate(windowStart.getDate() - (WEEKS_IN_WINDOW - 1) * 7)
  const windowEnd = new Date(weekStartMonday(new Date(nowMs)))
  windowEnd.setDate(windowEnd.getDate() + 7)

  for (const l of state.setLogs) {
    if (l.kind !== 'weighted' || !RADAR_GROUPS.includes(l.muscleGroup as MuscleGroup)) continue
    const t = new Date(l.at)
    if (t < windowStart || t >= windowEnd) continue
    const w = l as WeightedSetLog
    if (w.bodyweight || w.weight == null) continue
    const lbs = weightToLbs(w.weight, state.settings.unit)
    out[w.muscleGroup] += lbs * w.reps * Math.max(1, w.sets)
  }
  return out
}

function muscleBalanceScore(vols: Record<MuscleGroup, number>): number {
  const values = RADAR_GROUPS.map((g) => vols[g] ?? 0)
  const total = values.reduce((a, b) => a + b, 0)
  if (total < 3_000) return 0.25

  const shares = values.map((v) => v / total)
  const entropy = shares
    .filter((s) => s > 0)
    .reduce((e, s) => e - s * Math.log(s), 0)
  const maxEntropy = Math.log(RADAR_GROUPS.length)
  return clamp01(entropy / maxEntropy)
}

function sleepMetrics4Weeks(state: AppPersisted, nowMs: number) {
  const keys: string[] = []
  for (let i = 0; i < DAYS_IN_WINDOW; i++) {
    const d = new Date(nowMs)
    d.setDate(d.getDate() - i)
    keys.push(dateKey(d))
  }

  const logs = keys
    .map((k) => sleepLogForDateKey(state, k))
    .filter((l): l is NonNullable<typeof l> => l != null)

  if (!logs.length) {
    return { coverage: 0, durationScore: 0, qualityScore: 0, daysLogged: 0 }
  }

  const daysLogged = logs.length
  const coverage = daysLogged / DAYS_IN_WINDOW
  const avgDuration = logs.reduce((s, l) => s + l.durationMinutes, 0) / logs.length
  const avgQuality = logs.reduce((s, l) => s + l.quality, 0) / logs.length

  const durationScore = clamp01((avgDuration - 300) / (480 - 300))
  const qualityScore = clamp01((avgQuality - 1) / 4)

  return { coverage, durationScore, qualityScore, daysLogged }
}

function formatWeekLabel(weekStartKey: string): string {
  const d = new Date(weekStartKey + 'T12:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Rolling 4-week longevity score (0–100), refreshed each calendar week. */
export function computeLongevityScore(
  state: AppPersisted,
  nowMs: number = Date.now(),
): LongevityScoreResult {
  const weekStartKey = currentWeekStartKey(nowMs)
  const activityDays = workoutDaysFromActivity(state)
  const weeks = weekStartsInWindow(nowMs)

  let totalWorkoutDays = 0
  let weeksWithTraining = 0
  for (const ws of weeks) {
    const days = countWorkoutDaysInWeek(activityDays, ws)
    totalWorkoutDays += days
    if (days > 0) weeksWithTraining++
  }

  const hasEnoughData = weeksWithTraining >= 1 || state.cardioEntries.length > 0

  const weekScores = weeks.map((ws) => clamp01(countWorkoutDaysInWeek(activityDays, ws) / 3))
  const workoutConsistency = clamp01(
    weekScores.reduce((a, b) => a + b, 0) / WEEKS_IN_WINDOW,
  )

  let cardioSessions = 0
  for (const ws of weeks) cardioSessions += countCardioSessionsInWeek(state, ws)
  const cardioPerWeek = cardioSessions / WEEKS_IN_WINDOW
  const cardioConsistency = clamp01(cardioPerWeek / 1.25)

  const vols = strengthVolumeByMuscle4Weeks(state, nowMs)
  const balanceNorm = muscleBalanceScore(vols)
  const strengthBalance = balanceNorm

  const sleep = sleepMetrics4Weeks(state, nowMs)
  const sleepCombined =
    sleep.daysLogged > 0
      ? sleep.coverage * 0.45 + sleep.durationScore * 0.35 + sleep.qualityScore * 0.2
      : 0

  const pillars = {
    workoutConsistency: Math.round(workoutConsistency * 25),
    cardioConsistency: Math.round(cardioConsistency * 25),
    strengthBalance: Math.round(strengthBalance * 25),
    sleep: Math.round(sleepCombined * 25),
  }

  const score = Math.min(
    100,
    pillars.workoutConsistency +
      pillars.cardioConsistency +
      pillars.strengthBalance +
      pillars.sleep,
  )

  const drivers: LongevityDriver[] = []

  if (workoutConsistency >= 0.75) {
    drivers.push({
      direction: 'up',
      text: `Steady training — about ${Math.round(totalWorkoutDays / WEEKS_IN_WINDOW)} workout days per week.`,
    })
  } else if (workoutConsistency < 0.5) {
    drivers.push({
      direction: 'down',
      text: 'Workout consistency is low — fewer than 3 days in most recent weeks.',
    })
  }

  if (cardioConsistency >= 0.7) {
    drivers.push({
      direction: 'up',
      text: `Regular cardio — ~${cardioPerWeek.toFixed(1)} sessions per week.`,
    })
  } else if (cardioSessions === 0) {
    drivers.push({
      direction: 'down',
      text: 'No cardio logged in the past 4 weeks.',
    })
  } else {
    drivers.push({
      direction: 'down',
      text: 'Cardio frequency could increase for heart health.',
    })
  }

  const trainedGroups = RADAR_GROUPS.filter((g) => (vols[g] ?? 0) > 500)
  if (strengthBalance >= 0.7 && trainedGroups.length >= 4) {
    drivers.push({
      direction: 'up',
      text: 'Strength work is spread well across muscle groups.',
    })
  } else if (trainedGroups.length <= 2) {
    drivers.push({
      direction: 'down',
      text: 'Strength training is concentrated in only a few muscle groups.',
    })
  } else if (balanceNorm < 0.45) {
    drivers.push({
      direction: 'down',
      text: 'Muscle-group volume is uneven — consider balancing push, pull, and legs.',
    })
  }

  if (sleep.daysLogged === 0) {
    drivers.push({
      direction: 'down',
      text: 'No sleep logs — recovery score is limited.',
    })
  } else if (sleepCombined >= 0.65) {
    drivers.push({
      direction: 'up',
      text: 'Sleep logging and averages support recovery.',
    })
  } else if (sleep.coverage < 0.25) {
    drivers.push({
      direction: 'down',
      text: 'Sleep is logged infrequently — more data would improve this score.',
    })
  } else if (sleep.durationScore < 0.4) {
    drivers.push({
      direction: 'down',
      text: 'Average sleep duration is on the low side.',
    })
  }

  const topPillar = (
    Object.entries(pillars) as [keyof typeof pillars, number][]
  ).sort((a, b) => b[1] - a[1])[0]
  if (drivers.length < 3 && topPillar) {
    const labels: Record<keyof typeof pillars, string> = {
      workoutConsistency: 'workout consistency',
      cardioConsistency: 'cardio habits',
      strengthBalance: 'strength balance',
      sleep: 'sleep recovery',
    }
    drivers.push({
      direction: 'up',
      text: `Strongest pillar this week: ${labels[topPillar[0]]}.`,
    })
  }

  return {
    score,
    weekStartKey,
    weekLabel: formatWeekLabel(weekStartKey),
    pillars,
    drivers: drivers.slice(0, 4),
    hasEnoughData,
  }
}
