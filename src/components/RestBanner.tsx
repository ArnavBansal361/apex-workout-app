import { useEffect, useRef, useState } from 'react'
import { useWorkout, useWorkoutTick } from '../context/WorkoutContext'
import { showRestTimerCompleteNotification } from '../lib/desktopNotifications'

export function RestBanner() {
  const { state, dismissRestTimer, notify } = useWorkout()
  const { clock } = useWorkoutTick()
  const { restTimer, settings } = state
  const alertedRef = useRef(false)
  const slideDismissRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const [slideOut, setSlideOut] = useState(false)
  const [entered, setEntered] = useState(false)

  const visible = settings.restTimerEnabled && !restTimer.dismissed && restTimer.endAt != null
  const msLeft = visible && restTimer.endAt ? restTimer.endAt - clock : 0
  const done = visible && msLeft <= 0
  const left = !visible || done ? 0 : Math.max(0, Math.ceil(msLeft / 1000))
  const pulse = visible && !done && left > 0 && left <= 10

  useEffect(() => {
    alertedRef.current = false
    setSlideOut(false)
    setEntered(false)
    if (slideDismissRef.current != null) {
      window.clearTimeout(slideDismissRef.current)
      slideDismissRef.current = null
    }
    if (!visible) return
    const id = window.requestAnimationFrame(() => setEntered(true))
    return () => window.cancelAnimationFrame(id)
  }, [restTimer.endAt, visible])

  useEffect(() => {
    if (!visible || !done || restTimer.dismissed || !restTimer.endAt) return
    if (alertedRef.current) return
    alertedRef.current = true
    notify('Rest complete — time for your next set!')
    showRestTimerCompleteNotification()
    try {
      void window.navigator?.vibrate?.([120, 60, 120])
    } catch {
      /* ignore */
    }
    setSlideOut(true)
    slideDismissRef.current = window.setTimeout(() => {
      dismissRestTimer()
      setSlideOut(false)
      setEntered(false)
    }, 320)
    return () => {
      if (slideDismissRef.current != null) window.clearTimeout(slideDismissRef.current)
    }
  }, [visible, done, restTimer.dismissed, restTimer.endAt, notify, dismissRestTimer])

  if (!visible) return null

  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')

  return (
    <div
      className="fixed inset-x-0 z-[55] pointer-events-none"
      style={{ top: 'max(env(safe-area-inset-top, 0px), 0px)' }}
    >
      <div
        className={`pointer-events-auto flex w-full items-center justify-between gap-3 px-4 transition-transform duration-300 ease-out ${
          slideOut || !entered ? '-translate-y-full' : 'translate-y-0'
        }`}
        style={{
          height: 44,
          background: '#13181f',
          borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[11px] font-normal" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Rest
          </span>
          <span
            className={`text-[15px] font-medium tabular-nums text-white ${
              pulse ? 'apex-rest-timer-pulse' : ''
            }`}
          >
            {done ? '0:00' : `${mm}:${ss}`}
          </span>
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 shrink-0 touch-manipulation"
          style={{ color: 'rgba(255,255,255,0.4)' }}
          onClick={() => {
            setSlideOut(true)
            window.setTimeout(() => dismissRestTimer(), 280)
          }}
          aria-label="Skip rest"
        >
          <i className="ti ti-x text-[14px] leading-none" aria-hidden />
          <span className="text-[12px] font-normal">Skip</span>
        </button>
      </div>
    </div>
  )
}
