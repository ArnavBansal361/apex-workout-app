import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useWorkout, useWorkoutTick } from './context/WorkoutContext'
import {
  APEX_TODAY_MORE_OPEN_KEY,
  APEX_TODAY_PLAN_OPEN_KEY,
  stripNotificationMessage,
  useTodaySectionOpen,
} from './lib/persist'
import { AchievementsPage } from './components/AchievementsPage'
import { ExercisesTab } from './components/ExercisesTab'
import { FullHistory } from './components/FullHistory'
import { AiHub, ProfileTab } from './components/ProfileTab'
import { GymSpotifyPrompt } from './components/GymSpotifyPrompt'
import { PrCelebrationOverlay } from './components/PrCelebrationOverlay'
import { RestBanner } from './components/RestBanner'
import { ScheduleTab } from './components/ScheduleTab'
import { TodayTab } from './components/TodayTab'
import { ApexLogo } from './components/ApexLogo'
import { SpotifyPlayerCard } from './components/SpotifyPlayerCard'
import { useSwipeBackLayer } from './lib/swipeBackNavigation'
import { streakCurrent } from './lib/achievements'
import { computeWeekSummary } from './lib/weekSummary'
import { computeLongevityScore } from './lib/longevityScore'

const DESKTOP_MIN_WIDTH = 768

type DashboardNavId = 'today' | 'coach' | 'exercises' | 'schedule' | 'achievements' | 'settings'

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
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
}

const NAV_ITEMS: { id: DashboardNavId; label: string }[] = [
  { id: 'today', label: 'Dashboard' },
  { id: 'coach', label: 'AI Coach' },
  { id: 'exercises', label: 'Library' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'settings', label: 'Settings' },
]

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

function DashboardHeader() {
  const { state, todayKey } = useWorkout()
  const { clock } = useWorkoutTick()

  const firstName = useMemo(() => {
    const full = state.settings.displayName?.trim() ?? ''
    return full.split(' ')[0] || null
  }, [state.settings.displayName])

  const greeting = useMemo(() => {
    const hour = new Date(clock).getHours()
    const sal = hour >= 5 && hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'
    return firstName ? `Good ${sal}, ${firstName}.` : `Good ${sal}.`
  }, [clock, firstName])

  const dateLine = useMemo(() => {
    const d = new Date(clock)
    const sched = state.schedule.find((s) => s.dateKey === todayKey)
    const planName = sched?.workoutName?.trim() ?? ''
    const dow = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    return planName ? `${dow} · ${planName}` : dow
  }, [clock, state.schedule, todayKey])

  const streakDays = useMemo(
    () => streakCurrent(state, clock),
    [state.setLogs, state.cardioEntries, state.streakShieldUsedWeekStart, clock],
  )

  const weekRecap = useMemo(() => computeWeekSummary(state, clock), [state, clock])

  const weeklyVolLabel = useMemo(() => {
    const v = weekRecap.totalVolumeLbs
    if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}K lbs`
    return v > 0 ? `${v} lbs` : '—'
  }, [weekRecap.totalVolumeLbs])

  const longevityScore = useMemo(() => computeLongevityScore(state).score, [state])

  const weekSessions = useMemo(() => {
    const ws = new Date(clock)
    const day = ws.getDay()
    ws.setDate(ws.getDate() + (day === 0 ? -6 : 1 - day))
    ws.setHours(0, 0, 0, 0)
    const we = new Date(ws)
    we.setDate(ws.getDate() + 7)
    const days = new Set(
      state.setLogs
        .filter((l) => l.at >= ws.getTime() && l.at < we.getTime())
        .map((l) => new Date(l.at).toDateString()),
    )
    return days.size
  }, [state.setLogs, clock])

  const kpis = [
    { label: 'Streak', value: streakDays > 0 ? `${streakDays}d` : '—' },
    { label: 'Weekly vol', value: weeklyVolLabel },
    { label: 'Sessions', value: `${weekSessions}` },
    { label: 'Longevity', value: longevityScore > 0 ? `${longevityScore}` : '—' },
  ]

  return (
    <div className="shrink-0 px-8 pt-8 pb-6">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--apex-text-tertiary)] mb-2">{dateLine}</p>
          <h1 className="text-[28px] font-medium leading-none tracking-[-0.02em] text-[var(--apex-text-primary)]">{greeting}</h1>
        </div>
        <div className="flex gap-2 shrink-0">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="apex-card px-4 py-3 flex flex-col gap-1.5 min-w-[88px]"
            >
              <span className="text-[22px] font-medium tabular-nums leading-none text-[var(--apex-text-primary)]" style={{ letterSpacing: '-0.02em' }}>{kpi.value}</span>
              <span className="apex-section-label">{kpi.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SidebarUserProfile() {
  const { state } = useWorkout()
  const name = state.settings.displayName?.trim() || 'You'
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="flex items-center gap-3 px-4 py-4 border-t border-[0.5px] border-[var(--apex-border)]">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-medium text-[var(--apex-text-primary)]"
        style={{ background: 'var(--apex-surface-nested)', border: '0.5px solid var(--apex-border)' }}
      >
        {initials}
      </div>
      <span className="text-[13px] font-medium text-[var(--apex-text-primary)] truncate">{name}</span>
    </div>
  )
}

export function DashboardShell() {
  const { notifications } = useWorkout()
  const [nav, setNav] = useState<DashboardNavId>('today')
  const [historyOpen, setHistoryOpen] = useState(false)

  useSwipeBackLayer(historyOpen, () => setHistoryOpen(false))

  const [gymSettingsToken, setGymSettingsToken] = useState(0)
  const [aiSub, setAiSub] = useState<'coach' | 'parser' | 'form' | 'insights'>('coach')
  const [todayMoreOpen, setTodayMoreOpen] = useTodaySectionOpen(APEX_TODAY_MORE_OPEN_KEY)
  const [todayPlanOpen, setTodayPlanOpen] = useTodaySectionOpen(APEX_TODAY_PLAN_OPEN_KEY)

  const openGymMembershipSetup = () => {
    setNav('settings')
    setGymSettingsToken((t) => t + 1)
  }

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
        {/* Logo + app name */}
        <div className="flex items-center gap-3 px-5 py-5 shrink-0">
          <ApexLogo size={34} />
          <span className="text-[17px] font-medium text-[var(--apex-text-primary)]">Lift</span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 px-3 flex-1" aria-label="Dashboard">
          {NAV_ITEMS.map((item) => {
            const active = nav === item.id
            return (
              <button
                key={item.id}
                type="button"
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-[8px] text-[14px] font-medium text-left transition-colors ${
                  active
                    ? 'bg-[var(--apex-surface-card)] text-[var(--apex-text-primary)]'
                    : 'text-[var(--apex-text-secondary)] hover:text-[var(--apex-text-primary)] hover:bg-[var(--apex-surface-card)]/60'
                }`}
                onClick={() => setNav(item.id)}
              >
                <span className={`shrink-0 ${active ? 'text-[var(--apex-text-primary)]' : 'text-[var(--apex-text-tertiary)]'}`}>
                  {NAV_ICONS[item.id]}
                </span>
                {item.label}
                {active && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#3d7ab5' }} />
                )}
              </button>
            )
          })}
        </nav>

        {/* Spotify player */}
        <div className="px-3 pb-2 shrink-0">
          <SpotifyPlayerCard />
        </div>

        {/* User profile */}
        <SidebarUserProfile />
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
        {nav === 'today' && <DashboardHeader />}
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
        {nav === 'settings' && (
          <div className="px-8 pt-8 pb-2 shrink-0">
            <h2 className="text-[26px] font-medium text-[var(--apex-text-primary)] tracking-[-0.02em]">Settings</h2>
          </div>
        )}

        <main className="flex-1 min-h-0 min-w-0 overflow-y-auto">
          {nav === 'today' && (
            <div className="px-8 pb-8">
              <TodayTab
                screenLayout="desktop"
                onOpenHistory={() => setHistoryOpen(true)}
                onOpenGymMembershipSetup={openGymMembershipSetup}
                moreOpen={todayMoreOpen}
                onMoreOpenChange={setTodayMoreOpen}
                planOpen={todayPlanOpen}
                onPlanOpenChange={setTodayPlanOpen}
              />
            </div>
          )}
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
