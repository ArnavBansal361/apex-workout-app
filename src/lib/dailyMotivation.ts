const DAY_PREFIX = 'apex-daily-motivation-day:'
const HISTORY_KEY = 'apex-daily-motivation-history'
const MAX_HISTORY = 7

export type DailyMotivationHistoryEntry = {
  dateKey: string
  text: string
}

function dayStorageKey(dateKey: string): string {
  return `${DAY_PREFIX}${dateKey}`
}

export function readDailyMotivationForDay(dateKey: string): string | null {
  try {
    const raw = localStorage.getItem(dayStorageKey(dateKey))
    return raw?.trim() ? raw.trim() : null
  } catch {
    return null
  }
}

function readMotivationHistory(): DailyMotivationHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: DailyMotivationHistoryEntry[] = []
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue
      const e = row as Partial<DailyMotivationHistoryEntry>
      if (typeof e.dateKey !== 'string' || typeof e.text !== 'string') continue
      const text = e.text.trim()
      if (!text) continue
      out.push({ dateKey: e.dateKey, text })
    }
    return out
  } catch {
    return []
  }
}

function writeMotivationHistory(entries: DailyMotivationHistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)))
  } catch {
    /* ignore quota / private mode */
  }
}

/** Up to 7 prior motivation lines (newest first), excluding `excludeDateKey`. */
export function readRecentDailyMotivationTexts(excludeDateKey?: string): string[] {
  return readMotivationHistory()
    .filter((e) => e.dateKey !== excludeDateKey)
    .slice(0, MAX_HISTORY)
    .map((e) => e.text)
}

export function writeDailyMotivationForDay(dateKey: string, text: string): void {
  const trimmed = text.trim()
  if (!trimmed) return
  try {
    localStorage.setItem(dayStorageKey(dateKey), trimmed)
  } catch {
    /* ignore */
  }
  const history = readMotivationHistory().filter((e) => e.dateKey !== dateKey)
  history.unshift({ dateKey, text: trimmed })
  writeMotivationHistory(history)
}

/** One-time migration from legacy sessionStorage cache for the same day. */
export function migrateDailyMotivationFromSession(dateKey: string): string | null {
  try {
    const legacyKey = `apex-daily-motivation-${dateKey}`
    const raw = sessionStorage.getItem(legacyKey)
    if (!raw?.trim()) return null
    const text = raw.trim()
    writeDailyMotivationForDay(dateKey, text)
    sessionStorage.removeItem(legacyKey)
    return text
  } catch {
    return null
  }
}
