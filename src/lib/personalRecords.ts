import type { MuscleGroup, SetLog, WeightedSetLog } from '../types'
import { weightToLbs } from './volumeStats'

export type PersonalRecordRow = {
  exerciseId: string
  exerciseName: string
  muscleGroup: MuscleGroup
  /** Human-readable best, e.g. "185 lb × 8" or "BW × 12" or "90s hold" */
  detail: string
  at: number
}

export type PersonalRecordDisplayRow = PersonalRecordRow & {
  weightLabel: string | null
  improvementLabel: string | null
  dateLabel: string
}

function fmtWeight(w: number, unit: 'lbs' | 'kg'): string {
  const rounded = Math.round(w * 10) / 10
  return `${rounded} ${unit}`
}

type Best =
  | { t: 'w'; w: number; r: number; name: string; mg: MuscleGroup; at: number }
  | { t: 'bw'; r: number; name: string; mg: MuscleGroup; at: number }
  | { t: 'time'; sec: number; name: string; mg: MuscleGroup; at: number }

/** Current best per exercise from all logs (for Profile PR list). */
export function computePersonalRecords(logs: SetLog[], unit: 'lbs' | 'kg'): PersonalRecordRow[] {
  const m = new Map<string, Best>()

  for (const l of logs) {
    if (l.kind === 'timed') {
      const prev = m.get(l.exerciseId)
      const cand: Best = {
        t: 'time',
        sec: l.durationSec,
        name: l.exerciseName,
        mg: l.muscleGroup,
        at: l.at,
      }
      if (!prev || prev.t !== 'time' || l.durationSec > prev.sec) m.set(l.exerciseId, cand)
      continue
    }

    const w = l as WeightedSetLog
    if (w.bodyweight) {
      const prev = m.get(w.exerciseId)
      const cand: Best = { t: 'bw', r: w.reps, name: w.exerciseName, mg: w.muscleGroup, at: w.at }
      if (!prev || prev.t === 'time') {
        m.set(w.exerciseId, cand)
      } else if (prev.t === 'bw' && w.reps > prev.r) {
        m.set(w.exerciseId, cand)
      }
      continue
    }

    if (w.weight == null || !Number.isFinite(w.weight)) continue
    const prev = m.get(w.exerciseId)
    const cand: Best = {
      t: 'w',
      w: w.weight,
      r: w.reps,
      name: w.exerciseName,
      mg: w.muscleGroup,
      at: w.at,
    }
    if (!prev || prev.t === 'time') {
      m.set(w.exerciseId, cand)
      continue
    }
    if (prev.t === 'bw') {
      m.set(w.exerciseId, cand)
      continue
    }
    if (prev.t === 'w') {
      const pw = weightToLbs(prev.w, unit)
      const nw = weightToLbs(w.weight, unit)
      if (nw > pw || (Math.abs(nw - pw) < 1e-6 && w.reps > prev.r)) {
        m.set(w.exerciseId, cand)
      }
    }
  }

  const rows: PersonalRecordRow[] = []
  for (const [exerciseId, b] of m) {
    if (b.t === 'time') {
      rows.push({
        exerciseId,
        exerciseName: b.name,
        muscleGroup: b.mg,
        detail: `${b.sec}s hold`,
        at: b.at,
      })
    } else if (b.t === 'bw') {
      rows.push({
        exerciseId,
        exerciseName: b.name,
        muscleGroup: b.mg,
        detail: `BW × ${b.r}`,
        at: b.at,
      })
    } else {
      rows.push({
        exerciseId,
        exerciseName: b.name,
        muscleGroup: b.mg,
        detail: `${fmtWeight(b.w, unit)} × ${b.r}`,
        at: b.at,
      })
    }
  }

  rows.sort((a, b) => b.at - a.at)
  return rows
}

function formatPrDate(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function improvementForWeighted(
  logs: SetLog[],
  exerciseId: string,
  bestAt: number,
  bestWeight: number,
  unit: 'lbs' | 'kg',
): string | null {
  let prevBest: number | null = null
  for (const l of logs) {
    if (l.kind !== 'weighted' || l.exerciseId !== exerciseId) continue
    const w = l as WeightedSetLog
    if (w.bodyweight || w.weight == null || !Number.isFinite(w.weight)) continue
    if (l.at >= bestAt) continue
    const lbs = weightToLbs(w.weight, unit)
    if (prevBest == null || lbs > prevBest) prevBest = lbs
  }
  if (prevBest == null) return null
  const delta = weightToLbs(bestWeight, unit) - prevBest
  if (Math.abs(delta) < 0.05) return null
  const rounded =
    unit === 'kg'
      ? Math.round(delta * 4) / 4
      : Math.round(delta * 2) / 2
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded} ${unit}`
}

/** PR rows for Me tab with weight, date, and improvement vs prior best. */
export function computePersonalRecordDisplayRows(
  logs: SetLog[],
  unit: 'lbs' | 'kg',
): PersonalRecordDisplayRow[] {
  const base = computePersonalRecords(logs, unit)
  return base.map((row) => {
    const last = logs
      .filter((l): l is WeightedSetLog => l.exerciseId === row.exerciseId && l.kind === 'weighted')
      .sort((a, b) => b.at - a.at)[0]
    let weightLabel: string | null = null
    let improvementLabel: string | null = null
    if (last && !last.bodyweight && last.weight != null) {
      weightLabel = fmtWeight(last.weight, unit)
      improvementLabel = improvementForWeighted(logs, row.exerciseId, row.at, last.weight, unit)
    } else if (row.detail.startsWith('BW')) {
      weightLabel = 'BW'
    } else if (row.detail.endsWith('hold')) {
      weightLabel = row.detail.replace(' hold', '')
    } else {
      const m = row.detail.match(/^(.+?) ×/)
      weightLabel = m?.[1] ?? row.detail
    }
    return {
      ...row,
      weightLabel,
      improvementLabel,
      dateLabel: formatPrDate(row.at),
    }
  })
}
