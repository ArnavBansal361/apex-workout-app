import type { WarmupPlan } from '../lib/warmupGenerator'

type Props = {
  open: boolean
  plan: WarmupPlan | null
  onSkip: () => void
  onStart: () => void
}

export function WarmupCardModal({ open, plan, onSkip, onStart }: Props) {
  if (!open || !plan) return null

  const focusLabel =
    plan.muscleGroups.length > 0
      ? plan.muscleGroups.join(', ')
      : 'Full body'

  const basedOnLabel =
    plan.basedOn.length > 0 && plan.basedOn[0] !== 'General session'
      ? plan.basedOn.slice(0, 4).join(', ') +
        (plan.basedOn.length > 4 ? ` +${plan.basedOn.length - 4} more` : '')
      : 'your plan for today'

  return (
    <div
      role="presentation"
      className="apex-modal-overlay fixed inset-0 z-[96] flex items-end justify-center sm:items-center p-4"
      onClick={onSkip}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="warmup-title"
        className="w-full max-w-sm apex-card p-5 max-h-[min(92dvh,36rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="apex-section-label">Warm-up</p>
        <h2 id="warmup-title" className="mt-2 text-[15px] font-medium text-[var(--apex-text-primary)]">
          ~{plan.estimatedMinutes} min before you lift
        </h2>
        <p className="mt-2 text-[13px] font-medium text-[var(--apex-text-secondary)] leading-relaxed">
          Built for <span className="text-[var(--apex-text-secondary)]">{focusLabel}</span> work based on{' '}
          {basedOnLabel}.
        </p>

        <ol className="mt-5 space-y-3">
          {plan.movements.map((m, i) => (
            <li
              key={`${m.name}-${i}`}
              className="rounded-[12px] border-[0.5px] border-white/[0.08] bg-white/[0.03] px-3.5 py-3"
            >
              <p className="text-[13px] font-medium text-[var(--apex-text-primary)]">
                {i + 1}. {m.name}
              </p>
              <p className="mt-1 text-[12px] font-medium text-[var(--apex-text-tertiary)] tabular-nums">
                {m.prescription}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            className="apex-btn-primary min-h-12 w-full text-[13px] font-medium touch-manipulation"
            onClick={onStart}
          >
            Done — start workout
          </button>
          <button
            type="button"
            className="apex-btn min-h-12 w-full text-[13px] font-medium touch-manipulation"
            onClick={onSkip}
          >
            Skip warm-up
          </button>
        </div>
      </div>
    </div>
  )
}
