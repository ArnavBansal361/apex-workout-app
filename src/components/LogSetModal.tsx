import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveBarWeight, readBarWeightPrefs } from '../lib/barWeightPrefs'
import { getExerciseWeightPrefill } from '../lib/exerciseLastWeight'
import type { LastWeightedSetDefaults } from '../lib/lastSession'
import { getLastWeightedSetForExercise } from '../lib/lastSession'
import { platesPerSide } from '../lib/stats'
import type { Exercise, SetLog } from '../types'

/** Exercise is included so the parent never relies on a possibly-stale `logTarget` closure. */
export type LogSetSavePayload = {
  exercise: Exercise
  mode: 'weighted' | 'timed'
  weight: number | null
  bodyweight: boolean
  reps: number
  sets: number
  durationSec: number
  note: string
}

type Props = {
  open: boolean
  exercise: Exercise | null
  unit: 'lbs' | 'kg'
  lastSessionLine?: string | null
  initialWeighted?: LastWeightedSetDefaults | null
  /** When set, the sheet pre-fills from this log and the primary action updates it. */
  editingLog?: SetLog | null
  setLogs?: SetLog[]
  onClose: () => void
  onSave: (payload: LogSetSavePayload) => void | boolean
  onOpenGymMode?: () => void
  overlayClassName?: string
}

const PLATE_BG_KG: Record<number, string> = {
  25: '#c0392b',
  20: '#2980b9',
  15: '#f1c40f',
  10: '#27ae60',
  5: '#ecf0f1',
  2.5: '#1a1a1a',
  1.25: '#4a5568',
}

const PLATE_BG_LBS: Record<number, string> = {
  45: '#c0392b',
  35: '#f1c40f',
  25: '#27ae60',
  10: '#2980b9',
  5: '#ecf0f1',
  2.5: '#1a1a1a',
}

function weightIncrement(unit: 'lbs' | 'kg'): number {
  return unit === 'kg' ? 1.25 : 2.5
}

function defaultSheetPrefill(unit: 'lbs' | 'kg'): LastWeightedSetDefaults {
  return {
    bodyweight: false,
    weight: unit === 'kg' ? 20 : 45,
    reps: 8,
    sets: 1,
  }
}

function formatSheetLastLine(
  logs: SetLog[],
  exerciseId: string,
  unit: 'lbs' | 'kg',
): string | null {
  const last = getLastWeightedSetForExercise(logs, exerciseId)
  if (!last) return null
  if (last.bodyweight) return `Last: Bodyweight × ${last.reps}`
  return `Last: ${last.weight ?? 0} ${unit} × ${last.reps}`
}

function formatWeightValue(n: number, unit: 'lbs' | 'kg'): string {
  const step = weightIncrement(unit)
  const rounded = Math.round(n / step) * step
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '')
}

function plateBadgeColors(label: string, unit: 'lbs' | 'kg'): { background: string; color: string } {
  const n = parseFloat(label)
  const map = unit === 'kg' ? PLATE_BG_KG : PLATE_BG_LBS
  const background = map[n] ?? '#3d4f5f'
  return { background, color: n === 5 ? '#1a1a1a' : '#ffffff' }
}

function useRepeatingStep(onStep: () => void) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (delayRef.current) {
      clearTimeout(delayRef.current)
      delayRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    stop()
    onStep()
    delayRef.current = setTimeout(() => {
      intervalRef.current = setInterval(onStep, 140)
      setTimeout(() => {
        if (!intervalRef.current) return
        clearInterval(intervalRef.current)
        intervalRef.current = setInterval(onStep, 55)
      }, 550)
    }, 380)
  }, [onStep, stop])

  useEffect(() => () => stop(), [stop])

  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
      start()
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onPointerLeave: stop,
  }
}

function SheetStepperCard({
  label,
  valueNode,
  onMinus,
  onPlus,
  minusLabel,
  plusLabel,
}: {
  label: string
  valueNode: React.ReactNode
  onMinus: () => void
  onPlus: () => void
  minusLabel: string
  plusLabel: string
}) {
  const minusHold = useRepeatingStep(onMinus)
  const plusHold = useRepeatingStep(onPlus)

  return (
    <div className="apex-log-set-sheet__stepper-card">
      <p className="apex-log-set-sheet__stepper-label">{label}</p>
      <div className="apex-log-set-sheet__stepper-row">
        <button
          type="button"
          className="apex-log-set-sheet__stepper-btn"
          aria-label={minusLabel}
          {...minusHold}
        >
          −
        </button>
        <div className="apex-log-set-sheet__stepper-value">{valueNode}</div>
        <button
          type="button"
          className="apex-log-set-sheet__stepper-btn"
          aria-label={plusLabel}
          {...plusHold}
        >
          +
        </button>
      </div>
    </div>
  )
}

/** Legacy stepper for QuickLogModal / EditSetLogModal */
export function ApexStepper({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min?: number
}) {
  return (
    <div>
      <span className="apex-section-label block mb-2">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] border-[0.5px] border-[var(--apex-border)] bg-[var(--apex-surface-nested)] text-[20px] leading-none text-[#e0e0e0]"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          −
        </button>
        <span className="flex-1 text-center text-[18px] font-medium tabular-nums text-[#e0e0e0]">
          {value}
        </span>
        <button
          type="button"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] border-[0.5px] border-[var(--apex-border)] bg-[var(--apex-surface-nested)] text-[20px] leading-none text-[#e0e0e0]"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
      </div>
    </div>
  )
}

function applyVoiceTranscript(
  text: string,
  setBodyweight: (v: boolean) => void,
  setWeight: (v: string) => void,
  setReps: (v: number) => void,
  setSets: (v: number) => void,
  setDuration: (v: string) => void,
  setMode: (m: 'weighted' | 'timed') => void,
) {
  const t = text.toLowerCase()
  if (/\b(hold|timed|seconds?|sec)\b/.test(t)) {
    setMode('timed')
    const secM = t.match(/(\d+)\s*(?:second|seconds|sec)?/)
    if (secM) setDuration(secM[1])
  } else {
    setMode('weighted')
  }

  if (/\bbody\s*weight|bodyweight|\bbw\b/.test(t)) {
    setBodyweight(true)
  }

  const setsOfRepsM = t.match(/(\d+)\s*sets?\s*of\s*(\d+)/)
  const setsM = t.match(/(\d+)\s*(?:set|sets)\b/)
  const repsM = t.match(/(\d+)\s*(?:rep|reps)\b/)
  if (setsOfRepsM) {
    setSets(Math.max(1, Number(setsOfRepsM[1]) || 1))
    setReps(Math.max(0, Number(setsOfRepsM[2]) || 0))
  } else {
    if (setsM) setSets(Math.max(1, Number(setsM[1]) || 1))
    if (repsM) setReps(Math.max(0, Number(repsM[1]) || 0))
  }

  if (!/\bbody\s*weight|bodyweight|\bbw\b/.test(t)) {
    const kgM = t.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilo|kilos)\b/)
    const lbM = t.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound|pounds)\b/)
    const atM = t.match(/\bat\s+(\d+(?:\.\d+)?)\b/)
    if (kgM || lbM) {
      setBodyweight(false)
      const w = kgM?.[1] ?? lbM?.[1]
      if (w) setWeight(w)
    } else if (atM?.[1]) {
      setBodyweight(false)
      setWeight(atM[1])
    } else {
      const afterReps = t.match(/(?:rep|reps)[^\d]*(\d+(?:\.\d+)?)\s*(?:lb|lbs|kg)?/)
      if (afterReps) {
        setBodyweight(false)
        setWeight(afterReps[1])
      }
    }
  }
}

export function matchExerciseFromTranscript(text: string, exercises: Exercise[]): Exercise | null {
  const t = text.toLowerCase()
  const sorted = [...exercises].sort((a, b) => b.name.length - a.name.length)
  for (const ex of sorted) {
    if (t.includes(ex.name.toLowerCase())) return ex
  }
  return null
}

export { applyVoiceTranscript }

export function LogSetModal({
  open,
  exercise,
  unit,
  lastSessionLine: _lastSessionLine,
  initialWeighted,
  editingLog = null,
  setLogs = [],
  onClose,
  onSave,
  onOpenGymMode,
  overlayClassName,
}: Props) {
  const [mode, setMode] = useState<'weighted' | 'timed'>('weighted')
  const [bodyweight, setBodyweight] = useState(false)
  const [weight, setWeight] = useState(0)
  const [reps, setReps] = useState(8)
  const [duration, setDuration] = useState(60)
  const [plateCalcOpen, setPlateCalcOpen] = useState(false)
  const [sheetDragY, setSheetDragY] = useState(0)
  const dragStartY = useRef(0)
  const dragging = useRef(false)
  const sheetRef = useRef<HTMLDivElement>(null)

  const wStep = weightIncrement(unit)

  useEffect(() => {
    if (!open) {
      setSheetDragY(0)
      setPlateCalcOpen(false)
      dragging.current = false
    }
  }, [open])

  useEffect(() => {
    if (!open || !exercise) return
    if (editingLog && editingLog.exerciseId === exercise.id) {
      if (editingLog.kind === 'timed') {
        setMode('timed')
        setDuration(Math.max(0, Math.floor(editingLog.durationSec)))
      } else {
        setMode('weighted')
        setBodyweight(editingLog.bodyweight)
        setWeight(
          editingLog.bodyweight || editingLog.weight == null
            ? defaultSheetPrefill(unit).weight ?? 0
            : editingLog.weight,
        )
        setReps(editingLog.reps)
      }
      setPlateCalcOpen(false)
      return
    }

    const lastLog = [...setLogs]
      .filter((l) => l.exerciseId === exercise.id)
      .sort((a, b) => b.at - a.at)[0]
    if (lastLog?.kind === 'timed') {
      setMode('timed')
      setDuration(Math.max(0, Math.floor(lastLog.durationSec)))
    } else {
      setMode('weighted')
    }

    const prefill =
      initialWeighted ??
      getExerciseWeightPrefill(setLogs, exercise.id) ??
      defaultSheetPrefill(unit)

    setBodyweight(prefill.bodyweight)
    setWeight(
      prefill.bodyweight || prefill.weight == null
        ? defaultSheetPrefill(unit).weight ?? 0
        : prefill.weight,
    )
    setReps(prefill.reps)
    setPlateCalcOpen(false)
  }, [open, exercise?.id, initialWeighted, editingLog, setLogs, unit])

  const lastLine = useMemo(() => {
    if (!exercise) return null
    return formatSheetLastLine(setLogs, exercise.id, unit)
  }, [exercise, setLogs, unit])

  const plateBreakdown = useMemo(() => {
    if (!open || bodyweight || weight <= 0) return null
    const bar = resolveBarWeight(unit, readBarWeightPrefs())
    return platesPerSide(weight, unit, bar)
  }, [open, bodyweight, weight, unit])

  if (!open || !exercise) return null

  const exerciseSnapshot = exercise

  function adjustWeight(delta: number) {
    if (bodyweight) {
      setBodyweight(false)
      setWeight(defaultSheetPrefill(unit).weight ?? wStep)
      return
    }
    setWeight((w) => Math.max(0, Math.round((w + delta) * 100) / 100))
  }

  function submit() {
    const r = Math.max(0, Math.floor(reps))
    const d = Math.max(0, Math.floor(duration))
    try {
      const shouldClose =
        onSave({
          exercise: exerciseSnapshot,
          mode,
          weight: bodyweight ? null : weight,
          bodyweight,
          reps: r,
          sets: 1,
          durationSec: d,
          note: '',
        }) !== false
      if (shouldClose) onClose()
    } catch (e) {
      console.error('[Apex] Log set save failed', e)
    }
  }

  function onSheetTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return
    dragStartY.current = e.touches[0].clientY
    dragging.current = true
  }

  function onSheetTouchMove(e: React.TouchEvent) {
    if (!dragging.current || e.touches.length !== 1) return
    const dy = e.touches[0].clientY - dragStartY.current
    if (dy > 0) setSheetDragY(dy)
  }

  function onSheetTouchEnd() {
    if (sheetDragY > 90) onClose()
    else setSheetDragY(0)
    dragging.current = false
  }

  const weightDisplay = bodyweight ? (
    <span className="apex-log-set-sheet__num-main">BW</span>
  ) : (
    <>
      <span className="apex-log-set-sheet__num-main tabular-nums">
        {formatWeightValue(weight, unit)}
      </span>
      <span className="apex-log-set-sheet__num-unit">{unit}</span>
    </>
  )

  return (
    <div
      role="presentation"
      className={`apex-log-set-sheet-overlay fixed inset-0 flex items-end justify-center p-0 ${
        overlayClassName ?? 'z-[70]'
      }`}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${editingLog ? 'Edit' : 'Log'} set — ${exercise.name}`}
        className="apex-log-set-sheet w-full max-w-lg max-h-[92vh] overflow-y-auto"
        style={{
          transform: sheetDragY > 0 ? `translateY(${sheetDragY}px)` : undefined,
          transition: dragging.current ? 'none' : 'transform 0.22s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="apex-log-set-sheet__handle-wrap"
          onTouchStart={onSheetTouchStart}
          onTouchMove={onSheetTouchMove}
          onTouchEnd={onSheetTouchEnd}
        >
          <span className="apex-log-set-sheet__pill" aria-hidden />
        </div>

        <h2 className="apex-log-set-sheet__title">{exercise.name}</h2>
        {lastLine ? <p className="apex-log-set-sheet__last">{lastLine}</p> : null}

        {mode === 'weighted' ? (
          <>
            <div className="apex-log-set-sheet__steppers">
              <SheetStepperCard
                label="WEIGHT"
                valueNode={weightDisplay}
                onMinus={() => adjustWeight(-wStep)}
                onPlus={() => adjustWeight(wStep)}
                minusLabel="Decrease weight"
                plusLabel="Increase weight"
              />
              <SheetStepperCard
                label="REPS"
                valueNode={
                  <span className="apex-log-set-sheet__num-main tabular-nums">{reps}</span>
                }
                onMinus={() => setReps((r) => Math.max(0, r - 1))}
                onPlus={() => setReps((r) => r + 1)}
                minusLabel="Decrease reps"
                plusLabel="Increase reps"
              />
            </div>

            {!bodyweight && weight > 0 ? (
              <div className="apex-log-set-sheet__plate-wrap">
                <button
                  type="button"
                  className="apex-log-set-sheet__plate-link"
                  onClick={() => setPlateCalcOpen((o) => !o)}
                  aria-expanded={plateCalcOpen}
                >
                  🏋️ Plate calculator
                </button>
                {plateCalcOpen && plateBreakdown ? (
                  <div className="apex-log-set-sheet__plate-panel">
                    <p className="apex-log-set-sheet__plate-heading">Per side</p>
                    <div className="apex-log-set-sheet__plate-badges">
                      {plateBreakdown.chips.length ? (
                        plateBreakdown.chips.map((chip, i) => {
                          const { background, color } = plateBadgeColors(chip.label, unit)
                          return (
                            <span
                              key={`${chip.label}-${i}`}
                              className="apex-log-set-sheet__plate-badge"
                              style={{ background, color }}
                            >
                              {chip.label}
                            </span>
                          )
                        })
                      ) : (
                        <span className="apex-log-set-sheet__plate-empty">Bar only</span>
                      )}
                    </div>
                    <p className="apex-log-set-sheet__plate-bar">{plateBreakdown.barLabel}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="apex-log-set-sheet__steppers apex-log-set-sheet__steppers--single">
            <SheetStepperCard
              label="SECONDS"
              valueNode={
                <span className="apex-log-set-sheet__num-main tabular-nums">{duration}</span>
              }
              onMinus={() => setDuration((d) => Math.max(0, d - 5))}
              onPlus={() => setDuration((d) => d + 5)}
              minusLabel="Decrease duration"
              plusLabel="Increase duration"
            />
          </div>
        )}

        {onOpenGymMode ? (
          <button
            type="button"
            className="apex-log-set-sheet__gym-link"
            onClick={onOpenGymMode}
          >
            Open gym mode
          </button>
        ) : null}

        <footer className="apex-log-set-sheet__footer apex-safe-bottom">
          <button type="button" className="apex-log-set-sheet__log-btn" onClick={submit}>
            {editingLog ? 'Save' : 'Log set'}
          </button>
        </footer>
      </div>
    </div>
  )
}
