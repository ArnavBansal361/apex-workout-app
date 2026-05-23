import { useEffect } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import {
  completeOAuthFromCurrentUrl,
  isGoogleCalendarOAuthReturn,
  stripOAuthParamsFromUrl,
} from '../lib/googleCalendar'

/** Handles implicit OAuth return: `access_token` (or `error`) in the URL hash, then strips the fragment. */
export function GoogleCalendarOAuthHandler() {
  const { notify } = useWorkout()

  useEffect(() => {
    if (!isGoogleCalendarOAuthReturn()) return

    const rawHash = window.location.hash.replace(/^#/, '')
    const hashParams = rawHash ? new URLSearchParams(rawHash) : new URLSearchParams()

    try {
      if (hashParams.has('access_token')) {
        const didConnect = completeOAuthFromCurrentUrl()
        if (didConnect) notify('Connected to Google Calendar')
      } else if (hashParams.has('error')) {
        const desc =
          hashParams.get('error_description') || hashParams.get('error') || 'Sign-in cancelled'
        notify(desc)
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Google Calendar link failed')
    } finally {
      stripOAuthParamsFromUrl()
    }
  }, [notify])

  return null
}
