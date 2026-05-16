import { useEffect } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import { completeOAuthFromCurrentUrl, stripOAuthParamsFromUrl } from '../lib/googleCalendar'

/** Handles implicit OAuth return: `access_token` (or `error`) in the URL hash, then strips the fragment. */
export function GoogleCalendarOAuthHandler() {
  const { notify } = useWorkout()

  useEffect(() => {
    const rawHash = window.location.hash.replace(/^#/, '')
    const hashParams = rawHash ? new URLSearchParams(rawHash) : new URLSearchParams()
    const implicitReturn = hashParams.has('access_token') || hashParams.has('error')

    const sp = new URLSearchParams(window.location.search)
    if (sp.has('code')) {
      notify('Sign-in was updated. Tap Connect again on the Schedule tab.')
      stripOAuthParamsFromUrl()
      return
    }

    if (!implicitReturn && !sp.has('error')) return

    let cancelled = false
    void (async () => {
      try {
        if (hashParams.has('access_token')) {
          const didConnect = completeOAuthFromCurrentUrl()
          if (!cancelled && didConnect) notify('Connected to Google Calendar')
        } else if (hashParams.has('error')) {
          const desc =
            hashParams.get('error_description') || hashParams.get('error') || 'Sign-in cancelled'
          if (!cancelled) notify(desc)
        } else if (sp.has('error')) {
          const desc = sp.get('error_description') || sp.get('error') || 'Sign-in cancelled'
          if (!cancelled) notify(desc)
        }
      } catch (e) {
        if (!cancelled) notify(e instanceof Error ? e.message : 'Google Calendar link failed')
      } finally {
        stripOAuthParamsFromUrl()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [notify])

  return null
}
