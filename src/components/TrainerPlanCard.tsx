import { useEffect, useState } from 'react'
import { fetchAssignedWorkoutForClient } from '../lib/supabase'
import { dateKey } from '../lib/dates'
import type { AssignedWorkout } from '../types'

export function TrainerPlanCard({ clientUserId }: { clientUserId: string }) {
  const today = dateKey(new Date())
  const [plan, setPlan] = useState<AssignedWorkout | null | 'loading'>('loading')

  useEffect(() => {
    fetchAssignedWorkoutForClient(clientUserId, today)
      .then(setPlan)
      .catch(() => setPlan(null))
  }, [clientUserId, today])

  if (plan === 'loading' || plan === null) return null

  return (
    <div className="apex-card px-4 py-4" style={{ borderColor: 'rgba(61,122,181,0.3)' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--apex-accent)]">Trainer plan · today</p>
          {plan.title && (
            <p className="text-[16px] font-medium text-[var(--apex-text-primary)] mt-0.5">{plan.title}</p>
          )}
        </div>
      </div>

      {plan.exercises.length > 0 && (
        <div className="space-y-2 mb-3">
          {plan.exercises.map((ex, i) => (
            <div key={i} className="flex items-start justify-between gap-3 py-2 border-b border-[0.5px] border-[var(--apex-border)] last:border-0">
              <p className="text-[14px] font-medium text-[var(--apex-text-primary)]">{ex.name}</p>
              <p className="text-[13px] text-[var(--apex-text-secondary)] tabular-nums shrink-0">
                {ex.sets}×{ex.reps}
                {ex.weightNote ? ` · ${ex.weightNote}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      {plan.notes && (
        <p className="text-[13px] text-[var(--apex-text-secondary)] leading-relaxed">{plan.notes}</p>
      )}
    </div>
  )
}
