const WGER_BASE = 'https://wger.de/api/v2'
const ENGLISH_LANGUAGE = 2
const CACHE_PREFIX = 'apex-wger-exercise:'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type WgerMuscleRef = {
  id: number
  name: string
  nameEn: string
  isFront: boolean
}

export type WgerExerciseMuscles = {
  exerciseId: number
  matchedName: string
  primary: WgerMuscleRef[]
  secondary: WgerMuscleRef[]
}

type WgerMuscleApi = {
  id: number
  name: string
  name_en?: string
  is_front: boolean
}

type WgerExerciseInfo = {
  id: number
  muscles: WgerMuscleApi[]
  muscles_secondary: WgerMuscleApi[]
  translations?: {
    name: string
    aliases?: { alias: string }[]
  }[]
}

type WgerTranslationResult = {
  name: string
  exercise: number
}

type CacheEntry = {
  at: number
  data: WgerExerciseMuscles | null
}

const memoryCache = new Map<string, WgerExerciseMuscles | null>()

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function mapMuscle(m: WgerMuscleApi): WgerMuscleRef {
  return {
    id: m.id,
    name: m.name,
    nameEn: (m.name_en || m.name).trim(),
    isFront: m.is_front,
  }
}

function parseExerciseInfo(row: WgerExerciseInfo, matchedName: string): WgerExerciseMuscles {
  return {
    exerciseId: row.id,
    matchedName,
    primary: (row.muscles ?? []).map(mapMuscle),
    secondary: (row.muscles_secondary ?? []).map(mapMuscle),
  }
}

function readCache(key: string): WgerExerciseMuscles | null | undefined {
  const mem = memoryCache.get(key)
  if (mem !== undefined) return mem
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as CacheEntry
    if (Date.now() - parsed.at > CACHE_TTL_MS) {
      localStorage.removeItem(`${CACHE_PREFIX}${key}`)
      return undefined
    }
    memoryCache.set(key, parsed.data)
    return parsed.data
  } catch {
    return undefined
  }
}

function writeCache(key: string, data: WgerExerciseMuscles | null): void {
  memoryCache.set(key, data)
  try {
    const entry: CacheEntry = { at: Date.now(), data }
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry))
  } catch {
    /* ignore quota */
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`wger ${res.status}`)
  return res.json() as Promise<T>
}

async function fetchExerciseInfoById(id: number): Promise<WgerExerciseInfo | null> {
  try {
    return await fetchJson<WgerExerciseInfo>(`${WGER_BASE}/exerciseinfo/${id}/`)
  } catch {
    return null
  }
}

async function fetchByTranslationName(name: string): Promise<WgerExerciseMuscles | null> {
  const params = new URLSearchParams({
    language: String(ENGLISH_LANGUAGE),
    name,
  })
  const data = await fetchJson<{ results: WgerTranslationResult[] }>(
    `${WGER_BASE}/exercise-translation/?${params}`,
  )
  const hit = data.results?.[0]
  if (!hit?.exercise) return null
  const info = await fetchExerciseInfoById(hit.exercise)
  if (!info) return null
  return parseExerciseInfo(info, hit.name)
}

function matchScore(queryNorm: string, candidate: string): number {
  const c = normalizeName(candidate)
  if (!c) return 0
  if (c === queryNorm) return 100
  if (c.startsWith(queryNorm) || queryNorm.startsWith(c)) return 85
  if (c.includes(queryNorm) || queryNorm.includes(c)) return 70
  const qTokens = new Set(queryNorm.split(' ').filter(Boolean))
  const cTokens = c.split(' ').filter(Boolean)
  if (!qTokens.size || !cTokens.length) return 0
  let shared = 0
  for (const t of cTokens) if (qTokens.has(t)) shared++
  return Math.round((shared / Math.max(qTokens.size, cTokens.length)) * 60)
}

async function fetchBySearch(name: string): Promise<WgerExerciseMuscles | null> {
  const queryNorm = normalizeName(name)
  const params = new URLSearchParams({
    language: String(ENGLISH_LANGUAGE),
    limit: '40',
    search: name,
  })
  const data = await fetchJson<{ results: WgerExerciseInfo[] }>(
    `${WGER_BASE}/exerciseinfo/?${params}`,
  )
  let best: { score: number; info: WgerExerciseInfo; label: string } | null = null
  for (const row of data.results ?? []) {
    for (const tr of row.translations ?? []) {
      const labels = [tr.name, ...(tr.aliases?.map((a) => a.alias) ?? [])]
      for (const label of labels) {
        const score = matchScore(queryNorm, label)
        if (score < 72) continue
        if (!best || score > best.score) {
          best = { score, info: row, label: tr.name }
        }
      }
    }
  }
  if (!best) return null
  return parseExerciseInfo(best.info, best.label)
}

/** Resolve primary/secondary muscles for an exercise name via wger.de (cached). */
export async function fetchWgerExerciseMuscles(
  exerciseName: string,
): Promise<WgerExerciseMuscles | null> {
  const key = normalizeName(exerciseName)
  if (!key) return null

  const cached = readCache(key)
  if (cached !== undefined) return cached

  let result: WgerExerciseMuscles | null = null
  try {
    result = await fetchByTranslationName(exerciseName.trim())
    if (!result) result = await fetchBySearch(exerciseName.trim())
  } catch {
    result = null
  }

  writeCache(key, result)
  return result
}
