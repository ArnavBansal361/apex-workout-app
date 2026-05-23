import { useEffect, useMemo, useRef } from 'react'
import type { MuscleGroup } from '../types'
import muscleDiagramSvg from '/muscle-diagram.svg?raw'

type Props = {
  muscleGroup: MuscleGroup
  exerciseName: string
  className?: string
}

const MUSCLE_CLASSES = [
  'muscle-chest',
  'muscle-shoulders',
  'muscle-back',
  'muscle-arms',
  'muscle-core',
  'muscle-legs',
] as const

type MuscleClass = (typeof MUSCLE_CLASSES)[number]

function muscleClassForGroup(muscleGroup: MuscleGroup): MuscleClass | 'all' {
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
    case 'Cardio':
    case 'Stretches':
      return 'all'
    default:
      return 'all'
  }
}

/** Inline SVG from public/muscle-diagram.svg — keep viewBox for scaling. */
const MUSCLE_DIAGRAM_HTML = muscleDiagramSvg
  .replace(/<svg[^>]*>/, '<svg viewBox="0 0 680 520" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">')
  .replace(/\s*width="100%"/, '')
  .trim()

const ACTIVE_FILL = 'rgba(255,255,255,0.55)'
const ACTIVE_STROKE = 'rgba(255,255,255,0.95)'
const REST_FILL = 'rgba(255,255,255,0.08)'
const REST_STROKE = 'rgba(255,255,255,0.2)'

function applyMuscleHighlights(root: HTMLElement, activeClass: MuscleClass | 'all') {
  for (const cls of MUSCLE_CLASSES) {
    const highlighted = activeClass === 'all' || activeClass === cls
    root.querySelectorAll<SVGElement>(`.${cls}`).forEach((el) => {
      if (highlighted) {
        el.classList.add('active')
        el.setAttribute('fill', ACTIVE_FILL)
        el.setAttribute('stroke', ACTIVE_STROKE)
        el.setAttribute('stroke-width', '1.5')
      } else {
        el.classList.remove('active')
        el.setAttribute('fill', REST_FILL)
        el.setAttribute('stroke', REST_STROKE)
        el.setAttribute('stroke-width', '0.8')
      }
    })
  }
}

export function ExerciseMuscleDiagram({ muscleGroup, exerciseName, className }: Props) {
  const activeClass = useMemo(() => muscleClassForGroup(muscleGroup), [muscleGroup])
  const svgHostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = svgHostRef.current
    if (!host) return
    applyMuscleHighlights(host, activeClass)
  }, [activeClass])

  return (
    <div
      className={`apex-muscle-diagram relative w-full overflow-hidden py-2 ${className ?? ''}`}
      role="img"
      aria-label={`Muscle diagram highlighting ${muscleGroup} for ${exerciseName}`}
    >
      <div
        ref={svgHostRef}
        className="apex-muscle-diagram-svg w-full h-auto max-h-[300px] overflow-hidden [&_svg]:block [&_svg]:w-full [&_svg]:h-auto [&_svg]:max-h-[300px]"
        dangerouslySetInnerHTML={{ __html: MUSCLE_DIAGRAM_HTML }}
      />
    </div>
  )
}
