import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { DashboardShell, DesktopOnlyGate, MobileOnlyGate } from './Dashboard'
import { WorkoutProvider, useWorkout } from './context/WorkoutContext'
import { Auth } from './components/Auth'
import { supabase } from './lib/supabase'
import {
  APEX_TODAY_MORE_OPEN_KEY,
  APEX_TODAY_PLAN_OPEN_KEY,
  isPwaInstallDismissed,
  setPwaInstallDismissed,
  stripNotificationMessage,
  useTodaySectionOpen,
} from './lib/persist'
import type { TabId } from './types'
import { AchievementsPage } from './components/AchievementsPage'
import { BottomNav } from './components/BottomNav'
import { ExercisesTab } from './components/ExercisesTab'
import { FullHistory } from './components/FullHistory'
import { Onboarding } from './components/Onboarding'
import { ProfileTab } from './components/ProfileTab'
import { PrCelebrationOverlay } from './components/PrCelebrationOverlay'
import { RestBanner } from './components/RestBanner'
import { GoogleCalendarOAuthHandler } from './components/GoogleCalendarOAuthHandler'
import { SpotifyOAuthHandler } from './components/SpotifyOAuthHandler'
import { isGoogleCalendarOAuthReturn } from './lib/googleCalendar'
import { isSpotifyOAuthReturn } from './lib/spotify'
import { ScheduleTab } from './components/ScheduleTab'
import { ApexLogo } from './components/ApexLogo'
import { TodayTab } from './components/TodayTab'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalonePwa(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function PwaInstallBanner() {
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isPwaInstallDismissed() || isStandalonePwa()) return

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      deferredRef.current = e as BeforeInstallPromptEvent
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])

  function dismiss() {
    setPwaInstallDismissed()
    setVisible(false)
    deferredRef.current = null
  }

  async function install() {
    const ev = deferredRef.current
    if (!ev) return
    await ev.prompt()
    await ev.userChoice
    dismiss()
  }

  if (!visible || !deferredRef.current) return null

  return (
    <div className="apex-pwa-install-banner" role="region" aria-label="Install app">
      <div className="apex-pwa-install-banner__inner">
        <p className="apex-pwa-install-banner__text">Add Apex to your home screen</p>
        <button type="button" className="apex-pwa-install-banner__install" onClick={() => void install()}>
          Install
        </button>
        <button
          type="button"
          className="apex-pwa-install-banner__dismiss"
          aria-label="Dismiss install prompt"
          onClick={dismiss}
        >
          ×
        </button>
      </div>
    </div>
  )
}

function AppShell() {
  const { notifications } = useWorkout()
  const [tab, setTab] = useState<TabId>('today')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [achievementsOpen, setAchievementsOpen] = useState(false)
  const [gymSettingsToken, setGymSettingsToken] = useState(0)
  const [todayMoreOpen, setTodayMoreOpen] = useTodaySectionOpen(APEX_TODAY_MORE_OPEN_KEY)
  const [todayPlanOpen, setTodayPlanOpen] = useTodaySectionOpen(APEX_TODAY_PLAN_OPEN_KEY)

  const openGymMembershipSetup = () => {
    setTab('profile')
    setGymSettingsToken((t) => t + 1)
  }

  if (historyOpen) {
    return <FullHistory onClose={() => setHistoryOpen(false)} />
  }
  if (achievementsOpen) {
    return <AchievementsPage onClose={() => setAchievementsOpen(false)} />
  }

  return (
    <div className="apex-app-shell apex-theme-shell min-h-[100dvh]">
      <div className="apex-phone-column">
        {notifications[0] ? (
          <div className="fixed top-3 left-1/2 z-[100] w-[min(calc(480px-2rem),calc(100%-2rem))] -translate-x-1/2 px-3 pointer-events-none">
            <div className="apex-card text-[13px] font-medium text-[#e8e8ea] pointer-events-auto">
              {stripNotificationMessage(notifications[0].message)}
            </div>
          </div>
        ) : null}

        <RestBanner />
        <PrCelebrationOverlay />

        <main className="px-4 pt-4 pb-4">
          {tab === 'today' ? (
            <TodayTab
              onOpenHistory={() => setHistoryOpen(true)}
              onOpenGymMembershipSetup={openGymMembershipSetup}
              moreOpen={todayMoreOpen}
              onMoreOpenChange={setTodayMoreOpen}
              planOpen={todayPlanOpen}
              onPlanOpenChange={setTodayPlanOpen}
            />
          ) : null}
          {tab === 'exercises' ? <ExercisesTab /> : null}
          {tab === 'schedule' ? <ScheduleTab /> : null}
          {tab === 'profile' ? (
            <ProfileTab
              onOpenAchievements={() => setAchievementsOpen(true)}
              openGymSettingsToken={gymSettingsToken}
            />
          ) : null}
        </main>

        <PwaInstallBanner />
        <BottomNav tab={tab} onChange={setTab} />
      </div>
    </div>
  )
}

function AppWithOnboarding() {
  const { state, completeOnboarding } = useWorkout()
  if (!state.onboardingComplete) {
    return <Onboarding onComplete={completeOnboarding} />
  }
  return <AppShell />
}

function DashboardWithOnboarding() {
  const { state, completeOnboarding } = useWorkout()
  if (!state.onboardingComplete) {
    return <Onboarding onComplete={completeOnboarding} />
  }
  return <DashboardShell />
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  function applySession(next: Session | null) {
    setSession((prev) => {
      const prevId = prev?.user?.id ?? null
      const nextId = next?.user?.id ?? null
      if (prevId === nextId) return prev
      return next
    })
  }

  useEffect(() => {
    let mounted = true

    function clearOAuthUrl() {
      if (isGoogleCalendarOAuthReturn()) return
      if (isSpotifyOAuthReturn()) return
      const hash = window.location.hash
      const search = window.location.search
      if (
        hash.includes('access_token') ||
        hash.includes('refresh_token') ||
        search.includes('code=')
      ) {
        window.history.replaceState({}, document.title, window.location.pathname)
      }
    }

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return
      applySession(s)
      setLoading(false)
      if (s) clearOAuthUrl()
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return
      applySession(s)
      setLoading(false)
      if (
        s &&
        (event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'INITIAL_SESSION')
      ) {
        clearOAuthUrl()
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return (
      <div className="apex-safe-top min-h-[100dvh] flex flex-col items-center justify-center gap-4 bg-[var(--apex-surface-page)]">
        <ApexLogo />
        <p className="text-[14px] font-normal text-[var(--apex-text-secondary)]">Loading…</p>
      </div>
    )
  }

  if (!session) {
    return <Auth />
  }

  return (
    <BrowserRouter>
      <WorkoutProvider userId={session.user.id}>
        <GoogleCalendarOAuthHandler />
        <SpotifyOAuthHandler />
        <Routes>
          <Route
            path="/"
            element={
              <MobileOnlyGate>
                <AppWithOnboarding />
              </MobileOnlyGate>
            }
          />
          <Route
            path="/dashboard"
            element={
              <DesktopOnlyGate>
                <DashboardWithOnboarding />
              </DesktopOnlyGate>
            }
          />
        </Routes>
      </WorkoutProvider>
    </BrowserRouter>
  )
}
