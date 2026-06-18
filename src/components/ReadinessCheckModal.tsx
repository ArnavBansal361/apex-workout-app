import { useEffect, useState } from 'react'
import {
  readinessFromResponses,
  type ReadinessResponses,
  type ReadinessResult,
} from '../lib/readiness'
import { insertReadinessCheck } from '../lib/supabase'
import { useWorkout } from '../context/WorkoutContext'

type Props = {
  open: boolean
  userId: string
  todayKey: string
  onClose: () => void
  onComplete: () => void
}

type QuestionKey = keyof ReadinessResponses

const QUESTIONS: {
  key: QuestionKey
  label: string
  prompt?: string
  low: string
  high: string
}[] = [
  { key: 'recovery', label: 'Recovery', low: 'Worn out', high: 'Fully recovered' },
  { key: 'sleepQuality', label: 'Sleep quality', low: 'Poor', high: 'Excellent' },
  {
    key: 'cognitiveFatigue',
    label: 'Cognitive fatigue',
    prompt: 'How mentally tired are you?',
    low: 'Alert',
    high: 'Exhausted',
  },
  {
    key: 'stress',
    label: 'Stress',
    prompt: 'How stressed are you today?',
    low: 'Very calm',
    high: 'Very stressed',
  },
]

function ScaleRow({
  label,
  prompt,
  low,
  high,
  value,
  onChange,
}: {
  label: string
  prompt?: string
  low: string
  high: string
  value: number | null
  onChange: (n: number) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium text-[var(--apex-text-primary)]">{label}</p>
      {prompt ? (
        <p className="text-[12px] font-medium text-[var(--apex-text-secondary)] leading-snug">{prompt}</p>
      ) : null}
      <div className="flex gap-2">
        {([1, 2, 3, 4, 5] as const).map((n) => {
          const active = value === n
          return (
            <button
              key={n}
              type="button"
              aria-label={`${label} ${n} of 5`}
              aria-pressed={active}
              className={`flex-1 min-h-10 rounded-[8px] border-[0.5px] text-[13px] font-medium tabular-nums touch-manipulation ${
                active
                  ? 'border-white/25 bg-white/[0.14] text-[var(--apex-text-primary)]'
                  : 'border-white/[0.08] text-[var(--apex-text-secondary)] hover:border-white/[0.14]'
              }`}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          )
        })}
      </div>
      <div className="flex justify-between text-[10px] font-medium text-[var(--apex-text-tertiary)] uppercase tracking-wide">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  )
}

export function ReadinessCheckModal({ open, userId, todayKey, onClose, onComplete }: Props) {
  const { logReadinessCheck } = useWorkout()
  const [responses, setResponses] = useState<Partial<ReadinessResponses>>({})
  const [result, setResult] = useState<ReadinessResult | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setResponses({})
    setResult(null)
    setSaving(false)
  }, [open])

  if (!open) return null

  const complete =
    responses.recovery != null &&
    responses.cognitiveFatigue != null &&
    responses.stress != null &&
    responses.sleepQuality != null

  function patch(key: QuestionKey, value: number) {
    setResponses((prev) => ({ ...prev, [key]: value }))
    setResult(null)
  }

  function showResult() {
    if (!complete) return
    setResult(
      readinessFromResponses({
        recovery: responses.recovery!,
        cognitiveFatigue: responses.cognitiveFatigue!,
        stress: responses.stress!,
        sleepQuality: responses.sleepQuality!,
      }),
    )
  }

  async function startWorkout() {
    if (!complete || !result) return
    setSaving(true)
    const payload: ReadinessResponses = {
      recovery: responses.recovery!,
      cognitiveFatigue: responses.cognitiveFatigue!,
      stress: responses.stress!,
      sleepQuality: responses.sleepQuality!,
    }
    try {
      await insertReadinessCheck(userId, todayKey, payload, result)
    } catch {
      /* proceed even if cloud save fails */
    }
    logReadinessCheck({
      dateKey: todayKey,
      recovery: payload.recovery,
      cognitiveFatigue: payload.cognitiveFatigue,
      stress: payload.stress,
      sleepQuality: payload.sleepQuality,
      combinedScore: result.combinedScore,
      recommendation: result.tier,
    })
    setSaving(false)
    onComplete()
    onClose()
  }

  return (
    <div
      role="presentation"
      className="apex-modal-overlay fixed inset-0 z-[94] flex items-end justify-center sm:items-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="readiness-title"
        className="w-full max-w-sm apex-card p-5 max-h-[min(92dvh,36rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="apex-section-label">Readiness check</p>
        <h2 id="readiness-title" className="mt-2 text-[15px] font-medium text-[var(--apex-text-primary)]">
          Quick check before you train
        </h2>
        <p className="mt-2 text-[13px] font-medium text-[var(--apex-text-secondary)] leading-relaxed">
          Rate how you feel right now — we&apos;ll suggest how hard to push today.
        </p>

        {!result ? (
          <>
            <div className="mt-5 space-y-5">
              {QUESTIONS.map((q) => (
                <ScaleRow
                  key={q.key}
                  label={q.label}
                  prompt={q.prompt}
                  low={q.low}
                  high={q.high}
                  value={responses[q.key] ?? null}
                  onChange={(n) => patch(q.key, n)}
                />
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <button type="button" className="apex-btn min-h-12 flex-1" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="apex-btn-primary min-h-12 flex-1 disabled:opacity-45"
                disabled={!complete}
                onClick={showResult}
              >
                See recommendation
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-5 rounded-[12px] border-[0.5px] border-white/[0.08] bg-white/[0.03] px-4 py-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--apex-text-secondary)]">
                Recommendation
              </p>
              <p className="mt-2 text-[16px] font-medium text-[var(--apex-text-primary)]">{result.title}</p>
              <p className="mt-2 text-[13px] font-medium text-[var(--apex-text-secondary)] leading-relaxed">
                {result.message}
              </p>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                className="apex-btn min-h-12 flex-1"
                disabled={saving}
                onClick={() => setResult(null)}
              >
                Back
              </button>
              <button
                type="button"
                className="apex-btn-primary min-h-12 flex-1 disabled:opacity-45"
                disabled={saving}
                onClick={() => void startWorkout()}
              >
                {saving ? 'Saving…' : 'Continue'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
