import { useState } from 'react'
import { WorkoutProvider, useWorkout } from './context/WorkoutContext'
import type { TabId } from './types'
import { AchievementsPage } from './components/AchievementsPage'
import { ApexLogo } from './components/ApexLogo'
import { BottomNav } from './components/BottomNav'
import { ExercisesTab } from './components/ExercisesTab'
import { FullHistory } from './components/FullHistory'
import { Onboarding } from './components/Onboarding'
import { ProfileTab } from './components/ProfileTab'
import { PrCelebrationOverlay } from './components/PrCelebrationOverlay'
import { RestBanner } from './components/RestBanner'
import { GoogleCalendarOAuthHandler } from './components/GoogleCalendarOAuthHandler'
import { ScheduleTab } from './components/ScheduleTab'
import { TodayTab } from './components/TodayTab'

function AppShell() {
  const { state, notifications } = useWorkout()
  const accent = state.settings.accentColor
  const [tab, setTab] = useState<TabId>('today')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [achievementsOpen, setAchievementsOpen] = useState(false)

  if (historyOpen) {
    return <FullHistory onClose={() => setHistoryOpen(false)} />
  }
  if (achievementsOpen) {
    return <AchievementsPage onClose={() => setAchievementsOpen(false)} />
  }

  return (
    <div
      className="apex-app-shell min-h-[100dvh] text-[#e8e8ea]"
      style={{ ['--accent' as string]: accent }}
    >
      {notifications[0] ? (
        <div className="fixed top-3 left-1/2 z-[100] w-[min(100%-2rem,28rem)] -translate-x-1/2 px-3 pointer-events-none">
          <div className="apex-card px-4 py-3 text-[13px] font-medium text-[#e8e8ea] pointer-events-auto shadow-lg">
            {notifications[0].message}
          </div>
        </div>
      ) : null}

      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#070708]/85 backdrop-blur-md">
        <div className="max-w-lg mx-auto px-6 py-7 flex flex-col items-center justify-center gap-1">
          <ApexLogo accent={accent} className="mx-auto block" />
        </div>
      </header>

      <RestBanner />
      <PrCelebrationOverlay />

      <main className="max-w-lg mx-auto px-5 pt-6 pb-2">
        {tab === 'today' ? <TodayTab onOpenHistory={() => setHistoryOpen(true)} /> : null}
        {tab === 'exercises' ? <ExercisesTab /> : null}
        {tab === 'schedule' ? <ScheduleTab /> : null}
        {tab === 'profile' ? (
          <ProfileTab onOpenAchievements={() => setAchievementsOpen(true)} />
        ) : null}
      </main>

      <BottomNav tab={tab} onChange={setTab} accent={accent} />
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

export default function App() {
  return (
    <WorkoutProvider>
      <GoogleCalendarOAuthHandler />
      <AppWithOnboarding />
    </WorkoutProvider>
  )
}
