import { useMemo } from 'react'
import { suggestPostWorkoutStretches, muscleGroupsTrainedToday } from '../lib/stretchSuggestions'
import type { SetLog } from '../types'
import { useWorkout } from '../context/WorkoutContext'

type Props = {
  setLogs: SetLog[]
  todayKey: string
  compact?: boolean
}

export function PostWorkoutStretchesCard({ setLogs, todayKey, compact }: Props) {
  const { addPlanExercise, notify } = useWorkout()

  const trained = useMemo(
    () => muscleGroupsTrainedToday(setLogs, todayKey),
    [setLogs, todayKey],
  )

  const suggestions = useMemo(
    () => suggestPostWorkoutStretches(trained, compact ? 5 : 8),
    [trained, compact],
  )

  if (!suggestions.length) return null

  const trainedLabel =
    trained.length > 0 ? trained.join(', ') : 'general recovery'

  return (
    <div className="apex-card p-4 space-y-3">
      <div>
        <p className="apex-section-label">Cooldown</p>
        <h3 className="text-[15px] font-medium text-[#f0f0f2] tracking-tight mt-1">
          Suggested stretches
        </h3>
        <p className="mt-1.5 text-[12px] font-medium text-[var(--apex-text-secondary)] leading-relaxed">
          Based on {trainedLabel} work today — hold each stretch as noted.
        </p>
      </div>
      <ul className="space-y-2.5">
        {suggestions.map((s) => (
          <li
            key={s.id}
            className="rounded-[12px] border-[0.5px] border-white/[0.06] bg-white/[0.03] px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[var(--apex-text-primary)]">{s.name}</p>
                <p className="text-[11px] font-medium text-[var(--apex-text-tertiary)] mt-0.5">
                  {s.targets.join(' · ')} · {s.hold}
                </p>
                {!compact ? (
                  <p className="text-[12px] text-[#a8a8b0] mt-1.5 leading-relaxed line-clamp-3">
                    {s.instructions}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="shrink-0 min-h-9 px-2.5 rounded-[8px] border-[0.5px] border-white/[0.1] text-[11px] font-medium text-[var(--apex-text-primary)] hover:bg-white/[0.06]"
                onClick={() => {
                  addPlanExercise(s.id)
                  notify(`Added ${s.name} to today’s plan`)
                }}
              >
                Add
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-[#7d7d88] leading-relaxed">
        Browse the full library under Exercises → Stretches.
      </p>
    </div>
  )
}

/** Detail for session summary modal (no hooks). */
export function stretchSuggestionsForSummary(
  setLogs: SetLog[],
  todayKey: string,
): { id: string; name: string; hold: string; targets: string; instructions: string }[] {
  const trained = muscleGroupsTrainedToday(setLogs, todayKey)
  return suggestPostWorkoutStretches(trained, 6).map((s) => ({
    id: s.id,
    name: s.name,
    hold: s.hold,
    targets: s.targets.join(', '),
    instructions: s.instructions,
  }))
}
