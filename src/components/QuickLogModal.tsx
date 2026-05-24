import { useEffect, useMemo, useState } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import type { Exercise } from '../types'
import { ApexStepper, applyVoiceTranscript, matchExerciseFromTranscript } from './LogSetModal'

type Props = {
  onClose: () => void
  /** When set, opens with this exercise selected (same flow as Today + FAB). */
  initialExercise?: Exercise | null
}

const inp =
  'rounded-[12px] border border-[#1e1e1e] bg-[#121212] px-3 text-[16px] font-normal text-[#e0e0e0] placeholder:text-[#9898a0]'

export function QuickLogModal({ onClose, initialExercise = null }: Props) {
  const { visibleExercises, addSetLog, notify, state } = useWorkout()
  const unit = state.settings.unit

  const [search, setSearch] = useState(initialExercise?.name ?? '')
  const [selected, setSelected] = useState<Exercise | null>(initialExercise ?? null)
  const [bodyweight, setBodyweight] = useState(false)
  const [weight, setWeight] = useState('0')
  const [reps, setReps] = useState(10)
  const [sets, setSets] = useState(3)
  const [note, setNote] = useState('')
  const [listening, setListening] = useState(false)

  useEffect(() => {
    if (initialExercise) {
      setSelected(initialExercise)
      setSearch(initialExercise.name)
    }
  }, [initialExercise?.id])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q
      ? visibleExercises.filter(
          (e) =>
            e.name.toLowerCase().includes(q) || e.muscleGroup.toLowerCase().includes(q),
        )
      : visibleExercises
    return list.slice(0, 36)
  }, [visibleExercises, search])

  function save() {
    if (!selected) {
      notify('Pick an exercise first')
      return
    }
    const rawW = weight.trim() === '' ? null : Number(weight)
    const w = rawW != null && Number.isFinite(rawW) ? rawW : null
    const r = Math.max(0, Math.floor(reps))
    const s = Math.max(1, Math.floor(sets))
    try {
      addSetLog({
        kind: 'weighted',
        exerciseId: selected.id,
        exerciseName: selected.name,
        muscleGroup: selected.muscleGroup,
        weight: bodyweight ? null : w == null ? 0 : w,
        bodyweight,
        reps: r,
        sets: s,
        note: note.trim(),
      })
      onClose()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save set')
    }
  }

  function applyVoice(transcript: string) {
    applyVoiceTranscript(
      transcript,
      setBodyweight,
      setWeight,
      setReps,
      setSets,
      () => {},
      () => {},
    )
    const matched = matchExerciseFromTranscript(transcript, visibleExercises)
    if (matched) {
      setSelected(matched)
      setSearch(matched.name)
    }
  }

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      notify('Voice input is not supported in this browser')
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
      notify('Could not start microphone')
    }
  }

  return (
    <div
      role="presentation"
      className="apex-modal-overlay fixed inset-0 z-[93] flex items-end justify-center sm:items-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[min(92dvh,40rem)] flex flex-col rounded-t-[12px] sm:rounded-[12px] apex-card sm:max-h-[85vh]"
        
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3 shrink-0 border-b border-[#1e1e1e]">
          <div>
            <p className="apex-section-label">Quick log</p>
            <p className="mt-1 text-[12px] font-normal text-[#a0a0a8] leading-relaxed">
              Search any exercise, enter load and volume, save — no plan required.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
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

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block">
              <span className="apex-section-label block mb-2">Search exercise</span>
              <input
                className={`w-full min-h-12 ${inp}`}
                placeholder="Name or muscle group…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
                autoFocus
              />
            </label>
            <ul className="mt-2 max-h-40 overflow-y-auto rounded-[12px] border border-[#1e1e1e] bg-[#121212] divide-y divide-[#1e1e1e]">
              {filtered.length === 0 ? (
                <li className="px-3 py-3 text-[13px] text-[#a0a0a8]">No matches</li>
              ) : (
                filtered.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className={`w-full min-h-11 border-l-2 text-left px-3 py-2.5 text-[13px] font-normal transition-colors ${
                        selected?.id === e.id
                          ? 'bg-[#1a1a1a] text-[#e0e0e0]'
                          : 'border-transparent text-[#e0e0e0] hover:bg-[#1e1e1e]'
                      }`}
                      style={{ borderLeftColor: selected?.id === e.id ? 'var(--apex-accent)' : 'transparent' }}
                      onClick={() => setSelected(e)}
                    >
                      <span>{e.name}</span>
                      <span className="text-[#a0a0a8]"> · {e.muscleGroup}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          {selected ? (
            <div className="space-y-3 rounded-[12px] border border-[#1e1e1e] bg-[#161616] p-4">
              <p className="text-[13px] font-normal text-[#e0e0e0]">
                <span className="text-[#a0a0a8]">Selected · </span>
                {selected.name}
              </p>
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
                    className={`w-full min-h-12 ${inp}`}
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="0"
                  />
                </label>
              )}
              <ApexStepper label="Reps" value={reps} onChange={setReps} min={0} />
              <ApexStepper label="Sets" value={sets} onChange={(n) => setSets(Math.max(1, n))} min={1} />
              <label className="block">
                <span className="apex-section-label block mb-2">Note (optional)</span>
                <input
                  className={`w-full min-h-12 ${inp}`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="—"
                />
              </label>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 flex gap-3 p-5 pt-3 border-t border-[#1e1e1e]">
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
            onClick={() => save()}
          >
            Save set
          </button>
        </div>
      </div>
    </div>
  )
}
