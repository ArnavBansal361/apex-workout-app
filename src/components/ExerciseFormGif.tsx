import { useEffect, useMemo, useRef, useState } from 'react'
import type { MuscleGroup } from '../types'
import { fetchWgerExerciseMuscles, type WgerExerciseMuscles } from '../lib/wger'
import {
  applyGroupMuscleHighlight,
  applyWgerMuscleHighlights,
} from '../lib/wgerMuscleDiagram'
import { MUSCLE_DIAGRAM_BACK_HTML, MUSCLE_DIAGRAM_FRONT_HTML } from '../lib/muscleDiagramHtml'

type Props = {
  muscleGroup: MuscleGroup
  exerciseName: string
  className?: string
}

export function ExerciseMuscleDiagram({ muscleGroup, exerciseName, className }: Props) {
  const frontHostRef = useRef<HTMLDivElement>(null)
  const backHostRef = useRef<HTMLDivElement>(null)
  const [wger, setWger] = useState<WgerExerciseMuscles | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    setWger(undefined)
    void fetchWgerExerciseMuscles(exerciseName).then((data) => {
      if (!cancelled) setWger(data)
    })
    return () => {
      cancelled = true
    }
  }, [exerciseName])

  const useWger = Boolean(wger?.primary.length || wger?.secondary.length)
  const muscleLabels = useMemo(() => {
    if (!wger || !useWger) return null
    const primary = wger.primary.map((m) => m.nameEn || m.name)
    const secondary = wger.secondary.map((m) => m.nameEn || m.name)
    return { primary, secondary }
  }, [wger, useWger])

  useEffect(() => {
    const hosts = [frontHostRef.current, backHostRef.current].filter(Boolean) as HTMLElement[]
    if (!hosts.length) return
    for (const host of hosts) {
      if (useWger && wger) {
        applyWgerMuscleHighlights(host, wger.primary, wger.secondary)
      } else if (wger !== undefined) {
        applyGroupMuscleHighlight(host, muscleGroup)
      }
    }
  }, [wger, useWger, muscleGroup])

  const loading = wger === undefined

  return (
    <div
      className={`apex-muscle-diagram relative w-full overflow-hidden py-2 ${className ?? ''}`}
      role="img"
      aria-label={`Muscle diagram for ${exerciseName}`}
    >
      {loading ? (
        <div
          className="mb-3 h-[140px] rounded-[12px] bg-white/[0.04] animate-pulse"
          aria-hidden
        />
      ) : null}

      <div
        className={`apex-muscle-diagram-split grid grid-cols-2 gap-2 ${loading ? 'opacity-0 h-0 overflow-hidden' : ''}`}
      >
        <div className="apex-muscle-diagram-split__pane min-w-0">
          <p className="apex-muscle-diagram-split__label">Front</p>
          <div
            ref={frontHostRef}
            className="apex-muscle-diagram-svg w-full h-auto overflow-hidden [&_svg]:block [&_svg]:w-full [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: MUSCLE_DIAGRAM_FRONT_HTML }}
          />
        </div>
        <div className="apex-muscle-diagram-split__pane min-w-0">
          <p className="apex-muscle-diagram-split__label">Back</p>
          <div
            ref={backHostRef}
            className="apex-muscle-diagram-svg w-full h-auto overflow-hidden [&_svg]:block [&_svg]:w-full [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: MUSCLE_DIAGRAM_BACK_HTML }}
          />
        </div>
      </div>

      {useWger && muscleLabels ? (
        <div className="mt-3 space-y-1.5">
          {muscleLabels.primary.length ? (
            <p className="text-[11px] font-medium leading-relaxed">
              <span className="text-[var(--apex-text-tertiary)]">Primary · </span>
              <span className="text-[var(--apex-text-secondary)]">{muscleLabels.primary.join(', ')}</span>
            </p>
          ) : null}
          {muscleLabels.secondary.length ? (
            <p className="text-[11px] font-medium leading-relaxed">
              <span className="text-[var(--apex-text-tertiary)]">Secondary · </span>
              <span className="text-[var(--apex-text-tertiary)]">{muscleLabels.secondary.join(', ')}</span>
            </p>
          ) : null}
        </div>
      ) : wger !== undefined && !useWger ? (
        <p className="mt-2 text-[11px] font-medium uppercase tracking-wider text-[var(--apex-text-tertiary)]">
          {muscleGroup}
        </p>
      ) : null}
    </div>
  )
}
