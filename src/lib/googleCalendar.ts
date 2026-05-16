import { EXERCISE_BY_ID } from '../data/exercises'
import type { AppPersisted, ScheduleDay } from '../types'

const TOKEN_KEY = 'apex-google-calendar-tokens'
const OAUTH_STATE_KEY = 'google_oauth_state'

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const EVENTS_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

const DEFAULT_START_HOUR = 9
const DEFAULT_DURATION_MINUTES = 60

export type GoogleCalendarTokens = {
  access_token: string
  refresh_token?: string
  expires_at: number
}

function getClientId(): string {
  const id = import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID?.trim()
  return id ?? ''
}

export function isGoogleCalendarConfigured(): boolean {
  return getClientId().length > 0
}

export function getRedirectUri(): string {
  const override = import.meta.env.VITE_GOOGLE_CALENDAR_REDIRECT_URI?.trim()
  if (override) return override
  const base = `${window.location.origin}${window.location.pathname || '/'}`
  return base.replace(/\/$/, '') || window.location.origin
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function randomString(len: number): string {
  const pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const out: string[] = []
  const buf = new Uint8Array(len)
  crypto.getRandomValues(buf)
  for (let i = 0; i < len; i++) {
    out.push(pool[buf[i]! % pool.length])
  }
  return out.join('')
}

export function readStoredTokens(): GoogleCalendarTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const t = JSON.parse(raw) as GoogleCalendarTokens
    if (typeof t.access_token !== 'string' || typeof t.expires_at !== 'number') return null
    return t
  } catch {
    return null
  }
}

export function writeStoredTokens(tokens: GoogleCalendarTokens | null): void {
  try {
    if (!tokens) localStorage.removeItem(TOKEN_KEY)
    else localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens))
  } catch {
    /* ignore */
  }
}

export function isGoogleCalendarConnected(): boolean {
  const t = readStoredTokens()
  return !!(t?.access_token || t?.refresh_token)
}

export function clearStoredTokens(): void {
  writeStoredTokens(null)
}

/**
 * OAuth 2.0 implicit grant: Google redirects back with `access_token` in the URL **hash**
 * (fragment), so it is handled entirely in the browser with no authorization-code exchange.
 */
export function startGoogleCalendarOAuth(): void {
  const clientId = getClientId()
  if (!clientId) {
    throw new Error('Add VITE_GOOGLE_CALENDAR_CLIENT_ID to your .env (Google Cloud OAuth client ID).')
  }
  const redirectUri = getRedirectUri()
  console.log(
    '[Apex Google Calendar] OAuth authorize redirect_uri (exact string — copy into Google Cloud “Authorized redirect URIs”):',
    JSON.stringify(redirectUri),
  )
  console.log('[Apex Google Calendar] Same URI URL-encoded in query:', encodeURIComponent(redirectUri))
  console.log('[Apex Google Calendar] window.location breakdown:', {
    href: window.location.href,
    origin: window.location.origin,
    pathname: window.location.pathname,
  })

  const state = randomString(32)
  sessionStorage.setItem(OAUTH_STATE_KEY, state)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: CALENDAR_SCOPE,
    state,
    include_granted_scopes: 'true',
  })
  window.location.assign(`${AUTH_URL}?${params.toString()}`)
}

/**
 * Reads `access_token` from the URL hash after implicit redirect; persists tokens.
 * @returns true if tokens were stored, false if the URL did not contain an implicit OAuth result.
 */
export function completeOAuthFromCurrentUrl(): boolean {
  const raw = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash
  const hp = new URLSearchParams(raw)
  const accessToken = hp.get('access_token')
  const state = hp.get('state')
  if (!accessToken) return false

  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY)
  if (!expectedState || !state || state !== expectedState) {
    throw new Error('Invalid OAuth state — try connecting again.')
  }

  const expiresInRaw = hp.get('expires_in')
  const expiresIn =
    expiresInRaw != null && expiresInRaw !== '' ? Number.parseInt(expiresInRaw, 10) : Number.NaN
  const expiresSec = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600

  const tokens: GoogleCalendarTokens = {
    access_token: accessToken,
    expires_at: Date.now() + expiresSec * 1000 - 30_000,
  }
  writeStoredTokens(tokens)
  sessionStorage.removeItem(OAUTH_STATE_KEY)
  return true
}

export function stripOAuthParamsFromUrl(): void {
  const url = new URL(window.location.href)
  let changed = false

  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  if (hash) {
    const hp = new URLSearchParams(hash)
    if (hp.has('access_token') || hp.has('error')) {
      url.hash = ''
      changed = true
    }
  }

  if (url.searchParams.has('code') || url.searchParams.has('error')) {
    url.searchParams.delete('code')
    url.searchParams.delete('state')
    url.searchParams.delete('scope')
    url.searchParams.delete('authuser')
    url.searchParams.delete('prompt')
    url.searchParams.delete('error')
    url.searchParams.delete('error_description')
    changed = true
  }

  if (!changed) return
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState({}, '', next || url.pathname)
}

async function refreshAccessToken(refreshToken: string): Promise<GoogleCalendarTokens> {
  const clientId = getClientId()
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    refresh_token?: string
    error?: string
  }
  if (!res.ok || !data.access_token) {
    throw new Error(data.error || 'Could not refresh Google token — connect again.')
  }
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_at: Date.now() + expiresIn * 1000 - 30_000,
  }
}

export async function getValidAccessToken(): Promise<string | null> {
  let t = readStoredTokens()
  if (!t) return null
  if (Date.now() < t.expires_at) return t.access_token
  if (!t.refresh_token) {
    clearStoredTokens()
    return null
  }
  try {
    t = await refreshAccessToken(t.refresh_token)
    writeStoredTokens(t)
    return t.access_token
  } catch {
    clearStoredTokens()
    return null
  }
}

/** Local wall time on dateKey at hour:minute, RFC3339 with offset */
function localDateTimeRfc3339(dateKey: string, hour: number, minute: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(y, m - 1, d, hour, minute, 0, 0)
  const off = -dt.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  const oh = pad2(Math.floor(abs / 60))
  const om = pad2(abs % 60)
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:00${sign}${oh}:${om}`
}

function endAfterDurationRfc3339(
  dateKey: string,
  startHour: number,
  startMinute: number,
  durationMinutes: number,
): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const start = new Date(y, m - 1, d, startHour, startMinute, 0, 0)
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  const endKey = `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`
  return localDateTimeRfc3339(endKey, end.getHours(), end.getMinutes())
}

function buildExerciseLines(state: AppPersisted, day: ScheduleDay, todayKey: string): string {
  if (day.dateKey !== todayKey || !state.todayPlanExerciseIds.length) return ''
  const names = state.todayPlanExerciseIds
    .map(
      (id) =>
        EXERCISE_BY_ID[id]?.name ?? state.customExercises.find((c) => c.id === id)?.name,
    )
    .filter(Boolean)
  if (!names.length) return ''
  return `Exercises:\n${names.map((n) => `• ${n}`).join('\n')}`
}

function buildDescription(state: AppPersisted, day: ScheduleDay, todayKey: string): string {
  const parts: string[] = []
  parts.push('Synced from Apex.')
  if (day.notes?.trim()) parts.push('', day.notes.trim())
  const ex = buildExerciseLines(state, day, todayKey)
  if (ex) parts.push('', ex)
  parts.push('', `Planned duration: ${DEFAULT_DURATION_MINUTES} minutes`)
  return parts.join('\n')
}

function buildEventResource(
  state: AppPersisted,
  day: ScheduleDay,
  todayKey: string,
): Record<string, unknown> | null {
  const name = day.workoutName.trim()
  if (!name) return null
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const start = localDateTimeRfc3339(day.dateKey, DEFAULT_START_HOUR, 0)
  const end = endAfterDurationRfc3339(day.dateKey, DEFAULT_START_HOUR, 0, DEFAULT_DURATION_MINUTES)
  return {
    summary: name,
    description: buildDescription(state, day, todayKey),
    start: { dateTime: start, timeZone: tz },
    end: { dateTime: end, timeZone: tz },
  }
}

async function calendarRequest(
  accessToken: string,
  method: string,
  pathSuffix: string,
  body?: unknown,
): Promise<Response> {
  const url = `${EVENTS_BASE}${pathSuffix}`
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
}

export async function upsertCalendarEventForDay(
  accessToken: string,
  state: AppPersisted,
  day: ScheduleDay,
  todayKey: string,
): Promise<{ dateKey: string; googleCalendarEventId?: string }> {
  const resource = buildEventResource(state, day, todayKey)
  if (!resource) {
    if (day.googleCalendarEventId) {
      const res = await calendarRequest(accessToken, 'DELETE', `/${encodeURIComponent(day.googleCalendarEventId)}`)
      if (!res.ok && res.status !== 404) {
        throw new Error((await res.text()) || 'Could not remove calendar event')
      }
      return { dateKey: day.dateKey, googleCalendarEventId: undefined }
    }
    return { dateKey: day.dateKey }
  }

  if (day.googleCalendarEventId) {
    const res = await calendarRequest(
      accessToken,
      'PATCH',
      `/${encodeURIComponent(day.googleCalendarEventId)}`,
      resource,
    )
    if (!res.ok) {
      if (res.status === 404) {
        const ins = await calendarRequest(accessToken, 'POST', '', resource)
        if (!ins.ok) throw new Error((await ins.text()) || 'Calendar create failed')
        const created = (await ins.json()) as { id?: string }
        if (!created.id) throw new Error('No event id from Google')
        return { dateKey: day.dateKey, googleCalendarEventId: created.id }
      }
      throw new Error((await res.text()) || 'Calendar update failed')
    }
    return { dateKey: day.dateKey, googleCalendarEventId: day.googleCalendarEventId }
  }

  const res = await calendarRequest(accessToken, 'POST', '', resource)
  if (!res.ok) throw new Error((await res.text()) || 'Calendar create failed')
  const created = (await res.json()) as { id?: string }
  if (!created.id) throw new Error('No event id from Google')
  return { dateKey: day.dateKey, googleCalendarEventId: created.id }
}

export async function syncScheduleToGoogle(
  state: AppPersisted,
  todayKey: string,
): Promise<{ dateKey: string; patch: Partial<ScheduleDay> }[]> {
  const accessToken = await getValidAccessToken()
  if (!accessToken) throw new Error('Not connected to Google Calendar')
  const patches: { dateKey: string; patch: Partial<ScheduleDay> }[] = []
  for (const day of state.schedule) {
    const r = await upsertCalendarEventForDay(accessToken, state, day, todayKey)
    patches.push({
      dateKey: r.dateKey,
      patch: { googleCalendarEventId: r.googleCalendarEventId },
    })
  }
  return patches
}

export async function syncSingleScheduleDay(
  state: AppPersisted,
  day: ScheduleDay,
  todayKey: string,
): Promise<{ dateKey: string; patch: Partial<ScheduleDay> }> {
  const accessToken = await getValidAccessToken()
  if (!accessToken) return { dateKey: day.dateKey, patch: {} }
  const r = await upsertCalendarEventForDay(accessToken, state, day, todayKey)
  return {
    dateKey: r.dateKey,
    patch: { googleCalendarEventId: r.googleCalendarEventId },
  }
}
