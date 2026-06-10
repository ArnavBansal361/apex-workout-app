import { useWorkout } from '../context/WorkoutContext'
import { openSpotifyOnDevice } from '../lib/spotify'

export function GymSpotifyPrompt() {
  const { gymSpotifyPromptOpen, dismissGymSpotifyPrompt } = useWorkout()

  if (!gymSpotifyPromptOpen) return null

  return (
    <div
      role="presentation"
      className="apex-modal-overlay fixed inset-0 z-[94] flex items-end justify-center sm:items-center p-4"
      onClick={dismissGymSpotifyPrompt}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gym-spotify-prompt-title"
        className="w-full max-w-sm apex-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="apex-section-label">Gym session</p>
        <h2 id="gym-spotify-prompt-title" className="mt-2 text-[15px] font-medium text-[#ececee]">
          Start music?
        </h2>
        <p className="mt-2 text-[13px] font-medium text-[#a0a0a8] leading-relaxed">
          Open Spotify on this device when you&apos;re ready to train.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="apex-btn-secondary min-h-11 w-full sm:w-auto"
            onClick={dismissGymSpotifyPrompt}
          >
            Not now
          </button>
          <button
            type="button"
            className="apex-btn-primary min-h-11 w-full sm:w-auto"
            onClick={() => {
              openSpotifyOnDevice()
              dismissGymSpotifyPrompt()
            }}
          >
            Open Spotify
          </button>
        </div>
      </div>
    </div>
  )
}
