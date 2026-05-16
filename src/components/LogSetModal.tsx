import { useCallback, useState } from 'react'
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
  accent: string
  unit: 'lbs' | 'kg'
  lastSessionLine?: string | null
  onClose: () => void
  onSave: (payload: LogSetSavePayload) => void
}

const inp =
  'rounded-[12px] border border-[#1e1e1e] bg-[#121212] px-3 text-[16px] font-normal text-[#e0e0e0] placeholder:text-[#555]'

function applyVoiceTranscript(
  text: string,
  setBodyweight: (v: boolean) => void,
  setWeight: (v: string) => void,
  setReps: (v: string) => void,
  setSets: (v: string) => void,
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

  const setsM = t.match(/(\d+)\s*(?:set|sets)\b/)
  const repsM = t.match(/(\d+)\s*(?:rep|reps)\b/)
  if (setsM) setSets(setsM[1])
  if (repsM) setReps(repsM[1])

  if (!/\bbody\s*weight|bodyweight|\bbw\b/.test(t)) {
    const kgM = t.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilo|kilos)\b/)
    const lbM = t.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound|pounds)\b/)
    if (kgM || lbM) {
      setBodyweight(false)
      const w = kgM?.[1] ?? lbM?.[1]
      if (w) setWeight(w)
    } else {
      const afterReps = t.match(/(?:rep|reps)[^\d]*(\d+(?:\.\d+)?)\s*(?:lb|lbs|kg)?/)
      if (afterReps) {
        setBodyweight(false)
        setWeight(afterReps[1])
      }
    }
  }
}

export function LogSetModal({
  open,
  exercise,
  accent,
  unit,
  lastSessionLine,
  onClose,
  onSave,
}: Props) {
  const [mode, setMode] = useState<'weighted' | 'timed'>('weighted')
  const [bodyweight, setBodyweight] = useState(false)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('8')
  const [sets, setSets] = useState('1')
  const [duration, setDuration] = useState('60')
  const [note, setNote] = useState('')
  const [listening, setListening] = useState(false)

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
      const t = ev.results[0]?.[0]?.transcript
      if (t) applyVoice(t)
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
    const r = Math.max(0, Math.floor(Number(reps) || 0))
    const s = Math.max(1, Math.floor(Number(sets) || 1))
    const d = Math.max(0, Math.floor(Number(duration) || 0))
    try {
      onSave({
        exercise: exerciseSnapshot,
        mode,
        weight: bodyweight ? null : w == null ? 0 : w,
        bodyweight,
        reps: r,
        sets: s,
        durationSec: d,
        note: note.trim(),
      })
      onClose()
    } catch (e) {
      console.error('[Apex] Log set save failed', e)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center bg-black/75 p-0 sm:p-4">
      <div
        className="w-full max-w-lg rounded-t-[12px] sm:rounded-[12px] apex-card p-5 max-h-[90vh] overflow-y-auto"
        style={{ ['--accent' as string]: accent }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="apex-section-label">Log set</p>
            <h2 className="mt-1 text-[13px] font-normal text-[#e0e0e0]">{exercise.name}</h2>
            {lastSessionLine ? (
              <p className="mt-2 text-[12px] font-normal text-[#555] leading-relaxed">{lastSessionLine}</p>
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
                  ? { borderColor: accent, color: accent }
                  : undefined
              }
              onClick={startVoice}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </button>
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
              mode === 'weighted' ? 'bg-[#161616] text-[#e0e0e0]' : 'text-[#555]'
            }`}
            onClick={() => setMode('weighted')}
          >
            Weighted
          </button>
          <button
            type="button"
            className={`min-h-11 flex-1 rounded-[8px] text-[13px] font-normal ${
              mode === 'timed' ? 'bg-[#161616] text-[#e0e0e0]' : 'text-[#555]'
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
                className="h-4 w-4"
                style={{ accentColor: accent }}
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
              </label>
            )}
            <label className="block">
              <span className="apex-section-label block mb-2">Reps</span>
              <input
                inputMode="numeric"
                className={`mt-1 w-full min-h-12 ${inp}`}
                value={reps}
                onChange={(e) => setReps(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="apex-section-label block mb-2">Sets</span>
              <input
                inputMode="numeric"
                className={`mt-1 w-full min-h-12 ${inp}`}
                value={sets}
                onChange={(e) => setSets(e.target.value)}
              />
            </label>
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
            className="min-h-12 flex-1 rounded-[12px] text-[13px] font-medium text-[#0c0c0c]"
            style={{ backgroundColor: accent }}
            onClick={submit}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
