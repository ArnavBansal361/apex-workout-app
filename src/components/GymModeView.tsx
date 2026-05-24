import { useEffect, useMemo, useState } from 'react'
import type { LastWeightedSetDefaults } from '../lib/lastSession'
import type { Exercise } from '../types'

export type GymModeLogPayload = {
  bodyweight: boolean
  weight: number | null
  reps: number
}

type Props = {
  exercise: Exercise
  unit: 'lbs' | 'kg'
  setsLoggedToday: number
  initialWeighted: LastWeightedSetDefaults | null
  planExerciseIds: string[]
  resolveExercise: (id: string) => Exercise | null | undefined
  onNavigate: (exercise: Exercise) => void
  onExit: () => void
  onSwitchToStandard: () => void
  onLogSet: (payload: GymModeLogPayload) => void
}

function GymStepper({
  label,
  value,
  onChange,
  step,
  min = 0,
  format,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  step: number
  min?: number
  format?: (n: number) => string
}) {
  const display = format ? format(value) : String(value)
  return (
    <div className="apex-gym-stepper">
      <span className="apex-gym-stepper__label">{label}</span>
      <div className="apex-gym-stepper__row">
        <button
          type="button"
          className="apex-gym-stepper__btn"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(Math.max(min, Math.round((value - step) * 100) / 100))}
        >
          −
        </button>
        <span className="apex-gym-stepper__value tabular-nums" aria-live="polite">
          {display}
        </span>
        <button
          type="button"
          className="apex-gym-stepper__btn"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(Math.round((value + step) * 100) / 100)}
        >
          +
        </button>
      </div>
    </div>
  )
}

export function GymModeView({
  exercise,
  unit,
  setsLoggedToday,
  initialWeighted,
  planExerciseIds,
  resolveExercise,
  onNavigate,
  onExit,
  onSwitchToStandard,
  onLogSet,
}: Props) {
  const [bodyweight, setBodyweight] = useState(false)
  const [weight, setWeight] = useState(0)
  const [reps, setReps] = useState(10)

  useEffect(() => {
    if (initialWeighted) {
      setBodyweight(initialWeighted.bodyweight)
      setWeight(
        initialWeighted.bodyweight || initialWeighted.weight == null
          ? 0
          : initialWeighted.weight,
      )
      setReps(initialWeighted.reps)
    } else {
      setBodyweight(false)
      setWeight(0)
      setReps(10)
    }
  }, [exercise.id, initialWeighted])

  const planIndex = planExerciseIds.indexOf(exercise.id)
  const prevId = planIndex > 0 ? planExerciseIds[planIndex - 1] : null
  const nextId =
    planIndex >= 0 && planIndex < planExerciseIds.length - 1
      ? planExerciseIds[planIndex + 1]
      : null
  const prevEx = prevId ? resolveExercise(prevId) : undefined
  const nextEx = nextId ? resolveExercise(nextId) : undefined

  const weightStep = unit === 'kg' ? 2.5 : 5
  const setLabel = useMemo(() => {
    const next = setsLoggedToday + 1
    return `Set ${next}`
  }, [setsLoggedToday])

  function submit() {
    onLogSet({
      bodyweight,
      weight: bodyweight ? null : weight,
      reps: Math.max(0, Math.floor(reps)),
    })
  }

  return (
    <div
      className="apex-gym-mode fixed inset-0 z-[97] flex flex-col bg-[var(--apex-surface-page)] text-[var(--apex-text-primary)]"
      role="dialog"
      aria-modal="true"
      aria-label="Gym mode"
    >
      <header className="apex-gym-mode__header apex-safe-top shrink-0 flex items-center justify-between gap-3 px-4 pt-3 pb-2">
        <button
          type="button"
          className="apex-gym-mode__exit min-h-14 min-w-14 rounded-[14px] border border-[var(--apex-border)] text-[15px] font-medium touch-manipulation"
          onClick={onExit}
        >
          Exit
        </button>
        <p className="text-[15px] font-semibold uppercase tracking-[0.12em] text-[var(--apex-text-secondary)] tabular-nums">
          {setLabel}
        </p>
        <button
          type="button"
          className="apex-gym-mode__exit min-h-14 px-3 rounded-[14px] border border-[var(--apex-border)] text-[13px] font-medium text-[var(--apex-text-secondary)] touch-manipulation"
          onClick={onSwitchToStandard}
        >
          Standard
        </button>
      </header>

      <div className="flex-1 flex flex-col justify-center px-5 pb-6 min-h-0">
        <h1 className="text-center text-[clamp(1.75rem,6vw,2.25rem)] font-bold leading-tight tracking-tight text-[var(--apex-text-primary)] px-2">
          {exercise.name}
        </h1>

        <div className="mt-10 space-y-8 max-w-md mx-auto w-full">
          <label className="flex items-center justify-center gap-4 min-h-14 touch-manipulation">
            <input
              type="checkbox"
              checked={bodyweight}
              onChange={(e) => setBodyweight(e.target.checked)}
              className="apex-checkbox scale-125"
            />
            <span className="text-[17px] font-medium">Bodyweight</span>
          </label>

          {!bodyweight ? (
            <GymStepper
              label={`Weight (${unit})`}
              value={weight}
              onChange={setWeight}
              step={weightStep}
              min={0}
              format={(n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))}
            />
          ) : null}

          <GymStepper label="Reps" value={reps} onChange={setReps} step={1} min={0} />
        </div>
      </div>

      <footer className="apex-safe-bottom shrink-0 px-5 pb-6 pt-2 space-y-4 max-w-md mx-auto w-full">
        {(prevEx || nextEx) && planExerciseIds.length > 1 ? (
          <div className="flex gap-3">
            <button
              type="button"
              disabled={!prevEx}
              className="apex-gym-mode__nav flex-1 min-h-14 rounded-[14px] border border-[var(--apex-border)] text-[15px] font-medium disabled:opacity-30 touch-manipulation"
              onClick={() => prevEx && onNavigate(prevEx)}
            >
              ← Prev
            </button>
            <button
              type="button"
              disabled={!nextEx}
              className="apex-gym-mode__nav flex-1 min-h-14 rounded-[14px] border border-[var(--apex-border)] text-[15px] font-medium disabled:opacity-30 touch-manipulation"
              onClick={() => nextEx && onNavigate(nextEx)}
            >
              Next →
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="apex-gym-mode__log apex-btn-primary w-full min-h-[4.25rem] rounded-[16px] text-[18px] font-bold touch-manipulation active:scale-[0.98]"
          onClick={submit}
        >
          Log set
        </button>
      </footer>
    </div>
  )
}
