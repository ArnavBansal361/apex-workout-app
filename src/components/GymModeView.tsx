import { useEffect, useMemo, useState } from 'react'
import { requestGymCardScreenWakeLock } from '../lib/gymBarcode'
import { formatDuration } from '../lib/timers'
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
  targetSets: number
  elapsedSec: number
  initialWeighted: LastWeightedSetDefaults | null
  editPrefill: LastWeightedSetDefaults | null
  editPrefillVersion: number
  onExitGymMode: () => void
  onEditValues: (current: LastWeightedSetDefaults) => void
  onLogSet: (payload: GymModeLogPayload) => void
}

function formatWeightDisplay(
  bodyweight: boolean,
  weight: number,
  unit: 'lbs' | 'kg',
): { main: string; unitLabel: string | null } {
  if (bodyweight) return { main: 'BW', unitLabel: null }
  const main = Number.isInteger(weight) ? String(weight) : weight.toFixed(1)
  return { main, unitLabel: unit }
}

export function GymModeView({
  exercise,
  unit,
  setsLoggedToday,
  targetSets,
  elapsedSec,
  initialWeighted,
  editPrefill,
  editPrefillVersion,
  onExitGymMode,
  onEditValues,
  onLogSet,
}: Props) {
  const [bodyweight, setBodyweight] = useState(false)
  const [weight, setWeight] = useState(0)
  const [reps, setReps] = useState(10)

  function applyPrefill(prefill: LastWeightedSetDefaults | null) {
    if (prefill) {
      setBodyweight(prefill.bodyweight)
      setWeight(
        prefill.bodyweight || prefill.weight == null ? 0 : prefill.weight,
      )
      setReps(prefill.reps)
    } else {
      setBodyweight(false)
      setWeight(0)
      setReps(10)
    }
  }

  useEffect(() => {
    applyPrefill(initialWeighted)
  }, [exercise.id, initialWeighted])

  useEffect(() => {
    if (editPrefill) applyPrefill(editPrefill)
  }, [editPrefillVersion, editPrefill])

  useEffect(() => {
    let releaseWake = () => {}
    void requestGymCardScreenWakeLock().then((release) => {
      releaseWake = release
    })
    return () => {
      releaseWake()
    }
  }, [])

  const setNumber = Math.min(targetSets, setsLoggedToday + 1)
  const setCaption = useMemo(
    () => `SET ${setNumber} OF ${targetSets}`,
    [setNumber, targetSets],
  )

  const weightDisplay = formatWeightDisplay(bodyweight, weight, unit)

  function submit() {
    onLogSet({
      bodyweight,
      weight: bodyweight ? null : weight,
      reps: Math.max(0, Math.floor(reps)),
    })
  }

  function openEditor() {
    onEditValues({
      bodyweight,
      weight: bodyweight ? null : weight,
      reps,
      sets: 1,
    })
  }

  return (
    <div
      className="apex-gym-mode fixed inset-0 z-[97] flex flex-col bg-[#090d14] text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Gym mode"
    >
      <header className="apex-gym-mode__top apex-safe-top shrink-0 flex items-center justify-between px-4 pt-2 pb-3">
        <button
          type="button"
          className="apex-gym-mode__top-btn"
          onClick={onExitGymMode}
        >
          ‹ Exit gym mode
        </button>
        <p className="apex-gym-mode__top-btn tabular-nums">{formatDuration(elapsedSec)}</p>
      </header>

      <div className="apex-gym-mode__center flex-1 flex flex-col items-center justify-center px-5 min-h-0">
        <h1 className="apex-gym-mode__exercise-name">{exercise.name}</h1>
        <p className="apex-gym-mode__set-label">{setCaption}</p>

        <div className="apex-gym-mode__numbers mt-8 flex items-baseline justify-center gap-3 flex-wrap">
          <button
            type="button"
            className="apex-gym-mode__num-group"
            onClick={openEditor}
            aria-label="Edit weight"
          >
            <span className="apex-gym-mode__num-value tabular-nums">{weightDisplay.main}</span>
            {weightDisplay.unitLabel ? (
              <span className="apex-gym-mode__num-unit">{weightDisplay.unitLabel}</span>
            ) : null}
          </button>
          <span className="apex-gym-mode__num-dot" aria-hidden>
            ·
          </span>
          <button
            type="button"
            className="apex-gym-mode__num-group"
            onClick={openEditor}
            aria-label="Edit reps"
          >
            <span className="apex-gym-mode__num-value tabular-nums">{reps}</span>
            <span className="apex-gym-mode__num-unit">reps</span>
          </button>
        </div>
      </div>

      <footer className="apex-gym-mode__footer apex-safe-bottom shrink-0 px-4 pt-2">
        <button type="button" className="apex-gym-mode__log-btn" onClick={submit}>
          Log set
        </button>
      </footer>
    </div>
  )
}
