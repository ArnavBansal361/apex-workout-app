import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import { dateKey } from '../lib/dates'
import { formatExerciseLastHistoryLine } from '../lib/lastSession'
import type { Exercise, SetLog } from '../types'
import { formatDuration } from '../lib/timers'
import { LogSetModal, type LogSetSavePayload } from './LogSetModal'
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

const pickerInputClass =
  'w-full min-h-12 rounded-[12px] border border-white/[0.12] bg-[var(--apex-surface-card)] px-3 text-[16px] font-normal text-[#ececee] placeholder:text-[#a0a0a8]'

function formatSessionSetLine(log: SetLog, unit: 'lbs' | 'kg'): string {
  if (log.kind === 'timed') return `${log.durationSec}s timed`
  if (log.bodyweight) return `Bodyweight × ${log.reps}`
  return `${log.weight ?? 0} ${unit} × ${log.reps}`
}

function formatSessionSetTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

type SessionSetRowProps = {
  log: SetLog
  unit: 'lbs' | 'kg'
  onEdit: () => void
  onDelete: () => void
}

function SessionSetRow({ log, unit, onEdit, onDelete }: SessionSetRowProps) {
  return (
    <li className="flex items-stretch gap-0 rounded-[12px] border border-white/[0.08] bg-[var(--apex-surface-card)] overflow-hidden">
      <button
        type="button"
        className="flex flex-1 min-w-0 items-center justify-between gap-3 px-3 py-2.5 text-left touch-manipulation active:bg-white/[0.04]"
        onClick={onEdit}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-[#f0f0f2] truncate">{log.exerciseName}</p>
          <p className="text-[12px] font-medium text-[#a0a0a8] mt-0.5 tabular-nums">
            {formatSessionSetLine(log, unit)}
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-medium text-[#7d7d88] tabular-nums">
          {formatSessionSetTime(log.at)}
        </span>
      </button>
      <button
        type="button"
        className="flex shrink-0 items-center justify-center w-11 border-l border-white/[0.08] text-[#7d7d88] touch-manipulation active:bg-red-950/30 active:text-red-400"
        aria-label={`Delete ${log.exerciseName} set`}
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
      >
        <i className="ti ti-trash text-[16px]" aria-hidden />
      </button>
    </li>
  )
}

function WorkoutExercisePicker({
  open,
  search,
  unit,
  planExerciseIds,
  setLogs,
  onSearchChange,
  onClose,
  onPick,
}: {
  open: boolean
  search: string
  unit: 'lbs' | 'kg'
  planExerciseIds: string[]
  setLogs: SetLog[]
  onSearchChange: (value: string) => void
  onClose: () => void
  onPick: (ex: Exercise) => void
}) {
  const { visibleExercises } = useWorkout()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return visibleExercises
      .filter((e) => !planExerciseIds.includes(e.id))
      .filter(
        (e) =>
          !q ||
          e.name.toLowerCase().includes(q) ||
          e.muscleGroup.toLowerCase().includes(q),
      )
      .slice(0, 36)
  }, [visibleExercises, search, planExerciseIds])

  if (!open) return null

  return (
    <div
      role="presentation"
      className="apex-modal-overlay fixed inset-0 z-[98] flex items-end justify-center sm:items-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[min(92dvh,40rem)] flex flex-col rounded-t-[14px] sm:rounded-[14px] apex-card sm:max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3 shrink-0 border-b border-white/[0.08]">
          <div>
            <p className="apex-section-label">Add exercise</p>
            <p className="mt-1 text-[12px] font-medium text-[#a0a0a8] leading-relaxed">
              Search your library to add to this workout.
            </p>
          </div>
          <button
            type="button"
            className="min-h-11 min-w-11 rounded-[12px] border border-white/[0.12] text-[13px] text-[#ececee] shrink-0"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <label className="block">
            <span className="apex-section-label block mb-2">Search exercise</span>
            <input
              className={pickerInputClass}
              placeholder="Name or muscle group…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </label>
          <ul className="mt-2 max-h-[min(50vh,20rem)] overflow-y-auto rounded-[12px] border border-white/[0.08] bg-[var(--apex-surface-card)] divide-y divide-white/[0.06]">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-[13px] font-medium text-[#a0a0a8]">
                {planExerciseIds.length >= visibleExercises.length
                  ? 'All exercises are already in this workout.'
                  : 'No matches — try another search.'}
              </li>
            ) : (
              filtered.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className="w-full min-h-11 text-left px-3 py-2.5 text-[13px] font-medium text-[#ececee] hover:bg-white/[0.06] active:bg-white/[0.08] transition-colors"
                    onClick={() => onPick(e)}
                  >
                    <span className="block">{e.name}</span>
                    {formatExerciseLastHistoryLine(setLogs, e.id, unit) ? (
                      <span className="block text-[11px] font-medium text-[#a0a0a8] mt-0.5">
                        {formatExerciseLastHistoryLine(setLogs, e.id, unit)}
                      </span>
                    ) : (
                      <span className="text-[#a0a0a8]"> · {e.muscleGroup}</span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
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
  const { addPlanExercise, updateSetLog, deleteSetLog } = useWorkout()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [editLog, setEditLog] = useState<SetLog | null>(null)
  const [showSwipeHint, setShowSwipeHint] = useState(
    () => !readWorkoutSwipeHintDismissed(),
  )

  const sessionLogs = useMemo(
    () =>
      [...setLogs]
        .filter((l) => dateKey(new Date(l.at)) === todayKey)
        .sort((a, b) => b.at - a.at),
    [setLogs, todayKey],
  )

  const editExercise = useMemo(() => {
    if (!editLog) return null
    return resolveExercise(editLog.exerciseId) ?? null
  }, [editLog, resolveExercise])

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
  const hasExercises = planExerciseIds.length > 0

  function openPicker() {
    setPickerSearch('')
    setPickerOpen(true)
  }

  function pickExercise(ex: Exercise) {
    addPlanExercise(ex.id)
    onActiveExerciseChange(ex.id)
    setPickerOpen(false)
    setPickerSearch('')
  }

  function closeEditModal() {
    setEditLog(null)
  }

  function saveEditedSet(p: LogSetSavePayload) {
    if (!editLog) return false
    try {
      if (p.mode === 'weighted' && editLog.kind === 'weighted') {
        updateSetLog(editLog.id, {
          kind: 'weighted',
          weight: p.bodyweight ? null : p.weight ?? 0,
          bodyweight: p.bodyweight,
          reps: p.reps,
          sets: editLog.sets,
          note: p.note,
        })
      } else if (p.mode === 'timed' && editLog.kind === 'timed') {
        updateSetLog(editLog.id, {
          kind: 'timed',
          durationSec: p.durationSec,
          note: p.note,
        })
      } else {
        return false
      }
      setEditLog(null)
    } catch {
      return false
    }
  }

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
        {!hasExercises ? (
          <div className="flex min-h-[min(52vh,28rem)] flex-col items-center justify-center px-2">
            <button type="button" className="apex-workout-log-btn max-w-[17.5rem]" onClick={openPicker}>
              Add exercise
            </button>
          </div>
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
            <button type="button" className="apex-workout-add-exercise-secondary" onClick={openPicker}>
              Add exercise
            </button>
          </div>
        )}

        {sessionLogs.length > 0 ? (
          <section className="mt-6 pt-5 border-t border-white/[0.08]" aria-label="Session log">
            <h2 className="apex-section-label mb-3">Session log</h2>
            <ul className="space-y-2">
              {sessionLogs.map((log) => (
                <SessionSetRow
                  key={log.id}
                  log={log}
                  unit={unit}
                  onEdit={() => setEditLog(log)}
                  onDelete={() => deleteSetLog(log.id)}
                />
              ))}
            </ul>
          </section>
        ) : null}
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

      <WorkoutExercisePicker
        open={pickerOpen}
        search={pickerSearch}
        unit={unit}
        planExerciseIds={planExerciseIds}
        setLogs={setLogs}
        onSearchChange={setPickerSearch}
        onClose={() => {
          setPickerOpen(false)
          setPickerSearch('')
        }}
        onPick={pickExercise}
      />

      <LogSetModal
        open={!!editLog && !!editExercise}
        exercise={editExercise}
        unit={unit}
        editingLog={editLog}
        setLogs={setLogs}
        overlayClassName="z-[98]"
        onClose={closeEditModal}
        onSave={saveEditedSet}
      />
    </div>
  )
}
