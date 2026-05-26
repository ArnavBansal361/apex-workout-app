import type { MuscleGroup } from '../types'
import type { WgerMuscleRef } from './wger'

const MUSCLE_CLASSES = [
  'muscle-chest',
  'muscle-shoulders',
  'muscle-back',
  'muscle-arms',
  'muscle-core',
  'muscle-legs',
] as const

export type MuscleClass = (typeof MUSCLE_CLASSES)[number]

/** wger.de muscle id → diagram path class(es). */
const WGER_ID_TO_CLASSES: Record<number, MuscleClass[]> = {
  1: ['muscle-arms'],
  2: ['muscle-shoulders'],
  3: ['muscle-chest'],
  4: ['muscle-chest'],
  5: ['muscle-arms'],
  6: ['muscle-core'],
  7: ['muscle-legs'],
  8: ['muscle-legs'],
  9: ['muscle-back'],
  10: ['muscle-legs'],
  11: ['muscle-legs'],
  12: ['muscle-back'],
  13: ['muscle-arms'],
  14: ['muscle-core'],
  15: ['muscle-legs'],
}

export const PRIMARY_FILL = '#3d7ab5'
export const PRIMARY_STROKE = '#5a94c9'
export const SECONDARY_FILL = 'rgba(255,255,255,0.2)'
export const SECONDARY_STROKE = 'rgba(255,255,255,0.28)'
export const REST_FILL = 'rgba(255,255,255,0.06)'
export const REST_STROKE = 'rgba(255,255,255,0.12)'

const FRONT_CENTER_X_MAX = 340

export function muscleClassForGroup(muscleGroup: MuscleGroup): MuscleClass | 'all' {
  switch (muscleGroup) {
    case 'Chest':
      return 'muscle-chest'
    case 'Shoulders':
      return 'muscle-shoulders'
    case 'Back':
      return 'muscle-back'
    case 'Arms':
      return 'muscle-arms'
    case 'Core':
      return 'muscle-core'
    case 'Legs':
      return 'muscle-legs'
    default:
      return 'all'
  }
}

function classesForWgerMuscle(m: WgerMuscleRef): MuscleClass[] {
  return WGER_ID_TO_CLASSES[m.id] ?? []
}

function elementSide(el: SVGElement): 'front' | 'back' {
  try {
    const box = (el as SVGGraphicsElement).getBBox()
    const cx = box.x + box.width / 2
    return cx < FRONT_CENTER_X_MAX ? 'front' : 'back'
  } catch {
    return 'front'
  }
}

function sideMatches(muscle: WgerMuscleRef, el: SVGElement): boolean {
  const side = elementSide(el)
  return muscle.isFront ? side === 'front' : side === 'back'
}

type HighlightLevel = 'primary' | 'secondary' | 'rest'

function styleForLevel(level: HighlightLevel): { fill: string; stroke: string; strokeWidth: string } {
  switch (level) {
    case 'primary':
      return { fill: PRIMARY_FILL, stroke: PRIMARY_STROKE, strokeWidth: '1.5' }
    case 'secondary':
      return { fill: SECONDARY_FILL, stroke: SECONDARY_STROKE, strokeWidth: '1' }
    default:
      return { fill: REST_FILL, stroke: REST_STROKE, strokeWidth: '0.8' }
  }
}

function applyStyle(el: SVGElement, level: HighlightLevel) {
  const s = styleForLevel(level)
  el.classList.toggle('active', level !== 'rest')
  el.setAttribute('fill', s.fill)
  el.setAttribute('stroke', s.stroke)
  el.setAttribute('stroke-width', s.strokeWidth)
}

function levelRank(level: HighlightLevel): number {
  if (level === 'primary') return 2
  if (level === 'secondary') return 1
  return 0
}

/** Apply wger primary/secondary highlights on the inline muscle diagram SVG. */
export function applyWgerMuscleHighlights(
  root: HTMLElement,
  primary: WgerMuscleRef[],
  secondary: WgerMuscleRef[],
): void {
  const levels = new Map<SVGElement, HighlightLevel>()

  for (const cls of MUSCLE_CLASSES) {
    root.querySelectorAll<SVGElement>(`.${cls}`).forEach((el) => {
      levels.set(el, 'rest')
    })
  }

  const applyMuscle = (m: WgerMuscleRef, level: 'primary' | 'secondary') => {
    for (const cls of classesForWgerMuscle(m)) {
      root.querySelectorAll<SVGElement>(`.${cls}`).forEach((el) => {
        if (!sideMatches(m, el)) return
        const prev = levels.get(el) ?? 'rest'
        if (levelRank(level) > levelRank(prev)) levels.set(el, level)
      })
    }
  }

  for (const m of secondary) applyMuscle(m, 'secondary')
  for (const m of primary) applyMuscle(m, 'primary')

  for (const [el, level] of levels) applyStyle(el, level)
}

/** Fallback: single Apex muscle group as primary highlight. */
export function applyGroupMuscleHighlight(root: HTMLElement, muscleGroup: MuscleGroup): void {
  const activeClass = muscleClassForGroup(muscleGroup)
  for (const cls of MUSCLE_CLASSES) {
    root.querySelectorAll<SVGElement>(`.${cls}`).forEach((el) => {
      const highlighted = activeClass === 'all' || activeClass === cls
      applyStyle(el, highlighted ? 'primary' : 'rest')
    })
  }
}
