import { useEffect, useState } from 'react'
import { insertWorkoutMoodCheckin } from '../lib/supabase'
import type { WorkoutMoodResponses } from '../lib/workoutMood'
import { workoutMoodLift } from '../lib/workoutMood'
import { useWorkout } from '../context/WorkoutContext'

type Props = {
  open: boolean
  userId: string
  todayKey: string
  onClose: () => void
  onComplete: () => void
}

type MoodKey = keyof WorkoutMoodResponses

const QUESTIONS: { key: MoodKey; label: string; low: string; high: string }[] = [
  { key: 'moodBefore', label: 'Mood before', low: 'Low', high: 'Great' },
  { key: 'moodAfter', label: 'Mood after', low: 'Low', high: 'Great' },
]

function ScaleRow({
  label,
  low,
  high,
  value,
  onChange,
}: {
  label: string
  low: string
  high: string
  value: number | null
  onChange: (n: number) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium text-[#ececee]">{label}</p>
      <div className="flex gap-2">
        {([1, 2, 3, 4, 5] as const).map((n) => {
          const active = value === n
          return (
            <button
              key={n}
              type="button"
              aria-label={`${label} ${n} of 5`}
              aria-pressed={active}
              className={`flex-1 min-h-10 rounded-[12px] border text-[13px] font-semibold tabular-nums touch-manipulation ${
                active
                  ? 'border-white/25 bg-white/[0.14] text-[#ececee]'
                  : 'border-white/[0.08] text-[#a0a0a8] hover:border-white/[0.14]'
              }`}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          )
        })}
      </div>
      <div className="flex justify-between text-[10px] font-medium text-[#7d7d88] uppercase tracking-wide">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  )
}

export function WorkoutMoodCheckinModal({ open, userId, todayKey, onClose, onComplete }: Props) {
  const { logWorkoutMoodCheckin } = useWorkout()
  const [responses, setResponses] = useState<Partial<WorkoutMoodResponses>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setResponses({})
    setSaving(false)
  }, [open])

  if (!open) return null

  const complete = responses.moodBefore != null && responses.moodAfter != null

  function patch(key: MoodKey, value: number) {
    setResponses((prev) => ({ ...prev, [key]: value }))
  }

  async function save() {
    if (!complete) return
    setSaving(true)
    const payload: WorkoutMoodResponses = {
      moodBefore: responses.moodBefore!,
      moodAfter: responses.moodAfter!,
    }
    try {
      await insertWorkoutMoodCheckin(userId, todayKey, payload)
    } catch {
      /* proceed even if cloud save fails */
    }
    logWorkoutMoodCheckin({
      dateKey: todayKey,
      moodBefore: payload.moodBefore,
      moodAfter: payload.moodAfter,
      moodLift: workoutMoodLift(payload),
    })
    setSaving(false)
    onComplete()
  }

  function skip() {
    onClose()
  }

  return (
    <div
      role="presentation"
      className="apex-modal-overlay fixed inset-0 z-[96] flex items-end justify-center sm:items-center p-4"
      onClick={skip}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mood-checkin-title"
        className="w-full max-w-sm apex-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="apex-section-label">Check-in</p>
        <h2 id="mood-checkin-title" className="mt-2 text-[15px] font-semibold text-[#ececee]">
          How did that session feel?
        </h2>
        <p className="mt-2 text-[13px] font-medium text-[#a0a0a8] leading-relaxed">
          Two quick taps — we&apos;ll track your mood lift over time.
        </p>

        <div className="mt-5 space-y-5">
          {QUESTIONS.map((q) => (
            <ScaleRow
              key={q.key}
              label={q.label}
              low={q.low}
              high={q.high}
              value={responses[q.key] ?? null}
              onChange={(n) => patch(q.key, n)}
            />
          ))}
        </div>

        <div className="mt-6 flex gap-3">
          <button type="button" className="apex-btn min-h-12 flex-1" onClick={skip}>
            Skip
          </button>
          <button
            type="button"
            className="apex-btn-primary min-h-12 flex-1 disabled:opacity-45"
            disabled={!complete || saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
