import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Exercise, SetLog } from '../types'
import { formatDuration } from '../lib/timers'
import {
  exerciseRowStatus,
  formatLastCompactLine,
  pickActiveExerciseId,
  readWorkoutSwipeHintDismissed,
  setsLoggedTodayForExercise,
  targetSetsForExercise,
  writeWorkoutSwipeHintDismissed,
} from '../lib/gymMode'

type ExerciseRowProps = {
  ex: Exercise
  setsDone: number
  targetSets: number
  status: 'pending' | 'active' | 'complete'
  lastLine: string | null
  showSwipeHint: boolean
  onDismissSwipeHint: () => void
  onSwipeLog: () => void
  onOpenDetail: () => void
  onSelect: () => void
}

function ExerciseStatusIcon({ status }: { status: 'pending' | 'active' | 'complete' }) {
  if (status === 'complete') {
    return (
      <span className="apex-workout-status apex-workout-status--complete" aria-hidden>
        <i className="ti ti-check" />
      </span>
    )
  }
  if (status === 'active') {
    return <span className="apex-workout-status apex-workout-status--active" aria-hidden />
  }
  return <span className="apex-workout-status apex-workout-status--pending" aria-hidden />
}

function SetDots({ done, total }: { done: number; total: number }) {
  return (
    <div className="apex-workout-set-dots" aria-label={`${done} of ${total} sets logged`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`apex-workout-set-dots__dot${i < done ? ' apex-workout-set-dots__dot--done' : ''}`}
        />
      ))}
    </div>
  )
}

function WorkoutExerciseRow({
  ex,
  setsDone,
  targetSets,
  status,
  lastLine,
  showSwipeHint,
  onDismissSwipeHint,
  onSwipeLog,
  onOpenDetail,
  onSelect,
}: ExerciseRowProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const widthRef = useRef(280)

  useEffect(() => {
    if (rowRef.current) widthRef.current = rowRef.current.offsetWidth || 280
  }, [])

  function endDrag(clientX: number) {
    const dx = clientX - startX.current
    const w = widthRef.current
    if (dx >= w * 0.4) {
      onDismissSwipeHint()
      onSwipeLog()
    }
    setOffset(0)
    setDragging(false)
  }

  function onPointerDown(e: ReactPointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return
    startX.current = e.clientX
    setDragging(true)
    if (rowRef.current) widthRef.current = rowRef.current.offsetWidth || 280
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!dragging) return
    const dx = e.clientX - startX.current
    if (dx > 8) setOffset(Math.min(dx, widthRef.current))
    else if (dx < -4) setOffset(0)
  }

  function onPointerUp(e: ReactPointerEvent) {
    if (!dragging) return
    endDrag(e.clientX)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const isActive = status === 'active'

  return (
    <div
      ref={rowRef}
      className={`apex-workout-exercise-card${isActive ? ' apex-workout-exercise-card--active' : ''}`}
    >
      {showSwipeHint ? (
        <p className="apex-workout-swipe-hint">Swipe a row to log</p>
      ) : null}
      <div
        className="absolute inset-y-0 left-0 flex items-center overflow-hidden rounded-l-[14px]"
        style={{
          width: Math.max(offset, 0),
          background: 'rgba(61, 122, 181, 0.25)',
        }}
        aria-hidden
      >
        <span
          className="ml-4 text-[12px] font-semibold text-[#3d7ab5]"
          style={{ opacity: offset > 40 ? 1 : offset / 40 }}
        >
          Log
        </span>
      </div>
      <div
        className={`apex-workout-exercise-card__inner${dragging ? '' : ' apex-workout-exercise-card__inner--animate'}`}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button type="button" className="apex-workout-exercise-card__main" onClick={onSelect}>
          <ExerciseStatusIcon status={status} />
          <div className="apex-workout-exercise-card__body min-w-0 flex-1">
            <p className="apex-workout-exercise-card__name">{ex.name}</p>
            <p className="apex-workout-exercise-card__meta">
              <span>
                {setsDone} / {targetSets} sets
              </span>
              {lastLine ? (
                <>
                  <span className="apex-workout-exercise-card__meta-sep" aria-hidden>
                    ·
                  </span>
                  <span>{lastLine}</span>
                </>
              ) : null}
            </p>
            <SetDots done={Math.min(setsDone, targetSets)} total={targetSets} />
          </div>
        </button>
        <button
          type="button"
          className="apex-workout-exercise-card__chevron"
          aria-label={`${ex.name} details`}
          onClick={onOpenDetail}
        >
          <i className="ti ti-chevron-right" aria-hidden />
        </button>
      </div>
    </div>
  )
}

export type WorkoutInProgressViewProps = {
  workoutName: string
  elapsedSec: number
  planExerciseIds: string[]
  setLogs: SetLog[]
  todayKey: string
  unit: 'lbs' | 'kg'
  activeExerciseId: string | null
  resolveExercise: (id: string) => Exercise | null | undefined
  onActiveExerciseChange: (id: string) => void
  onExitWorkout: () => void
  onLogSet: () => void
  onSwipeLog: (ex: Exercise) => void
  onOpenExerciseDetail: (ex: Exercise) => void
  onOpenGymMode?: () => void
}

export function WorkoutInProgressView({
  workoutName,
  elapsedSec,
  planExerciseIds,
  setLogs,
  todayKey,
  unit,
  activeExerciseId,
  resolveExercise,
  onActiveExerciseChange,
  onExitWorkout,
  onLogSet,
  onSwipeLog,
  onOpenExerciseDetail,
  onOpenGymMode,
}: WorkoutInProgressViewProps) {
  const [showSwipeHint, setShowSwipeHint] = useState(
    () => !readWorkoutSwipeHintDismissed(),
  )

  const resolvedActiveId = useMemo(
    () => pickActiveExerciseId(planExerciseIds, setLogs, todayKey, activeExerciseId),
    [planExerciseIds, setLogs, todayKey, activeExerciseId],
  )

  const dismissSwipeHint = () => {
    if (!showSwipeHint) return
    writeWorkoutSwipeHintDismissed()
    setShowSwipeHint(false)
  }

  const title = workoutName.trim() || 'Workout'
  const timerLabel = formatDuration(elapsedSec)

  return (
    <div className="apex-workout-progress fixed inset-0 z-[96] flex flex-col bg-[var(--apex-surface-page)]">
      <header className="apex-workout-progress__header apex-safe-top shrink-0 px-4 pt-3 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                type="button"
                className="apex-workout-progress__exit"
                onClick={onExitWorkout}
              >
                Exit workout
              </button>
              <p className="apex-workout-progress__label">IN PROGRESS</p>
            </div>
            <h1 className="apex-workout-progress__title">{title}</h1>
          </div>
          <div className="apex-workout-progress__elapsed shrink-0 text-right">
            <p className="apex-workout-progress__elapsed-label">ELAPSED</p>
            <p className="apex-workout-progress__timer tabular-nums">{timerLabel}</p>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
        {planExerciseIds.length === 0 ? (
          <p className="text-[14px] font-medium text-[#a0a0a8] py-8 text-center">
            Add exercises to today&apos;s plan to log sets.
          </p>
        ) : (
          <div className="space-y-3">
            {planExerciseIds.map((id, index) => {
              const ex = resolveExercise(id)
              if (!ex) return null
              const setsDone = setsLoggedTodayForExercise(setLogs, id, todayKey)
              const targetSets = targetSetsForExercise(setLogs, id)
              const status = exerciseRowStatus(id, resolvedActiveId, setsDone, targetSets)
              const lastLine = formatLastCompactLine(setLogs, id, unit)
              return (
                <WorkoutExerciseRow
                  key={id}
                  ex={ex}
                  setsDone={setsDone}
                  targetSets={targetSets}
                  status={status}
                  lastLine={lastLine}
                  showSwipeHint={showSwipeHint && index === 0}
                  onDismissSwipeHint={dismissSwipeHint}
                  onSwipeLog={() => {
                    dismissSwipeHint()
                    onSwipeLog(ex)
                  }}
                  onOpenDetail={() => onOpenExerciseDetail(ex)}
                  onSelect={() => onActiveExerciseChange(id)}
                />
              )
            })}
          </div>
        )}
      </div>

      <footer className="apex-workout-progress__footer apex-safe-bottom shrink-0 px-4 pb-4 pt-2 space-y-2">
        <button type="button" className="apex-workout-log-btn" onClick={onLogSet}>
          Log set →
        </button>
        {onOpenGymMode ? (
          <button type="button" className="apex-workout-gym-mode-link" onClick={onOpenGymMode}>
            Gym mode
          </button>
        ) : null}
      </footer>
    </div>
  )
}
