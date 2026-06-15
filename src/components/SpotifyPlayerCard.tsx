import { useCallback, useEffect, useState } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import {
  disconnectSpotify,
  fetchSpotifyNowPlaying,
  isSpotifyConfigured,
  isSpotifyConnected,
  setSpotifyPlaying,
  startSpotifyOAuth,
  type SpotifyNowPlaying,
} from '../lib/spotify'

const POLL_MS = 4_000

export function SpotifyPlayerCard() {
  const { notify } = useWorkout()
  const [connected, setConnected] = useState(() => isSpotifyConnected())
  const [nowPlaying, setNowPlaying] = useState<SpotifyNowPlaying | null>(null)
  const [loading, setLoading] = useState(false)
  const [controlBusy, setControlBusy] = useState(false)

  const configured = isSpotifyConfigured()

  const refreshPlayback = useCallback(async () => {
    if (!isSpotifyConnected()) {
      setConnected(false)
      setNowPlaying(null)
      return
    }
    setConnected(true)
    try {
      const np = await fetchSpotifyNowPlaying()
      setNowPlaying(np)
    } catch (e) {
      setNowPlaying(null)
      notify(e instanceof Error ? e.message : 'Spotify error')
    }
  }, [notify])

  useEffect(() => {
    if (!connected) return
    void refreshPlayback()
    const id = window.setInterval(() => void refreshPlayback(), POLL_MS)
    return () => window.clearInterval(id)
  }, [connected, refreshPlayback])

  useEffect(() => {
    setConnected(isSpotifyConnected())
    const onStorage = () => setConnected(isSpotifyConnected())
    const onFocus = () => setConnected(isSpotifyConnected())
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  async function connect() {
    if (!configured) {
      notify('Add VITE_SPOTIFY_CLIENT_ID to enable Spotify')
      return
    }
    setLoading(true)
    try {
      startSpotifyOAuth()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not start Spotify sign-in')
      setLoading(false)
    }
  }

  function disconnect() {
    disconnectSpotify()
    setConnected(false)
    setNowPlaying(null)
    notify('Disconnected from Spotify')
  }

  async function togglePlay() {
    if (!nowPlaying) return
    setControlBusy(true)
    try {
      await setSpotifyPlaying(!nowPlaying.isPlaying)
      setNowPlaying({ ...nowPlaying, isPlaying: !nowPlaying.isPlaying })
      window.setTimeout(() => void refreshPlayback(), 400)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Playback control failed')
    } finally {
      setControlBusy(false)
    }
  }

  if (!configured) {
    return (
      <div className="apex-card px-5 py-4">
        <p className="apex-section-label mb-2">Spotify</p>
        <p className="m-0 text-[13px] font-medium text-[#a0a0a8] leading-relaxed">
          Set <span className="text-[#c8c8ce]">VITE_SPOTIFY_CLIENT_ID</span> in your environment to connect
          Spotify.
        </p>
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="apex-card px-5 py-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <i className="ti ti-brand-spotify text-[20px] text-[#1db954]" aria-hidden />
          <p className="apex-section-label m-0">Spotify</p>
        </div>
        <p className="m-0 text-[13px] font-medium text-[#a0a0a8] leading-relaxed">
          Connect to see and control what&apos;s playing during your workout.
        </p>
        <button
          type="button"
          disabled={loading}
          className="apex-btn-primary w-full min-h-12 rounded-[8px]  text-[14px] font-medium disabled:opacity-50"
          onClick={() => void connect()}
        >
          {loading ? 'Redirecting…' : 'Connect Spotify'}
        </button>
      </div>
    )
  }

  return (
    <div className="apex-card apex-spotify-player px-4 py-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <i className="ti ti-brand-spotify shrink-0 text-[18px] text-[#1db954]" aria-hidden />
          <p className="apex-section-label m-0">Now playing</p>
        </div>
        <button
          type="button"
          className="shrink-0 text-[11px] font-medium text-[#7d7d88] underline-offset-2 hover:underline touch-manipulation"
          onClick={disconnect}
        >
          Disconnect
        </button>
      </div>

      {nowPlaying ? (
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            disabled={controlBusy}
            className="apex-spotify-player__play flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06] text-[#f0f0f2] touch-manipulation disabled:opacity-45 active:scale-95"
            aria-label={nowPlaying.isPlaying ? 'Pause' : 'Play'}
            onClick={() => void togglePlay()}
          >
            <i
              className={`ti ${nowPlaying.isPlaying ? 'ti-player-pause' : 'ti-player-play'} text-[26px] leading-none`}
              aria-hidden
            />
          </button>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[15px] font-medium text-[#f0f0f2] truncate leading-snug">
              {nowPlaying.trackName}
            </p>
            <p className="m-0 mt-1 text-[13px] font-medium text-[#a0a0a8] truncate">
              {nowPlaying.artistName}
            </p>
          </div>
        </div>
      ) : (
        <p className="m-0 text-[13px] font-medium text-[#a0a0a8] leading-relaxed">
          Nothing playing — start music in Spotify on your phone or computer.
        </p>
      )}
    </div>
  )
}
