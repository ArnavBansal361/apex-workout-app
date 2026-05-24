import type { SetLog } from '../types'
import { dateKey, parseDateKey, weekStartMonday } from './dates'

export const STRENGTH_PROJECTION_WEEKS = 8
export const MIN_STRENGTH_POINTS_FOR_PROJECTION = 4

export type StrengthProgressPoint = {
  weekStartKey: string
  label: string
  weight: number | null
}

export type StrengthProgressProjection = {
  slopePerWeek: number
  projectedWeight: number
  projectedDate: Date
  /** Week index in the historical 8-week window where projection starts. */
  startIndex: number
  /** Points along the projection segment (includes start). */
  points: { weekIndex: number; weight: number }[]
}

/** Max weight per week for exercise (non-BW), last 8 Mon–Sun blocks. */
export function strengthProgressSeries(logs: SetLog[], exerciseId: string): StrengthProgressPoint[] {
  const thisMonday = weekStartMonday(new Date())
  const out: StrengthProgressPoint[] = []
  for (let back = 7; back >= 0; back--) {
    const ws = new Date(thisMonday)
    ws.setDate(thisMonday.getDate() - back * 7)
    const we = new Date(ws)
    we.setDate(ws.getDate() + 7)
    let maxW: number | null = null
    for (const l of logs) {
      if (l.exerciseId !== exerciseId || l.kind !== 'weighted' || l.bodyweight) continue
      const t = new Date(l.at)
      if (t < ws || t >= we) continue
      const w = l.weight ?? 0
      maxW = maxW === null ? w : Math.max(maxW, w)
    }
    out.push({
      weekStartKey: dateKey(ws),
      label: `${ws.getMonth() + 1}/${ws.getDate()}`,
      weight: maxW,
    })
  }
  return out
}

function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number } | null {
  const n = points.length
  if (n < 2) return null
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0
  for (const p of points) {
    sumX += p.x
    sumY += p.y
    sumXY += p.x * p.y
    sumXX += p.x * p.x
  }
  const denom = n * sumXX - sumX * sumX
  if (Math.abs(denom) < 1e-10) return null
  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

/** Linear trend from weekly peaks; projects forward 8 weeks from the latest logged week. */
export function computeStrengthProgressProjection(
  series: StrengthProgressPoint[],
): StrengthProgressProjection | null {
  const plotted = series
    .map((p, index) => ({ ...p, index }))
    .filter((p): p is typeof p & { weight: number } => p.weight != null)

  if (plotted.length < MIN_STRENGTH_POINTS_FOR_PROJECTION) return null

  const reg = linearRegression(plotted.map((p) => ({ x: p.index, y: p.weight })))
  if (!reg) return null

  const start = plotted.reduce((a, b) => (a.index > b.index ? a : b))
  const startIndex = start.index
  const anchorWeek = parseDateKey(series[startIndex]!.weekStartKey)
  const projectedDate = new Date(anchorWeek)
  projectedDate.setDate(projectedDate.getDate() + STRENGTH_PROJECTION_WEEKS * 7)

  const points: { weekIndex: number; weight: number }[] = []
  for (let w = 0; w <= STRENGTH_PROJECTION_WEEKS; w++) {
    const weekIndex = startIndex + w
    points.push({
      weekIndex,
      weight: Math.max(0, reg.intercept + reg.slope * weekIndex),
    })
  }

  const endWeight = points[points.length - 1]!.weight

  return {
    slopePerWeek: reg.slope,
    projectedWeight: Math.round(endWeight * 10) / 10,
    projectedDate,
    startIndex,
    points,
  }
}

/** Max weight used on a calendar day for exercise (non-bodyweight only) */
function maxWeightOnDay(logs: SetLog[], exerciseId: string, dayKey: string): number | null {
  let m: number | null = null
  for (const l of logs) {
    if (l.exerciseId !== exerciseId || l.kind !== 'weighted' || l.bodyweight) continue
    if (dateKey(new Date(l.at)) !== dayKey) continue
    const w = l.weight ?? 0
    m = m === null ? w : Math.max(m, w)
  }
  return m
}

/** Distinct workout days for exercise with weighted non-BW sets, most recent first */
function recentSessionMaxWeights(logs: SetLog[], exerciseId: string): number[] {
  const days = new Set<string>()
  for (const l of logs) {
    if (l.exerciseId !== exerciseId || l.kind !== 'weighted' || l.bodyweight) continue
    days.add(dateKey(new Date(l.at)))
  }
  const sorted = [...days].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  return sorted.map((d) => maxWeightOnDay(logs, exerciseId, d)).filter((w): w is number => w != null)
}

/** Legacy long message for inline card hints */
export function progressiveOverloadMessage(
  logs: SetLog[],
  exerciseId: string,
  exerciseName: string,
): string | null {
  const series = recentSessionMaxWeights(logs, exerciseId)
  if (series.length < 3) return null
  const a = series[0]
  const b = series[1]
  const c = series[2]
  if (a === b && b === c && a > 0) {
    return `You've used ${a} on ${exerciseName} for three sessions in a row. Try adding a small amount of weight or one more rep if form stays perfect.`
  }
  return null
}

/** First exercise in plan that hit same weight 3 sessions — for top banner */
export function progressiveOverloadBanner(
  logs: SetLog[],
  planExerciseIds: string[],
  exerciseNames: Record<string, string>,
  unitLabel: string,
): { weight: number; unitLabel: string; exerciseName: string } | null {
  for (const id of planExerciseIds) {
    const series = recentSessionMaxWeights(logs, id)
    if (series.length < 3) continue
    const a = series[0]
    const b = series[1]
    const c = series[2]
    if (a === b && b === c && a > 0) {
      return {
        weight: a,
        unitLabel,
        exerciseName: exerciseNames[id] ?? 'Exercise',
      }
    }
  }
  return null
}
