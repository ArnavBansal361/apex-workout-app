import { useEffect, useRef } from 'react'
import { MUSCLE_DIAGRAM_BACK_HTML, MUSCLE_DIAGRAM_FRONT_HTML } from '../lib/muscleDiagramHtml'
import { applyGroupMuscleHighlight } from '../lib/wgerMuscleDiagram'
import type { MuscleGroup } from '../types'

const TARGET_LABELS: Partial<
  Record<MuscleGroup, { front: string; back: string }>
> = {
  Chest: { front: 'Pectorals', back: '—' },
  Back: { front: '—', back: 'Lats & traps' },
  Legs: { front: 'Quads', back: 'Glutes & hams' },
  Shoulders: { front: 'Delts', back: 'Rear delts' },
  Arms: { front: 'Biceps', back: 'Triceps' },
  Core: { front: 'Abs & obliques', back: '—' },
  Stretches: { front: 'Full body', back: 'Full body' },
  Cardio: { front: '—', back: '—' },
}

type Props = {
  muscleGroup: MuscleGroup
}

export function MuscleGroupTargetingCard({ muscleGroup }: Props) {
  const frontRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLDivElement>(null)
  const labels = TARGET_LABELS[muscleGroup] ?? { front: '—', back: '—' }

  useEffect(() => {
    for (const host of [frontRef.current, backRef.current].filter(Boolean) as HTMLElement[]) {
      applyGroupMuscleHighlight(host, muscleGroup)
    }
  }, [muscleGroup])

  return (
    <div className="apex-library-target-card">
      <p className="apex-library-target-card__eyebrow">Targeting</p>
      <h2 className="apex-library-target-card__title">{muscleGroup}</h2>
      <div className="apex-library-target-card__diagrams">
        <div className="apex-library-target-card__pane">
          <div
            ref={frontRef}
            className="apex-muscle-diagram-svg w-full [&_svg]:block [&_svg]:w-full [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: MUSCLE_DIAGRAM_FRONT_HTML }}
          />
          <p className="apex-library-target-card__side-label">
            <span className="apex-library-target-card__side-key">Front</span>
            <span className="apex-library-target-card__side-val">/ {labels.front}</span>
          </p>
        </div>
        <div className="apex-library-target-card__pane">
          <div
            ref={backRef}
            className="apex-muscle-diagram-svg w-full [&_svg]:block [&_svg]:w-full [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: MUSCLE_DIAGRAM_BACK_HTML }}
          />
          <p className="apex-library-target-card__side-label">
            <span className="apex-library-target-card__side-key">Back</span>
            <span className="apex-library-target-card__side-val">/ {labels.back}</span>
          </p>
        </div>
      </div>
    </div>
  )
}
