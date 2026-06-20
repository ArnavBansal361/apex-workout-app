import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
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
import { SpotifyPlayerCard } from './components/SpotifyPlayerCard'
import { TrainerClientsOverview } from './components/TrainerClientsOverview'
import { useSwipeBackLayer } from './lib/swipeBackNavigation'
import { computeWeekSummary } from './lib/weekSummary'
import { computeLongevityScore } from './lib/longevityScore'
import { readTrainerModeEnabled } from './lib/trainer'
import { weekStartMonday, weekDatesFromStart } from './lib/dates'
import { type TrainerClientSummary } from './lib/supabase'
import type { WeightedSetLog } from './types'

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

function DashboardHeader({ onStartWorkout }: { onStartWorkout?: () => void }) {
  const { state, todayKey, resolveExerciseById } = useWorkout()
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

  const weekRecap = useMemo(() => computeWeekSummary(state, clock), [state, clock])
  const lastWeekRecap = useMemo(() => computeWeekSummary(state, clock - 7 * 24 * 60 * 60 * 1000), [state, clock])

  const weeklyVolLabel = useMemo(() => {
    const v = weekRecap.totalVolumeLbs
    if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}K lbs`
    return v > 0 ? `${v} lbs` : '—'
  }, [weekRecap.totalVolumeLbs])

  const volTrend = useMemo(() => {
    const cur = weekRecap.totalVolumeLbs
    const prev = lastWeekRecap.totalVolumeLbs
    if (!prev || !cur) return null
    return Math.round(((cur - prev) / prev) * 100)
  }, [weekRecap.totalVolumeLbs, lastWeekRecap.totalVolumeLbs])

  const longevityScore = useMemo(() => computeLongevityScore(state).score, [state])

  const { weekSessions, weeklyGoal, weekBarData } = useMemo(() => {
    const ws = weekStartMonday(new Date(clock))
    const dates = weekDatesFromStart(ws)
    const todayStr = new Date(clock).toISOString().slice(0, 10)
    const loggedDays = new Set(
      state.setLogs.map((l) => new Date(l.at).toISOString().slice(0, 10))
    )
    const bars = dates.map((d, i) => {
      const vol = state.setLogs
        .filter((l): l is WeightedSetLog => l.kind === 'weighted' && new Date(l.at).toISOString().slice(0, 10) === d)
        .reduce((sum, l) => sum + (l.weight ?? 0) * l.reps, 0)
      return { vol, isToday: d === todayStr, label: ['M','T','W','T','F','S','S'][i] ?? '' }
    })
    const goal = Math.max(
      dates.filter((d) => state.schedule.some((s) => s.dateKey === d && s.workoutName?.trim())).length,
      1
    )
    return {
      weekSessions: dates.filter((d) => loggedDays.has(d)).length,
      weeklyGoal: goal,
      weekBarData: bars,
    }
  }, [state.setLogs, state.schedule, clock])

  const sched = state.schedule.find((s) => s.dateKey === todayKey)
  const planName = sched?.workoutName?.trim() ?? ''

  const todayPlannedExercises = useMemo(() => {
    if (!sched?.plannedExerciseIds?.length) return []
    return sched.plannedExerciseIds
      .map((id) => resolveExerciseById(id))
      .filter((ex): ex is NonNullable<typeof ex> => ex != null)
  }, [sched, resolveExerciseById])

  const kpis: { label: string; value: string; sub: string | null; trend?: number | null; progress?: { filled: number; total: number } | null; extra?: string | null }[] = [
    {
      label: 'WEEKLY VOLUME',
      value: weeklyVolLabel,
      sub: weekRecap.totalSets > 0 ? `${weekRecap.totalSets} sets` : null,
      trend: volTrend,
    },
    {
      label: 'SESSIONS',
      value: `${weekSessions}`,
      sub: `/ ${weeklyGoal} goal`,
      progress: { filled: weekSessions, total: weeklyGoal },
    },
    {
      label: 'LONGEVITY SCORE',
      value: longevityScore > 0 ? `${longevityScore}` : '—',
      sub: longevityScore > 0 ? '/ 100' : null,
      extra: longevityScore > 0 ? 'Based on your training age' : null,
    },
  ]

  const hasBarData = weekBarData.some((d) => d.vol > 0)

  return (
    <div className="shrink-0 px-8 pt-8 pb-0">
      {/* Date + greeting */}
      <p className="text-[11px] font-medium tracking-[0.12em] text-[var(--apex-text-tertiary)] mb-2" style={{ fontVariantNumeric: 'tabular-nums' }}>{dateLine}</p>
      <h1 className="text-[34px] font-medium leading-none tracking-[-0.03em] text-[var(--apex-text-primary)] mb-6">{greeting}</h1>

      {/* 3-col stat strip */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="apex-card px-5 py-5 flex flex-col gap-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--apex-text-tertiary)]">{kpi.label}</p>
            <div className="flex items-baseline gap-1.5 mt-2">
              <span className="text-[32px] font-medium tabular-nums leading-none text-[var(--apex-text-primary)]" style={{ letterSpacing: '-0.03em' }}>{kpi.value}</span>
              {kpi.sub && <span className="text-[13px] text-[var(--apex-text-tertiary)]">{kpi.sub}</span>}
            </div>
            {kpi.trend != null && (
              <p className="mt-2 text-[12px] font-medium" style={{ color: kpi.trend >= 0 ? '#4ade80' : '#f87171' }}>
                {kpi.trend >= 0 ? '↑' : '↓'} {Math.abs(kpi.trend)}% vs last week
              </p>
            )}
            {kpi.progress && (
              <div className="mt-2 flex gap-1">
                {Array.from({ length: kpi.progress.total }).map((_, i) => (
                  <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i < kpi.progress!.filled ? '#3d7ab5' : 'rgba(255,255,255,0.08)' }} />
                ))}
              </div>
            )}
            {kpi.extra && <p className="mt-1.5 text-[11px] text-[var(--apex-text-tertiary)]">{kpi.extra}</p>}
          </div>
        ))}
      </div>

      {/* Today's workout card */}
      <div className="apex-card px-5 py-5 mb-4">
        {planName ? (
          <>
            <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--apex-text-tertiary)] mb-2">Today's workout</p>
            <p className="text-[18px] font-medium text-[var(--apex-text-primary)] tracking-tight mb-3">{planName}</p>
            {todayPlannedExercises.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {todayPlannedExercises.slice(0, 4).map((ex) => (
                  <span key={ex.id} className="px-2.5 py-1 text-[12px] font-medium rounded-[99px] text-[var(--apex-text-secondary)]" style={{ background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.08)' }}>
                    {ex.name}
                  </span>
                ))}
                {todayPlannedExercises.length > 4 && (
                  <span className="px-2.5 py-1 text-[12px] font-medium rounded-[99px] text-[var(--apex-text-tertiary)]" style={{ background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.08)' }}>
                    +{todayPlannedExercises.length - 4} more
                  </span>
                )}
              </div>
            )}
            <button
              type="button"
              className="w-full min-h-10 rounded-[8px] text-[13px] font-medium text-white"
              style={{ background: '#3d7ab5' }}
              onClick={onStartWorkout}
            >
              Start workout
            </button>
          </>
        ) : (
          <>
            <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--apex-text-tertiary)] mb-2">Today</p>
            <p className="text-[15px] font-medium text-[var(--apex-text-primary)]">Rest day</p>
            <p className="mt-1 text-[13px] text-[var(--apex-text-secondary)]">No workout scheduled — recovery is part of the plan.</p>
          </>
        )}
      </div>

      {/* Weekly volume bar chart */}
      {hasBarData && (
        <div className="apex-card px-5 py-5 mb-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--apex-text-tertiary)] mb-4">Weekly volume</p>
          <div className="flex items-end gap-2 h-14">
            {(() => {
              const maxVol = Math.max(...weekBarData.map((d) => d.vol), 1)
              return weekBarData.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <div
                    className="w-full rounded-[3px]"
                    style={{
                      height: `${Math.max((d.vol / maxVol) * 44, d.vol > 0 ? 4 : 2)}px`,
                      background: d.isToday ? '#3d7ab5' : d.vol > 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)',
                      alignSelf: 'flex-end',
                    }}
                  />
                  <span className="text-[10px] font-medium" style={{ color: d.isToday ? '#3d7ab5' : 'rgba(255,255,255,0.3)' }}>{d.label}</span>
                </div>
              ))
            })()}
          </div>
        </div>
      )}
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
        style={{ background: 'rgba(61,122,181,0.18)', border: '0.5px solid rgba(61,122,181,0.3)' }}
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
                style={active ? { background: 'rgba(61,122,181,0.22)', border: '0.5px solid rgba(61,122,181,0.4)' } : undefined}
                onClick={() => setNav(item.id)}
              >
                <span className={`shrink-0 ${active ? 'text-[#3d7ab5]' : 'text-[var(--apex-text-tertiary)]'}`}>
                  {NAV_ICONS[item.id]}
                </span>
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Spotify mini-player */}
        <div className="px-3 pb-2 shrink-0">
          <SpotifyPlayerCard />
        </div>

        {/* User profile */}
        <SidebarUserProfile onSettings={() => setNav('settings')} />
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
        {nav === 'today' && <DashboardHeader onStartWorkout={() => { setNav('today') }} />}
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

        <main className="flex-1 min-h-0 min-w-0 overflow-y-auto">
          {nav === 'today' && (
            <div className="px-8 pb-8" />
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
