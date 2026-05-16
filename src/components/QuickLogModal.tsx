import { useMemo, useState } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import type { Exercise } from '../types'

type Props = {
  accent: string
  onClose: () => void
}

const inp =
  'rounded-[12px] border border-[#1e1e1e] bg-[#121212] px-3 text-[16px] font-normal text-[#e0e0e0] placeholder:text-[#555]'

export function QuickLogModal({ accent, onClose }: Props) {
  const { visibleExercises, addSetLog, notify, state } = useWorkout()
  const unit = state.settings.unit

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Exercise | null>(null)
  const [bodyweight, setBodyweight] = useState(false)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('8')
  const [sets, setSets] = useState('1')
  const [note, setNote] = useState('')

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
    const r = Math.max(0, Math.floor(Number(reps) || 0))
    const s = Math.max(1, Math.floor(Number(sets) || 1))
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

  return (
    <div className="fixed inset-0 z-[93] flex items-end justify-center sm:items-center bg-black/80 p-0 sm:p-4">
      <div
        className="w-full max-w-lg max-h-[min(92dvh,40rem)] flex flex-col rounded-t-[12px] sm:rounded-[12px] apex-card sm:max-h-[85vh]"
        style={{ ['--accent' as string]: accent }}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3 shrink-0 border-b border-[#1e1e1e]">
          <div>
            <p className="apex-section-label">Quick log</p>
            <p className="mt-1 text-[12px] font-normal text-[#888] leading-relaxed">
              Search any exercise, enter load and volume, save — no plan required.
            </p>
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
                <li className="px-3 py-3 text-[13px] text-[#888]">No matches</li>
              ) : (
                filtered.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className={`w-full min-h-11 border-l-2 text-left px-3 py-2.5 text-[13px] font-normal transition-colors ${
                        selected?.id === e.id
                          ? 'bg-[#1a1a24] text-[#e0e0e0]'
                          : 'border-transparent text-[#e0e0e0] hover:bg-[#1e1e1e]'
                      }`}
                      style={{ borderLeftColor: selected?.id === e.id ? accent : 'transparent' }}
                      onClick={() => setSelected(e)}
                    >
                      <span>{e.name}</span>
                      <span className="text-[#888]"> · {e.muscleGroup}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          {selected ? (
            <div className="space-y-3 rounded-[12px] border border-[#1e1e1e] bg-[#161616] p-4">
              <p className="text-[13px] font-normal text-[#e0e0e0]">
                <span className="text-[#888]">Selected · </span>
                {selected.name}
              </p>
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
                    className={`w-full min-h-12 ${inp}`}
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="0"
                  />
                </label>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="apex-section-label block mb-2">Reps</span>
                  <input
                    inputMode="numeric"
                    className={`w-full min-h-12 ${inp}`}
                    value={reps}
                    onChange={(e) => setReps(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="apex-section-label block mb-2">Sets</span>
                  <input
                    inputMode="numeric"
                    className={`w-full min-h-12 ${inp}`}
                    value={sets}
                    onChange={(e) => setSets(e.target.value)}
                  />
                </label>
              </div>
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
            className="min-h-12 flex-1 rounded-[12px] text-[13px] font-medium text-[#0c0c0c]"
            style={{ backgroundColor: accent }}
            onClick={() => save()}
          >
            Save set
          </button>
        </div>
      </div>
    </div>
  )
}
