import { EXERCISE_BY_ID } from '../data/exercises'
import type { AppPersisted, ScheduleDay } from '../types'

const TOKEN_KEY = 'apex-gcal-token'
const LEGACY_TOKEN_KEY = 'apex-google-calendar-tokens'
const OAUTH_STATE_KEY = 'google_oauth_state'

/** Registered in Google Cloud Console for this app. */
const DEFAULT_CLIENT_ID =
  '580975288146-id4cd7q2mpsde3gl6ufpo376eng38n76.apps.googleusercontent.com'

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
  return import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID?.trim() || DEFAULT_CLIENT_ID
}

export function isGoogleCalendarConfigured(): boolean {
  return getClientId().length > 0
}

/** Must match Google Cloud “Authorized redirect URIs” (origin only, no path). */
export function getRedirectUri(): string {
  const override = import.meta.env.VITE_GOOGLE_CALENDAR_REDIRECT_URI?.trim()
  if (override) return override.replace(/\/$/, '')
  return window.location.origin.replace(/\/$/, '')
}

/** Implicit OAuth return: `access_token` or `error` in the URL hash with matching state. */
export function isGoogleCalendarOAuthReturn(): boolean {
  const hp = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  if (!hp.has('access_token') && !hp.has('error')) return false
  const expected = sessionStorage.getItem(OAUTH_STATE_KEY)
  const state = hp.get('state')
  return !!(expected && state && state === expected)
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

function tokensFromTokenResponse(data: {
  access_token?: string
  expires_in?: number
  refresh_token?: string
}): GoogleCalendarTokens {
  if (!data.access_token) throw new Error('No access token from Google')
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + expiresIn * 1000 - 30_000,
  }
}

export function readStoredTokens(): GoogleCalendarTokens | null {
  try {
    let raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) {
      raw = localStorage.getItem(LEGACY_TOKEN_KEY)
      if (raw) {
        localStorage.setItem(TOKEN_KEY, raw)
        localStorage.removeItem(LEGACY_TOKEN_KEY)
      }
    }
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
    if (!tokens) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(LEGACY_TOKEN_KEY)
    } else {
      localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens))
    }
  } catch {
    /* ignore */
  }
}

export function hasGoogleCalendarStorageToken(): boolean {
  try {
    return (
      localStorage.getItem(TOKEN_KEY) != null || localStorage.getItem(LEGACY_TOKEN_KEY) != null
    )
  } catch {
    return false
  }
}

export function isGoogleCalendarConnected(): boolean {
  const t = readStoredTokens()
  if (!t?.access_token) return false
  if (Date.now() < t.expires_at) return true
  return !!t.refresh_token
}

/** Human-readable expiry for Settings UI, e.g. "expires in 45 min". */
export function formatGoogleCalendarExpiryLabel(): string {
  const t = readStoredTokens()
  if (!t) return ''
  const ms = t.expires_at - Date.now()
  if (ms <= 0) return 'expired'
  const minutes = Math.max(1, Math.ceil(ms / 60_000))
  if (minutes < 60) return `expires in ${minutes} min`
  const hours = Math.ceil(minutes / 60)
  return `expires in ${hours} hr`
}

export function clearStoredTokens(): void {
  writeStoredTokens(null)
}

/**
 * OAuth 2.0 implicit grant: Google redirects with `access_token` in the URL hash (no token exchange).
 */
export function startGoogleCalendarOAuth(): void {
  const clientId = getClientId()
  if (!clientId) {
    throw new Error('Add VITE_GOOGLE_CALENDAR_CLIENT_ID to your .env (Google Cloud OAuth client ID).')
  }
  const redirectUri = getRedirectUri()
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
 * Reads `access_token` from the URL hash after implicit redirect and stores in `apex-gcal-token`.
 * @returns true if tokens were stored, false if the URL had no implicit OAuth result.
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

  writeStoredTokens({
    access_token: accessToken,
    expires_at: Date.now() + expiresSec * 1000 - 30_000,
  })
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
    error_description?: string
  }
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Could not refresh Google token — connect again.')
  }
  const tokens = tokensFromTokenResponse(data)
  tokens.refresh_token = data.refresh_token ?? refreshToken
  return tokens
}

export type PrimaryCalendarEvent = {
  summary: string
  start: string
  end: string
}

/** List primary-calendar events from now through the next 7 days. */
export async function fetchPrimaryCalendarEventsNext7Days(): Promise<PrimaryCalendarEvent[]> {
  const accessToken = await getValidAccessToken()
  if (!accessToken) {
    throw new Error('Google Calendar not connected — reconnect in Settings.')
  }
  const timeMin = new Date()
  timeMin.setHours(0, 0, 0, 0)
  const timeMax = new Date(timeMin.getTime() + 7 * 24 * 60 * 60 * 1000)
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })
  const res = await fetch(`${EVENTS_BASE}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error((await res.text()) || 'Could not load Google Calendar events')
  }
  const data = (await res.json()) as {
    items?: Array<{
      summary?: string
      start?: { dateTime?: string; date?: string }
      end?: { dateTime?: string; date?: string }
    }>
  }
  return (data.items ?? []).map((item) => ({
    summary: item.summary?.trim() || '(No title)',
    start: item.start?.dateTime ?? item.start?.date ?? '',
    end: item.end?.dateTime ?? item.end?.date ?? '',
  }))
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
  parts.push('Synced from Lift.')
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
