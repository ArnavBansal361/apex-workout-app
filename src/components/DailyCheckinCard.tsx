import { useState, useEffect } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import { dateKey } from '../lib/dates'

export function DailyCheckinCard() {
  const { state, saveDailyCheckin, addBodyweight } = useWorkout()
  const today = dateKey(new Date())
  const existing = state.dailyCheckins?.find((c) => c.dateKey === today)

  const lastWeight = state.bodyweightLogs.length > 0
    ? state.bodyweightLogs[state.bodyweightLogs.length - 1].value
    : null

  const [weight, setWeight] = useState(
    existing?.weightLbs != null
      ? String(existing.weightLbs)
      : lastWeight != null ? String(lastWeight) : '',
  )
  const [food, setFood] = useState(existing?.foodNote ?? '')
  const [saved, setSaved] = useState(!!existing)

  useEffect(() => {
    if (existing) {
      setWeight(existing.weightLbs != null ? String(existing.weightLbs) : '')
      setFood(existing.foodNote)
      setSaved(true)
    }
  }, [today])

  function handleSave() {
    const w = parseFloat(weight)
    const weightVal = !isNaN(w) && w > 0 ? w : null
    saveDailyCheckin(today, weightVal, food.trim())
    if (weightVal != null) addBodyweight(weightVal)
    setSaved(true)
  }

  if (saved && existing) {
    return (
      <div className="apex-card px-4 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--apex-text-tertiary)]">Today's check-in</p>
          <p className="mt-1 text-[14px] text-[var(--apex-text-primary)]">
            {existing.weightLbs != null && (
              <span className="font-medium">{existing.weightLbs} {state.settings.unit} · </span>
            )}
            <span className="text-[var(--apex-text-secondary)]">{existing.foodNote || 'No food note'}</span>
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 text-[12px] text-[var(--apex-text-tertiary)] border-[0.5px] border-[var(--apex-border)] rounded-[8px] px-3 py-1.5"
          onClick={() => setSaved(false)}
        >
          Edit
        </button>
      </div>
    )
  }

  return (
    <div className="apex-card px-4 py-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--apex-text-tertiary)] mb-3">Today's check-in</p>
      <div className="flex gap-2 mb-2">
        <div className="flex-1">
          <p className="text-[11px] text-[var(--apex-text-tertiary)] mb-1">Weight ({state.settings.unit})</p>
          <input
            type="number"
            inputMode="decimal"
            className="w-full rounded-[8px] px-3 py-2.5 text-[14px] text-[var(--apex-text-primary)] border-[0.5px] border-[var(--apex-border)] bg-[var(--apex-surface-nested)] outline-none focus:border-[var(--apex-accent)]"
            placeholder={lastWeight != null ? String(lastWeight) : '0'}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </div>
      </div>
      <div className="mb-3">
        <p className="text-[11px] text-[var(--apex-text-tertiary)] mb-1">What did you eat? <span style={{ opacity: 0.5 }}>(rough is fine)</span></p>
        <input
          type="text"
          className="w-full rounded-[8px] px-3 py-2.5 text-[14px] text-[var(--apex-text-primary)] border-[0.5px] border-[var(--apex-border)] bg-[var(--apex-surface-nested)] outline-none focus:border-[var(--apex-accent)]"
          placeholder="e.g. chicken + rice, ~130g protein"
          value={food}
          onChange={(e) => setFood(e.target.value)}
        />
      </div>
      <button
        type="button"
        className="w-full rounded-[8px] py-2.5 text-[14px] font-medium text-[var(--apex-text-primary)] border-[0.5px] border-[var(--apex-border)] bg-[var(--apex-surface-nested)]"
        style={weight || food ? { background: 'var(--apex-accent)', color: '#fff', borderColor: 'var(--apex-accent)' } : undefined}
        onClick={handleSave}
        disabled={!weight && !food}
      >
        Save check-in
      </button>
    </div>
  )
}
