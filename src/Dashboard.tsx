import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useWorkout } from './context/WorkoutContext'
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
import { useSwipeBackLayer } from './lib/swipeBackNavigation'

const DESKTOP_MIN_WIDTH = 768

type DashboardNavId = 'today' | 'exercises' | 'schedule' | 'profile' | 'settings'

const NAV_ICONS: Record<DashboardNavId, JSX.Element> = {
  today: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  exercises: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  schedule: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3.6 6l1 1 2-2.2M3.6 12l1 1 2-2.2M3.6 18l1 1 2-2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  profile: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3c.45 4 1.55 5.1 5.5 5.5-3.95.4-5.05 1.5-5.5 5.5-.45-4-1.55-5.1-5.5-5.5 3.95-.4 5.05-1.5 5.5-5.5z" fill="currentColor" />
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 19V5M4 19h16M8 16l4-5 3 3 4-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}

const NAV_ITEMS: { id: DashboardNavId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'exercises', label: 'Library' },
  { id: 'schedule', label: 'Plan' },
  { id: 'profile', label: 'Coach' },
  { id: 'settings', label: 'Insights' },
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

export function DashboardShell() {
  const { notifications } = useWorkout()
  const [nav, setNav] = useState<DashboardNavId>('today')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [achievementsOpen, setAchievementsOpen] = useState(false)

  useSwipeBackLayer(historyOpen, () => setHistoryOpen(false))
  useSwipeBackLayer(achievementsOpen, () => setAchievementsOpen(false))

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
  if (achievementsOpen) {
    return <AchievementsPage onClose={() => setAchievementsOpen(false)} />
  }

  return (
    <div className="apex-dashboard apex-theme-shell min-h-[100dvh]">
      {notifications[0] ? (
        <div className="apex-dashboard-toast fixed top-4 left-1/2 z-[100] -translate-x-1/2 px-4 pointer-events-none">
          <div className="apex-card text-[13px] font-medium text-[#e8e8ea] pointer-events-auto max-w-md">
            {stripNotificationMessage(notifications[0].message)}
          </div>
        </div>
      ) : null}

      <RestBanner />
      <PrCelebrationOverlay />
      <GymSpotifyPrompt />

      <aside className="apex-dashboard-nav shrink-0 w-[240px] border-r border-[0.5px] border-white/[0.08] flex flex-col px-4 py-5">
        <ApexLogo />
        <nav className="mt-8 flex flex-col gap-1" aria-label="Dashboard">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`apex-dashboard-nav-btn flex items-center gap-3 ${
                nav === item.id ? 'apex-dashboard-nav-btn--active' : ''
              }`}
              onClick={() => setNav(item.id)}
            >
              <span className="shrink-0 opacity-70">{NAV_ICONS[item.id]}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="apex-dashboard-main flex-1 min-w-0 overflow-y-auto px-6 py-5">
        {nav === 'today' ? (
          <TodayTab
            screenLayout="desktop"
            onOpenHistory={() => setHistoryOpen(true)}
            onOpenGymMembershipSetup={openGymMembershipSetup}
            moreOpen={todayMoreOpen}
            onMoreOpenChange={setTodayMoreOpen}
            planOpen={todayPlanOpen}
            onPlanOpenChange={setTodayPlanOpen}
          />
        ) : null}
        {nav === 'exercises' ? <ExercisesTab gridCols={4} /> : null}
        {nav === 'schedule' ? <ScheduleTab defaultViewMode="month" /> : null}
        {nav === 'profile' ? (
          <ProfileTab
            layout="desktop"
            desktopSection="profile"
            onOpenAchievements={() => setAchievementsOpen(true)}
          />
        ) : null}
        {nav === 'settings' ? (
          <ProfileTab
            layout="desktop"
            desktopSection="settings"
            onOpenAchievements={() => setAchievementsOpen(true)}
            openGymSettingsToken={gymSettingsToken}
          />
        ) : null}
      </main>

      <aside className="apex-dashboard-coach shrink-0 border-l border-[0.5px] border-white/[0.08] flex flex-col px-4 py-5 min-h-0 min-w-0 overflow-hidden">
        <p className="apex-section-label shrink-0 mb-3">AI</p>
        <div className="flex flex-1 min-h-0 min-w-0 w-full flex-col overflow-hidden">
          <AiHub aiSub={aiSub} setAiSub={setAiSub} variant="sidebar" />
        </div>
      </aside>
    </div>
  )
}
