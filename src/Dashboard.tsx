import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useWorkout, useWorkoutTick } from './context/WorkoutContext'
import { stripNotificationMessage } from './lib/persist'
import { AchievementsPage } from './components/AchievementsPage'
import { ExercisesTab } from './components/ExercisesTab'
import { FullHistory } from './components/FullHistory'
import { AiHub, ProfileTab } from './components/ProfileTab'
import { GymSpotifyPrompt } from './components/GymSpotifyPrompt'
import { PrCelebrationOverlay } from './components/PrCelebrationOverlay'
import { RestBanner } from './components/RestBanner'
import { ScheduleTab } from './components/ScheduleTab'
import { TrainerClientsOverview } from './components/TrainerClientsOverview'
import { useSwipeBackLayer } from './lib/swipeBackNavigation'
import { streakCurrent } from './lib/achievements'
import { computeWeekSummary } from './lib/weekSummary'
import { computeLongevityScore } from './lib/longevityScore'
import { readTrainerModeEnabled } from './lib/trainer'
import { weekStartMonday, weekDatesFromStart } from './lib/dates'
import {
  disconnectSpotify,
  fetchSpotifyNowPlaying,
  isSpotifyConfigured,
  isSpotifyConnected,
  setSpotifyPlaying,
  startSpotifyOAuth,
  type SpotifyNowPlaying,
} from './lib/spotify'
import { type TrainerClientSummary } from './lib/supabase'
import type { WeightedSetLog } from './types'

const ACCENT = '#c0582a'
const ACCENT_BG = 'rgba(192,88,42,0.15)'
const ACCENT_BORDER = '0.5px solid rgba(192,88,42,0.4)'
const CARD_STYLE = { background: '#13181f', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 12 }

const QUOTES = [
  { text: 'Strength isn\'t given — it\'s built between the sets when no one\'s watching.', attr: 'Lift' },
  { text: 'Consistency over intensity. Small wins compound into something undeniable.', attr: 'Lift' },
  { text: 'The bar doesn\'t care about your mood — only your effort.', attr: 'Lift' },
  { text: 'Discipline is choosing what you want most over what you want right now.', attr: 'Lift' },
  { text: 'Every expert was once a beginner who refused to quit.', attr: 'Lift' },
  { text: 'Progress is built one rep at a time. Show up today.', attr: 'Lift' },
  { text: 'Heavy isn\'t heroic — controlled, honest reps are.', attr: 'Lift' },
]

function dailyQuote(dateKey: string) {
  let h = 2166136261
  for (let i = 0; i < dateKey.length; i++) { h ^= dateKey.charCodeAt(i); h = Math.imul(h, 16777619) }
  return QUOTES[Math.abs(h >>> 0) % QUOTES.length]!
}

function SidebarSpotify() {
  const { notify } = useWorkout()
  const configured = isSpotifyConfigured()
  const [connected, setConnected] = useState(() => isSpotifyConnected())
  const [np, setNp] = useState<SpotifyNowPlaying | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!isSpotifyConnected()) { setConnected(false); setNp(null); return }
    setConnected(true)
    try { setNp(await fetchSpotifyNowPlaying()) } catch { setNp(null) }
  }, [])

  useEffect(() => {
    if (!connected) return
    void refresh()
    const id = window.setInterval(() => void refresh(), 4000)
    return () => clearInterval(id)
  }, [connected, refresh])

  useEffect(() => {
    const sync = () => setConnected(isSpotifyConnected())
    window.addEventListener('storage', sync)
    window.addEventListener('focus', sync)
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('focus', sync) }
  }, [])

  async function toggle() {
    if (!np) return
    setBusy(true)
    try {
      await setSpotifyPlaying(!np.isPlaying)
      setNp({ ...np, isPlaying: !np.isPlaying })
      setTimeout(() => void refresh(), 400)
    } catch (e) { notify(e instanceof Error ? e.message : 'Playback error') }
    finally { setBusy(false) }
  }

  if (!configured || !connected) {
    return (
      <div className="px-4 py-3">
        <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--apex-text-tertiary)] mb-1">Spotify</p>
        <p className="text-[12px] text-[var(--apex-text-tertiary)]">
          {!configured ? 'Not configured' : 'Not connected'}{' '}
          {configured && !connected && (
            <button type="button" className="underline" onClick={() => startSpotifyOAuth()}>Connect</button>
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="px-3 py-3">
      <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--apex-text-tertiary)] mb-2">Now playing</p>
      {np ? (
        <>
          <div className="flex items-center gap-2 mb-2 min-w-0">
            <div className="w-8 h-8 rounded-[4px] shrink-0 bg-white/[0.08] flex items-center justify-center">
              <i className="ti ti-brand-spotify text-[14px] text-[#1db954]" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[var(--apex-text-primary)] truncate leading-snug">{np.trackName}</p>
              <p className="text-[11px] text-[var(--apex-text-tertiary)] truncate">{np.artistName}</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-4">
            <button type="button" aria-label="Previous" className="text-[var(--apex-text-tertiary)] hover:text-[var(--apex-text-primary)]" onClick={() => void refresh()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z"/></svg>
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={np.isPlaying ? 'Pause' : 'Play'}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--apex-text-primary)] bg-white/[0.08] hover:bg-white/[0.14] disabled:opacity-50"
              onClick={() => void toggle()}
            >
              {np.isPlaying
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              }
            </button>
            <button type="button" aria-label="Next" className="text-[var(--apex-text-tertiary)] hover:text-[var(--apex-text-primary)]" onClick={() => void refresh()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2.5-6 8.5 6V6l-8.5 6z"/></svg>
            </button>
          </div>
        </>
      ) : (
        <p className="text-[12px] text-[var(--apex-text-tertiary)]">Nothing playing</p>
      )}
    </div>
  )
}

const DESKTOP_MIN_WIDTH = 768

type DashboardNavId = 'today' | 'coach' | 'exercises' | 'schedule' | 'achievements' | 'clients' | 'settings'

const NAV_ICONS: Record<DashboardNavId, ReactElement> = {
  today: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  coach: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3c.45 4 1.55 5.1 5.5 5.5-3.95.4-5.05 1.5-5.5 5.5-.45-4-1.55-5.1-5.5-5.5 3.95-.4 5.05-1.5 5.5-5.5z" fill="currentColor" />
    </svg>
  ),
  exercises: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  schedule: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="5" cy="6" r="1.5" fill="currentColor" />
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="5" cy="18" r="1.5" fill="currentColor" />
    </svg>
  ),
  achievements: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3l1.8 5.5h5.8l-4.7 3.4 1.8 5.5-4.7-3.4-4.7 3.4 1.8-5.5-4.7-3.4h5.8L12 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  clients: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 11c1.7 0 3 1.3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M19 14c1.5.5 2.5 1.8 2.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
}

const BASE_NAV_ITEMS: { id: DashboardNavId; label: string }[] = [
  { id: 'today', label: 'Dashboard' },
  { id: 'coach', label: 'AI Coach' },
  { id: 'exercises', label: 'Library' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'achievements', label: 'Achievements' },
]

const TRAINER_NAV_ITEM: { id: DashboardNavId; label: string } = { id: 'clients', label: 'Clients' }
const SETTINGS_NAV_ITEM: { id: DashboardNavId; label: string } = { id: 'settings', label: 'Settings' }

function useViewportDesktop(): boolean {
  const [desktop, setDesktop] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= DESKTOP_MIN_WIDTH,
  )
  useEffect(() => {
    const onResize = () => setDesktop(window.innerWidth >= DESKTOP_MIN_WIDTH)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return desktop
}

export function MobileOnlyGate({ children }: { children: ReactNode }) {
  const desktop = useViewportDesktop()
  if (desktop) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export function DesktopOnlyGate({ children }: { children: ReactNode }) {
  const desktop = useViewportDesktop()
  if (!desktop) return <Navigate to="/" replace />
  return <>{children}</>
}

function DashboardHome() {
  const { state, todayKey } = useWorkout()
  const { clock } = useWorkoutTick()

  const firstName = useMemo(() => {
    const full = state.settings.displayName?.trim() ?? ''
    return full.split(' ')[0] || null
  }, [state.settings.displayName])

  const { greeting, dateLine } = useMemo(() => {
    const d = new Date(clock)
    const hour = d.getHours()
    const sal = hour >= 5 && hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
    const dow = d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()
    const md = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }).toUpperCase()
    return {
      greeting: firstName ? `Good ${sal}, ${firstName}.` : `Good ${sal}.`,
      dateLine: `${dow}, ${md}`,
    }
  }, [clock, firstName])

  const streakDays = useMemo(
    () => streakCurrent(state, clock),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.setLogs, state.cardioEntries, state.streakShieldUsedWeekStart, clock],
  )

  const weekRecap = useMemo(() => computeWeekSummary(state, clock), [state, clock])
  const lastWeekRecap = useMemo(() => computeWeekSummary(state, clock - 7 * 24 * 60 * 60 * 1000), [state, clock])
  const longevityScore = useMemo(() => computeLongevityScore(state).score, [state])

  const volTrend = useMemo(() => {
    const cur = weekRecap.totalVolumeLbs
    const prev = lastWeekRecap.totalVolumeLbs
    if (!prev || !cur) return null
    return Math.round(((cur - prev) / prev) * 100)
  }, [weekRecap.totalVolumeLbs, lastWeekRecap.totalVolumeLbs])

  const { weekSessions, weeklyGoal, weekBarData, cardioMinsThisWeek, cardioByDay } = useMemo(() => {
    const ws = weekStartMonday(new Date(clock))
    const dates = weekDatesFromStart(ws)
    const todayStr = new Date(clock).toISOString().slice(0, 10)
    const loggedDays = new Set(state.setLogs.map((l) => new Date(l.at).toISOString().slice(0, 10)))
    const we = new Date(ws.getTime() + 7 * 86400000)

    const bars = dates.map((d, i) => {
      const vol = state.setLogs
        .filter((l): l is WeightedSetLog => l.kind === 'weighted' && new Date(l.at).toISOString().slice(0, 10) === d)
        .reduce((sum, l) => sum + (l.weight ?? 0) * l.reps, 0)
      return { vol, isToday: d === todayStr, label: (['M','T','W','T','F','S','S'] as const)[i] ?? '', volK: vol >= 1000 ? `${(vol/1000).toFixed(1)}k` : vol > 0 ? `${vol}` : '' }
    })

    const goal = Math.max(dates.filter((d) => state.schedule.some((s) => s.dateKey === d && s.workoutName?.trim())).length, 1)
    const cardioEntries = state.cardioEntries.filter((e) => e.at >= ws.getTime() && e.at < we.getTime())
    const cardioMins = cardioEntries.reduce((s, e) => s + (e.durationMinutes ?? 0), 0)
    const cardioByDay = dates.map((d) => cardioEntries.some((e) => new Date(e.at).toISOString().slice(0, 10) === d))

    return {
      weekSessions: dates.filter((d) => loggedDays.has(d)).length,
      weeklyGoal: goal,
      weekBarData: bars,
      cardioMinsThisWeek: cardioMins,
      cardioByDay,
    }
  }, [state.setLogs, state.cardioEntries, state.schedule, clock])

  const weeklyVolStr = useMemo(() => {
    const v = weekRecap.totalVolumeLbs
    if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
    return v > 0 ? `${v}` : '—'
  }, [weekRecap.totalVolumeLbs])

  const subtitle = useMemo(() => {
    if (streakDays > 0) {
      const sessionsPart = weekSessions < weeklyGoal
        ? ` ${weeklyGoal - weekSessions} session${weeklyGoal - weekSessions > 1 ? 's' : ''} left this week.`
        : ' Weekly goal hit.'
      return `You're on a ${streakDays}-day streak.${sessionsPart}`
    }
    return weekSessions < weeklyGoal
      ? `${weeklyGoal - weekSessions} session${weeklyGoal - weekSessions > 1 ? 's' : ''} left this week.`
      : 'Weekly goal hit. Great week.'
  }, [streakDays, weekSessions, weeklyGoal])

  const quote = useMemo(() => dailyQuote(todayKey), [todayKey])
  const maxBarVol = Math.max(...weekBarData.map((d) => d.vol), 1)

  return (
    <div className="px-8 pt-8 pb-10 overflow-y-auto flex-1 min-h-0">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-medium uppercase tracking-widest" style={{ color: ACCENT }}>{dateLine}</p>
        {streakDays > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-[99px]" style={{ background: ACCENT_BG, border: ACCENT_BORDER }}>
            <span className="text-[15px] leading-none" aria-hidden>🔥</span>
            <span className="text-[20px] font-medium tabular-nums leading-none" style={{ color: ACCENT, letterSpacing: '-0.02em' }}>{streakDays}</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: ACCENT, opacity: 0.8 }}>day streak</span>
          </div>
        )}
      </div>
      <h1 className="text-[48px] font-medium leading-none tracking-[-0.03em] text-[var(--apex-text-primary)] mb-2">{greeting}</h1>
      <p className="text-[14px] text-[var(--apex-text-secondary)] mb-8">{subtitle}</p>

      {/* ── 4-col stat strip ── */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {/* Weekly Volume */}
        <div style={CARD_STYLE} className="px-5 py-5 flex flex-col">
          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--apex-text-tertiary)]">Weekly Volume</p>
          <div className="flex items-baseline gap-1 mt-3">
            <span className="text-[32px] font-medium tabular-nums leading-none text-[var(--apex-text-primary)]" style={{ letterSpacing: '-0.03em' }}>{weeklyVolStr}</span>
            {weekRecap.totalVolumeLbs > 0 && <span className="text-[13px] text-[var(--apex-text-tertiary)]">lbs</span>}
          </div>
          {volTrend != null && (
            <p className="mt-2 text-[12px] font-medium" style={{ color: volTrend >= 0 ? '#4ade80' : '#f87171' }}>
              {volTrend >= 0 ? '↑' : '↓'} {Math.abs(volTrend)}% vs last week
            </p>
          )}
        </div>

        {/* Sessions */}
        <div style={CARD_STYLE} className="px-5 py-5 flex flex-col">
          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--apex-text-tertiary)]">Sessions</p>
          <div className="flex items-baseline gap-1 mt-3">
            <span className="text-[32px] font-medium tabular-nums leading-none text-[var(--apex-text-primary)]" style={{ letterSpacing: '-0.03em' }}>{weekSessions}</span>
            <span className="text-[13px] text-[var(--apex-text-tertiary)]">/ {weeklyGoal} goal</span>
          </div>
          <div className="mt-3 flex gap-1">
            {Array.from({ length: weeklyGoal }).map((_, i) => (
              <div key={i} className="h-[3px] flex-1 rounded-full" style={{ background: i < weekSessions ? ACCENT : 'rgba(255,255,255,0.1)' }} />
            ))}
          </div>
        </div>

        {/* Longevity Score */}
        <div style={CARD_STYLE} className="px-5 py-5 flex flex-col">
          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--apex-text-tertiary)]">Longevity Score</p>
          <div className="flex items-baseline gap-1 mt-3">
            <span className="text-[32px] font-medium tabular-nums leading-none text-[var(--apex-text-primary)]" style={{ letterSpacing: '-0.03em' }}>{longevityScore > 0 ? longevityScore : '—'}</span>
            {longevityScore > 0 && <span className="text-[13px] text-[var(--apex-text-tertiary)]">/ 100</span>}
          </div>
          {longevityScore > 0 && <p className="mt-2 text-[11px] text-[var(--apex-text-tertiary)]">Based on training age</p>}
        </div>

        {/* Active Days */}
        <div style={CARD_STYLE} className="px-5 py-5 flex flex-col">
          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--apex-text-tertiary)]">Active Mins</p>
          <div className="flex items-baseline gap-1 mt-3">
            <span className="text-[32px] font-medium tabular-nums leading-none text-[var(--apex-text-primary)]" style={{ letterSpacing: '-0.03em' }}>{cardioMinsThisWeek > 0 ? cardioMinsThisWeek : '—'}</span>
            {cardioMinsThisWeek > 0 && <span className="text-[13px] text-[var(--apex-text-tertiary)]">this week</span>}
          </div>
          {cardioMinsThisWeek === 0 && <p className="mt-2 text-[11px] text-[var(--apex-text-tertiary)]">No cardio logged yet</p>}
        </div>
      </div>

      {/* ── Daily quote ── */}
      <div className="mb-4 px-5 py-4 rounded-[12px] relative flex items-start gap-4" style={{ background: '#13181f', border: '0.5px solid rgba(255,255,255,0.08)', borderLeft: `3px solid ${ACCENT}` }}>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] text-[var(--apex-text-primary)] leading-relaxed">"{quote.text}"</p>
          <p className="mt-2 text-[12px] text-[var(--apex-text-tertiary)]">— {quote.attr}</p>
        </div>
        <span className="shrink-0 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--apex-text-tertiary)] mt-0.5">Daily</span>
      </div>

      {/* ── Two-column section ── */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 0.65fr' }}>

        {/* Left: Weekly Training Volume bar chart */}
        <div style={CARD_STYLE} className="px-5 py-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[14px] font-medium text-[var(--apex-text-primary)]">Weekly Training Volume</p>
              <p className="text-[11px] text-[var(--apex-text-tertiary)] mt-0.5">Total tonnage lifted per day</p>
            </div>
            <div className="flex gap-1">
              <span className="px-2.5 py-1 rounded-[6px] text-[11px] font-medium text-white" style={{ background: ACCENT }}>Week</span>
              <span className="px-2.5 py-1 rounded-[6px] text-[11px] font-medium text-[var(--apex-text-tertiary)]">Month</span>
            </div>
          </div>
          <div className="flex items-end gap-2 mt-2" style={{ height: 140 }}>
            {weekBarData.map((d, i) => {
              const barH = d.vol > 0 ? Math.max((d.vol / maxBarVol) * 100, 8) : 4
              return (
                <div key={i} className="flex-1 flex flex-col items-center" style={{ gap: 4 }}>
                  <span className="text-[9px] tabular-nums" style={{ color: d.isToday ? ACCENT : d.vol > 0 ? 'rgba(255,255,255,0.35)' : 'transparent', minHeight: 13 }}>{d.volK || ' '}</span>
                  <div className="flex-1 w-full flex items-end">
                    <div
                      className="w-full rounded-t-[3px]"
                      style={{
                        height: barH,
                        background: d.isToday ? ACCENT : d.vol > 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)',
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-medium" style={{ color: d.isToday ? ACCENT : 'rgba(255,255,255,0.3)' }}>{d.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: two stacked cards */}
        <div className="flex flex-col gap-3">
          {/* Cardio card */}
          <div style={CARD_STYLE} className="px-5 py-5 flex-1">
            <div className="flex items-start justify-between mb-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--apex-text-tertiary)]">Cardio</p>
              <span className="text-[10px] font-medium text-[var(--apex-text-tertiary)]">Zone 2</span>
            </div>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-[28px] font-medium tabular-nums leading-none text-[var(--apex-text-primary)]" style={{ letterSpacing: '-0.03em' }}>{cardioMinsThisWeek > 0 ? cardioMinsThisWeek : '—'}</span>
              {cardioMinsThisWeek > 0 && <span className="text-[12px] text-[var(--apex-text-tertiary)]">min this week</span>}
            </div>
            <div className="flex gap-2 mt-4">
              {cardioByDay.map((active, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-[4px]"
                  style={{ aspectRatio: '1', background: active ? ACCENT : 'rgba(255,255,255,0.07)', maxWidth: 24 }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-1.5">
              {(['M','T','W','T','F','S','S'] as const).map((l, i) => (
                <span key={i} className="text-[9px] text-[var(--apex-text-tertiary)] flex-1 text-center">{l}</span>
              ))}
            </div>
          </div>

          {/* Placeholder card */}
          <div style={CARD_STYLE} className="px-5 py-5 flex-1 flex flex-col items-start justify-center">
            <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--apex-text-tertiary)] mb-1">Coming soon</p>
            <p className="text-[13px] text-[var(--apex-text-secondary)] leading-snug mt-1">Body composition &amp; recovery trends</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function SidebarUserProfile({ onSettings }: { onSettings: () => void }) {
  const { state } = useWorkout()
  const name = state.settings.displayName?.trim() || 'You'
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-t border-[0.5px] border-[var(--apex-border)]">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-medium text-[var(--apex-text-primary)]"
        style={{ background: ACCENT_BG, border: ACCENT_BORDER }}
      >
        {initials}
      </div>
      <span className="text-[13px] font-medium text-[var(--apex-text-primary)] truncate flex-1">{name}</span>
      <button
        type="button"
        aria-label="Settings"
        className="shrink-0 text-[var(--apex-text-tertiary)] hover:text-[var(--apex-text-primary)] transition-colors"
        onClick={onSettings}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

export function DashboardShell() {
  const { notifications } = useWorkout()
  const [nav, setNav] = useState<DashboardNavId>('today')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [isTrainer] = useState(() => readTrainerModeEnabled())
  const [_selectedClient, setSelectedClient] = useState<TrainerClientSummary | null>(null)

  const navItems = [
    ...BASE_NAV_ITEMS,
    ...(isTrainer ? [TRAINER_NAV_ITEM] : []),
    SETTINGS_NAV_ITEM,
  ]

  useSwipeBackLayer(historyOpen, () => setHistoryOpen(false))

  const [gymSettingsToken] = useState(0)
  const [aiSub, setAiSub] = useState<'coach' | 'parser' | 'form' | 'insights'>('coach')

  if (historyOpen) {
    return <FullHistory onClose={() => setHistoryOpen(false)} />
  }

  return (
    <div className="apex-dashboard apex-theme-shell min-h-[100dvh]">
      {notifications[0] ? (
        <div className="fixed top-4 left-1/2 z-[100] -translate-x-1/2 px-4 pointer-events-none">
          <div className="apex-card text-[13px] font-medium text-[var(--apex-text-primary)] pointer-events-auto max-w-md px-4 py-3">
            {stripNotificationMessage(notifications[0].message)}
          </div>
        </div>
      ) : null}

      <RestBanner />
      <PrCelebrationOverlay />
      <GymSpotifyPrompt />

      {/* Sidebar */}
      <aside className="apex-dashboard-nav shrink-0 w-[260px] border-r border-[0.5px] border-[var(--apex-border)] flex flex-col min-h-0">
        {/* Wordmark */}
        <div className="px-5 py-5 shrink-0">
          <span className="text-[19px] font-medium tracking-[-0.02em] text-[var(--apex-text-primary)]">Lift</span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 px-3 flex-1" aria-label="Dashboard">
          {navItems.map((item) => {
            const active = nav === item.id
            return (
              <button
                key={item.id}
                type="button"
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-[8px] text-[14px] font-medium text-left transition-colors ${
                  active
                    ? 'text-[var(--apex-text-primary)]'
                    : 'text-[var(--apex-text-secondary)] hover:text-[var(--apex-text-primary)]'
                }`}
                style={active ? { background: ACCENT_BG, border: ACCENT_BORDER } : undefined}
                onClick={() => setNav(item.id)}
              >
                <span className={`shrink-0 ${active ? 'text-[#c0582a]' : 'text-[var(--apex-text-tertiary)]'}`}>
                  {NAV_ICONS[item.id]}
                </span>
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Spotify mini-player */}
        <div className="px-3 pb-2 shrink-0">
          <SidebarSpotify />
        </div>

        {/* User profile */}
        <SidebarUserProfile onSettings={() => setNav('settings')} />
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
        {nav === 'coach' && (
          <div className="px-8 pt-8 pb-2 shrink-0">
            <h2 className="text-[26px] font-medium text-[var(--apex-text-primary)] tracking-[-0.02em]">AI Coach</h2>
            <p className="mt-1 text-[13px] text-[var(--apex-text-tertiary)]">Knows your full training history</p>
          </div>
        )}
        {nav === 'exercises' && (
          <div className="px-8 pt-8 pb-2 shrink-0">
            <h2 className="text-[26px] font-medium text-[var(--apex-text-primary)] tracking-[-0.02em]">Library</h2>
            <p className="mt-1 text-[13px] text-[var(--apex-text-tertiary)]">Your exercises and routines</p>
          </div>
        )}
        {nav === 'schedule' && (
          <div className="px-8 pt-8 pb-2 shrink-0">
            <h2 className="text-[26px] font-medium text-[var(--apex-text-primary)] tracking-[-0.02em]">Schedule</h2>
            <p className="mt-1 text-[13px] text-[var(--apex-text-tertiary)]">Plan your training week</p>
          </div>
        )}
        {nav === 'achievements' && (
          <div className="px-8 pt-8 pb-2 shrink-0">
            <h2 className="text-[26px] font-medium text-[var(--apex-text-primary)] tracking-[-0.02em]">Achievements</h2>
            <p className="mt-1 text-[13px] text-[var(--apex-text-tertiary)]">
              {`${0} unlocked — keep showing up`}
            </p>
          </div>
        )}
        {nav === 'clients' && (
          <div className="px-8 pt-8 pb-2 shrink-0">
            <h2 className="text-[26px] font-medium text-[var(--apex-text-primary)] tracking-[-0.02em]">Clients</h2>
            <p className="mt-1 text-[13px] text-[var(--apex-text-tertiary)]">Your connected clients — today at a glance</p>
          </div>
        )}
        {nav === 'settings' && (
          <div className="px-8 pt-8 pb-2 shrink-0">
            <h2 className="text-[26px] font-medium text-[var(--apex-text-primary)] tracking-[-0.02em]">Settings</h2>
          </div>
        )}

        <main className="flex-1 min-h-0 min-w-0 overflow-y-auto flex flex-col">
          {nav === 'today' && <DashboardHome />}
          {nav === 'coach' && (
            <div className="px-8 pb-8 h-full flex flex-col">
              <div className="flex-1 min-h-0 flex flex-col">
                <AiHub aiSub={aiSub} setAiSub={setAiSub} variant="tab" showNav />
              </div>
            </div>
          )}
          {nav === 'exercises' && (
            <div className="px-8 pb-8">
              <ExercisesTab gridCols={4} />
            </div>
          )}
          {nav === 'schedule' && (
            <div className="px-8 pb-8">
              <ScheduleTab defaultViewMode="month" />
            </div>
          )}
          {nav === 'achievements' && (
            <AchievementsPage onClose={() => {}} standalone />
          )}
          {nav === 'clients' && (
            <div className="px-8 pb-8">
              <TrainerClientsOverview onSelectClient={(c) => setSelectedClient(c)} />
            </div>
          )}
          {nav === 'settings' && (
            <div className="px-8 pb-8">
              <ProfileTab
                layout="desktop"
                desktopSection="settings"
                onOpenAchievements={() => setNav('achievements')}
                openGymSettingsToken={gymSettingsToken}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
