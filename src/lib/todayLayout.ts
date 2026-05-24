import type { TodayLayoutPersist, TodaySectionId } from '../types'

export const ALL_TODAY_SECTION_IDS: TodaySectionId[] = [
  'daily-motivation',
  'spotify-player',
  'weekly-volume',
  'muscle-balance',
  'gym-tracker',
  'cardio-tracker',
  'water-tracker',
  'sleep-tracker',
  'nutrition-tracker',
  'my-plan',
  'todays-log',
]

export const TODAY_SECTION_LABELS: Record<TodaySectionId, string> = {
  'daily-motivation': 'Daily motivation',
  'spotify-player': 'Spotify',
  'weekly-volume': 'Weekly volume',
  'muscle-balance': 'Muscle balance',
  'gym-tracker': 'Gym tracker',
  'cardio-tracker': 'Cardio tracker',
  'water-tracker': 'Water',
  'sleep-tracker': 'Sleep',
  'nutrition-tracker': 'Nutrition',
  'my-plan': 'My plan',
  'todays-log': "Today's log",
}

export const DEFAULT_TODAY_LAYOUT: TodayLayoutPersist = {
  order: [...ALL_TODAY_SECTION_IDS],
  hidden: [],
}

function isSectionId(x: string): x is TodaySectionId {
  return (ALL_TODAY_SECTION_IDS as string[]).includes(x)
}

export function normalizeTodayLayout(raw: unknown): TodayLayoutPersist {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TODAY_LAYOUT }
  const o = raw as Partial<TodayLayoutPersist>
  const hiddenIn = Array.isArray(o.hidden) ? o.hidden.filter((x): x is TodaySectionId => typeof x === 'string' && isSectionId(x)) : []
  const hidden = [...new Set(hiddenIn)]
  let order = Array.isArray(o.order)
    ? o.order.filter((x): x is TodaySectionId => typeof x === 'string' && isSectionId(x))
    : []
  for (const id of ALL_TODAY_SECTION_IDS) {
    if (!order.includes(id)) order.push(id)
  }
  order = order.filter((id, i) => order.indexOf(id) === i)
  for (const id of ALL_TODAY_SECTION_IDS) {
    if (!order.includes(id)) order.push(id)
  }
  return { order, hidden }
}
