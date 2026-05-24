import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LastWeightedSetDefaults } from '../lib/lastSession'
import { platesPerSide } from '../lib/stats'
import type { Exercise } from '../types'

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
  onClose: () => void
  /** Return false to keep the modal open (e.g. superset auto-advance). */
  onSave: (payload: LogSetSavePayload) => void | boolean
  /** Switch to full-screen gym mode for this exercise. */
  onOpenGymMode?: () => void
}

const inp =
  'rounded-[12px] border border-[#1e1e1e] bg-[#121212] px-3 text-[16px] font-normal text-[#e0e0e0] placeholder:text-[#9898a0]'

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
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border border-[#1e1e1e] bg-[#121212] text-[20px] leading-none text-[#e0e0e0]"
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
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border border-[#1e1e1e] bg-[#121212] text-[20px] leading-none text-[#e0e0e0]"
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
  lastSessionLine,
  initialWeighted,
  onClose,
  onSave,
  onOpenGymMode,
}: Props) {
  const [mode, setMode] = useState<'weighted' | 'timed'>('weighted')
  const [bodyweight, setBodyweight] = useState(false)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState(10)
  const [sets, setSets] = useState(3)
  const [duration, setDuration] = useState('60')
  const [note, setNote] = useState('')
  const [listening, setListening] = useState(false)

  useEffect(() => {
    if (!open || !exercise) return
    if (initialWeighted) {
      setMode('weighted')
      setBodyweight(initialWeighted.bodyweight)
      setWeight(
        initialWeighted.bodyweight || initialWeighted.weight == null
          ? ''
          : String(initialWeighted.weight),
      )
      setReps(initialWeighted.reps)
      setSets(initialWeighted.sets)
    } else {
      setMode('weighted')
      setBodyweight(false)
      setWeight('')
      setReps(10)
      setSets(3)
    }
    setDuration('60')
    setNote('')
  }, [open, exercise?.id, initialWeighted])

  const plateBreakdown = useMemo(() => {
    if (mode !== 'weighted' || bodyweight) return null
    const w = Number(weight)
    if (!Number.isFinite(w) || w <= 0) return null
    return platesPerSide(w, unit)
  }, [mode, bodyweight, weight, unit])

  const applyVoice = useCallback(
    (transcript: string) => {
      applyVoiceTranscript(
        transcript,
        setBodyweight,
        setWeight,
        setReps,
        setSets,
        setDuration,
        setMode,
      )
    },
    [],
  )

  if (!open || !exercise) return null

  const exerciseSnapshot = exercise

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      return
    }
    const r = new SR()
    r.lang = 'en-US'
    r.interimResults = false
    r.maxAlternatives = 1
    r.onresult = (ev) => {
      const transcript = ev.results[0]?.[0]?.transcript
      if (transcript) applyVoice(transcript)
    }
    r.onerror = () => setListening(false)
    r.onend = () => setListening(false)
    try {
      r.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }

  function submit() {
    const rawW = weight.trim() === '' ? null : Number(weight)
    const w = rawW != null && Number.isFinite(rawW) ? rawW : null
    const r = Math.max(0, Math.floor(reps))
    const s = Math.max(1, Math.floor(sets))
    const d = Math.max(0, Math.floor(Number(duration) || 0))
    try {
      const shouldClose =
        onSave({
          exercise: exerciseSnapshot,
          mode,
          weight: bodyweight ? null : w == null ? 0 : w,
          bodyweight,
          reps: r,
          sets: s,
          durationSec: d,
          note: note.trim(),
        }) !== false
      if (shouldClose) onClose()
    } catch (e) {
      console.error('[Apex] Log set save failed', e)
    }
  }

  return (
    <div
      role="presentation"
      className="apex-modal-overlay fixed inset-0 z-[70] flex items-end justify-center sm:items-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-[12px] sm:rounded-[12px] apex-card apex-modal-panel max-h-[90vh] overflow-y-auto"
        
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="apex-section-label">Log set</p>
            <h2 className="mt-1 text-[13px] font-normal text-[#e0e0e0]">{exercise.name}</h2>
            {lastSessionLine ? (
              <p className="mt-2 text-[12px] font-normal text-[#a0a0a8] leading-relaxed">{lastSessionLine}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Voice input"
              className={`relative min-h-11 min-w-11 rounded-full border border-[#1e1e1e] bg-[#121212] text-[#e0e0e0] flex items-center justify-center ${
                listening ? 'apex-mic-listening' : ''
              }`}
              style={
                listening
                  ? { borderColor: 'rgba(255,255,255,0.45)', color: '#ffffff' }
                  : undefined
              }
              onClick={startVoice}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </button>
            {onOpenGymMode ? (
              <button
                type="button"
                className="min-h-11 px-3 rounded-[12px] border border-[#1e1e1e] bg-[#121212] text-[12px] font-medium text-[#e0e0e0]"
                onClick={onOpenGymMode}
              >
                Gym mode
              </button>
            ) : null}
            <button
              type="button"
              className="min-h-11 min-w-11 rounded-[12px] border border-[#1e1e1e] bg-[#121212] text-[13px] text-[#e0e0e0]"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="mt-4 flex rounded-[12px] bg-[#121212] p-1 border border-[#1e1e1e]">
          <button
            type="button"
            className={`min-h-11 flex-1 rounded-[8px] text-[13px] font-normal ${
              mode === 'weighted' ? 'bg-[#161616] text-[#e0e0e0]' : 'text-[#a0a0a8]'
            }`}
            onClick={() => setMode('weighted')}
          >
            Weighted
          </button>
          <button
            type="button"
            className={`min-h-11 flex-1 rounded-[8px] text-[13px] font-normal ${
              mode === 'timed' ? 'bg-[#161616] text-[#e0e0e0]' : 'text-[#a0a0a8]'
            }`}
            onClick={() => setMode('timed')}
          >
            Timed
          </button>
        </div>

        {mode === 'weighted' ? (
          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-3 min-h-12 text-[13px] font-normal text-[#e0e0e0]">
              <input
                type="checkbox"
                checked={bodyweight}
                onChange={(e) => setBodyweight(e.target.checked)}
                className="apex-checkbox"
              />
              Bodyweight
            </label>
            {!bodyweight && (
              <label className="block">
                <span className="apex-section-label block mb-2">Weight ({unit})</span>
                <input
                  inputMode="decimal"
                  className={`mt-1 w-full min-h-12 ${inp}`}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="0"
                />
                {plateBreakdown ? (
                  <div className="mt-3">
                    <p
                      className="mb-2 text-[10px] font-normal uppercase tracking-[0.08em]"
                      style={{ color: 'rgba(255,255,255,0.3)' }}
                    >
                      Plates per side
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {plateBreakdown.chips.map((chip, i) => (
                        <span
                          key={`${chip.label}-${i}`}
                          className="text-[12px] font-medium text-white"
                          style={{
                            borderRadius: 99,
                            padding: '4px 10px',
                            border: `0.5px solid rgba(255,255,255,${chip.opacity})`,
                            background: 'transparent',
                          }}
                        >
                          {chip.label}
                        </span>
                      ))}
                      <span
                        className="text-[12px] font-medium"
                        style={{ color: 'rgba(255,255,255,0.3)' }}
                      >
                        {plateBreakdown.barLabel}
                      </span>
                    </div>
                  </div>
                ) : null}
              </label>
            )}
            <ApexStepper label="Reps" value={reps} onChange={setReps} min={0} />
            <ApexStepper label="Sets" value={sets} onChange={(n) => setSets(Math.max(1, n))} min={1} />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="apex-section-label block mb-2">Duration (seconds)</span>
              <input
                inputMode="numeric"
                className={`mt-1 w-full min-h-12 ${inp}`}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </label>
          </div>
        )}

        <label className="mt-4 block">
          <span className="apex-section-label block mb-2">Note</span>
          <textarea
            className={`mt-1 w-full min-h-[4.5rem] rounded-[12px] border border-[#1e1e1e] bg-[#121212] px-3 py-2 text-[16px] font-normal text-[#e0e0e0]`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            className="min-h-12 flex-1 rounded-[12px] border border-[#1e1e1e] bg-[#161616] text-[13px] font-normal text-[#e0e0e0]"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="apex-btn-primary min-h-12 flex-1 text-[13px] font-medium"
            onClick={submit}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
