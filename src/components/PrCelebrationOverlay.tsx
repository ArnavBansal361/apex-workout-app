import { useEffect } from 'react'
import { useWorkout } from '../context/WorkoutContext'

/** Top banner: slide in, hold ~1.5s, fade out. Does not block interaction (aside from brief banner). */
export function PrCelebrationOverlay() {
  const { prCelebration, dismissPrCelebration } = useWorkout()

  useEffect(() => {
    if (!prCelebration) return
    const t = window.setTimeout(() => dismissPrCelebration(), 2400)
    return () => window.clearTimeout(t)
  }, [prCelebration, dismissPrCelebration])

  if (!prCelebration) return null

  return (
    <div
      className="fixed inset-x-0 top-0 z-[99] flex justify-center pt-[calc(env(safe-area-inset-top,0px)+12px)] px-4 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div
        className="pointer-events-none apex-pr-banner rounded-full border border-white/10 bg-white px-6 py-3 text-black"
      >
        <p className="text-[15px] font-black tracking-tight text-[#0c0c0c] text-center whitespace-nowrap">
          NEW PR! <span className="font-bold">{prCelebration.exerciseName}</span>
        </p>
      </div>
    </div>
  )
}
