import { useEffect } from 'react'
import { useWorkout } from '../context/WorkoutContext'

export function PrCelebrationOverlay() {
  const { prCelebration, dismissPrCelebration } = useWorkout()

  useEffect(() => {
    if (!prCelebration) return
    const t = window.setTimeout(() => dismissPrCelebration(), 2800)
    return () => window.clearTimeout(t)
  }, [prCelebration, dismissPrCelebration])

  if (!prCelebration) return null

  return (
    <div
      className="fixed inset-0 z-[96] flex items-center justify-center bg-black/72 backdrop-blur-[2px] pointer-events-auto px-6"
      role="dialog"
      aria-modal="true"
      aria-label="Personal record"
      onClick={() => dismissPrCelebration()}
    >
      <div
        className="relative max-w-sm w-full rounded-[22px] border border-white/[0.12] bg-gradient-to-b from-[#1a1a22] to-[#0e0e12] px-8 pt-12 pb-10 text-center shadow-2xl pointer-events-none apex-pr-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2">
          <span className="apex-pr-badge inline-block rounded-full border-2 border-amber-200/90 bg-gradient-to-b from-amber-300 to-amber-600 px-5 py-1.5 text-[12px] font-black tracking-[0.2em] text-[#0c0c0c] shadow-lg">
            PR
          </span>
        </div>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-amber-400/60 bg-amber-500/15 text-3xl">
          🏆
        </div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-200/90">New personal record</p>
        <p className="mt-3 text-[1.35rem] font-black text-[#f8fafc] leading-tight tracking-tight">
          {prCelebration.exerciseName}
        </p>
        <p className="mt-3 text-[13px] font-medium text-[#a8a8b3] leading-relaxed">
          You just set a new personal best. Keep building.
        </p>
        <p className="mt-6 text-[11px] font-semibold text-[#6b6b73] uppercase tracking-wider">
          Tap anywhere to continue
        </p>
      </div>
    </div>
  )
}
