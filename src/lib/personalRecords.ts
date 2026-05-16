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

  rows.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName))
  return rows
}
