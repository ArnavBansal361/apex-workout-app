import type { AppPersisted, CardioEntry, SetLog, WeightedSetLog } from '../types'
import { EXERCISE_BY_ID } from './exercises'

/** One-time import: maps free-text names to app exercise ids (lbs in source data). */
const N: Record<
  string,
  { id: string; pr?: boolean; bodyweight?: boolean; note?: string }
> = {
  'dumbbell bench press': { id: 'dumbbell-bench-press' },
  'seated dumbbell bench press': { id: 'seated-bench-press' },
  'cable lateral raise': { id: 'lateral-raises' },
  'tricep rope pushdown': { id: 'tricep-rope-pushdown' },
  'tricep rope pushdowns': { id: 'tricep-rope-pushdown' },
  'lat pulldown': { id: 'lat-pulldown' },
  'seated cable rows': { id: 'seated-cable-row' },
  'dumbbell curls': { id: 'dumbbell-curl' },
  'leg curl machine': { id: 'leg-curl' },
  'leg curl': { id: 'leg-curl' },
  'leg extension': { id: 'leg-extension' },
  'dip assist machine': { id: 'dips', note: 'Assist machine' },
  'incline press': { id: 'incline-bench-press' },
  'hamstring curl': { id: 'hamstring-curl' },
  'hamstring curls': { id: 'hamstring-curl' },
  dips: { id: 'dips' },
  'pec fly': { id: 'pec-fly' },
  'pec lift': { id: 'pec-fly' },
  'shoulder press': { id: 'shoulder-press' },
  'crunch machine': { id: 'crunch-machine' },
  crunch: { id: 'crunch-machine' },
  'seated bench press': { id: 'seated-bench-press' },
  'inner thigh machine': { id: 'inner-thigh-machine' },
  'outer thigh machine': { id: 'outer-thigh-machine' },
  'outer thigh': { id: 'outer-thigh-machine' },
  'inner thigh': { id: 'inner-thigh-machine' },
  rows: { id: 'rows' },
  'seated dumbbell curls': { id: 'seated-dumbbell-curl' },
  'seated dumbbell curl': { id: 'seated-dumbbell-curl' },
  'chest press': { id: 'chest-press-machine' },
  'curling machine': { id: 'seated-dumbbell-curl', note: 'Curl machine' },
  curls: { id: 'dumbbell-curl' },
  'preacher curl': { id: 'dumbbell-curl', note: 'Preacher' },
  'preacher curls': { id: 'dumbbell-curl', note: 'Preacher' },
}

type Row = { day: string; name: string; sets: number; reps: number; weight: number; pr?: boolean; bw?: boolean }

const ROWS: Row[] = [
  { day: '2026-04-24', name: 'dumbbell bench press', sets: 4, reps: 10, weight: 10 },
  { day: '2026-04-24', name: 'seated dumbbell bench press', sets: 3, reps: 10, weight: 10 },
  { day: '2026-04-24', name: 'cable lateral raise', sets: 1, reps: 5, weight: 20 },
  { day: '2026-04-24', name: 'tricep rope pushdown', sets: 3, reps: 10, weight: 20 },
  { day: '2026-04-24', name: 'lat pulldown', sets: 4, reps: 10, weight: 40 },
  { day: '2026-04-24', name: 'seated cable rows', sets: 3, reps: 10, weight: 40 },
  { day: '2026-04-24', name: 'dumbbell curls', sets: 3, reps: 10, weight: 10 },
  { day: '2026-04-24', name: 'leg curl machine', sets: 3, reps: 10, weight: 70 },
  { day: '2026-04-24', name: 'leg extension', sets: 3, reps: 5, weight: 40 },

  { day: '2026-04-28', name: 'dumbbell bench press', sets: 3, reps: 10, weight: 10 },
  { day: '2026-04-28', name: 'seated dumbbell bench press', sets: 3, reps: 10, weight: 10 },
  { day: '2026-04-28', name: 'seated cable rows', sets: 3, reps: 10, weight: 40 },
  { day: '2026-04-28', name: 'tricep rope pushdown', sets: 3, reps: 10, weight: 20 },
  { day: '2026-04-28', name: 'leg curl machine', sets: 3, reps: 10, weight: 55 },
  { day: '2026-04-28', name: 'leg extension', sets: 3, reps: 10, weight: 25 },
  { day: '2026-04-28', name: 'dip assist machine', sets: 1, reps: 10, weight: 120 },

  { day: '2026-04-29', name: 'dumbbell bench press', sets: 5, reps: 10, weight: 10 },
  { day: '2026-04-29', name: 'seated cable rows', sets: 5, reps: 10, weight: 40 },
  { day: '2026-04-29', name: 'dip assist machine', sets: 3, reps: 10, weight: 100 },
  { day: '2026-04-29', name: 'seated dumbbell curl', sets: 5, reps: 10, weight: 10 },
  { day: '2026-04-29', name: 'tricep rope pushdown', sets: 3, reps: 10, weight: 20 },
  { day: '2026-04-29', name: 'leg curl', sets: 5, reps: 10, weight: 55 },
  { day: '2026-04-29', name: 'leg extension', sets: 5, reps: 10, weight: 25 },

  { day: '2026-05-01', name: 'dip assist machine', sets: 6, reps: 5, weight: 100 },
  { day: '2026-05-01', name: 'incline press', sets: 3, reps: 10, weight: 3 },
  { day: '2026-05-01', name: 'leg curl', sets: 5, reps: 10, weight: 55 },
  { day: '2026-05-01', name: 'leg extension', sets: 3, reps: 10, weight: 40 },
  { day: '2026-05-01', name: 'hamstring curl', sets: 3, reps: 10, weight: 9 },
  { day: '2026-05-01', name: 'seated cable rows', sets: 3, reps: 10, weight: 40 },
  { day: '2026-05-01', name: 'tricep rope pushdown', sets: 3, reps: 10, weight: 20 },
  { day: '2026-05-01', name: 'lat pulldown', sets: 3, reps: 10, weight: 40 },

  { day: '2026-05-02', name: 'leg curl', sets: 5, reps: 10, weight: 55 },
  { day: '2026-05-02', name: 'leg extension', sets: 5, reps: 10, weight: 40 },
  { day: '2026-05-02', name: 'dips', sets: 5, reps: 10, weight: 100 },
  { day: '2026-05-02', name: 'hamstring curl', sets: 3, reps: 10, weight: 5 },
  { day: '2026-05-02', name: 'seated cable rows', sets: 3, reps: 10, weight: 40 },
  { day: '2026-05-02', name: 'pec fly', sets: 5, reps: 10, weight: 20 },
  { day: '2026-05-02', name: 'lat pulldown', sets: 3, reps: 10, weight: 40 },
  { day: '2026-05-02', name: 'tricep rope pushdown', sets: 3, reps: 10, weight: 20 },
  { day: '2026-05-02', name: 'shoulder press', sets: 5, reps: 10, weight: 0, bw: true },
  { day: '2026-05-02', name: 'crunch machine', sets: 3, reps: 10, weight: 10 },

  { day: '2026-05-03', name: 'seated cable rows', sets: 5, reps: 10, weight: 40 },
  { day: '2026-05-03', name: 'tricep rope pushdown', sets: 3, reps: 10, weight: 20 },
  { day: '2026-05-03', name: 'lat pulldown', sets: 5, reps: 10, weight: 40 },
  { day: '2026-05-03', name: 'shoulder press', sets: 3, reps: 10, weight: 0, bw: true },
  { day: '2026-05-03', name: 'crunch machine', sets: 5, reps: 10, weight: 15, pr: true },
  { day: '2026-05-03', name: 'seated bench press', sets: 3, reps: 10, weight: 12.5, pr: true },
  { day: '2026-05-03', name: 'dips', sets: 3, reps: 5, weight: 100 },
  { day: '2026-05-03', name: 'pec fly', sets: 3, reps: 10, weight: 50, pr: true },
  { day: '2026-05-03', name: 'leg curl', sets: 3, reps: 10, weight: 60, pr: true },
  { day: '2026-05-03', name: 'leg extension', sets: 5, reps: 10, weight: 25 },
  { day: '2026-05-03', name: 'inner thigh machine', sets: 3, reps: 10, weight: 40 },
  { day: '2026-05-03', name: 'outer thigh machine', sets: 3, reps: 10, weight: 30 },

  { day: '2026-05-04', name: 'pec fly', sets: 5, reps: 10, weight: 40 },
  { day: '2026-05-04', name: 'leg curl', sets: 3, reps: 10, weight: 60 },
  { day: '2026-05-04', name: 'leg extension', sets: 3, reps: 10, weight: 25 },
  { day: '2026-05-04', name: 'outer thigh', sets: 3, reps: 10, weight: 30 },
  { day: '2026-05-04', name: 'inner thigh', sets: 3, reps: 10, weight: 40 },
  { day: '2026-05-04', name: 'rows', sets: 3, reps: 10, weight: 40 },
  { day: '2026-05-04', name: 'lat pulldown', sets: 3, reps: 10, weight: 40 },
  { day: '2026-05-04', name: 'crunch machine', sets: 5, reps: 10, weight: 15 },
  { day: '2026-05-04', name: 'tricep rope pushdown', sets: 5, reps: 10, weight: 20 },
  { day: '2026-05-04', name: 'shoulder press', sets: 3, reps: 10, weight: 0, bw: true },
  { day: '2026-05-04', name: 'seated dumbbell curls', sets: 2, reps: 10, weight: 10 },

  { day: '2026-05-05', name: 'dips', sets: 3, reps: 10, weight: 100 },
  { day: '2026-05-05', name: 'shoulder press', sets: 5, reps: 10, weight: 0, bw: true },
  { day: '2026-05-05', name: 'crunch', sets: 5, reps: 10, weight: 15 },
  { day: '2026-05-05', name: 'pec fly', sets: 5, reps: 10, weight: 40 },
  { day: '2026-05-05', name: 'leg curl', sets: 2, reps: 10, weight: 60 },
  { day: '2026-05-05', name: 'leg extension', sets: 3, reps: 10, weight: 25 },
  { day: '2026-05-05', name: 'rows', sets: 3, reps: 10, weight: 40 },
  { day: '2026-05-05', name: 'lat pulldown', sets: 2, reps: 10, weight: 40 },
  { day: '2026-05-05', name: 'tricep rope pushdown', sets: 5, reps: 10, weight: 20 },
  { day: '2026-05-05', name: 'chest press', sets: 5, reps: 10, weight: 0, bw: true },

  { day: '2026-05-06', name: 'dips', sets: 3, reps: 10, weight: 100 },
  { day: '2026-05-06', name: 'rows', sets: 3, reps: 10, weight: 50, pr: true },
  { day: '2026-05-06', name: 'chest press', sets: 3, reps: 10, weight: 20, pr: true },
  { day: '2026-05-06', name: 'shoulder press', sets: 3, reps: 10, weight: 0, bw: true },
  { day: '2026-05-06', name: 'lat pulldown', sets: 3, reps: 10, weight: 50, pr: true },
  { day: '2026-05-06', name: 'dumbbell bench press', sets: 3, reps: 10, weight: 12.5 },
  { day: '2026-05-06', name: 'hamstring curls', sets: 3, reps: 10, weight: 7.5, pr: true },
  { day: '2026-05-06', name: 'curling machine', sets: 3, reps: 10, weight: 20, pr: true },

  { day: '2026-05-07', name: 'pec fly', sets: 5, reps: 10, weight: 40 },
  { day: '2026-05-07', name: 'rows', sets: 5, reps: 10, weight: 40 },
  { day: '2026-05-07', name: 'lat pulldown', sets: 5, reps: 10, weight: 40 },
  { day: '2026-05-07', name: 'tricep rope pushdowns', sets: 5, reps: 5, weight: 30, pr: true },
  { day: '2026-05-07', name: 'crunch', sets: 5, reps: 10, weight: 20 },
  { day: '2026-05-07', name: 'shoulder press', sets: 5, reps: 10, weight: 20, pr: true },
  { day: '2026-05-07', name: 'hamstring curl', sets: 3, reps: 10, weight: 7.5 },
  { day: '2026-05-07', name: 'chest press', sets: 5, reps: 10, weight: 20 },

  { day: '2026-05-08', name: 'pec fly', sets: 8, reps: 10, weight: 40 },
  { day: '2026-05-08', name: 'rows', sets: 5, reps: 10, weight: 50 },
  { day: '2026-05-08', name: 'tricep rope pushdown', sets: 5, reps: 10, weight: 20 },
  { day: '2026-05-08', name: 'lat pulldown', sets: 2, reps: 10, weight: 50 },
  { day: '2026-05-08', name: 'inner thigh', sets: 3, reps: 19, weight: 40 },
  { day: '2026-05-08', name: 'outer thigh', sets: 1, reps: 10, weight: 40 },
  { day: '2026-05-08', name: 'crunch', sets: 5, reps: 10, weight: 25, pr: true },
  { day: '2026-05-08', name: 'shoulder press', sets: 3, reps: 10, weight: 20 },
  { day: '2026-05-08', name: 'hamstring curl', sets: 3, reps: 10, weight: 7.5 },
  { day: '2026-05-08', name: 'dumbbell bench press', sets: 3, reps: 10, weight: 12.5 },
  { day: '2026-05-08', name: 'preacher curl', sets: 3, reps: 10, weight: 0, bw: true },

  { day: '2026-05-09', name: 'pec lift', sets: 3, reps: 10, weight: 40 },
  { day: '2026-05-09', name: 'leg curl', sets: 3, reps: 10, weight: 60 },
  { day: '2026-05-09', name: 'leg extension', sets: 3, reps: 10, weight: 40 },
  { day: '2026-05-09', name: 'outer thigh', sets: 3, reps: 10, weight: 30 },
  { day: '2026-05-09', name: 'inner thigh', sets: 3, reps: 10, weight: 40 },
  { day: '2026-05-09', name: 'shoulder press', sets: 3, reps: 10, weight: 20 },
  { day: '2026-05-09', name: 'crunch', sets: 3, reps: 10, weight: 25 },
  { day: '2026-05-09', name: 'rows', sets: 3, reps: 10, weight: 50 },
  { day: '2026-05-09', name: 'tricep rope pushdown', sets: 3, reps: 10, weight: 20 },
  { day: '2026-05-09', name: 'lat pulldown', sets: 3, reps: 10, weight: 50 },
  { day: '2026-05-09', name: 'hamstring curl', sets: 3, reps: 10, weight: 7.5 },
  { day: '2026-05-09', name: 'preacher curls', sets: 4, reps: 10, weight: 0, bw: true },

  { day: '2026-05-09', name: 'pec fly', sets: 10, reps: 10, weight: 40 },
  { day: '2026-05-09', name: 'rows', sets: 7, reps: 10, weight: 40 },
  { day: '2026-05-09', name: 'tricep rope pushdown', sets: 3, reps: 15, weight: 20 },
  { day: '2026-05-09', name: 'lat pulldown', sets: 3, reps: 15, weight: 40 },
  { day: '2026-05-09', name: 'curls', sets: 5, reps: 10, weight: 25 },
  { day: '2026-05-09', name: 'hamstring curl', sets: 2, reps: 20, weight: 10, pr: true },
  { day: '2026-05-09', name: 'preacher curl', sets: 5, reps: 10, weight: 2.5, pr: true },

  { day: '2026-05-10', name: 'pec fly', sets: 8, reps: 10, weight: 40 },
  { day: '2026-05-10', name: 'rows', sets: 5, reps: 10, weight: 50 },
  { day: '2026-05-10', name: 'tricep rope pushdown', sets: 5, reps: 10, weight: 20 },
  { day: '2026-05-10', name: 'lat pulldown', sets: 2, reps: 10, weight: 50 },
  { day: '2026-05-10', name: 'inner thigh', sets: 3, reps: 19, weight: 40 },
  { day: '2026-05-10', name: 'outer thigh', sets: 1, reps: 10, weight: 40 },
  { day: '2026-05-10', name: 'crunch', sets: 5, reps: 10, weight: 25 },
  { day: '2026-05-10', name: 'shoulder press', sets: 3, reps: 10, weight: 20 },
  { day: '2026-05-10', name: 'hamstring curl', sets: 3, reps: 10, weight: 7.5 },
  { day: '2026-05-10', name: 'dumbbell bench press', sets: 3, reps: 10, weight: 12.5 },
  { day: '2026-05-10', name: 'preacher curl', sets: 3, reps: 10, weight: 0, bw: true },
]

const SEED_FLAG = 'apex-seed-workout-history-v1'

export function hasSeededWorkoutHistory(): boolean {
  return localStorage.getItem(SEED_FLAG) === '1'
}

export function markWorkoutHistorySeeded(): void {
  localStorage.setItem(SEED_FLAG, '1')
}

let seedMergeStarted = false

/** Call once from provider; guarded against React Strict Mode double effects. */
export function applyWorkoutHistorySeedIfNeeded(
  mergeImport: (p: Partial<AppPersisted>, opts?: { silent?: boolean }) => void,
): void {
  if (typeof window === 'undefined') return
  if (seedMergeStarted || hasSeededWorkoutHistory()) return
  seedMergeStarted = true
  const { setLogs, cardioEntries } = buildSeedWorkoutHistoryPayload()
  mergeImport({ setLogs, cardioEntries }, { silent: true })
  markWorkoutHistorySeeded()
}

/** Build logs + cardio for mergeImport; all weights stored as user lbs (app default lbs). */
export function buildSeedWorkoutHistoryPayload(): {
  setLogs: SetLog[]
  cardioEntries: CardioEntry[]
} {
  const setLogs: SetLog[] = []
  const dayCursor = new Map<string, number>()
  for (const r of ROWS) {
    const key = r.name.toLowerCase().trim()
    const map = N[key]
    if (!map) continue
    const ex = EXERCISE_BY_ID[map.id]
    if (!ex) continue

    const base = dayCursor.get(r.day) ?? new Date(`${r.day}T11:00:00`).getTime()
    const at = base
    dayCursor.set(r.day, base + 120_000)

    const bodyweight = !!r.bw
    const isPr = !!r.pr
    const note = [map.note].filter(Boolean).join(' ')

    const log: WeightedSetLog = {
      kind: 'weighted',
      id: crypto.randomUUID(),
      exerciseId: ex.id,
      exerciseName: ex.name,
      muscleGroup: ex.muscleGroup,
      weight: bodyweight ? null : r.weight,
      bodyweight,
      reps: r.reps,
      sets: r.sets,
      note,
      at,
      isPr,
    }
    setLogs.push(log)
  }

  const cardioEntries: CardioEntry[] = [
    {
      id: crypto.randomUUID(),
      name: '6.64 mile run',
      durationMinutes: null,
      at: new Date('2026-05-07T19:00:00').getTime(),
    },
    {
      id: crypto.randomUUID(),
      name: 'Basketball',
      durationMinutes: 35,
      at: new Date('2026-05-09T08:00:00').getTime(),
    },
  ]

  return { setLogs, cardioEntries }
}
