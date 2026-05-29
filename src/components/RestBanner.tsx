import { useEffect, useRef, useState } from 'react'
import { useWorkout, useWorkoutTick } from '../context/WorkoutContext'
import { showRestTimerCompleteNotification } from '../lib/desktopNotifications'
import { hapticRestTimerComplete } from '../lib/haptics'

function formatRestCountdown(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function isGymModeActive(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.body.classList.contains('apex-gym-mode-active')
  )
}

export function RestBanner() {
  const { state, dismissRestTimer } = useWorkout()
  const { clock } = useWorkoutTick()
  const { restTimer, settings, gymSession } = state
  const completedRef = useRef(false)
  const dismissTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const [slideIn, setSlideIn] = useState(false)
  const [slideOut, setSlideOut] = useState(false)
  const [gymMode, setGymMode] = useState(isGymModeActive)

  useEffect(() => {
    const sync = () => setGymMode(isGymModeActive())
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const durationSec = Math.max(1, restTimer.durationSec || settings.restTimerSeconds || 90)
  const startedAt =
    restTimer.startedAt ??
    (restTimer.endAt != null ? restTimer.endAt - durationSec * 1000 : null)

  const timerActive =
    settings.restTimerEnabled &&
    !restTimer.dismissed &&
    restTimer.endAt != null &&
    startedAt != null

  const visible = timerActive

  const durationMs = durationSec * 1000
  const msLeft = visible && restTimer.endAt ? Math.max(0, restTimer.endAt - clock) : 0
  const done = visible && msLeft <= 0
  const secLeft = !visible || done ? 0 : Math.max(0, Math.ceil(msLeft / 1000))
  const progressPct = visible && !done ? Math.min(100, (msLeft / durationMs) * 100) : 0

  const navHidden = gymSession.active || gymMode

  useEffect(() => {
    completedRef.current = false
    setSlideOut(false)
    setSlideIn(false)
    if (dismissTimerRef.current != null) {
      window.clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = null
    }
    if (!visible) return
    const id = window.requestAnimationFrame(() => setSlideIn(true))
    return () => window.cancelAnimationFrame(id)
  }, [restTimer.endAt, startedAt, visible])

  useEffect(() => {
    if (!visible || !done || completedRef.current) return
    completedRef.current = true
    hapticRestTimerComplete()
    showRestTimerCompleteNotification()
    setSlideOut(true)
    dismissTimerRef.current = window.setTimeout(() => {
      dismissRestTimer()
      setSlideOut(false)
      setSlideIn(false)
    }, 250)
    return () => {
      if (dismissTimerRef.current != null) window.clearTimeout(dismissTimerRef.current)
    }
  }, [visible, done, dismissRestTimer])

  function skipRest() {
    setSlideOut(true)
    dismissTimerRef.current = window.setTimeout(() => {
      dismissRestTimer()
      setSlideOut(false)
      setSlideIn(false)
    }, 250)
  }

  if (!visible) return null

  return (
    <div
      className={`apex-rest-banner fixed inset-x-0 z-[55] pointer-events-none ${
        navHidden ? 'apex-rest-banner--no-nav' : ''
      }`}
      role="status"
      aria-live="polite"
    >
      <div
        className={`apex-rest-banner__panel pointer-events-auto ${
          slideIn && !slideOut ? 'apex-rest-banner__panel--in' : 'apex-rest-banner__panel--out'
        }`}
      >
        <div className="apex-rest-banner__track" aria-hidden>
          <div
            className="apex-rest-banner__fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="apex-rest-banner__row">
          <span className="apex-rest-banner__clock" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M12 7v5l3 2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="apex-rest-banner__text">
            <span className="apex-rest-banner__label">REST</span>
            <span className="apex-rest-banner__time tabular-nums">
              {done ? '0:00' : formatRestCountdown(secLeft)}
            </span>
          </div>
          <button
            type="button"
            className="apex-rest-banner__skip"
            onClick={skipRest}
            aria-label="Skip rest"
          >
            Skip ›
          </button>
        </div>
      </div>
    </div>
  )
}
