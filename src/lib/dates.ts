/** Always read the real current moment (do not cache dates app-wide). */
export function getNow(): Date {
  return new Date()
}

export function todayDateKey(now: Date = getNow()): string {
  return dateKey(now)
}

/** e.g. "Today is Wednesday, May 21, 2026" */
export function formatCoachTodayLine(now: Date = getNow()): string {
  return `Today is ${now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })}.`
}

/** Monday-first week grid column: 0 = Mon … 6 = Sun. */
export function mondayFirstColumnIndex(d: Date = getNow()): number {
  const day = d.getDay()
  return day === 0 ? 6 : day - 1
}

export function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Monday 00:00 local of the week containing `d` */
export function weekStartMonday(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = c.getDay()
  const diff = day === 0 ? -6 : 1 - day
  c.setDate(c.getDate() + diff)
  c.setHours(0, 0, 0, 0)
  return c
}

export function weekDatesFromStart(start: Date): string[] {
  const keys: string[] = []
  for (let i = 0; i < 7; i++) {
    const x = new Date(start)
    x.setDate(start.getDate() + i)
    keys.push(dateKey(x))
  }
  return keys
}

export function formatLong(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatShortWeekday(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short' })
}

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function isSameLocalDay(a: number, b: Date): boolean {
  return dateKey(new Date(a)) === dateKey(b)
}
