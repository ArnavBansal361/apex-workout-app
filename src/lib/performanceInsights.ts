import type { AppPersisted } from '../types'
import { dateKey, parseDateKey, weekStartMonday } from './dates'
import { workoutDaysFromLogs } from './achievements'
import { macroTotalsForDateKey, sleepLogForDateKey } from './stats'
import { estimateOneRepMaxLbs } from './strengthAge'
import { weightToLbs } from './volumeStats'

const MIN_COMBINED_SPAN_DAYS = 14
const MIN_WEEKS_WITH_DATA = 2
const MIN_DAYS_PER_GROUP = 2
const MIN_PCT_DIFF = 5
const LONG_SLEEP_MINUTES = 8 * 60

export type PerformanceInsight = {
  id: 'sleep-duration' | 'prior-day-carbs'
  text: string
}

export type PerformanceInsightsResult = {
  eligible: boolean
  insights: PerformanceInsight[]
}

function shiftDateKey(key: string, deltaDays: number): string {
  const d = parseDateKey(key)
  d.setDate(d.getDate() + deltaDays)
  return dateKey(d)
}

function daysBetweenInclusive(startKey: string, endKey: string): number {
  const start = parseDateKey(startKey)
  const end = parseDateKey(endKey)
  const ms = end.getTime() - start.getTime()
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1
}

/** Average best estimated 1RM (lbs) per exercise on a workout day. */
function workoutDayStrengthScore(state: AppPersisted, dayKey: string): number | null {
  const bestByExercise = new Map<string, number>()
  for (const l of state.setLogs) {
    if (l.kind !== 'weighted' || l.bodyweight || l.weight == null) continue
    if (dateKey(new Date(l.at)) !== dayKey) continue
    const lbs = weightToLbs(l.weight, state.settings.unit)
    const e1rm = estimateOneRepMaxLbs(lbs, l.reps)
    const prev = bestByExercise.get(l.exerciseId) ?? 0
    if (e1rm > prev) bestByExercise.set(l.exerciseId, e1rm)
  }
  if (bestByExercise.size === 0) return null
  const vals = [...bestByExercise.values()]
  return vals.reduce((sum, v) => sum + v, 0) / vals.length
}

function average(nums: number[]): number | null {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function pctStronger(higher: number, lower: number): number {
  if (lower <= 0) return 0
  return Math.round(((higher - lower) / lower) * 100)
}

function median(nums: number[]): number | null {
  if (!nums.length) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]!
  return (sorted[mid - 1]! + sorted[mid]!) / 2
}

function hasMinimumCombinedData(
  workoutDays: string[],
  sleepDayKeys: Set<string>,
  nutritionPriorDayKeys: Set<string>,
): boolean {
  const combined = new Set<string>()
  for (const d of workoutDays) {
    if (sleepDayKeys.has(d)) combined.add(d)
    if (nutritionPriorDayKeys.has(d)) combined.add(d)
  }
  if (combined.size === 0) return false

  const sorted = [...combined].sort()
  const span = daysBetweenInclusive(sorted[0]!, sorted[sorted.length - 1]!)
  if (span < MIN_COMBINED_SPAN_DAYS) return false

  const weeks = new Set(
    sorted.map((k) => dateKey(weekStartMonday(parseDateKey(k)))),
  )
  return weeks.size >= MIN_WEEKS_WITH_DATA
}

function sleepDurationInsight(state: AppPersisted, workoutDays: string[]): PerformanceInsight | null {
  const longScores: number[] = []
  const shortScores: number[] = []

  for (const day of workoutDays) {
    const sleep = sleepLogForDateKey(state, day)
    const score = workoutDayStrengthScore(state, day)
    if (!sleep || score == null) continue
    if (sleep.durationMinutes >= LONG_SLEEP_MINUTES) longScores.push(score)
    else shortScores.push(score)
  }

  if (longScores.length < MIN_DAYS_PER_GROUP || shortScores.length < MIN_DAYS_PER_GROUP) {
    return null
  }

  const longAvg = average(longScores)!
  const shortAvg = average(shortScores)!
  if (longAvg <= shortAvg) return null

  const pct = pctStronger(longAvg, shortAvg)
  if (pct < MIN_PCT_DIFF) return null

  return {
    id: 'sleep-duration',
    text: `You lift ${pct}% stronger after 8+ hours of sleep.`,
  }
}

function priorDayCarbInsight(state: AppPersisted, workoutDays: string[]): PerformanceInsight | null {
  const paired: { score: number; priorCarbsG: number }[] = []

  for (const day of workoutDays) {
    const priorKey = shiftDateKey(day, -1)
    const macros = macroTotalsForDateKey(state, priorKey)
    if (macros.carbsG <= 0) continue
    const score = workoutDayStrengthScore(state, day)
    if (score == null) continue
    paired.push({ score, priorCarbsG: macros.carbsG })
  }

  if (paired.length < MIN_DAYS_PER_GROUP * 2) return null

  const carbMedian = median(paired.map((p) => p.priorCarbsG))
  if (carbMedian == null) return null

  const highScores = paired.filter((p) => p.priorCarbsG >= carbMedian).map((p) => p.score)
  const lowScores = paired.filter((p) => p.priorCarbsG < carbMedian).map((p) => p.score)

  if (highScores.length < MIN_DAYS_PER_GROUP || lowScores.length < MIN_DAYS_PER_GROUP) {
    return null
  }

  const highAvg = average(highScores)!
  const lowAvg = average(lowScores)!
  if (highAvg <= lowAvg) return null

  const pct = pctStronger(highAvg, lowAvg)
  if (pct < MIN_PCT_DIFF) return null

  const sorted = [...paired].sort((a, b) => b.score - a.score)
  const topCount = Math.max(1, Math.ceil(sorted.length * 0.25))
  const topSlice = sorted.slice(0, topCount)
  const topHighCarbShare =
    topSlice.filter((p) => p.priorCarbsG >= carbMedian).length / topSlice.length

  if (topHighCarbShare >= 0.6) {
    return {
      id: 'prior-day-carbs',
      text: 'Your best sessions follow high-carb days.',
    }
  }

  return {
    id: 'prior-day-carbs',
    text: `You lift ${pct}% stronger when the prior day was high-carb.`,
  }
}

export function computePerformanceInsights(state: AppPersisted): PerformanceInsightsResult {
  const workoutDays = [...workoutDaysFromLogs(state.setLogs)].sort()
  if (workoutDays.length === 0) {
    return { eligible: false, insights: [] }
  }

  const sleepDayKeys = new Set((state.sleepLogs ?? []).map((s) => s.dateKey))
  const nutritionPriorDayKeys = new Set<string>()
  for (const day of workoutDays) {
    const priorKey = shiftDateKey(day, -1)
    if (macroTotalsForDateKey(state, priorKey).carbsG > 0) {
      nutritionPriorDayKeys.add(day)
    }
  }

  const eligible = hasMinimumCombinedData(workoutDays, sleepDayKeys, nutritionPriorDayKeys)
  if (!eligible) {
    return { eligible: false, insights: [] }
  }

  const insights: PerformanceInsight[] = []
  const sleep = sleepDurationInsight(state, workoutDays)
  if (sleep) insights.push(sleep)
  const carbs = priorDayCarbInsight(state, workoutDays)
  if (carbs) insights.push(carbs)

  return { eligible: true, insights }
}
