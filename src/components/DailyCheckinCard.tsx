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
  const [saved, setSaved] = useState(!!existing)

  useEffect(() => {
    if (existing) {
      setWeight(existing.weightLbs != null ? String(existing.weightLbs) : '')
      setSaved(true)
    }
  }, [today])

  function handleSave() {
    const w = parseFloat(weight)
    const weightVal = !isNaN(w) && w > 0 ? w : null
    saveDailyCheckin(today, weightVal, '')
    if (weightVal != null) addBodyweight(weightVal)
    setSaved(true)
  }

  if (saved && existing) {
    return (
      <div className="apex-card px-4 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--apex-text-tertiary)]">Today's check-in</p>
          <p className="mt-1 text-[14px] font-medium text-[var(--apex-text-primary)]">
            {existing.weightLbs != null ? `${existing.weightLbs} ${state.settings.unit}` : 'Logged'}
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
      <p className="text-[11px] text-[var(--apex-text-tertiary)] mb-1">Weight ({state.settings.unit})</p>
      <input
        type="number"
        inputMode="decimal"
        className="w-full rounded-[8px] px-3 py-2.5 text-[14px] text-[var(--apex-text-primary)] border-[0.5px] border-[var(--apex-border)] bg-[var(--apex-surface-nested)] outline-none focus:border-[var(--apex-accent)] mb-3"
        placeholder={lastWeight != null ? String(lastWeight) : '0'}
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
      />
      <button
        type="button"
        className="w-full rounded-[8px] py-2.5 text-[14px] font-medium text-[var(--apex-text-primary)] border-[0.5px] border-[var(--apex-border)] bg-[var(--apex-surface-nested)]"
        style={weight ? { background: 'var(--apex-accent)', color: '#fff', borderColor: 'var(--apex-accent)' } : undefined}
        onClick={handleSave}
        disabled={!weight}
      >
        Save
      </button>
    </div>
  )
}
