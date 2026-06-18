import { useEffect, useMemo, useState } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import { ApexLogo } from './ApexLogo'
import {
  formatAiUpdatedAgo,
  lastAiIntelligenceUpdatedMs,
  workoutSessionCount,
} from '../lib/aiIntelligenceStatus'
import { AiHub, type AiSub } from './ProfileTab'

type AiCard = {
  id: AiSub
  title: string
  description: string
  icon: string
  beta?: boolean
}

const AI_CARDS: AiCard[] = [
  {
    id: 'coach',
    title: 'Coach',
    description:
      'Chat with your AI trainer about programming, plateaus, or anything.',
    icon: 'ti-messages',
  },
  {
    id: 'parser',
    title: 'Parser',
    description: 'Log a workout by typing or speaking naturally — no taps required.',
    icon: 'ti-microphone-2',
    beta: true,
  },
  {
    id: 'form',
    title: 'Form Tips',
    description: 'Technique cues and common mistakes for any exercise in your library.',
    icon: 'ti-user',
  },
  {
    id: 'insights',
    title: 'Insights',
    description: 'Patterns and trends from your training data, refreshed weekly.',
    icon: 'ti-chart-line',
  },
]

/** Mobile AI tab — hub menu + drill-down into coach tools. */
export function AiTab() {
  const { state } = useWorkout()
  const [active, setActive] = useState<AiSub | null>(null)
  const [clock, setClock] = useState(() => Date.now())

  const sessionCount = useMemo(() => workoutSessionCount(state), [state.setLogs, state.cardioEntries])
  const updatedMs = useMemo(() => lastAiIntelligenceUpdatedMs(state), [state.chatMessages])
  const updatedPhrase = useMemo(() => {
    if (!updatedMs) return 'not yet'
    return formatAiUpdatedAgo(updatedMs, clock)
  }, [updatedMs, clock])

  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  if (active) {
    return (
      <div className="apex-ai-tab pb-28">
        <button
          type="button"
          className="apex-ai-tab__back mb-3 flex items-center gap-1.5 text-[13px] font-medium text-[var(--apex-text-tertiary)] touch-manipulation"
          onClick={() => setActive(null)}
        >
          <i className="ti ti-chevron-left text-[16px]" aria-hidden />
          AI
        </button>
        <AiHub aiSub={active} setAiSub={setActive} variant="tab" showNav={false} />
      </div>
    )
  }

  return (
    <div className="apex-ai-tab apex-safe-top pb-28">
      <header className="apex-ai-tab__header">
        <div className="flex items-center gap-2 mb-1">
          <ApexLogo size={24} />
          <p className="apex-ai-tab__eyebrow" style={{ marginBottom: 0 }}>Lift Intelligence</p>
        </div>
        <h1 className="apex-ai-tab__title">AI Coach</h1>
        <p className="apex-ai-tab__subtitle">Your training intelligence.</p>
      </header>

      <ul className="apex-ai-tab__list" role="list">
        {AI_CARDS.map((card) => (
          <li key={card.id}>
            <button
              type="button"
              className="apex-ai-tab__card"
              onClick={() => setActive(card.id)}
            >
              <span className="apex-ai-tab__card-icon" aria-hidden>
                <i className={`ti ${card.icon}`} />
              </span>
              <span className="apex-ai-tab__card-text">
                <span className="apex-ai-tab__card-title-row">
                  <span className="apex-ai-tab__card-title">{card.title}</span>
                  {card.beta ? (
                    <span className="apex-ai-tab__beta">BETA</span>
                  ) : null}
                </span>
                <span className="apex-ai-tab__card-desc">{card.description}</span>
              </span>
              <i className="ti ti-chevron-right apex-ai-tab__chevron" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <div className="apex-ai-tab__footer" role="status">
        <span className="apex-ai-tab__footer-dot" aria-hidden />
        <p className="apex-ai-tab__footer-text">
          Trained on your last {sessionCount} session{sessionCount === 1 ? '' : 's'} · Updated{' '}
          {updatedPhrase}
        </p>
      </div>
    </div>
  )
}
