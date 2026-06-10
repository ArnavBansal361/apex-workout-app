import { useEffect, useState } from 'react'
import { TRAINING_MODES, type TrainingMode } from '../lib/trainingMode'
import { insertWorkoutSession } from '../lib/supabase'

type Props = {
  open: boolean
  userId: string
  todayKey: string
  onClose: () => void
  onComplete: (mode: TrainingMode) => void
}

export function TrainingModeModal({ open, userId, todayKey, onClose, onComplete }: Props) {
  const [selected, setSelected] = useState<TrainingMode | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelected(null)
    setSaving(false)
  }, [open])

  if (!open) return null

  async function confirm() {
    if (!selected) return
    setSaving(true)
    try {
      await insertWorkoutSession(userId, todayKey, selected)
    } catch {
      /* proceed even if cloud save fails */
    }
    setSaving(false)
    onComplete(selected)
    onClose()
  }

  return (
    <div
      role="presentation"
      className="apex-modal-overlay fixed inset-0 z-[95] flex items-end justify-center sm:items-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="training-mode-title"
        className="w-full max-w-sm apex-card p-5 max-h-[min(92dvh,36rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="apex-section-label">Training mode</p>
        <h2 id="training-mode-title" className="mt-2 text-[15px] font-medium text-[#ececee]">
          How do you want to train today?
        </h2>
        <p className="mt-2 text-[13px] font-medium text-[#a0a0a8] leading-relaxed">
          This shapes your coach&apos;s tone and sets the intent for the session.
        </p>

        <div className="mt-5 space-y-2">
          {TRAINING_MODES.map((mode) => {
            const active = selected === mode.id
            return (
              <button
                key={mode.id}
                type="button"
                aria-pressed={active}
                className={`w-full rounded-[12px] border px-4 py-3 text-left touch-manipulation transition-colors ${
                  active
                    ? 'border-white/25 bg-white/[0.1]'
                    : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14]'
                }`}
                onClick={() => setSelected(mode.id)}
              >
                <p className="text-[14px] font-medium text-[#ececee]">{mode.label}</p>
                <p className="mt-1 text-[12px] font-medium text-[#a0a0a8] leading-relaxed">
                  {mode.hint}
                </p>
              </button>
            )
          })}
        </div>

        {selected ? (
          <p className="mt-4 text-[13px] font-medium text-[#ececee] leading-relaxed">
            {TRAINING_MODES.find((m) => m.id === selected)?.framing}
          </p>
        ) : null}

        <div className="mt-6 flex gap-3">
          <button type="button" className="apex-btn min-h-12 flex-1" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="apex-btn-primary min-h-12 flex-1 disabled:opacity-45"
            disabled={!selected || saving}
            onClick={() => void confirm()}
          >
            {saving ? 'Saving…' : 'Start workout'}
          </button>
        </div>
      </div>
    </div>
  )
}
