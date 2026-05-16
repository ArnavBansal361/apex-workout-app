import { useState } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import { formatShortWeekday, parseDateKey } from '../lib/dates'
import { ApexLogo } from './ApexLogo'

type Props = {
  onComplete: () => void
}

export function Onboarding({ onComplete }: Props) {
  const { state, updateSettings, updateScheduleDay } = useWorkout()
  const accent = state.settings.accentColor
  const [step, setStep] = useState(0)
  const [name, setName] = useState(state.settings.displayName)
  const [goals, setGoals] = useState(state.settings.fitnessGoals)

  function nextFromProfile() {
    updateSettings({ displayName: name.trim(), fitnessGoals: goals.trim() })
    setStep(1)
  }

  function nextFromSchedule() {
    setStep(2)
  }

  function finish() {
    onComplete()
  }

  return (
    <div
      className="min-h-[100dvh] bg-[#0c0c0c] text-[#e0e0e0] px-4 py-6 pb-12"
      style={{ ['--accent' as string]: accent }}
    >
      <div className="max-w-lg mx-auto space-y-6">
        <ApexLogo accent={accent} />

        {step === 0 ? (
          <div className="space-y-4">
            <p className="text-[13px] text-[#555]">Welcome — let&apos;s set you up.</p>
            <h1 className="text-[18px] font-medium text-[#e0e0e0]">About you</h1>
            <label className="block space-y-2">
              <span className="apex-section-label">Display name</span>
              <input
                className="w-full min-h-12 rounded-[12px] border border-[#1e1e1e] bg-[#161616] px-3 text-[13px] text-[#e0e0e0]"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </label>
            <label className="block space-y-2">
              <span className="apex-section-label">Fitness goals</span>
              <textarea
                className="w-full min-h-28 rounded-[12px] border border-[#1e1e1e] bg-[#161616] px-3 py-2 text-[13px] text-[#e0e0e0]"
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                placeholder="What are you training for?"
              />
            </label>
            <button
              type="button"
              className="w-full min-h-12 rounded-[12px] text-[13px] font-medium text-[#0c0c0c]"
              style={{ backgroundColor: accent }}
              onClick={nextFromProfile}
            >
              Continue
            </button>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <p className="text-[13px] text-[#555]">Plan your week — you can edit anytime.</p>
            <h1 className="text-[18px] font-medium text-[#e0e0e0]">Weekly schedule</h1>
            <ul className="space-y-2">
              {state.schedule.map((d) => (
                <li key={d.dateKey} className="apex-card p-3">
                  <p className="apex-section-label mb-2">
                    {formatShortWeekday(parseDateKey(d.dateKey))} · {d.dateKey.slice(5)}
                  </p>
                  <input
                    className="w-full min-h-10 rounded-[12px] border border-[#1e1e1e] bg-[#121212] px-3 text-[13px] text-[#e0e0e0]"
                    placeholder="Workout name or Rest"
                    value={d.workoutName}
                    onChange={(e) =>
                      updateScheduleDay(d.dateKey, { workoutName: e.target.value })
                    }
                  />
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="w-full min-h-12 rounded-[12px] text-[13px] font-medium text-[#0c0c0c]"
              style={{ backgroundColor: accent }}
              onClick={nextFromSchedule}
            >
              Continue
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <h1 className="text-[18px] font-medium text-[#e0e0e0]">Log your first set</h1>
            <p className="text-[13px] text-[#555] leading-relaxed">
              Open the <strong className="text-[#e0e0e0] font-medium">Today</strong> tab, add
              exercises to <strong className="text-[#e0e0e0] font-medium">My Plan</strong>, then
              tap <strong className="text-[#e0e0e0] font-medium">Log Set</strong> to record weight,
              reps, and sets. Your history stays on this device.
            </p>
            <button
              type="button"
              className="w-full min-h-12 rounded-[12px] text-[13px] font-medium text-[#0c0c0c]"
              style={{ backgroundColor: accent }}
              onClick={finish}
            >
              Go to Today
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
