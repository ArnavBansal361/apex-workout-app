import { useEffect, useRef } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import { showRestTimerCompleteNotification } from '../lib/desktopNotifications'

export function RestBanner() {
  const { state, dismissRestTimer, clock, notify } = useWorkout()
  const { restTimer, settings } = state
  const alertedRef = useRef(false)

  const visible = settings.restTimerEnabled && !restTimer.dismissed && restTimer.endAt != null
  const totalSec = Math.max(1, Math.floor(settings.restTimerSeconds) || 90)
  const msLeft = visible && restTimer.endAt ? restTimer.endAt - clock : 0
  const done = visible && msLeft <= 0
  const left = !visible || done ? 0 : Math.max(0, Math.ceil(msLeft / 1000))

  useEffect(() => {
    alertedRef.current = false
  }, [restTimer.endAt])

  useEffect(() => {
    if (!visible || !done || restTimer.dismissed || !restTimer.endAt) return
    if (alertedRef.current) return
    alertedRef.current = true
    notify('Rest complete — time for your next set!')
    showRestTimerCompleteNotification()
    try {
      void window.navigator?.vibrate?.(80)
    } catch {
      /* ignore */
    }
  }, [visible, done, restTimer.dismissed, restTimer.endAt, notify])

  if (!visible) return null

  const frac = done ? 0 : Math.max(0, Math.min(1, left / totalSec))
  const r = 36
  const c = 2 * Math.PI * r
  const arcLen = c * frac

  const accent = settings.accentColor

  return (
    <div className="fixed top-3 inset-x-0 z-[55] flex justify-center px-3 pointer-events-none">
      <div className="pointer-events-auto flex w-full max-w-lg items-center gap-4 apex-card px-5 py-3.5">
        <div className="relative h-[5.5rem] w-[5.5rem] shrink-0">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 88 88">
            <circle cx="44" cy="44" fill="none" r={r} stroke="#1e1e1e" strokeWidth="8" />
            {!done ? (
              <circle
                cx="44"
                cy="44"
                fill="none"
                r={r}
                stroke={accent}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${arcLen} ${c}`}
                style={{ transition: 'stroke-dasharray 0.35s ease' }}
              />
            ) : (
              <circle
                cx="44"
                cy="44"
                fill="none"
                r={r}
                stroke="#22c55e"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${c} ${c}`}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {done ? (
              <span className="text-2xl" aria-hidden>
                ✓
              </span>
            ) : (
              <>
                <span className="apex-stat-num tabular-nums leading-none">{left}</span>
                <span className="apex-section-label mt-1">sec</span>
              </>
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="apex-section-label">{done ? 'Rest done' : 'Rest'}</p>
          <p className="mt-1 truncate text-[13px] font-normal text-[#bbb]">
            {done ? 'Great work — ready when you are.' : 'Recover — breathe deep'}
          </p>
        </div>
        <button
          type="button"
          className="min-h-11 shrink-0 rounded-[12px] border border-[#1e1e1e] bg-[#121212] px-4 text-[13px] font-normal text-[#e0e0e0]"
          onClick={dismissRestTimer}
        >
          {done ? 'Dismiss' : 'Skip'}
        </button>
      </div>
    </div>
  )
}
