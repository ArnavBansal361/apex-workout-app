import { useState, type ReactNode } from 'react'
import { FITNESS_GOAL_OPTIONS, type FitnessGoalType } from '../types'
import { useSwipeBackLayer } from '../lib/swipeBackNavigation'
import { useWorkout } from '../context/WorkoutContext'
import { APEX_COACH_PROFILE_KEY } from '../lib/persist'
import { APEX_LOGO_URL } from '../lib/apexBrand'
import { writeGymBarcode } from '../lib/gymBarcode'
import { buildTendedUserStateDaySnapshot } from '../lib/tendedUserState'
import { dateKey } from '../lib/dates'
import { connectClientToTrainer, upsertTendedUserState } from '../lib/supabase'
import { trainerConnectErrorMessage } from '../lib/trainer'
import {
  isSpotifyConfigured,
  isSpotifyConnected,
  startSpotifyOAuth,
} from '../lib/spotify'

type Props = {
  onComplete: (opts?: { markHealthPromptDone?: boolean }) => void
}

function OnboardingField({
  label,
  optional,
  children,
}: {
  label: string
  optional?: boolean
  children: ReactNode
}) {
  return (
    <label className="apex-onboarding-field block">
      <span className="apex-onboarding-field__label">
        {label}
        {optional ? <span className="apex-onboarding-field__optional"> optional</span> : null}
      </span>
      {children}
    </label>
  )
}

function OnboardingShell({
  step,
  onBack,
  children,
  footer,
}: {
  step: 1 | 2 | 3
  onBack?: () => void
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="apex-onboarding">
      <header className="apex-onboarding__top apex-safe-top">
        {onBack ? (
          <button type="button" className="apex-onboarding__back" onClick={onBack} aria-label="Back">
            ‹
          </button>
        ) : (
          <span className="apex-onboarding__back-placeholder" aria-hidden />
        )}
        <div className="apex-onboarding__dots" aria-hidden>
          {([1, 2, 3] as const).map((n) => (
            <span
              key={n}
              className={n === step ? 'apex-onboarding__dot apex-onboarding__dot--active' : 'apex-onboarding__dot'}
            />
          ))}
        </div>
        <span className="apex-onboarding__counter tabular-nums">
          {step}/3
        </span>
      </header>

      <div className="apex-onboarding__body">{children}</div>

      <footer className="apex-onboarding__footer apex-safe-bottom">{footer}</footer>
    </div>
  )
}

function PrimaryOnboardingButton({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="apex-onboarding__primary"
      disabled={disabled}
      onClick={onClick}
    >
      {label} →
    </button>
  )
}

export function Onboarding({ onComplete }: Props) {
  const {
    state,
    userId,
    updateSettings,
    notify,
    appleHealthAvailable,
    enableAppleHealthSync,
  } = useWorkout()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  useSwipeBackLayer(step > 1, () => setStep((s) => (s === 3 ? 2 : 1)))
  const [name, setName] = useState(state.settings.displayName)
  const [goal] = useState(state.settings.fitnessGoals)
  const [goalType, setGoalType] = useState<FitnessGoalType | null>(state.settings.fitnessGoalType)
  const [unit, setUnit] = useState<'lbs' | 'kg'>(state.settings.unit)
  const [barcode, setBarcode] = useState(() => '')
  const [trainerCode, setTrainerCode] = useState('')
  const [healthConnected, setHealthConnected] = useState(
    () => state.settings.appleHealthSyncEnabled,
  )
  const [spotifyConnected, setSpotifyConnected] = useState(() => isSpotifyConnected())
  const [busy, setBusy] = useState(false)

  function saveStep1() {
    const fitnessGoal = goalType
      ? FITNESS_GOAL_OPTIONS.find((o) => o.id === goalType)?.label ?? goal.trim()
      : goal.trim()
    updateSettings({
      displayName: name.trim(),
      fitnessGoals: fitnessGoal,
      fitnessGoalType: goalType,
    })
    try {
      localStorage.setItem(APEX_COACH_PROFILE_KEY, JSON.stringify({ fitnessGoal }))
    } catch {
      /* ignore */
    }
  }

  async function saveStep2() {
    updateSettings({ unit })
    const trimmedBarcode = barcode.trim()
    if (trimmedBarcode) {
      writeGymBarcode({ number: trimmedBarcode, format: 'code128' })
    }
    const code = trainerCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    if (code.length === 6) {
      try {
        await connectClientToTrainer(userId, code)
      } catch (e) {
        notify(trainerConnectErrorMessage(e))
      }
    }
    try {
      const todayKey = dateKey(new Date())
      const snapshot = buildTendedUserStateDaySnapshot(
        { ...state, settings: { ...state.settings, unit } },
        todayKey,
      )
      await upsertTendedUserState(userId, snapshot)
    } catch {
      /* tended sync is best-effort during onboarding */
    }
  }

  async function finish(markHealthPromptDone: boolean) {
    setBusy(true)
    try {
      onComplete({ markHealthPromptDone })
    } finally {
      setBusy(false)
    }
  }

  async function onConnectHealth() {
    if (!appleHealthAvailable) {
      setHealthConnected(true)
      updateSettings({ appleHealthSyncEnabled: true })
      return
    }
    await enableAppleHealthSync()
    setHealthConnected(true)
  }

  function onConnectSpotify() {
    if (!isSpotifyConfigured()) {
      setSpotifyConnected(true)
      return
    }
    try {
      startSpotifyOAuth()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not start Spotify sign-in')
    }
  }

  if (step === 1) {
    return (
      <OnboardingShell
        step={1}
        footer={
          <PrimaryOnboardingButton
            label="Get started"
            disabled={!name.trim()}
            onClick={() => {
              saveStep1()
              setStep(2)
            }}
          />
        }
      >
        <div className="apex-onboarding__welcome">
          <img src={APEX_LOGO_URL} alt="" className="apex-onboarding__logo" width={48} height={48} />
          <h1 className="apex-onboarding__title">Welcome to Lift</h1>
          <p className="apex-onboarding__subtitle">Let&apos;s get you set up.</p>
        </div>
        <div className="apex-onboarding__fields">
          <OnboardingField label="YOUR NAME">
            <input
              className="apex-onboarding-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          </OnboardingField>
          <div className="block">
            <span className="apex-onboarding-field__label">YOUR GOAL</span>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {FITNESS_GOAL_OPTIONS.map((opt) => {
                const active = goalType === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setGoalType(active ? null : opt.id)}
                    className="text-left rounded-[12px] px-4 py-4 border-[0.5px] transition-colors"
                    style={{
                      background: active ? 'var(--apex-accent)' : 'var(--apex-surface-card)',
                      borderColor: active ? 'var(--apex-accent)' : 'var(--apex-border)',
                      color: active ? '#fff' : 'var(--apex-text-primary)',
                    }}
                  >
                    <p className="text-[14px] font-medium leading-snug">{opt.label}</p>
                    <p className="text-[12px] mt-0.5" style={{ opacity: active ? 0.8 : 0.5 }}>{opt.sub}</p>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </OnboardingShell>
    )
  }

  if (step === 2) {
    return (
      <OnboardingShell
        step={2}
        onBack={() => setStep(1)}
        footer={
          <div className="apex-onboarding__dual-actions">
            <button
              type="button"
              className="apex-onboarding__skip"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true)
                  await saveStep2()
                  setBusy(false)
                  setStep(3)
                })()
              }}
            >
              Skip
            </button>
            <button
              type="button"
              className="apex-onboarding__continue"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true)
                  await saveStep2()
                  setBusy(false)
                  setStep(3)
                })()
              }}
            >
              Continue →
            </button>
          </div>
        }
      >
        <p className="apex-onboarding__step-tag">STEP 2</p>
        <h1 className="apex-onboarding__headline">Set up your gym.</h1>
        <p className="apex-onboarding__lede">Pick your units. The rest is optional.</p>

        <div className="apex-onboarding__fields">
          <div className="apex-onboarding-field">
            <span className="apex-onboarding-field__label">WEIGHT UNITS</span>
            <div className="apex-onboarding-units">
              <button
                type="button"
                className={unit === 'kg' ? 'apex-onboarding-units__btn apex-onboarding-units__btn--on' : 'apex-onboarding-units__btn'}
                onClick={() => setUnit('kg')}
              >
                KG
              </button>
              <button
                type="button"
                className={unit === 'lbs' ? 'apex-onboarding-units__btn apex-onboarding-units__btn--on' : 'apex-onboarding-units__btn'}
                onClick={() => setUnit('lbs')}
              >
                LBS
              </button>
            </div>
          </div>

          <OnboardingField label="GYM BARCODE" optional>
            <div className="apex-onboarding-input-wrap">
              <span className="apex-onboarding-input-icon" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M4 6h2v12H4V6zm4 3h1v6H8V9zm3-3h1v12h-1V6zm4 2h1v8h-1V8zm4-2h2v12h-2V6z" fill="currentColor" />
                </svg>
              </span>
              <input
                className="apex-onboarding-input apex-onboarding-input--icon"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan or enter your member ID"
                autoComplete="off"
              />
            </div>
          </OnboardingField>

          <OnboardingField label="HAVE A TRAINER? ENTER THEIR CODE." optional>
            <div className="apex-onboarding-input-wrap">
              <span className="apex-onboarding-input-icon" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" />
                  <path
                    d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <input
                className="apex-onboarding-input apex-onboarding-input--icon"
                value={trainerCode}
                onChange={(e) => setTrainerCode(e.target.value)}
                placeholder="e.g. LFT-7421"
                autoComplete="off"
              />
            </div>
          </OnboardingField>
        </div>
      </OnboardingShell>
    )
  }

  return (
    <OnboardingShell
      step={3}
      onBack={() => setStep(2)}
      footer={
        <>
          <PrimaryOnboardingButton
            label="Finish setup"
            disabled={busy}
            onClick={() => void finish(true)}
          />
          <button
            type="button"
            className="apex-onboarding__text-skip"
            disabled={busy}
            onClick={() => void finish(true)}
          >
            Skip for now
          </button>
        </>
      }
    >
      <p className="apex-onboarding__step-tag">STEP 3</p>
      <h1 className="apex-onboarding__headline">Connect your apps.</h1>
      <p className="apex-onboarding__lede">Pull in metrics and music. You can change this anytime.</p>

      <div className="apex-onboarding__integrations">
        <div className="apex-onboarding-integration">
          <div className="apex-onboarding-integration__icon apex-onboarding-integration__icon--health">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 21s-6.5-4.35-9-8.2C1.2 9.6 2.4 5.5 6 5.5c2 0 3.2 1.2 4 2.4C11.8 6.7 13 5.5 15 5.5c3.6 0 4.8 4.1 3 7.3-2.5 3.85-6 8.2-6 8.2z"
                fill="currentColor"
              />
            </svg>
          </div>
          <div className="apex-onboarding-integration__copy">
            <p className="apex-onboarding-integration__name">Apple Health</p>
            <p className="apex-onboarding-integration__desc">
              Sync workouts, heart rate, sleep, and weight.
            </p>
          </div>
          {healthConnected ? (
            <span className="apex-onboarding-integration__check" aria-label="Connected">
              ✓
            </span>
          ) : (
            <button type="button" className="apex-onboarding-integration__connect" onClick={() => void onConnectHealth()}>
              Connect
            </button>
          )}
        </div>

        <div className="apex-onboarding-integration">
          <div className="apex-onboarding-integration__icon apex-onboarding-integration__icon--spotify">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 4.2a.9.9 0 01.9.9v6.3a.9.9 0 01-1.8 0V8.1a.9.9 0 01.9-.9zm-3.6 2.1a.9.9 0 011.3 0 4.5 4.5 0 003.6 0 .9.9 0 011.3 1.3 6.3 6.3 0 01-5.2 0 .9.9 0 010-1.3zm7.2 0a.9.9 0 011.3 1.3 6.3 6.3 0 01-5.2 0 .9.9 0 011.3-1.3 4.5 4.5 0 003.6 0z"
                fill="currentColor"
              />
            </svg>
          </div>
          <div className="apex-onboarding-integration__copy">
            <p className="apex-onboarding-integration__name">Spotify</p>
            <p className="apex-onboarding-integration__desc">
              Play a workout playlist when you start a session.
            </p>
          </div>
          {spotifyConnected || isSpotifyConnected() ? (
            <span className="apex-onboarding-integration__check" aria-label="Connected">
              ✓
            </span>
          ) : (
            <button type="button" className="apex-onboarding-integration__connect" onClick={onConnectSpotify}>
              Connect
            </button>
          )}
        </div>
      </div>
    </OnboardingShell>
  )
}
