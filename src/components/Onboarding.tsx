import { useState } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import { claudeParseImport } from '../lib/anthropicCoach'
import { sanitizeWorkoutImport } from '../lib/parseWorkoutImport'
import { APEX_COACH_PROFILE_KEY } from '../lib/persist'
import { ApexLogo } from './ApexLogo'

type Props = {
  onComplete: () => void
}

const inp =
  'w-full min-h-12 rounded-[12px] border border-[#1e1e1e] bg-[#161616] px-3 text-[13px] text-[#e0e0e0] placeholder:text-[#9898a0]'

export function Onboarding({ onComplete }: Props) {
  const { state, updateSettings, mergeImport, notify } = useWorkout()
  const [name, setName] = useState(state.settings.displayName)
  const [goals, setGoals] = useState(state.settings.fitnessGoals)
  const [unit, setUnit] = useState<'lbs' | 'kg'>(state.settings.unit)
  const [migrationText, setMigrationText] = useState('')
  const [busy, setBusy] = useState(false)

  async function finish() {
    const fitnessGoal = goals.trim()
    updateSettings({
      displayName: name.trim(),
      fitnessGoals: fitnessGoal,
      unit,
    })
    try {
      localStorage.setItem(APEX_COACH_PROFILE_KEY, JSON.stringify({ fitnessGoal }))
    } catch {
      /* ignore */
    }

    const notes = migrationText.trim()
    if (notes) {
      setBusy(true)
      try {
        const raw = await claudeParseImport(state, notes)
        const partial = sanitizeWorkoutImport(raw, state)
        if (
          partial.setLogs?.length ||
          partial.cardioEntries?.length ||
          partial.bodyweightLogs?.length ||
          partial.schedule
        ) {
          mergeImport(partial, { silent: true })
        }
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Could not parse migration notes')
        setBusy(false)
        return
      }
      setBusy(false)
    }

    onComplete()
  }

  return (
    <div className="apex-safe-top apex-theme-shell min-h-[100dvh] bg-[var(--apex-surface-page)] text-[var(--apex-text-primary)] px-4 py-6 pb-12">
      <div className="max-w-lg mx-auto space-y-6">
        <ApexLogo />

        <div className="space-y-4">
          <p className="text-[13px] text-[#a0a0a8]">Welcome — let&apos;s set you up.</p>
          <h1 className="text-[18px] font-medium text-[#e0e0e0]">Get started</h1>

          <label className="block space-y-2">
            <span className="apex-section-label">Display name</span>
            <input
              className={inp}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </label>

          <label className="block space-y-2">
            <span className="apex-section-label">Fitness goal</span>
            <textarea
              className="w-full min-h-28 rounded-[12px] border border-[#1e1e1e] bg-[#161616] px-3 py-2 text-[13px] text-[#e0e0e0]"
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              placeholder="What are you training for?"
            />
          </label>

          <div>
            <span className="apex-section-label block mb-2">Weight unit</span>
            <div className="apex-unit-segment">
              <button
                type="button"
                className={unit === 'lbs' ? 'apex-unit-segment--active' : ''}
                onClick={() => setUnit('lbs')}
              >
                lbs
              </button>
              <button
                type="button"
                className={unit === 'kg' ? 'apex-unit-segment--active' : ''}
                onClick={() => setUnit('kg')}
              >
                kg
              </button>
            </div>
          </div>

          <label className="block space-y-2">
            <span className="apex-section-label">Import past workouts (optional)</span>
            <p className="text-[12px] font-medium text-[#a0a0a8] leading-relaxed">
              Paste notes from another app — Apex will parse them with AI after you finish setup.
            </p>
            <textarea
              className="w-full min-h-32 rounded-[12px] border border-[#1e1e1e] bg-[#161616] px-3 py-2 text-[13px] text-[#e0e0e0]"
              value={migrationText}
              onChange={(e) => setMigrationText(e.target.value)}
              placeholder="Paste workout history or notes…"
            />
          </label>

          <button
            type="button"
            disabled={busy}
            className="apex-btn-primary w-full min-h-12 text-[13px] font-medium disabled:opacity-50"
            onClick={() => void finish()}
          >
            {busy ? 'Parsing…' : 'Continue to Today'}
          </button>
        </div>
      </div>
    </div>
  )
}
