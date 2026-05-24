import type { SetLog, WeightedSetLog } from '../types'
import { weightToLbs } from './volumeStats'

/** Key barbell lifts mapped to exercise ids in the catalog (best match wins). */
export const KEY_LIFT_EXERCISES = {
  bench: [
    'bench-press',
    'incline-bench-press',
    'decline-bench-press',
    'close-grip-bench-press',
    'floor-press',
    'dumbbell-bench-press',
    'seated-bench-press',
  ],
  squat: ['squat', 'front-squat', 'box-squat', 'goblet-squat', 'hack-squat'],
  deadlift: [
    'deadlift',
    'sumo-deadlift',
    'romanian-deadlift',
    'deficit-deadlift',
    'snatch-grip-deadlift',
    'rack-pull',
  ],
  ohp: ['overhead-press', 'barbell-overhead-press', 'shoulder-press', 'push-press'],
} as const

export type KeyLift = keyof typeof KEY_LIFT_EXERCISES

/** Intermediate male 1RM-to-bodyweight ratios at strength peak (~25). Based on common strength-standard tables (ExRx / symmetric-strength style). */
const PEAK_BENCHMARK_RATIO: Record<KeyLift, number> = {
  bench: 1.18,
  squat: 1.54,
  deadlift: 1.88,
  ohp: 0.71,
}

/** Relative strength vs peak by age (general population training norms). */
const AGE_STRENGTH_FACTORS: { age: number; factor: number }[] = [
  { age: 15, factor: 0.85 },
  { age: 20, factor: 0.95 },
  { age: 25, factor: 1.0 },
  { age: 30, factor: 0.99 },
  { age: 35, factor: 0.96 },
  { age: 40, factor: 0.92 },
  { age: 45, factor: 0.88 },
  { age: 50, factor: 0.84 },
  { age: 55, factor: 0.8 },
  { age: 60, factor: 0.75 },
  { age: 65, factor: 0.7 },
  { age: 70, factor: 0.64 },
  { age: 75, factor: 0.58 },
]

const DUMBBELL_DOUBLE_LOAD = new Set(['dumbbell-bench-press', 'seated-bench-press'])

export function estimateOneRepMaxLbs(weightLbs: number, reps: number): number {
  const r = Math.max(1, Math.floor(reps))
  return weightLbs * (1 + r / 30)
}

function strengthAgeForRatio(ratio: number, peakBenchmark: number): number {
  const curve = AGE_STRENGTH_FACTORS.map((p) => ({
    age: p.age,
    ratio: peakBenchmark * p.factor,
  }))

  if (ratio >= curve[0]!.ratio) return curve[0]!.age
  const last = curve[curve.length - 1]!
  if (ratio <= last.ratio) return last.age

  for (let i = 0; i < curve.length - 1; i++) {
    const younger = curve[i]!
    const older = curve[i + 1]!
    if (ratio <= younger.ratio && ratio >= older.ratio) {
      const span = younger.ratio - older.ratio
      if (span <= 0) return younger.age
      const t = (younger.ratio - ratio) / span
      return Math.round(younger.age + t * (older.age - younger.age))
    }
  }

  return 25
}

function bestOneRmLbsForLift(
  logs: SetLog[],
  exerciseIds: readonly string[],
  unit: 'lbs' | 'kg',
): number | null {
  let best: number | null = null
  const idSet = new Set(exerciseIds)

  for (const log of logs) {
    if (log.kind !== 'weighted') continue
    const w = log as WeightedSetLog
    if (!idSet.has(w.exerciseId) || w.bodyweight || w.weight == null || !Number.isFinite(w.weight)) {
      continue
    }
    let loadLbs = weightToLbs(w.weight, unit)
    if (DUMBBELL_DOUBLE_LOAD.has(w.exerciseId)) loadLbs *= 2
    const oneRm = estimateOneRepMaxLbs(loadLbs, w.reps)
    if (best == null || oneRm > best) best = oneRm
  }

  return best
}

export type StrengthAgeResult = {
  strengthAge: number | null
  liftAges: Partial<Record<KeyLift, number>>
  liftsUsed: KeyLift[]
  bodyweightLbs: number | null
  missingBodyweight: boolean
  missingLifts: boolean
}

export function computeStrengthAge(
  logs: SetLog[],
  bodyweight: number | null,
  unit: 'lbs' | 'kg',
): StrengthAgeResult {
  const bodyweightLbs =
    bodyweight != null && Number.isFinite(bodyweight) && bodyweight > 0
      ? weightToLbs(bodyweight, unit)
      : null

  if (!bodyweightLbs) {
    return {
      strengthAge: null,
      liftAges: {},
      liftsUsed: [],
      bodyweightLbs: null,
      missingBodyweight: true,
      missingLifts: true,
    }
  }

  const liftAges: Partial<Record<KeyLift, number>> = {}
  const liftsUsed: KeyLift[] = []

  for (const lift of Object.keys(KEY_LIFT_EXERCISES) as KeyLift[]) {
    const oneRm = bestOneRmLbsForLift(logs, KEY_LIFT_EXERCISES[lift], unit)
    if (oneRm == null) continue
    const ratio = oneRm / bodyweightLbs
    liftAges[lift] = strengthAgeForRatio(ratio, PEAK_BENCHMARK_RATIO[lift])
    liftsUsed.push(lift)
  }

  if (!liftsUsed.length) {
    return {
      strengthAge: null,
      liftAges: {},
      liftsUsed: [],
      bodyweightLbs,
      missingBodyweight: false,
      missingLifts: true,
    }
  }

  const ages = liftsUsed.map((k) => liftAges[k]!).filter((n) => Number.isFinite(n))
  const strengthAge = Math.round(ages.reduce((sum, n) => sum + n, 0) / ages.length)

  return {
    strengthAge,
    liftAges,
    liftsUsed,
    bodyweightLbs,
    missingBodyweight: false,
    missingLifts: false,
  }
}

export function formatStrengthAgeLiftLabel(lift: KeyLift): string {
  switch (lift) {
    case 'bench':
      return 'Bench'
    case 'squat':
      return 'Squat'
    case 'deadlift':
      return 'Deadlift'
    case 'ohp':
      return 'Press'
  }
}
