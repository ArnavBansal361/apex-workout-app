import type { AppPersisted } from '../types'
import { dateKey, parseDateKey, weekStartMonday } from './dates'
import { workoutDaysFromLogs } from './achievements'
import { macroTotalsForDateKey, sleepLogForDateKey } from './stats'
import { estimateOneRepMaxLbs } from './strengthAge'
import { weightToLbs } from './volumeStats'

const MIN_COMBINED_SPAN_DAYS = 14
const MIN_WEEKS_WITH_DATA = 2
const MIN_QUALIFYING_DAYS = 4
const MIN_DAYS_PER_GROUP = 2
const MIN_PCT_DIFF = 5
const LONG_SLEEP_MINUTES = 8 * 60
const HIGH_SLEEP_QUALITY = 4

export type PerformanceInsight = {
  id: 'sleep-duration' | 'sleep-quality' | 'prior-day-carbs' | 'prior-day-protein'
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

function priorDayHasNutrition(state: AppPersisted, workoutDayKey: string): boolean {
  const macros = macroTotalsForDateKey(state, shiftDateKey(workoutDayKey, -1))
  return macros.calories > 0 || macros.proteinG > 0 || macros.carbsG > 0
}

/** Workout days with sleep, prior-day nutrition, and measurable strength that day. */
function qualifyingWorkoutDays(state: AppPersisted, workoutDays: string[]): string[] {
  return workoutDays.filter((day) => {
    if (!sleepLogForDateKey(state, day)) return false
    if (!priorDayHasNutrition(state, day)) return false
    return workoutDayStrengthScore(state, day) != null
  })
}

/** At least 2 calendar weeks of sleep + nutrition + workout data spanning 14+ days. */
function hasMinimumCombinedData(qualifyingDays: string[]): boolean {
  if (qualifyingDays.length < MIN_QUALIFYING_DAYS) return false

  const sorted = [...qualifyingDays].sort()
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

function sleepQualityInsight(state: AppPersisted, workoutDays: string[]): PerformanceInsight | null {
  const restedScores: number[] = []
  const tiredScores: number[] = []

  for (const day of workoutDays) {
    const sleep = sleepLogForDateKey(state, day)
    const score = workoutDayStrengthScore(state, day)
    if (!sleep || score == null) continue
    if (sleep.quality >= HIGH_SLEEP_QUALITY) restedScores.push(score)
    else tiredScores.push(score)
  }

  if (restedScores.length < MIN_DAYS_PER_GROUP || tiredScores.length < MIN_DAYS_PER_GROUP) {
    return null
  }

  const restedAvg = average(restedScores)!
  const tiredAvg = average(tiredScores)!
  if (restedAvg <= tiredAvg) return null

  const pct = pctStronger(restedAvg, tiredAvg)
  if (pct < MIN_PCT_DIFF) return null

  return {
    id: 'sleep-quality',
    text: `You lift ${pct}% stronger after nights you rate ${HIGH_SLEEP_QUALITY}+ stars for sleep quality.`,
  }
}

function priorDayMacroInsight(
  state: AppPersisted,
  workoutDays: string[],
  macro: 'carbsG' | 'proteinG',
  id: PerformanceInsight['id'],
  highLabel: string,
): PerformanceInsight | null {
  const paired: { score: number; value: number }[] = []

  for (const day of workoutDays) {
    const priorKey = shiftDateKey(day, -1)
    const macros = macroTotalsForDateKey(state, priorKey)
    const value = macros[macro]
    if (value <= 0) continue
    const score = workoutDayStrengthScore(state, day)
    if (score == null) continue
    paired.push({ score, value })
  }

  if (paired.length < MIN_DAYS_PER_GROUP * 2) return null

  const med = median(paired.map((p) => p.value))
  if (med == null) return null

  const highScores = paired.filter((p) => p.value >= med).map((p) => p.score)
  const lowScores = paired.filter((p) => p.value < med).map((p) => p.score)

  if (highScores.length < MIN_DAYS_PER_GROUP || lowScores.length < MIN_DAYS_PER_GROUP) {
    return null
  }

  const highAvg = average(highScores)!
  const lowAvg = average(lowScores)!
  if (highAvg <= lowAvg) return null

  const pct = pctStronger(highAvg, lowAvg)
  if (pct < MIN_PCT_DIFF) return null

  return {
    id,
    text: `You lift ${pct}% stronger when the prior day was ${highLabel}.`,
  }
}

export function computePerformanceInsights(state: AppPersisted): PerformanceInsightsResult {
  const workoutDays = [...workoutDaysFromLogs(state.setLogs)].sort()
  if (workoutDays.length === 0) {
    return { eligible: false, insights: [] }
  }

  const qualifyingDays = qualifyingWorkoutDays(state, workoutDays)
  if (!hasMinimumCombinedData(qualifyingDays)) {
    return { eligible: false, insights: [] }
  }

  const insights: PerformanceInsight[] = []
  const sleepDur = sleepDurationInsight(state, workoutDays)
  if (sleepDur) insights.push(sleepDur)
  const sleepQual = sleepQualityInsight(state, workoutDays)
  if (sleepQual) insights.push(sleepQual)
  const carbs = priorDayMacroInsight(state, workoutDays, 'carbsG', 'prior-day-carbs', 'high-carb')
  if (carbs) insights.push(carbs)
  const protein = priorDayMacroInsight(
    state,
    workoutDays,
    'proteinG',
    'prior-day-protein',
    'high-protein',
  )
  if (protein) insights.push(protein)

  return { eligible: true, insights }
}
