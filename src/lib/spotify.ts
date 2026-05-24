const TOKEN_KEY = 'apex-spotify-token'
const OAUTH_STATE_KEY = 'spotify_oauth_state'
const CODE_VERIFIER_KEY = 'spotify_code_verifier'

const AUTH_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API_BASE = 'https://api.spotify.com/v1'

export const SPOTIFY_SCOPES = 'user-read-playback-state user-modify-playback-state'

export type SpotifyTokens = {
  access_token: string
  refresh_token?: string
  expires_at: number
}

export type SpotifyNowPlaying = {
  trackName: string
  artistName: string
  isPlaying: boolean
}

function getClientId(): string {
  return import.meta.env.VITE_SPOTIFY_CLIENT_ID?.trim() ?? ''
}

export function isSpotifyConfigured(): boolean {
  return getClientId().length > 0
}

export function getSpotifyRedirectUri(): string {
  const override = import.meta.env.VITE_SPOTIFY_REDIRECT_URI?.trim()
  if (override) return override.replace(/\/$/, '')
  return window.location.origin.replace(/\/$/, '')
}

function randomString(len: number): string {
  const pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const out: string[] = []
  const buf = new Uint8Array(len)
  crypto.getRandomValues(buf)
  for (let i = 0; i < len; i++) out.push(pool[buf[i]! % pool.length]!)
  return out.join('')
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function pkceChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(digest)
}

function tokensFromResponse(data: {
  access_token?: string
  refresh_token?: string
  expires_in?: number
}): SpotifyTokens {
  if (!data.access_token) throw new Error('No access token from Spotify')
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + expiresIn * 1000 - 30_000,
  }
}

export function readSpotifyTokens(): SpotifyTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const t = JSON.parse(raw) as SpotifyTokens
    if (typeof t.access_token !== 'string' || typeof t.expires_at !== 'number') return null
    return t
  } catch {
    return null
  }
}

export function writeSpotifyTokens(tokens: SpotifyTokens | null): void {
  try {
    if (!tokens) localStorage.removeItem(TOKEN_KEY)
    else localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens))
  } catch {
    /* ignore */
  }
}

export function clearSpotifyTokens(): void {
  writeSpotifyTokens(null)
}

export function isSpotifyConnected(): boolean {
  const t = readSpotifyTokens()
  if (!t?.access_token) return false
  if (Date.now() < t.expires_at) return true
  return !!t.refresh_token
}

/** Authorization code + PKCE return in the query string. */
export function isSpotifyOAuthReturn(): boolean {
  const params = new URLSearchParams(window.location.search)
  if (!params.has('code') && !params.get('error')) return false
  const expected = sessionStorage.getItem(OAUTH_STATE_KEY)
  const state = params.get('state')
  return !!(expected && state && state === expected)
}

export function startSpotifyOAuth(): void {
  const clientId = getClientId()
  if (!clientId) {
    throw new Error('Add VITE_SPOTIFY_CLIENT_ID to your .env (Spotify app client ID).')
  }
  void (async () => {
    const redirectUri = getSpotifyRedirectUri()
    const state = randomString(32)
    const verifier = randomString(64)
    const challenge = await pkceChallenge(verifier)
    sessionStorage.setItem(OAUTH_STATE_KEY, state)
    sessionStorage.setItem(CODE_VERIFIER_KEY, verifier)

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SPOTIFY_SCOPES,
      state,
      code_challenge_method: 'S256',
      code_challenge: challenge,
    })
    window.location.assign(`${AUTH_URL}?${params.toString()}`)
  })()
}

async function exchangeCodeForTokens(code: string, verifier: string): Promise<SpotifyTokens> {
  const clientId = getClientId()
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getSpotifyRedirectUri(),
    client_id: clientId,
    code_verifier: verifier,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Spotify authorization failed')
  }
  return tokensFromResponse(data)
}

async function refreshSpotifyAccessToken(refreshToken: string): Promise<SpotifyTokens> {
  const clientId = getClientId()
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Spotify session expired — connect again.')
  }
  const next = tokensFromResponse({
    ...data,
    refresh_token: data.refresh_token ?? refreshToken,
  })
  writeSpotifyTokens(next)
  return next
}

export async function getValidSpotifyAccessToken(): Promise<string | null> {
  const t = readSpotifyTokens()
  if (!t?.access_token) return null
  if (Date.now() < t.expires_at) return t.access_token
  if (!t.refresh_token) {
    clearSpotifyTokens()
    return null
  }
  try {
    const refreshed = await refreshSpotifyAccessToken(t.refresh_token)
    return refreshed.access_token
  } catch {
    clearSpotifyTokens()
    return null
  }
}

export async function completeSpotifyOAuthFromCurrentUrl(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (!code) return false

  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY)
  const state = params.get('state')
  if (!expectedState || !state || state !== expectedState) {
    throw new Error('Invalid OAuth state — try connecting again.')
  }

  const verifier = sessionStorage.getItem(CODE_VERIFIER_KEY)
  if (!verifier) throw new Error('Missing PKCE verifier — try connecting again.')

  const tokens = await exchangeCodeForTokens(code, verifier)
  writeSpotifyTokens(tokens)
  sessionStorage.removeItem(OAUTH_STATE_KEY)
  sessionStorage.removeItem(CODE_VERIFIER_KEY)
  return true
}

export function stripSpotifyOAuthParamsFromUrl(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('code') && !url.searchParams.get('error')) return
  url.search = ''
  window.history.replaceState({}, '', `${url.pathname}${url.hash}`)
}

export async function fetchSpotifyNowPlaying(): Promise<SpotifyNowPlaying | null> {
  const token = await getValidSpotifyAccessToken()
  if (!token) return null

  const res = await fetch(`${API_BASE}/me/player/currently-playing`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 204) return null

  if (res.status === 401) {
    clearSpotifyTokens()
    return null
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(err.error?.message || 'Could not load Spotify playback')
  }

  const data = (await res.json()) as {
    is_playing?: boolean
    item?: {
      name?: string
      artists?: { name?: string }[]
    } | null
  }

  const item = data.item
  if (!item?.name) return null

  const artists = (item.artists ?? []).map((a) => a.name).filter(Boolean)
  return {
    trackName: item.name,
    artistName: artists.join(', ') || 'Unknown artist',
    isPlaying: Boolean(data.is_playing),
  }
}

export async function setSpotifyPlaying(playing: boolean): Promise<void> {
  const token = await getValidSpotifyAccessToken()
  if (!token) throw new Error('Not connected to Spotify')

  const url = playing ? `${API_BASE}/me/player/play` : `${API_BASE}/me/player/pause`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 204 || res.ok) return

  const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
  const msg = err.error?.message
  if (res.status === 404) {
    throw new Error('No active Spotify device — start playback in the Spotify app first.')
  }
  throw new Error(msg || 'Could not control playback')
}

export function disconnectSpotify(): void {
  clearSpotifyTokens()
  sessionStorage.removeItem(OAUTH_STATE_KEY)
  sessionStorage.removeItem(CODE_VERIFIER_KEY)
}
