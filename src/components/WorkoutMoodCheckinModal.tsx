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

const QUESTIONS: { key: MoodKey; label: string }[] = [
  { key: 'moodBefore', label: 'How did you feel going in?' },
  { key: 'moodAfter', label: 'How do you feel now?' },
]

function ScaleRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (n: number) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium text-[var(--apex-text-primary)]">{label}</p>
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

  return (
    <div
      role="presentation"
      className="apex-modal-overlay fixed inset-0 z-[96] flex items-end justify-center sm:items-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mood-checkin-title"
        className="w-full max-w-sm apex-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="apex-section-label">Post-workout</p>
        <h2 id="mood-checkin-title" className="mt-2 text-[15px] font-medium text-[var(--apex-text-primary)]">
          Quick check-in
        </h2>

        <div className="mt-5 space-y-5">
          {QUESTIONS.map((q) => (
            <ScaleRow
              key={q.key}
              label={q.label}
              value={responses[q.key] ?? null}
              onChange={(n) => patch(q.key, n)}
            />
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            className="apex-btn min-h-12 w-full text-[13px] font-medium text-[var(--apex-text-secondary)]"
            onClick={onClose}
          >
            Skip
          </button>
          <button
            type="button"
            className="apex-btn-primary min-h-12 w-full disabled:opacity-45"
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

const FEEL_EMOJIS = ['😞', '😐', '🙂', '😄', '💪'] as const
const ENERGY_EMOJIS = ['🪫', '😴', '😐', '⚡', '🔋'] as const

function RatingSliderCard({
  label,
  value,
  emojis,
  onChange,
}: {
  label: string
  value: number
  emojis: readonly string[]
  onChange: (n: number) => void
}) {
  return (
    <div className="apex-post-workout-card">
      <p className="apex-post-workout-card__label">{label}</p>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        className="apex-post-workout-slider"
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="apex-post-workout-emojis" aria-hidden>
        {emojis.map((emoji, i) => (
          <span
            key={emoji}
            className={`apex-post-workout-emoji${value === i + 1 ? ' apex-post-workout-emoji--active' : ''}`}
          >
            {emoji}
          </span>
        ))}
      </div>
    </div>
  )
}

type PostWorkoutCheckinProps = {
  open: boolean
  todayKey: string
  trainingMode: import('../lib/trainingMode').TrainingMode | null
  onDone: () => void
  onSkip: () => void
}

export function PostWorkoutCheckinScreen({
  open,
  todayKey,
  trainingMode,
  onDone,
  onSkip,
}: PostWorkoutCheckinProps) {
  const { logPostWorkoutCheckin } = useWorkout()
  const [feel, setFeel] = useState(3)
  const [energy, setEnergy] = useState(3)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!open) {
      setVisible(false)
      return
    }
    setFeel(3)
    setEnergy(3)
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    document.body.classList.toggle('apex-post-workout-checkin-active', open)
    return () => document.body.classList.remove('apex-post-workout-checkin-active')
  }, [open])

  if (!open) return null

  function finish(save: boolean) {
    if (save) {
      logPostWorkoutCheckin({
        dateKey: todayKey,
        feelRating: feel,
        energyRating: energy,
        trainingMode,
      })
      onDone()
    } else {
      onSkip()
    }
  }

  return (
    <div
      className={`apex-post-workout-checkin fixed inset-0 z-[102] flex flex-col bg-[#090d14] text-white apex-post-workout-checkin--${
        visible ? 'in' : 'out'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-workout-checkin-title"
    >
      <div className="apex-post-workout-checkin__body flex-1 flex flex-col px-5 min-h-0 overflow-y-auto">
        <h1 id="post-workout-checkin-title" className="apex-post-workout-checkin__title">
          Nice work.
        </h1>
        <div className="apex-post-workout-checkin__sliders">
          <RatingSliderCard
            label="How did that feel?"
            value={feel}
            emojis={FEEL_EMOJIS}
            onChange={setFeel}
          />
          <RatingSliderCard
            label="Energy level now"
            value={energy}
            emojis={ENERGY_EMOJIS}
            onChange={setEnergy}
          />
        </div>
      </div>
      <footer className="apex-post-workout-checkin__footer apex-safe-bottom shrink-0 px-4 pb-4">
        <button type="button" className="apex-post-workout-done-btn" onClick={() => finish(true)}>
          Done
        </button>
        <button type="button" className="apex-post-workout-skip-btn" onClick={() => finish(false)}>
          Skip
        </button>
      </footer>
    </div>
  )
}
