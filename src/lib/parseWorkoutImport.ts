import { EXERCISE_BY_ID, EXERCISES } from '../data/exercises'
import { parseDateKey } from './dates'
import { normalizeImportedCardio } from './persist'
import type { AppPersisted, Exercise, MuscleGroup, SetLog, WeightedSetLog } from '../types'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function normalizeNameKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/** Common free-text aliases → built-in exercise ids. */
const EXERCISE_ALIASES: Record<string, string> = {
  bench: 'bench-press',
  'bench press': 'bench-press',
  'barbell bench': 'bench-press',
  'barbell bench press': 'bench-press',
  squat: 'squat',
  squats: 'squat',
  deadlift: 'deadlift',
  deadlifts: 'deadlift',
  'lat pulldown': 'lat-pulldown',
  'lat pulldowns': 'lat-pulldown',
  'shoulder press': 'shoulder-press',
  'ohp': 'shoulder-press',
  'overhead press': 'shoulder-press',
  curls: 'dumbbell-curl',
  curl: 'dumbbell-curl',
  'dumbbell curl': 'dumbbell-curl',
  'dumbbell curls': 'dumbbell-curl',
  rows: 'rows',
  'cable row': 'seated-cable-row',
  'seated row': 'seated-cable-row',
}

const MUSCLE_GROUPS = new Set<MuscleGroup>([
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
  'Cardio',
  'Stretches',
])

function coerceMuscleGroup(raw: unknown, fallback: MuscleGroup): MuscleGroup {
  if (typeof raw === 'string' && MUSCLE_GROUPS.has(raw as MuscleGroup)) {
    return raw as MuscleGroup
  }
  if (raw === 'Flexibility') return 'Stretches'
  return fallback
}

export function resolveImportExercise(
  exerciseId: string | undefined,
  exerciseName: string | undefined,
  customExercises: AppPersisted['customExercises'],
): Exercise | null {
  const customs = customExercises ?? []

  if (exerciseId?.trim()) {
    const id = exerciseId.trim()
    const byId = EXERCISE_BY_ID[id] ?? EXERCISE_BY_ID[slugify(id)]
    if (byId) return byId
    const custom = customs.find((c) => c.id === id || slugify(c.name) === slugify(id))
    if (custom) {
      return {
        id: custom.id,
        name: custom.name,
        muscleGroup: custom.muscleGroup,
        equipment: custom.equipment,
      }
    }
  }

  const nameKey = normalizeNameKey(exerciseName || exerciseId || '')
  if (!nameKey) return null

  const aliasId = EXERCISE_ALIASES[nameKey]
  if (aliasId && EXERCISE_BY_ID[aliasId]) return EXERCISE_BY_ID[aliasId]

  for (const e of EXERCISES) {
    if (normalizeNameKey(e.name) === nameKey || slugify(e.name) === slugify(nameKey)) return e
  }
  for (const c of customs) {
    if (normalizeNameKey(c.name) === nameKey) {
      return {
        id: c.id,
        name: c.name,
        muscleGroup: c.muscleGroup,
        equipment: c.equipment,
      }
    }
  }

  let best: Exercise | null = null
  let bestLen = 0
  for (const e of EXERCISES) {
    const en = normalizeNameKey(e.name)
    if (nameKey.includes(en) || en.includes(nameKey)) {
      if (en.length > bestLen) {
        best = e
        bestLen = en.length
      }
    }
  }
  return best
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/** YYYY-MM-DD → local noon ms (noon avoids DST-edge day shifts). */
function dateStringToLocalNoonMs(date: string): number | null {
  if (!DATE_KEY_RE.test(date)) return null
  const d = parseDateKey(date)
  if (Number.isNaN(d.getTime())) return null
  d.setHours(12, 0, 0, 0)
  return d.getTime()
}

function coerceTimestamp(raw: unknown, defaultAtMs: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return defaultAtMs
  let at = raw < 1e11 ? raw * 1000 : raw
  // Exact UTC midnight is the signature of a model doing date→epoch math.
  // Re-anchor to local noon of that UTC calendar date so it groups under the intended day.
  if (at % 86_400_000 === 0) {
    const utc = new Date(at)
    const local = new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), 12)
    at = local.getTime()
  }
  // reject absurd future dates (> 1 day ahead) but allow any past date
  if (at > defaultAtMs + 86_400_000) return defaultAtMs
  return at
}

/** Prefer an explicit "date" (YYYY-MM-DD) field; fall back to numeric "at". */
function resolveRowTimestamp(row: Record<string, unknown>, defaultAtMs: number): number {
  if (typeof row.date === 'string') {
    const fromDate = dateStringToLocalNoonMs(row.date.trim())
    if (fromDate != null && fromDate <= defaultAtMs + 86_400_000) return fromDate
  }
  return coerceTimestamp(row.at, defaultAtMs)
}

export type NormalizeImportedSetLogsOptions = {
  customExercises: AppPersisted['customExercises']
  atMs?: number
}

/** Turn AI or local parse rows into valid set logs stamped for today. */
export function normalizeImportedSetLogs(
  raw: unknown,
  opts: NormalizeImportedSetLogsOptions,
): SetLog[] {
  if (!Array.isArray(raw)) return []
  const defaultAtMs = opts.atMs ?? Date.now()
  const out: SetLog[] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const resolved = resolveImportExercise(
      typeof row.exerciseId === 'string' ? row.exerciseId : undefined,
      typeof row.exerciseName === 'string' ? row.exerciseName : undefined,
      opts.customExercises,
    )
    if (!resolved) continue

    const at = resolveRowTimestamp(row, defaultAtMs)
    const note = typeof row.note === 'string' ? row.note.trim() : ''
    const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : crypto.randomUUID()
    const muscleGroup = coerceMuscleGroup(row.muscleGroup, resolved.muscleGroup)

    if (row.kind === 'timed') {
      const durationSec = Math.round(Number(row.durationSec ?? row.duration ?? 0))
      if (!Number.isFinite(durationSec) || durationSec <= 0) continue
      out.push({
        kind: 'timed',
        id,
        exerciseId: resolved.id,
        exerciseName: resolved.name,
        muscleGroup,
        durationSec,
        note,
        at,
        isPr: false,
      })
      continue
    }

    const bodyweight = row.bodyweight === true
    let weight: number | null = row.weight != null ? Number(row.weight) : null
    if (bodyweight) {
      weight = null
    } else if (weight == null || !Number.isFinite(weight)) {
      weight = 0
    }

    let reps = Math.round(Number(row.reps ?? 0))
    let sets = Math.round(Number(row.sets ?? row.setCount ?? row.set ?? 1))
    if (!Number.isFinite(reps) || reps <= 0) reps = 1
    if (!Number.isFinite(sets) || sets <= 0) sets = 1

    out.push({
      kind: 'weighted',
      id,
      exerciseId: resolved.id,
      exerciseName: resolved.name,
      muscleGroup,
      weight,
      bodyweight,
      reps,
      sets,
      note,
      at,
      isPr: false,
    } satisfies WeightedSetLog)
  }

  return out
}

type LocalParseOpts = NormalizeImportedSetLogsOptions

function pushWeightedDraft(
  drafts: Record<string, unknown>[],
  sets: number,
  reps: number,
  exerciseName: string,
  weight: number | null,
  bodyweight = false,
) {
  drafts.push({
    kind: 'weighted',
    exerciseName: exerciseName.trim(),
    sets,
    reps,
    weight,
    bodyweight,
  })
}

/** Regex parser for common note formats when AI is unavailable or returns empty. */
export function parseWorkoutTextLocally(
  text: string,
  opts: LocalParseOpts,
): Partial<Pick<AppPersisted, 'setLogs'>> {
  const drafts: Record<string, unknown>[] = []
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)

  for (const line of lines) {
    const setsOf = line.match(
      /^(\d+)\s*sets?\s+of\s+(\d+)\s+(.+?)\s+at\s+(\d+(?:\.\d+)?)\s*(lbs?|pounds?|kg)?\s*$/i,
    )
    if (setsOf) {
      pushWeightedDraft(
        drafts,
        Number(setsOf[1]),
        Number(setsOf[2]),
        setsOf[3],
        Number(setsOf[4]),
      )
      continue
    }

    const setsOfBw = line.match(/^(\d+)\s*sets?\s+of\s+(\d+)\s+(.+?)\s+(bw|bodyweight)\s*$/i)
    if (setsOfBw) {
      pushWeightedDraft(drafts, Number(setsOfBw[1]), Number(setsOfBw[2]), setsOfBw[3], null, true)
      continue
    }

    const xAt = line.match(
      /^(\d+)\s*[x×]\s*(\d+)\s+(.+?)\s+@?\s*(\d+(?:\.\d+)?)\s*(lbs?|pounds?|kg)?\s*$/i,
    )
    if (xAt) {
      pushWeightedDraft(drafts, Number(xAt[1]), Number(xAt[2]), xAt[3], Number(xAt[4]))
      continue
    }

    const xOnly = line.match(/^(\d+)\s*[x×]\s*(\d+)\s+(.+?)\s*$/i)
    if (xOnly) {
      pushWeightedDraft(drafts, Number(xOnly[1]), Number(xOnly[2]), xOnly[3], null, true)
      continue
    }

    const nameFirst = line.match(
      /^(.+?)\s+(\d+)\s*[x×]\s*(\d+)(?:\s+@?\s*(\d+(?:\.\d+)?)\s*(lbs?|pounds?|kg)?)?\s*$/i,
    )
    if (nameFirst) {
      const w = nameFirst[4] != null ? Number(nameFirst[4]) : null
      pushWeightedDraft(
        drafts,
        Number(nameFirst[2]),
        Number(nameFirst[3]),
        nameFirst[1],
        w,
        w == null,
      )
    }
  }

  const setLogs = normalizeImportedSetLogs(drafts, opts)
  return setLogs.length ? { setLogs } : {}
}

export function sanitizeWorkoutImport(
  raw: unknown,
  state: AppPersisted,
): Partial<AppPersisted> {
  if (!raw || typeof raw !== 'object') return {}
  const o = raw as Record<string, unknown>
  const out: Partial<AppPersisted> = {}
  const atMs = Date.now()

  if (Array.isArray(o.setLogs)) {
    out.setLogs = normalizeImportedSetLogs(o.setLogs, {
      customExercises: state.customExercises,
      atMs,
    })
  }
  if (Array.isArray(o.bodyweightLogs)) {
    const bw = o.bodyweightLogs as AppPersisted['bodyweightLogs']
    out.bodyweightLogs = bw.map((b) =>
      b.id ? b : { ...b, id: crypto.randomUUID() },
    )
  }
  if (Array.isArray(o.cardioEntries) && o.cardioEntries.length) {
    const withDates = o.cardioEntries.map((item) => {
      if (!item || typeof item !== 'object') return item
      const row = item as Record<string, unknown>
      return { ...row, at: resolveRowTimestamp(row, atMs) }
    })
    out.cardioEntries = normalizeImportedCardio(withDates).map((c) => ({
      ...c,
      at: coerceTimestamp(c.at, atMs),
    }))
  }
  if (Array.isArray(o.schedule) && o.schedule.length) {
    out.schedule = (o.schedule as AppPersisted['schedule']).map((d) => ({
      ...d,
      plannedExerciseIds: d.plannedExerciseIds ?? [],
    }))
  }
  return out
}
