import { useState } from 'react'
import type { SetLog, SetLogEditPayload } from '../types'

type Props = {
  open: boolean
  log: SetLog | null
  accent: string
  unit: 'lbs' | 'kg'
  onClose: () => void
  onSave: (logId: string, payload: SetLogEditPayload) => void
}

const inp =
  'rounded-[12px] border border-[#1e1e1e] bg-[#121212] px-3 text-[16px] font-normal text-[#e0e0e0] placeholder:text-[#555]'

type InnerProps = {
  log: SetLog
  accent: string
  unit: 'lbs' | 'kg'
  onClose: () => void
  onSave: (logId: string, payload: SetLogEditPayload) => void
}

/** Remount when `log.id` changes so fields reinitialize from the log (see parent `key`). */
function EditSetLogModalInner({ log, accent, unit, onClose, onSave }: InnerProps) {
  const [bodyweight, setBodyweight] = useState(
    () => (log.kind === 'weighted' ? log.bodyweight : false),
  )
  const [weight, setWeight] = useState(() =>
    log.kind === 'weighted' ? (log.bodyweight ? '' : String(log.weight ?? '')) : '',
  )
  const [reps, setReps] = useState(() => (log.kind === 'weighted' ? String(log.reps) : '8'))
  const [sets, setSets] = useState(() => (log.kind === 'weighted' ? String(log.sets) : '1'))
  const [duration, setDuration] = useState(() =>
    log.kind === 'timed' ? String(log.durationSec) : '60',
  )
  const [note, setNote] = useState(() => log.note)

  function submit() {
    try {
      if (log.kind === 'weighted') {
        const rawW = weight.trim() === '' ? null : Number(weight)
        const w = rawW != null && Number.isFinite(rawW) ? rawW : null
        const r = Math.max(0, Math.floor(Number(reps) || 0))
        const s = Math.max(1, Math.floor(Number(sets) || 1))
        onSave(log.id, {
          kind: 'weighted',
          weight: bodyweight ? null : w == null ? 0 : w,
          bodyweight,
          reps: r,
          sets: s,
          note: note.trim(),
        })
      } else {
        const d = Math.max(0, Math.floor(Number(duration) || 0))
        onSave(log.id, {
          kind: 'timed',
          durationSec: d,
          note: note.trim(),
        })
      }
      onClose()
    } catch (e) {
      console.error('[Apex] Edit set save failed', e)
    }
  }

  return (
    <div
      className="w-full max-w-lg rounded-t-[12px] sm:rounded-[12px] apex-card p-5 max-h-[90vh] overflow-y-auto"
      style={{ ['--accent' as string]: accent }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="apex-section-label">Edit set</p>
          <h2 className="mt-1 text-[13px] font-normal text-[#e0e0e0]">{log.exerciseName}</h2>
        </div>
        <button
          type="button"
          className="min-h-11 min-w-11 rounded-[12px] border border-[#1e1e1e] bg-[#121212] text-[13px] text-[#e0e0e0]"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {log.kind === 'weighted' ? (
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
          Save changes
        </button>
      </div>
    </div>
  )
}

export function EditSetLogModal({ open, log, accent, unit, onClose, onSave }: Props) {
  if (!open || !log) return null
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center bg-black/75 p-0 sm:p-4">
      <EditSetLogModalInner key={log.id} log={log} accent={accent} unit={unit} onClose={onClose} onSave={onSave} />
    </div>
  )
}
