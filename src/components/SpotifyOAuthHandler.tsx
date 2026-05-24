import { useEffect } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import {
  completeSpotifyOAuthFromCurrentUrl,
  isSpotifyOAuthReturn,
  stripSpotifyOAuthParamsFromUrl,
} from '../lib/spotify'

/** Handles Spotify PKCE OAuth return (`?code=` in query), then strips params. */
export function SpotifyOAuthHandler() {
  const { notify } = useWorkout()

  useEffect(() => {
    if (!isSpotifyOAuthReturn()) return

    const params = new URLSearchParams(window.location.search)

    void (async () => {
      try {
        if (params.has('code')) {
          const didConnect = await completeSpotifyOAuthFromCurrentUrl()
          if (didConnect) notify('Connected to Spotify')
        } else if (params.get('error')) {
          const desc = params.get('error_description') || params.get('error') || 'Sign-in cancelled'
          notify(desc)
        }
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Spotify connection failed')
      } finally {
        stripSpotifyOAuthParamsFromUrl()
      }
    })()
  }, [notify])

  return null
}
