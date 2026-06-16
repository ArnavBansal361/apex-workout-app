import { useEffect, useMemo, useRef, useState } from 'react'
import { useSwipeBackLayer } from '../lib/swipeBackNavigation'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BodyMeasurementsSection } from './BodyMeasurementsSection'
import { useWorkout } from '../context/WorkoutContext'
import {
  muscleGroupsThisWeek,
  prsThisMonth,
  sessionsThisWeek,
  setsThisWeek,
  streakCurrent,
} from '../lib/achievements'
import {
  computePersonalRecords,
  computePersonalRecordDisplayRows,
} from '../lib/personalRecords'
import { getLevelInfo, xpBarLabels } from '../lib/xpLevel'
import {
  claudeCoachComplete,
  claudeExerciseFormTips,
  claudeParseImport,
  dailyCoachSuggestions,
  resolvePlanPersonalizationFlow,
} from '../lib/anthropicCoach'
import { computeStrengthAge } from '../lib/strengthAge'
import { LongevityScoreCard } from './LongevityScoreCard'
import { InjuryRiskScoreCard } from './InjuryRiskScoreCard'
import { PerformanceInsightsCard } from './PerformanceInsightsCard'
import { dateKey, weekStartMonday } from '../lib/dates'
import {
  connectClientToTrainer,
  fetchMyTrainerConnection,
  fetchTrainerClientSummaries,
  fetchUserWorkoutStateForTrainer,
  addFriendByCode,
  clearUserSupabaseData,
  ensureFriendProfile,
  fetchGlobalLeaderboardByXp,
  fetchLeaderboardXpForUsers,
  formatLeaderboardVolume,
  insertTrainerNote,
  supabase,
  TENDED_FRIEND_CODE_PROFILE_DATE_KEY,
  upsertTrainerCode,
  upsertUserWorkoutState,
  upsertTendedPostWorkoutCheckin,
  type AddFriendResult,
  type FriendLeaderboardRow,
  type LeaderboardEntry,
  type TrainerClientSummary,
  type TrainerConnectionRow,
} from '../lib/supabase'
import {
  ensureTrainerCode,
  filterClientStateForTrainer,
  formatLastActive,
  readTrainerCode,
  readTrainerModeEnabled,
  readTrainerSharePrefs,
  writeTrainerModeEnabled,
  writeTrainerSharePref,
  applyTrainerShareToState,
  syncTrainerShareFromState,
  trainerConnectErrorMessage,
  type TrainerShareType,
} from '../lib/trainer'
import { extractExerciseIdsFromCoachPlan } from '../lib/coachWorkoutPlan'
import {
  parseWorkoutTextLocally,
  sanitizeWorkoutImport,
} from '../lib/parseWorkoutImport'
import {
  getCoachMessageDisplayText,
  isCoachUiPromptLine,
  applyApexAppearanceFromStorage,
  APEX_THEME_STORAGE_KEY,
  APEX_FONT_SIZE_STORAGE_KEY,
  readDistanceUnit,
  writeDistanceUnit,
  readWorkoutRemindersEnabled,
  writeWorkoutRemindersEnabled,
  readWeeklySummaryEnabled,
  writeWeeklySummaryEnabled,
  readPostWorkoutCheckinEnabled,
  writePostWorkoutCheckinEnabled,
  type ApexDistanceUnit,
  type ApexThemeMode,
  type ApexFontSizeMode,
} from '../lib/persist'
import {
  isSpotifyConfigured,
  isSpotifyConnected,
  startSpotifyOAuth,
} from '../lib/spotify'
import { bodyweightSeries, useApexChartColors, weeklyVolumeSeries } from '../lib/stats'
import { strengthProgressSeries } from '../lib/overload'
import {
  isGoogleCalendarConfigured,
  isGoogleCalendarConnected,
  startGoogleCalendarOAuth,
} from '../lib/googleCalendar'
import {
  GYM_BARCODE_FORMAT_OPTIONS,
  readGymBarcode,
  writeGymBarcode,
  type GymBarcodeFormat,
  type GymBarcodeStored,
} from '../lib/gymBarcode'
import { coachImageDataUrl, prepareCoachChatImage } from '../lib/coachChatImage'
import type { AppPersisted, ChatMessage, CoachChatImage } from '../types'
import { ConfirmDialog } from './ConfirmDialog'
type Sub = 'stats' | 'ai'
export type AiSub = 'coach' | 'parser' | 'form' | 'insights'

const AI_PILLS: { id: AiSub; label: string }[] = [
  { id: 'coach', label: 'Coach' },
  { id: 'parser', label: 'Parser' },
  { id: 'form', label: 'Form tips' },
  { id: 'insights', label: 'Insights' },
]

function AiPillNav({ active, onChange }: { active: AiSub; onChange: (id: AiSub) => void }) {
  return (
    <div className="pb-1">
      <div className="flex flex-wrap gap-2">
        {AI_PILLS.map((p) => {
          const on = active === p.id
          return (
            <button
              key={p.id}
              type="button"
              className={`shrink-0 text-[11px] font-medium transition-colors touch-manipulation ${
                on ? 'apex-accent-pill-active' : 'bg-transparent text-[#ececee]'
              }`}
              style={{
                height: 30,
                padding: '0 14px',
                borderRadius: 99,
                border: on ? '0.5px solid transparent' : '0.5px solid rgba(255,255,255,0.2)',
              }}
              onClick={() => onChange(p.id)}
            >
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Top Lifts Progress Card ──────────────────────────────────────────────────

type TopLiftRange = '4w' | '8w' | 'all'

function TopLiftSparkline({
  points,
  color,
}: {
  points: number[]
  color: string
}) {
  if (points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const w = 80
  const h = 32
  const pad = 3
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (w - pad * 2))
  const ys = points.map((v) => pad + (1 - (v - min) / range) * (h - pad * 2))
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1]!} cy={ys[ys.length - 1]!} r={2.5} fill={color} />
    </svg>
  )
}

export function TopLiftsProgressCard({
  className = '',
  onOpenLibrary,
}: {
  className?: string
  onOpenLibrary?: (exerciseId: string) => void
}) {
  const { state } = useWorkout()
  const [range, setRange] = useState<TopLiftRange>('8w')

  const accentColor = '#6db87a'

  // Find the most-logged weighted exercises (top 6 by set count)
  const topExercises = useMemo(() => {
    const counts: Record<string, { count: number; name: string }> = {}
    for (const log of state.setLogs) {
      if (log.kind !== 'weighted' || log.bodyweight) continue
      if (!counts[log.exerciseId]) {
        const ex = state.customExercises.find((e) => e.id === log.exerciseId)
        const name = ex?.name ?? log.exerciseId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        counts[log.exerciseId] = { count: 0, name }
      }
      counts[log.exerciseId]!.count++
    }
    return Object.entries(counts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 4)
      .map(([id, { name }]) => ({ id, name }))
  }, [state.setLogs, state.customExercises])

  // For each top exercise, compute weekly max weight series
  const lifts = useMemo(() => {
    const weeksBack = range === '4w' ? 4 : range === '8w' ? 8 : 52
    return topExercises.map(({ id, name }) => {
      const series = strengthProgressSeries(state.setLogs, id)
      const sliced = range === 'all' ? series : series.slice(series.length - weeksBack)
      const plotted = sliced.filter((p) => p.weight != null).map((p) => p.weight as number)
      const currentMax = plotted.length ? plotted[plotted.length - 1]! : null
      const firstMax = plotted.length ? plotted[0]! : null
      const delta = currentMax != null && firstMax != null ? currentMax - firstMax : null
      return { id, name, plotted, currentMax, delta }
    }).filter((l) => l.plotted.length >= 2)
  }, [topExercises, state.setLogs, range])

  if (lifts.length === 0) {
    return (
      <div className={`apex-card p-5 ${className}`.trim()}>
        <p className="apex-section-label mb-1">Progress</p>
        <p className="text-[12px] font-medium text-[#a0a0a8] leading-relaxed mt-2">
          Log weighted sets for the same exercises across multiple weeks to see your strength trends here.
        </p>
      </div>
    )
  }

  const rangeOptions: { id: TopLiftRange; label: string }[] = [
    { id: '4w', label: '4W' },
    { id: '8w', label: '8W' },
    { id: 'all', label: 'All' },
  ]

  return (
    <div className={`apex-card p-5 ${className}`.trim()}>
      <div className="flex items-center justify-between mb-4">
        <p className="apex-section-label">Progress</p>
        <div className="flex gap-1">
          {rangeOptions.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setRange(o.id)}
              className={`px-2.5 py-1 rounded-[6px] text-[11px] font-medium transition-colors ${
                range === o.id
                  ? 'bg-white/[0.12] text-[#ececee]'
                  : 'text-[#7d7d88] hover:text-[#a0a0a8]'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {lifts.map((lift) => (
          <button
            key={lift.id}
            type="button"
            className="w-full flex items-center gap-3 rounded-[8px] p-3 bg-white/[0.04] hover:bg-white/[0.07] transition-colors text-left touch-manipulation"
            onClick={() => onOpenLibrary?.(lift.id)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[#ececee] truncate">{lift.name}</p>
              <p className="text-[11px] font-medium text-[#7d7d88] mt-0.5">
                {lift.currentMax != null ? `${lift.currentMax} ${state.settings.unit}` : '—'}
                {lift.delta != null && lift.delta !== 0 ? (
                  <span style={{ color: lift.delta > 0 ? accentColor : '#e07070' }}>
                    {' '}{lift.delta > 0 ? '↑' : '↓'}{Math.abs(lift.delta)} {state.settings.unit}
                  </span>
                ) : null}
              </p>
            </div>
            <TopLiftSparkline points={lift.plotted} color={accentColor} />
          </button>
        ))}
      </div>
      <p className="text-[11px] font-medium text-[#5a5a65] mt-3 text-center">
        Tap any lift to see full chart in Library
      </p>
    </div>
  )
}

type Props = {
  onOpenAchievements: () => void
  layout?: 'mobile' | 'desktop'
  desktopSection?: 'profile' | 'settings'
  /** Increment to open Gym Membership settings (e.g. from Today barcode button). */
  openGymSettingsToken?: number
}

type AiCoachPanelProps = {
  variant?: 'tab' | 'sidebar'
  showTitle?: boolean
}

export function AiCoachPanel({ variant = 'tab', showTitle = true }: AiCoachPanelProps) {
  const {
    state,
    userId,
    pushChat,
    clearChat,
    notify,
    todayKey,
    applyCoachPlanToToday,
    resolveExerciseById,
  } = useWorkout()
  const [chatInput, setChatInput] = useState('')
  const [pendingImage, setPendingImage] = useState<CoachChatImage | null>(null)
  const [busy, setBusy] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Voice-to-text
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // Text-to-speech toggle (persisted per session)
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    try { return localStorage.getItem('lift-coach-tts') === '1' } catch { return false }
  })

  function toggleTts() {
    setTtsEnabled((prev: boolean) => {
      const next = !prev
      try { localStorage.setItem('lift-coach-tts', next ? '1' : '0') } catch {}
      if (!next) window.speechSynthesis?.cancel()
      return next
    })
  }

  function speakText(text: string) {
    if (!ttsEnabled || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = 1.05
    utt.pitch = 1
    // Prefer a natural English voice if available
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(
      (v) => v.lang.startsWith('en') && (v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Google') || v.localService)
    )
    if (preferred) utt.voice = preferred
    window.speechSynthesis.speak(utt)
  }

  function startListening() {
    const SR = (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
      ?? (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition
    if (!SR) { notify('Voice input not supported in this browser'); return }
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    const rec = new SR()
    rec.lang = 'en-US'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0]?.[0]?.transcript ?? ''
      if (transcript) setChatInput((prev: string) => (prev ? `${prev} ${transcript}` : transcript))
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    rec.start()
    recognitionRef.current = rec
    setListening(true)
  }
  const coachSuggestions = useMemo(() => dailyCoachSuggestions(todayKey, state), [todayKey, state])

  async function onAttachImage(file: File) {
    try {
      setPendingImage(await prepareCoachChatImage(file))
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not attach photo')
    }
  }

  async function runCoachTurn(
    userText: string,
    opts?: { hideUserBubble?: boolean; image?: CoachChatImage },
  ) {
    const msg = userText.trim()
    const image = opts?.image
    if ((!msg && !image) || busy) return

    if (!image && msg) {
      const flow = resolvePlanPersonalizationFlow(state.chatMessages, msg, opts)
      if (flow.type === 'ask') {
        if (flow.pushUserBubble && !isCoachUiPromptLine(msg)) {
          pushChat('user', msg)
        }
        pushChat('model', flow.questionText)
        return
      }
      if (flow.type === 'generate') {
        const planPending: ChatMessage = {
          id: 'pending-user',
          role: 'user',
          text: msg,
          at: 0,
        }
        const planHistory = [...state.chatMessages, planPending]
        const pushUser = !opts?.hideUserBubble && !isCoachUiPromptLine(msg)
        if (pushUser) pushChat('user', msg)
        setBusy(true)
        try {
          const reply = await claudeCoachComplete(state, planHistory, {
            mode: 'workout_plan',
            planAnswers: flow.answers,
            userId,
          })
          pushChat('model', reply, { workoutPlan: true })
        } catch (e) {
          notify(e instanceof Error ? e.message : 'Coach error')
        } finally {
          setBusy(false)
        }
        return
      }
    }

    const pending: ChatMessage = {
      id: 'pending-user',
      role: 'user',
      text: msg,
      at: 0,
      ...(image ? { image } : {}),
    }
    const historyForApi = [...state.chatMessages, pending]
    const pushUser =
      !opts?.hideUserBubble && (Boolean(image) || !isCoachUiPromptLine(msg))

    if (pushUser) pushChat('user', msg, image ? { image } : undefined)
    setBusy(true)
    try {
      const reply = await claudeCoachComplete(state, historyForApi, { userId })
      pushChat('model', reply)
      speakText(reply)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Coach error')
    } finally {
      setBusy(false)
    }
  }

  async function sendCoach() {
    const msg = chatInput.trim()
    const image = pendingImage
    if (!msg && !image) return
    setChatInput('')
    setPendingImage(null)
    await runCoachTurn(msg, { image: image ?? undefined })
  }

  function applyPlanToToday(planText: string) {
    const ids = extractExerciseIdsFromCoachPlan(planText, state.customExercises)
    if (!ids.length) {
      notify('No exercises found in this plan — try asking for specific movement names')
      return
    }
    applyCoachPlanToToday(ids)
    const names = ids
      .map((id) => resolveExerciseById(id)?.name ?? id)
      .slice(0, 4)
    const more = ids.length > names.length ? ` +${ids.length - names.length} more` : ''
    notify(`Added ${ids.length} exercise${ids.length === 1 ? '' : 's'} to today: ${names.join(', ')}${more}`)
  }

  const shellClass =
    variant === 'sidebar'
      ? 'flex flex-col flex-1 min-h-0 min-w-0'
      : 'flex flex-col min-h-[min(70vh,32rem)] max-h-[calc(100dvh-11rem)]'

  const isSidebar = variant === 'sidebar'

  return (
    <div className={`${shellClass}${isSidebar ? ' apex-coach-sidebar' : ''}`}>
      {showTitle ? <p className="apex-section-label shrink-0 mb-3">Coach</p> : null}
      <div className="apex-coach-sidebar-messages flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="relative flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
          <button
            type="button"
            disabled={busy}
            className="apex-coach-clear-btn absolute top-2 right-2 z-10"
            aria-label="Clear chat"
            onClick={() => {
              clearChat()
              setPendingImage(null)
              notify('Chat cleared')
            }}
          >
            <i className="ti ti-trash" aria-hidden />
          </button>
          <div className="apex-coach-chat-scroll flex-1 min-h-0 min-w-0 space-y-3 rounded-[12px] p-4 pt-10">
            {state.chatMessages.length === 0 ? (
              <p className="apex-coach-empty-hint m-0 font-normal text-[#a8a8b0] leading-relaxed">
                Ask for form cues, programming ideas, or recovery tips — or attach a photo (form check, meal, etc.).
                Your goals, this week&apos;s logged work, schedule, and streak are sent with every message.
              </p>
            ) : null}
            {state.chatMessages.map((m) => {
              const display = getCoachMessageDisplayText(m)
              if (!display && !m.image) return null
              const isUser = m.role === 'user'
              return (
                <div
                  key={m.id}
                  className={`apex-coach-message flex w-full min-w-0 max-w-full flex-col gap-2 ${
                    isUser ? 'ml-auto items-end' : 'mr-auto items-start'
                  }`}
                >
                  <div
                    className={`apex-coach-bubble w-full min-w-0 max-w-full rounded-[12px] font-normal border-[0.5px] ${
                      isUser
                        ? 'apex-coach-bubble--user text-white border-transparent'
                        : 'apex-coach-bubble--model apex-coach-bubble-ai border-white/[0.08] text-white'
                    }`}
                    style={isUser ? { backgroundColor: '#2a2a2a' } : undefined}
                  >
                    {m.image ? (
                      <img
                        src={coachImageDataUrl(m.image)}
                        alt={isUser ? 'Photo you sent' : 'Attached'}
                        className="apex-coach-bubble__image mb-2 max-h-48 w-full rounded-[8px] object-contain bg-black/20"
                      />
                    ) : null}
                    {display ? <p className="apex-coach-bubble__text m-0">{display}</p> : null}
                  </div>
                  {m.workoutPlan ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="apex-btn-primary min-h-9 max-w-full px-4 text-[12px] font-medium disabled:opacity-50"
                      onClick={() => applyPlanToToday(m.text)}
                    >
                      Apply to today
                    </button>
                  ) : null}
                </div>
              )
            })}
            {busy ? (
              <div className="apex-coach-dots" role="status" aria-label="Loading">
                <span />
                <span />
                <span />
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="apex-coach-sidebar-footer shrink-0 min-w-0 w-full pt-2">
        <div className="grid grid-cols-1 gap-2">
          {coachSuggestions.map((label) => (
            <button
              key={label}
              type="button"
              disabled={busy}
              className={`apex-btn min-h-10 min-w-0 w-full px-2 font-medium leading-snug text-left text-[#e8e8ec] border-white/[0.12] disabled:opacity-45 ${
                isSidebar ? 'text-[13px]' : 'text-[12px]'
              }`}
              onClick={() => void runCoachTurn(label, { hideUserBubble: true })}
            >
              {label}
            </button>
          ))}
        </div>
        {pendingImage ? (
          <div className="relative mt-2 inline-flex max-w-full">
            <img
              src={coachImageDataUrl(pendingImage)}
              alt="Photo to send"
              className="max-h-24 max-w-full rounded-[12px] border-[0.5px] border-white/[0.12] object-contain bg-black/30"
            />
            <button
              type="button"
              className="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full border-[0.5px] border-white/[0.15] bg-[#1a1a1a] text-[#ececee] text-[14px] touch-manipulation"
              aria-label="Remove photo"
              disabled={busy}
              onClick={() => setPendingImage(null)}
            >
              ✕
            </button>
          </div>
        ) : null}
        <div className="flex min-w-0 items-center gap-2 pt-3 border-t border-[0.5px] border-white/[0.08] mt-2">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="sr-only"
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void onAttachImage(file)
            }}
          />
          {/* Photo attach */}
          <button
            type="button"
            disabled={busy}
            className="apex-coach-attach-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border-[0.5px] border-white/[0.12] bg-[#121212] text-[#ececee] touch-manipulation disabled:opacity-45"
            aria-label="Attach photo"
            onClick={() => imageInputRef.current?.click()}
          >
            <i className="ti ti-photo-plus text-[20px] leading-none" aria-hidden />
          </button>
          {/* Voice-to-text mic */}
          <button
            type="button"
            disabled={busy}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border-[0.5px] touch-manipulation disabled:opacity-45 transition-colors ${
              listening
                ? 'border-[#e07070] bg-[rgba(224,112,112,0.12)] text-[#e07070]'
                : 'border-white/[0.12] bg-[#121212] text-[#ececee]'
            }`}
            aria-label={listening ? 'Stop listening' : 'Voice input'}
            onClick={startListening}
          >
            <i className={`ti ${listening ? 'ti-microphone-off' : 'ti-microphone'} text-[20px] leading-none`} aria-hidden />
          </button>
          <input
            className={`min-h-11 min-w-0 flex-1 ${inp}`}
            placeholder={listening ? 'Listening…' : 'Message coach…'}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void sendCoach()
            }}
          />
          {/* TTS toggle */}
          <button
            type="button"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border-[0.5px] touch-manipulation transition-colors ${
              ttsEnabled
                ? 'border-[var(--apex-accent)] bg-[rgba(var(--apex-accent-rgb,109,184,122),0.12)] text-[var(--apex-accent)]'
                : 'border-white/[0.12] bg-[#121212] text-[#9898a0]'
            }`}
            aria-label={ttsEnabled ? 'Disable voice reply' : 'Enable voice reply'}
            onClick={toggleTts}
          >
            <i className={`ti ${ttsEnabled ? 'ti-volume' : 'ti-volume-off'} text-[20px] leading-none`} aria-hidden />
          </button>
          <button
            type="button"
            disabled={busy || (!chatInput.trim() && !pendingImage)}
            className="apex-btn-primary min-h-11 shrink-0 px-4 text-[13px] font-medium disabled:opacity-50"
            onClick={() => void sendCoach()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

const inp = 'apex-input w-full min-h-12 px-3 py-2.5'

const PARSER_TIMEOUT_MS = 15_000
const PARSER_TIMEOUT_MESSAGE = "Couldn't parse that. Try again."

function AiParserPanel({
  importText,
  setImportText,
  busy,
  parseError,
  onParse,
}: {
  importText: string
  setImportText: (v: string) => void
  busy: boolean
  parseError: string | null
  onParse: () => void
}) {
  return (
    <div className="apex-card min-w-0 max-w-full p-5 space-y-3">
      <p className="apex-section-label">Import with AI</p>
      <p className="m-0 text-[12px] font-medium text-[#a0a0a8] leading-relaxed break-words">
        Paste workout notes (e.g. &quot;3 sets of 10 bench press at 135 lbs&quot;), preview, then save to
        today&apos;s log.
      </p>
      <textarea
        className="apex-input w-full min-h-32 px-3 py-3 resize-y"
        placeholder="Paste workout notes…"
        value={importText}
        onChange={(e) => setImportText(e.target.value)}
        disabled={busy}
      />
      {parseError ? (
        <p className="m-0 text-[13px] font-medium text-red-300/90 leading-relaxed" role="alert">
          {parseError}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        className="apex-btn-primary w-full min-h-12 text-[13px] font-medium disabled:opacity-50"
        onClick={onParse}
      >
        {busy ? 'Parsing…' : 'Parse'}
      </button>
    </div>
  )
}

function AiFormTipsPanel() {
  const { notify } = useWorkout()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [tips, setTips] = useState<{
    formTips: string
    commonMistakes: string
    beginnerAdvice: string
  } | null>(null)

  async function runFormTips() {
    const n = name.trim()
    if (!n) {
      notify('Enter an exercise name')
      return
    }
    setBusy(true)
    setTips(null)
    try {
      const h = await claudeExerciseFormTips(n)
      setTips({
        formTips: h.formTips,
        commonMistakes: h.commonMistakes,
        beginnerAdvice: h.beginnerAdvice,
      })
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not load form tips')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-w-0 max-w-full space-y-4">
      <label className="block min-w-0">
        <span className="apex-section-label block mb-2">Exercise name</span>
        <input
          className={`${inp}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Romanian deadlift"
          autoComplete="off"
        />
      </label>
      <button
        type="button"
        disabled={busy || !name.trim()}
        className="apex-btn-primary w-full min-h-12 text-[13px] font-medium disabled:opacity-50"
        onClick={() => void runFormTips()}
      >
        {busy ? 'Loading…' : 'Get form tips'}
      </button>
      {tips ? (
        <div className="space-y-4">
          <div>
            <p className="apex-section-label mb-2">Form tips</p>
            <p className="m-0 text-[13px] font-medium text-[#a8a8b0] leading-relaxed break-words whitespace-pre-wrap">
              {tips.formTips}
            </p>
          </div>
          <div>
            <p className="apex-section-label mb-2">Common mistakes</p>
            <p className="m-0 text-[13px] font-medium text-[#a8a8b0] leading-relaxed break-words whitespace-pre-wrap">
              {tips.commonMistakes}
            </p>
          </div>
          <div>
            <p className="apex-section-label mb-2">Beginner advice</p>
            <p className="m-0 text-[13px] font-medium text-[#a8a8b0] leading-relaxed break-words whitespace-pre-wrap">
              {tips.beginnerAdvice}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AiInsightsPanel() {
  const { state } = useWorkout()
  const chart = useApexChartColors()

  const now = Date.now()
  const today = new Date(now)
  const thisMonday = weekStartMonday(today)
  const lastMonday = new Date(thisMonday)
  lastMonday.setDate(thisMonday.getDate() - 7)
  const thisWeekStartKey = dateKey(thisMonday)
  const lastWeekStartKey = dateKey(lastMonday)

  const hasAnySessionData = state.setLogs.length > 0 || state.cardioEntries.length > 0

  const weeklyVolume = useMemo(() => weeklyVolumeSeries(state, now).slice(-6), [state, now])
  const latestWeekVolume = weeklyVolume[weeklyVolume.length - 1]?.volume ?? 0
  const prevWeekVolume = weeklyVolume[weeklyVolume.length - 2]?.volume ?? 0
  const volumeDeltaPct = prevWeekVolume > 0 ? Math.round(((latestWeekVolume - prevWeekVolume) / prevWeekVolume) * 100) : 0
  const volumeUnit = state.settings.unit === 'kg' ? 'kg' : 'lbs'
  const volumeTrendText =
    prevWeekVolume <= 0
      ? 'Log more sessions to establish a weekly trend baseline.'
      : volumeDeltaPct >= 0
        ? `+${volumeDeltaPct}% from last week`
        : `Down ${Math.abs(volumeDeltaPct)}% — consider pushing volume this week`

  const muscleFocusRows = useMemo(() => {
    const thisWeekCounts: Record<string, number> = {}
    const lastWeekCounts: Record<string, number> = {}
    for (const log of state.setLogs) {
      const d = new Date(log.at)
      const wk = dateKey(weekStartMonday(d))
      if (wk === thisWeekStartKey) {
        thisWeekCounts[log.muscleGroup] = (thisWeekCounts[log.muscleGroup] ?? 0) + Math.max(1, log.kind === 'weighted' ? log.sets : 1)
      } else if (wk === lastWeekStartKey) {
        lastWeekCounts[log.muscleGroup] = (lastWeekCounts[log.muscleGroup] ?? 0) + Math.max(1, log.kind === 'weighted' ? log.sets : 1)
      }
    }
    const rows = Object.entries(thisWeekCounts)
      .map(([muscle, thisWeek]) => ({
        muscle,
        thisWeek,
        lastWeek: lastWeekCounts[muscle] ?? 0,
      }))
      .sort((a, b) => b.thisWeek - a.thisWeek)
      .slice(0, 5)
    const maxSets = Math.max(1, ...rows.map((r) => Math.max(r.thisWeek, r.lastWeek)))
    return rows.map((r) => ({ ...r, pct: Math.round((r.thisWeek / maxSets) * 100) }))
  }, [state.setLogs, thisWeekStartKey, lastWeekStartKey])

  const consistency = useMemo(() => {
    const month = today.getMonth()
    const year = today.getFullYear()
    const plannedDaysThisMonth = state.schedule.filter((d) => {
      const dt = new Date(`${d.dateKey}T12:00:00`)
      const hasPlan = Boolean(d.workoutName.trim()) || (d.plannedExerciseIds?.length ?? 0) > 0
      return dt.getFullYear() === year && dt.getMonth() === month && hasPlan
    })
    const loggedDaySet = new Set(
      state.setLogs
        .map((l) => dateKey(new Date(l.at)))
        .filter((dk) => {
          const dt = new Date(`${dk}T12:00:00`)
          return dt.getFullYear() === year && dt.getMonth() === month
        }),
    )
    const completedPlanned = plannedDaysThisMonth.filter((d) => loggedDaySet.has(d.dateKey)).length
    const completionRatio = plannedDaysThisMonth.length > 0 ? completedPlanned / plannedDaysThisMonth.length : 0
    const streak = streakCurrent(state, now)
    const last28Start = new Date(now)
    last28Start.setDate(last28Start.getDate() - 27)
    const last28Sessions = new Set(
      state.setLogs
        .filter((l) => l.at >= last28Start.getTime())
        .map((l) => dateKey(new Date(l.at))),
    ).size
    const avgSessionsPerWeek = last28Sessions / 4
    const score = Math.round(
      Math.max(
        0,
        Math.min(
          100,
          completionRatio * 60 +
            Math.min(14, streak) / 14 * 20 +
            Math.min(4, avgSessionsPerWeek) / 4 * 20,
        ),
      ),
    )
    const explanation =
      plannedDaysThisMonth.length > 0
        ? `${completedPlanned} of ${plannedDaysThisMonth.length} planned sessions completed this month.`
        : 'Add planned sessions to unlock a more accurate consistency score.'
    return { score, explanation }
  }, [state, now, today])

  const recovery = useMemo(() => {
    const thisWeekCheckins = state.postWorkoutCheckins.filter(
      (c) => dateKey(weekStartMonday(new Date(c.at))) === thisWeekStartKey,
    )
    if (!thisWeekCheckins.length) return null
    const avgFeel = thisWeekCheckins.reduce((s, c) => s + c.feelRating, 0) / thisWeekCheckins.length
    const avgEnergy = thisWeekCheckins.reduce((s, c) => s + c.energyRating, 0) / thisWeekCheckins.length
    const note =
      avgEnergy < 3
        ? 'Energy trending low mid-week — consider an earlier bedtime or deload.'
        : avgFeel >= 4 && avgEnergy >= 4
          ? 'Recovery signals look strong — keep your sleep and hydration consistent.'
          : 'Recovery is steady — watch sleep quality on heavier training days.'
    return { avgFeel, avgEnergy, note }
  }, [state.postWorkoutCheckins, thisWeekStartKey])

  if (!hasAnySessionData) {
    return (
      <div className="py-14 text-center">
        <i className="ti ti-chart-bar text-[26px] leading-none mx-auto block mb-4 text-[#3d7ab5]" aria-hidden />
        <p className="text-[20px] font-medium text-[#f0f0f2]">No data yet</p>
        <p className="mt-2 text-[14px] font-medium text-[#a0a0a8]">
          Log your first workout to start seeing patterns here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="apex-section-label text-[#3d7ab5]">INSIGHTS</p>
        <h2 className="mt-1 text-[28px] font-medium text-[#f4f4f5] leading-tight">Training Patterns</h2>
        <p className="mt-2 text-[14px] font-medium text-[#a0a0a8]">Updated weekly based on your sessions.</p>
      </header>

      <section className="rounded-[12px] p-4 bg-[#13181f]">
        <p className="apex-section-label">WEEKLY VOLUME</p>
        <div className="mt-3 h-24">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weeklyVolume} margin={{ left: 6, right: 6, top: 4, bottom: 4 }}>
              <Line
                type="monotone"
                dataKey="volume"
                stroke="#3d7ab5"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: '#3d7ab5' }}
              />
              <Tooltip
                cursor={{ stroke: chart.grid }}
                contentStyle={{
                  background: chart.tooltipBg,
                  border: `0.5px solid ${chart.tooltipBorder}`,
                  borderRadius: 10,
                  color: chart.tooltipText,
                }}
                labelStyle={{ color: chart.tick }}
                formatter={(v) => [`${Math.round(Number(v)).toLocaleString()} ${volumeUnit}`, 'Volume']}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className={`mt-2 text-[13px] font-medium ${volumeDeltaPct >= 0 ? 'text-[#3d7ab5]' : 'text-[#c8c8ce]'}`}>
          {volumeTrendText}
        </p>
      </section>

      <section className="rounded-[12px] p-4 bg-[#13181f]">
        <p className="apex-section-label">MUSCLE FOCUS</p>
        <div className="mt-3 space-y-3">
          {muscleFocusRows.length ? (
            muscleFocusRows.map((row) => (
              <div key={row.muscle}>
                <div className="flex items-center justify-between text-[12px] font-medium text-[#c8c8ce]">
                  <span>{row.muscle}</span>
                  <span className="tabular-nums">{row.thisWeek} sets</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-white/[0.08] overflow-hidden">
                  <div className="h-full bg-[#3d7ab5]" style={{ width: `${row.pct}%` }} />
                </div>
              </div>
            ))
          ) : (
            <p className="text-[13px] font-medium text-[#a0a0a8]">Log sets this week to see your top muscle groups.</p>
          )}
        </div>
      </section>

      <section className="rounded-[12px] p-4 bg-[#13181f]">
        <p className="apex-section-label">CONSISTENCY</p>
        <p className="mt-2 text-[38px] leading-none font-medium text-[#f4f4f5] tabular-nums">
          {consistency.score}
          <span className="text-[18px] text-[#a0a0a8] font-medium">/100</span>
        </p>
        <p className="mt-2 text-[13px] font-medium text-[#c8c8ce]">{consistency.explanation}</p>
      </section>

      <section className="rounded-[12px] p-4 bg-[#13181f]">
        <p className="apex-section-label">RECOVERY</p>
        {recovery ? (
          <>
            <div className="mt-2 flex items-center gap-4 text-[13px] font-medium text-[#c8c8ce]">
              <span>Feel: <span className="tabular-nums text-[#f4f4f5]">{recovery.avgFeel.toFixed(1)}/5</span></span>
              <span>Energy: <span className="tabular-nums text-[#f4f4f5]">{recovery.avgEnergy.toFixed(1)}/5</span></span>
            </div>
            <p className="mt-2 text-[13px] font-medium text-[#a0a0a8]">{recovery.note}</p>
          </>
        ) : (
          <p className="mt-2 text-[13px] font-medium text-[#a0a0a8]">
            Complete post-workout check-ins to unlock recovery insights.
          </p>
        )}
      </section>
    </div>
  )
}

export function AiHub({
  aiSub,
  setAiSub,
  variant = 'tab',
  showNav = true,
}: {
  aiSub: AiSub
  setAiSub: (s: AiSub) => void
  variant?: 'tab' | 'sidebar'
  /** When false, hide pill nav (e.g. mobile AI tab hub picks the section). */
  showNav?: boolean
}) {
  const { state, mergeImport, notify } = useWorkout()
  const [importText, setImportText] = useState('')
  const [importPreview, setImportPreview] = useState<Partial<AppPersisted> | null>(null)
  const [busy, setBusy] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  async function runParseImport() {
    if (!importText.trim()) {
      notify('Paste workout notes first')
      return
    }
    setBusy(true)
    setParseError(null)
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), PARSER_TIMEOUT_MS)
    const normOpts = { customExercises: state.customExercises, atMs: Date.now() }
    let apiError: string | null = null
    try {
      let partial: Partial<AppPersisted> = {}
      try {
        const raw = await claudeParseImport(state, importText, { signal: controller.signal })
        partial = sanitizeWorkoutImport(raw, state)
      } catch (e) {
        if (controller.signal.aborted) {
          setParseError(PARSER_TIMEOUT_MESSAGE)
          return
        }
        apiError = e instanceof Error ? e.message : 'Parse failed'
        partial = parseWorkoutTextLocally(importText, normOpts)
      }

      if (!partial.setLogs?.length) {
        const local = parseWorkoutTextLocally(importText, normOpts)
        if (local.setLogs?.length) partial = { ...partial, setLogs: local.setLogs }
      }

      if (
        !partial.setLogs?.length &&
        !partial.cardioEntries?.length &&
        !partial.bodyweightLogs?.length &&
        !partial.schedule
      ) {
        notify(apiError ?? 'No entries found — try different wording')
        return
      }
      setImportPreview(partial)
    } catch (e) {
      if (controller.signal.aborted) {
        setParseError(PARSER_TIMEOUT_MESSAGE)
      } else {
        notify(e instanceof Error ? e.message : 'Parse failed')
      }
    } finally {
      window.clearTimeout(timeoutId)
      setBusy(false)
    }
  }

  function confirmImportMerge() {
    if (!importPreview) return
    const setCount = importPreview.setLogs?.length ?? 0
    mergeImport(importPreview, { silent: true })
    if (setCount > 0) {
      notify(
        setCount === 1
          ? "Logged 1 exercise to today's workout"
          : `Logged ${setCount} exercises to today's workout`,
      )
    } else {
      notify('Import saved')
    }
    setImportPreview(null)
    setImportText('')
  }

  const hubShellClass =
    variant === 'sidebar'
      ? 'flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden'
      : 'space-y-4'

  const aiSubContent =
    aiSub === 'coach' ? (
      <AiCoachPanel variant={variant} showTitle={false} />
    ) : aiSub === 'parser' ? (
      <AiParserPanel
        importText={importText}
        setImportText={(v) => {
          setImportText(v)
          setParseError(null)
        }}
        busy={busy}
        parseError={parseError}
        onParse={() => void runParseImport()}
      />
    ) : aiSub === 'form' ? (
      <AiFormTipsPanel />
    ) : (
      <AiInsightsPanel />
    )

  return (
    <>
      <div className={hubShellClass}>
        {showNav ? (
          <div className={variant === 'sidebar' ? 'shrink-0 pb-3' : undefined}>
            <AiPillNav active={aiSub} onChange={setAiSub} />
          </div>
        ) : null}
        {variant === 'sidebar' ? (
          <div className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
            {aiSub === 'coach' ? (
              aiSubContent
            ) : (
              <div className="apex-coach-sidebar-scroll flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
                {aiSubContent}
              </div>
            )}
          </div>
        ) : (
          aiSubContent
        )}
      </div>
      {importPreview ? (
        <div
          role="presentation"
          className="apex-modal-overlay fixed inset-0 z-[85] flex items-center justify-center p-4"
          onClick={() => setImportPreview(null)}
        >
          <div
            className="w-full max-w-md apex-card p-5 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[13px] font-normal text-[#e0e0e0]">Import preview</h3>
            <p className="mt-2 text-[13px] font-normal text-[#a8a8b0] leading-relaxed">
              Set logs are added to today&apos;s workout. Other entries are merged into your data.
            </p>
            <ul className="mt-4 space-y-2 text-[13px] font-normal text-[#e0e0e0]">
              <li>
                Set logs:{' '}
                <span className="tabular-nums text-[#e0e0e0]">{importPreview.setLogs?.length ?? 0}</span>
              </li>
              <li>
                Cardio:{' '}
                <span className="tabular-nums text-[#e0e0e0]">
                  {importPreview.cardioEntries?.length ?? 0}
                </span>
              </li>
              <li>
                Bodyweight:{' '}
                <span className="tabular-nums text-[#e0e0e0]">
                  {importPreview.bodyweightLogs?.length ?? 0}
                </span>
              </li>
              <li>
                Schedule:{' '}
                <span className="text-[#e0e0e0]">
                  {importPreview.schedule ? `${importPreview.schedule.length} days` : 'unchanged'}
                </span>
              </li>
            </ul>
            {importPreview.setLogs?.length ? (
              <div className="mt-4 max-h-40 overflow-y-auto rounded-[8px] border-[0.5px] border-white/[0.08] p-3">
                <p className="apex-section-label mb-2">Sample sets</p>
                <ul className="space-y-1 text-[12px] text-[#a8a8b0]">
                  {importPreview.setLogs.slice(0, 8).map((l) => (
                    <li key={l.id}>
                      {l.exerciseName}
                      {l.kind === 'weighted'
                        ? ` · ${l.sets}×${l.reps} @ ${l.bodyweight ? 'BW' : `${l.weight ?? 0} ${state.settings.unit}`}`
                        : ` · ${l.durationSec}s`}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                className="apex-btn min-h-12 flex-1 text-[14px] font-medium"
                onClick={() => setImportPreview(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="apex-btn-primary min-h-12 flex-1 text-[13px] font-medium"
                onClick={confirmImportMerge}
              >
                Log to today
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function readThemeMode(): ApexThemeMode {
  try {
    return localStorage.getItem(APEX_THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function readFontSizeMode(): ApexFontSizeMode {
  try {
    const v = localStorage.getItem(APEX_FONT_SIZE_STORAGE_KEY)
    if (v === 'small' || v === 'large' || v === 'xlarge') return v
  } catch {
    /* ignore */
  }
  return 'medium'
}

function fontSizeStopLabel(size: ApexFontSizeMode): string {
  if (size === 'small') return 'S'
  if (size === 'large' || size === 'xlarge') return 'L'
  return 'M'
}

function fontSizeStopIndex(size: ApexFontSizeMode): number {
  if (size === 'small') return 0
  if (size === 'large' || size === 'xlarge') return 2
  return 1
}

function fontSizeFromStop(index: number): ApexFontSizeMode {
  if (index <= 0) return 'small'
  if (index >= 2) return 'large'
  return 'medium'
}

function IosSwitch({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  ariaLabel: string
}) {
  return (
    <div className="apex-settings-toggle-segment" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`${ariaLabel} on`}
        className={`apex-settings-toggle-segment__btn${checked ? ' is-active' : ''}`}
        onClick={() => onChange(true)}
      >
        ON
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={!checked}
        aria-label={`${ariaLabel} off`}
        className={`apex-settings-toggle-segment__btn${!checked ? ' is-active' : ''}`}
        onClick={() => onChange(false)}
      >
        OFF
      </button>
    </div>
  )
}

function SettingsSegment({
  value,
  left,
  right,
  onChange,
}: {
  value: string
  left: { id: string; label: string }
  right: { id: string; label: string }
  onChange: (id: string) => void
}) {
  return (
    <div className="apex-settings-segment" role="group">
      <button
        type="button"
        className={`apex-settings-segment__btn${value === left.id ? ' is-active' : ''}`}
        onClick={() => onChange(left.id)}
      >
        {left.label}
      </button>
      <button
        type="button"
        className={`apex-settings-segment__btn${value === right.id ? ' is-active' : ''}`}
        onClick={() => onChange(right.id)}
      >
        {right.label}
      </button>
    </div>
  )
}

const ME_ACTUAL_AGE_YEARS = 30

/** Hardcoded leaderboard bots — always shown on the Me tab card. */
const ME_LEADERBOARD_BOTS: FriendLeaderboardRow[] = [
  {
    id: 'bot-atlas',
    name: 'Atlas',
    xp: 3200,
    isMe: false,
    isBot: true,
    avatarShade: 1,
    avatarInitial: 'A',
  },
  {
    id: 'bot-rex',
    name: 'Rex',
    xp: 2800,
    isMe: false,
    isBot: true,
    avatarShade: 2,
    avatarInitial: 'R',
  },
  {
    id: 'bot-luna',
    name: 'Luna',
    xp: 2450,
    isMe: false,
    isBot: true,
    avatarShade: 3,
    avatarInitial: 'L',
  },
]

function sortedMeLeaderboardBots(): FriendLeaderboardRow[] {
  return [...ME_LEADERBOARD_BOTS].sort((a, b) => b.xp - a.xp)
}

function buildMeLeaderboardTop(
  friends: { user_id: string; display_name: string; xp: number }[],
): FriendLeaderboardRow[] {
  const real: FriendLeaderboardRow[] = friends.map((f, i) => ({
    id: f.user_id,
    name: f.display_name,
    xp: f.xp,
    isMe: false,
    isBot: false,
    avatarShade: (i % 4) + 1,
  }))
  const merged = [...ME_LEADERBOARD_BOTS, ...real].sort((a, b) => b.xp - a.xp)
  return merged.length > 0 ? merged : sortedMeLeaderboardBots()
}

function generateMeFriendCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

function sanitizeMeFriendCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const code = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return code.length >= 4 ? code : null
}

function buildMeLeaderboardMe(
  viewerUserId: string,
  viewerName: string,
  viewerXp: number,
): FriendLeaderboardRow {
  return {
    id: viewerUserId,
    name: viewerName,
    xp: viewerXp,
    isMe: true,
    isBot: false,
    avatarShade: 0,
  }
}

function meLeaderboardRank(top: FriendLeaderboardRow[], me: FriendLeaderboardRow): number {
  return [...top, me].sort((a, b) => b.xp - a.xp).findIndex((r) => r.isMe) + 1
}

function leaderboardAvatarInitial(row: FriendLeaderboardRow): string {
  if (row.avatarInitial) return row.avatarInitial
  return initialsForName(row.name)
}

function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`.toUpperCase()
  }
  return (parts[0]?.slice(0, 1) ?? 'A').toUpperCase()
}

function StrengthAgeSemicircle({ strengthAge }: { strengthAge: number }) {
  const max = 70
  const pct = Math.min(1, Math.max(0, strengthAge / max))
  const arcLen = Math.PI * 50
  const dash = pct * arcLen
  const younger = strengthAge < ME_ACTUAL_AGE_YEARS
  return (
    <div className="apex-me-strength-gauge">
      <svg viewBox="0 0 120 68" width="120" height="68" aria-hidden>
        <path
          d="M 12 58 A 48 48 0 0 1 108 58"
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M 12 58 A 48 48 0 0 1 108 58"
          fill="none"
          stroke="#3d7ab5"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${arcLen}`}
        />
      </svg>
      <p className="apex-me-strength-gauge__tag">{younger ? 'YOUNGER' : 'OLDER'}</p>
    </div>
  )
}

type MeTabProfileProps = {
  displayName: string
  profileInitials: string
  lifetimeXp: number
  levelLabel: string
  xpLeft: string
  xpRight: string
  progressPct: number
  sessionsWeek: number
  setsWeek: number
  streakDays: number
  prsMonth: number
  prRows: ReturnType<typeof computePersonalRecordDisplayRows>
  strengthAge: ReturnType<typeof computeStrengthAge>
  appearanceTheme: ApexThemeMode
  onToggleTheme: () => void
  friendCode: string | null
  friendCodeLoading: boolean
  friendTopRows: FriendLeaderboardRow[]
  meLeaderboardRow: FriendLeaderboardRow
  friendLoading: boolean
  onCopyFriendCode: () => void
  onAddFriend: () => void
  onViewAllPr: () => void
  onViewAllLeaderboard: () => void
  onOpenSettings: () => void
}

function MeTabProfileView({
  displayName,
  profileInitials,
  lifetimeXp,
  levelLabel,
  xpLeft,
  xpRight,
  progressPct,
  sessionsWeek,
  setsWeek,
  streakDays,
  prsMonth,
  prRows,
  strengthAge,
  appearanceTheme,
  onToggleTheme,
  friendCode,
  friendCodeLoading,
  friendTopRows,
  meLeaderboardRow,
  friendLoading,
  onCopyFriendCode,
  onAddFriend,
  onViewAllPr,
  onViewAllLeaderboard,
  onOpenSettings,
}: MeTabProfileProps) {
  const rankedTop =
    friendTopRows.length > 0 ? friendTopRows : sortedMeLeaderboardBots()
  const listTop = rankedTop.slice(0, 4)
  const meRank = meLeaderboardRank(rankedTop, meLeaderboardRow)

  const ageDelta =
    strengthAge.strengthAge != null ? ME_ACTUAL_AGE_YEARS - strengthAge.strengthAge : null

  return (
    <div className="apex-me-tab space-y-5">
      <header className="apex-me-header">
        <div className="apex-me-header__row">
          <div className="apex-me-header__identity">
            <span className="apex-me-avatar" aria-hidden>
              {profileInitials.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <h1 className="apex-me-username">{displayName}</h1>
              <p className="apex-me-level-line">
                {levelLabel} · {lifetimeXp} XP
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            className="apex-me-theme-toggle"
            aria-label="Settings"
            onClick={onOpenSettings}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 15a3 3 0 100-6 3 3 0 000 6z"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </button>
          <button
            type="button"
            className="apex-me-theme-toggle"
            aria-label={appearanceTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={onToggleTheme}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          </div>
        </div>
        <div className="apex-me-xp-track">
          <div className="apex-me-xp-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="apex-me-xp-labels">
          <span>{xpLeft}</span>
          <span>{xpRight}</span>
        </div>
      </header>

      <div className="apex-me-stats-grid">
        <div className="apex-me-stat-card">
          <p className="apex-me-stat-card__label">SESSIONS</p>
          <p className="apex-me-stat-card__value tabular-nums">{sessionsWeek}</p>
          <p className="apex-me-stat-card__sub">this wk</p>
        </div>
        <div className="apex-me-stat-card">
          <p className="apex-me-stat-card__label">SETS</p>
          <p className="apex-me-stat-card__value tabular-nums">{setsWeek}</p>
          <p className="apex-me-stat-card__sub">this wk</p>
        </div>
        <div className="apex-me-stat-card">
          <p className="apex-me-stat-card__label">STREAK</p>
          <p className="apex-me-stat-card__value tabular-nums">{streakDays}</p>
          <p className="apex-me-stat-card__sub">days</p>
        </div>
        <div className="apex-me-stat-card">
          <p className="apex-me-stat-card__label">PRS</p>
          <p className="apex-me-stat-card__value tabular-nums">{prsMonth}</p>
          <p className="apex-me-stat-card__sub">this mo</p>
        </div>
      </div>

      <section>
        <div className="apex-me-section-head">
          <h2 className="apex-me-section-title">PERSONAL RECORDS</h2>
          <button type="button" className="apex-me-link" onClick={onViewAllPr}>
            See all
          </button>
        </div>
        <div className="apex-me-card">
          {prRows.length ? (
            <ul className="apex-me-pr-list">
              {prRows.slice(0, 4).map((row, i) => (
                <li key={row.exerciseId}>
                  {i > 0 ? <div className="apex-me-pr-divider" aria-hidden /> : null}
                  <div className="apex-me-pr-row">
                    <div className="min-w-0">
                      <p className="apex-me-pr-name">{row.exerciseName}</p>
                      <p className="apex-me-pr-date">{row.dateLabel}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="apex-me-pr-weight">{row.weightLabel ?? row.detail}</p>
                      {row.improvementLabel ? (
                        <p className="apex-me-pr-delta">{row.improvementLabel}</p>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="apex-me-empty">Log sets to build your PR board.</p>
          )}
        </div>
      </section>

      <section>
        <div className="apex-me-card apex-me-strength-card">
          <div className="apex-me-strength-card__gauge">
            {strengthAge.strengthAge != null ? (
              <StrengthAgeSemicircle strengthAge={strengthAge.strengthAge} />
            ) : (
              <div className="apex-me-strength-placeholder">—</div>
            )}
          </div>
          <div className="apex-me-strength-card__copy">
            <p className="apex-me-strength-label">Your strength age</p>
            {strengthAge.strengthAge != null && ageDelta != null ? (
              <>
                <p className="apex-me-strength-age tabular-nums">{strengthAge.strengthAge}</p>
                <p className="apex-me-strength-sub">
                  {Math.abs(ageDelta)} years {ageDelta > 0 ? 'younger' : ageDelta < 0 ? 'older' : 'same as'}{' '}
                  than your actual age
                </p>
              </>
            ) : (
              <p className="apex-me-strength-sub">
                {strengthAge.missingBodyweight
                  ? 'Log bodyweight and key lifts to calculate'
                  : 'Log bench, squat, deadlift, or press for strength age'}
              </p>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="apex-me-section-head">
          <h2 className="apex-me-section-title">LEADERBOARD</h2>
          <button type="button" className="apex-me-link" onClick={onViewAllLeaderboard}>
            View all
          </button>
        </div>
        <div className="apex-me-card">
          <ul className="apex-me-lb-list">
            {listTop.map((row, index) => (
              <li key={row.id} className="apex-me-lb-row">
                <span className="apex-me-lb-rank tabular-nums">{index + 1}</span>
                <span
                  className={`apex-me-lb-avatar apex-me-lb-avatar--shade-${row.avatarShade || 1}`}
                >
                  {leaderboardAvatarInitial(row)}
                </span>
                <span className="apex-me-lb-name truncate">{row.name}</span>
                <span className="apex-me-lb-xp tabular-nums">{row.xp} XP</span>
              </li>
            ))}
            <li className="apex-me-lb-ellipsis" aria-hidden>
              ···
            </li>
            <li className="apex-me-lb-row apex-me-lb-row--me">
              <span className="apex-me-lb-rank tabular-nums">{meRank}</span>
              <span className="apex-me-lb-avatar apex-me-lb-avatar--shade-0">
                {leaderboardAvatarInitial(meLeaderboardRow)}
              </span>
              <span className="apex-me-lb-name truncate">{meLeaderboardRow.name}</span>
              <span className="apex-me-lb-xp tabular-nums">{meLeaderboardRow.xp} XP</span>
            </li>
          </ul>
          {friendLoading ? (
            <p className="apex-me-empty mt-2 mb-0 text-[12px]">Updating friends…</p>
          ) : null}
        </div>
        <div className="apex-me-friend-code-row">
          <span className="apex-me-friend-code-label">
            Your code:{' '}
            <span className="tabular-nums tracking-wide font-medium">
              {friendCodeLoading ? '…' : friendCode}
            </span>
          </span>
          <button
            type="button"
            className="apex-me-copy-btn"
            aria-label="Copy friend code"
            disabled={friendCodeLoading || !friendCode}
            onClick={onCopyFriendCode}
          >
            <i className="ti ti-copy text-[18px]" aria-hidden />
          </button>
        </div>
        <button type="button" className="apex-me-add-friend-btn" onClick={onAddFriend}>
          + Add friend
        </button>
      </section>
    </div>
  )
}

function GlobalLeaderboardOverlay({
  open,
  rows,
  loading,
  userId,
  onClose,
}: {
  open: boolean
  rows: LeaderboardEntry[]
  loading: boolean
  userId: string
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="apex-me-overlay fixed inset-0 z-[92] flex flex-col bg-[#090d14] text-white">
      <header className="apex-safe-top flex items-center gap-3 px-4 py-3 border-b border-[0.5px] border-white/[0.06]">
        <button type="button" className="apex-me-back" onClick={onClose}>
          ‹ Back
        </button>
        <h1 className="text-[17px] font-medium">Global leaderboard</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="text-[13px] text-white/45">Loading…</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row, index) => {
              const isMe = row.user_id === userId
              return (
                <li
                  key={row.user_id}
                  className={`apex-me-card flex items-center gap-3 px-4 py-3 ${isMe ? 'ring-1 ring-[#3d7ab5]/40' : ''}`}
                >
                  <span className="apex-me-lb-rank tabular-nums w-6">{index + 1}</span>
                  <span className="apex-me-lb-avatar apex-me-lb-avatar--shade-1">
                    {initialsForName(row.display_name)}
                  </span>
                  <span className="flex-1 truncate text-[14px]">{row.display_name}</span>
                  <span className="text-[13px] tabular-nums text-white/70">{row.xp} XP</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function PrListOverlay({
  open,
  rows,
  onClose,
}: {
  open: boolean
  rows: ReturnType<typeof computePersonalRecordDisplayRows>
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="apex-me-overlay fixed inset-0 z-[92] flex flex-col bg-[#090d14] text-white">
      <header className="apex-safe-top flex items-center gap-3 px-4 py-3 border-b border-[0.5px] border-white/[0.06]">
        <button type="button" className="apex-me-back" onClick={onClose}>
          ‹ Back
        </button>
        <h1 className="text-[17px] font-medium">Personal records</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <ul className="apex-me-card apex-me-pr-list">
          {rows.map((row, i) => (
            <li key={row.exerciseId}>
              {i > 0 ? <div className="apex-me-pr-divider" aria-hidden /> : null}
              <div className="apex-me-pr-row">
                <div className="min-w-0">
                  <p className="apex-me-pr-name">{row.exerciseName}</p>
                  <p className="apex-me-pr-date">{row.dateLabel}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="apex-me-pr-weight">{row.weightLabel ?? row.detail}</p>
                  {row.improvementLabel ? (
                    <p className="apex-me-pr-delta">{row.improvementLabel}</p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function AddFriendSheet({
  open,
  code,
  error,
  busy,
  onCodeChange,
  onClose,
  onSubmit,
}: {
  open: boolean
  code: string
  error: string
  busy: boolean
  onCodeChange: (v: string) => void
  onClose: () => void
  onSubmit: () => void
}) {
  if (!open) return null
  return (
    <div
      className="apex-log-set-sheet-overlay fixed inset-0 z-[93] flex items-end justify-center p-0"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="apex-log-set-sheet w-full max-w-lg"
        role="dialog"
        aria-modal="true"
        aria-label="Add friend"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="apex-log-set-sheet__handle-wrap">
          <span className="apex-log-set-sheet__pill" aria-hidden />
        </div>
        <h2 className="apex-log-set-sheet__title">Add friend</h2>
        <p className="apex-me-add-friend-hint">Enter friend code</p>
        <input
          className="apex-me-add-friend-input"
          value={code}
          onChange={(e) => onCodeChange(e.target.value.toUpperCase())}
          placeholder="ABC123"
          autoCapitalize="characters"
          maxLength={6}
        />
        {error ? <p className="apex-me-add-friend-error">{error}</p> : null}
        <footer className="apex-log-set-sheet__footer apex-safe-bottom">
          <button
            type="button"
            className="apex-log-set-sheet__log-btn"
            disabled={busy || !code.trim()}
            onClick={onSubmit}
          >
            {busy ? 'Adding…' : 'Add friend'}
          </button>
        </footer>
      </div>
    </div>
  )
}

export function ProfileTab({
  onOpenAchievements,
  layout = 'mobile',
  desktopSection = 'profile',
  openGymSettingsToken = 0,
}: Props) {
  const isDesktop = layout === 'desktop'
  const {
    userId,
    state,
    updateSettings,
    notify,
    addBodyweight,
  } = useWorkout()
  const sub: Sub = 'stats'
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [distanceUnit, setDistanceUnit] = useState<ApexDistanceUnit>(readDistanceUnit)
  const [workoutReminders, setWorkoutReminders] = useState(readWorkoutRemindersEnabled)
  const [weeklySummary, setWeeklySummary] = useState(readWeeklySummaryEnabled)
  const [postWorkoutCheckin, setPostWorkoutCheckin] = useState(readPostWorkoutCheckinEnabled)
  const [spotifyConnected, setSpotifyConnected] = useState(isSpotifyConnected)
  const [busy, setBusy] = useState(false)
  const [appearanceTheme, setAppearanceTheme] = useState<ApexThemeMode>(readThemeMode)
  const [appearanceFontSize, setAppearanceFontSize] = useState<ApexFontSizeMode>(readFontSizeMode)
  const [bwInput, setBwInput] = useState('')
  const [clearDataBusy, setClearDataBusy] = useState(false)
  const [confirmClearData, setConfirmClearData] = useState(false)
  const [gymBarcode, setGymBarcode] = useState<GymBarcodeStored | null>(() => readGymBarcode())
  const [gymSettingsOpen, setGymSettingsOpen] = useState(false)
  const [gymDraftNumber, setGymDraftNumber] = useState('')
  const [gymDraftFormat, setGymDraftFormat] = useState<GymBarcodeFormat>('code128')
  const [gymDraftGymName, setGymDraftGymName] = useState('')
  const [friendCode, setFriendCode] = useState<string | null>(null)
  const [friendCodeLoading, setFriendCodeLoading] = useState(true)
  const [friendLbTop, setFriendLbTop] = useState<FriendLeaderboardRow[]>(sortedMeLeaderboardBots)
  const [friendLbMe, setFriendLbMe] = useState<FriendLeaderboardRow>(() =>
    buildMeLeaderboardMe(userId, 'Lift Athlete', 0),
  )
  const [friendLbLoading, setFriendLbLoading] = useState(false)
  const [addFriendOpen, setAddFriendOpen] = useState(false)
  const [addFriendCode, setAddFriendCode] = useState('')
  const [addFriendError, setAddFriendError] = useState('')
  const [addFriendBusy, setAddFriendBusy] = useState(false)
  const [globalLbOpen, setGlobalLbOpen] = useState(false)
  const [globalLbRows, setGlobalLbRows] = useState<LeaderboardEntry[]>([])
  const [globalLbLoading, setGlobalLbLoading] = useState(false)
  const [prListOpen, setPrListOpen] = useState(false)
  const [friendsRefresh, setFriendsRefresh] = useState(0)

  const showSettingsScreen =
    (isDesktop && desktopSection === 'settings') || (!isDesktop && settingsOpen)
  const showMeTab = isDesktop ? desktopSection === 'profile' : sub === 'stats' && !settingsOpen

  useSwipeBackLayer(showSettingsScreen && !isDesktop, () => setSettingsOpen(false))
  useSwipeBackLayer(globalLbOpen, () => setGlobalLbOpen(false))
  useSwipeBackLayer(prListOpen, () => setPrListOpen(false))

  const [trainerMode, setTrainerMode] = useState(readTrainerModeEnabled)
  const [trainerCode, setTrainerCode] = useState(readTrainerCode)
  const [clientConnection, setClientConnection] = useState<TrainerConnectionRow | null>(null)
  const [sharePrefs, setSharePrefs] = useState(readTrainerSharePrefs)
  const [connectCodeInput, setConnectCodeInput] = useState('')
  const [connectCodeError, setConnectCodeError] = useState('')
  const [clients, setClients] = useState<TrainerClientSummary[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [selectedClient, setSelectedClient] = useState<TrainerClientSummary | null>(null)
  const [clientDetailState, setClientDetailState] = useState<AppPersisted | null>(null)
  const [clientDetailLoading, setClientDetailLoading] = useState(false)
  const [clientNoteDraft, setClientNoteDraft] = useState('')
  const chart = useApexChartColors()
  const vol = useMemo(() => weeklyVolumeSeries(state), [state])
  const bw = useMemo(() => bodyweightSeries(state), [state])
  const lastBodyweight = useMemo(() => {
    const sorted = [...state.bodyweightLogs].sort((a, b) => b.at - a.at)
    return sorted[0] ?? null
  }, [state.bodyweightLogs])

  const strengthAge = useMemo(
    () =>
      computeStrengthAge(
        state.setLogs,
        lastBodyweight?.value ?? null,
        state.settings.unit,
      ),
    [state.setLogs, lastBodyweight, state.settings.unit],
  )

  const profileInitials = useMemo(() => {
    const n = state.settings.displayName.trim()
    if (!n) return 'AX'
    const parts = n.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`.toUpperCase()
    }
    return n.slice(0, 2).toUpperCase()
  }, [state.settings.displayName])

  useEffect(() => {
    if (state.settings.trainerMode && !readTrainerModeEnabled()) {
      writeTrainerModeEnabled(true)
      const code = ensureTrainerCode()
      setTrainerMode(true)
      setTrainerCode(code)
      updateSettings({ trainerMode: false, trainerNotes: '' })
      void upsertTrainerCode(userId, code).catch(() => {})
    }
  }, [state.settings.trainerMode, updateSettings, userId])

  useEffect(() => {
    void fetchMyTrainerConnection(userId).then(setClientConnection)
  }, [userId])

  useEffect(() => {
    if (!trainerMode) return
    const code = ensureTrainerCode()
    setTrainerCode(code)
    void upsertTrainerCode(userId, code).catch(() => {})
  }, [trainerMode, userId])

  useEffect(() => {
    if (!trainerMode) {
      setClients([])
      return
    }
    const showProfileStats =
      (isDesktop && desktopSection === 'profile') || (!isDesktop && sub === 'stats')
    if (!showProfileStats) return
    let cancelled = false
    setClientsLoading(true)
    void fetchTrainerClientSummaries(userId).then((rows) => {
      if (!cancelled) {
        setClients(rows)
        setClientsLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [trainerMode, userId, sub, isDesktop, desktopSection, state.setLogs.length])

  useEffect(() => {
    if (state.trainerShare) {
      syncTrainerShareFromState(state)
      setSharePrefs(readTrainerSharePrefs())
    }
  }, [state.trainerShare?.workoutLogs, state.trainerShare?.bodyweight, state.trainerShare?.personalRecords])

  const persistSharePrefs = () => {
    void upsertUserWorkoutState(userId, applyTrainerShareToState(state)).catch(() => {})
  }

  const toggleTrainerMode = (enabled: boolean) => {
    writeTrainerModeEnabled(enabled)
    setTrainerMode(enabled)
    if (enabled) {
      const code = ensureTrainerCode()
      setTrainerCode(code)
      void upsertTrainerCode(userId, code)
        .then(() => notify('Trainer mode enabled'))
        .catch((e) => notify(e instanceof Error ? e.message : 'Could not save trainer code'))
    } else {
      setSelectedClient(null)
      setClientDetailState(null)
    }
    if (state.settings.trainerMode || state.settings.trainerNotes) {
      updateSettings({ trainerMode: false, trainerNotes: '' })
    }
  }

  const toggleSharePref = (type: TrainerShareType, enabled: boolean) => {
    writeTrainerSharePref(type, enabled)
    setSharePrefs(readTrainerSharePrefs())
    persistSharePrefs()
  }

  const openClientDetail = (client: TrainerClientSummary) => {
    setSelectedClient(client)
    setClientDetailState(null)
    setClientNoteDraft('')
    setClientDetailLoading(true)
    void fetchUserWorkoutStateForTrainer(client.connection.client_user_id)
      .then((raw) => setClientDetailState(raw ? filterClientStateForTrainer(raw) : null))
      .finally(() => setClientDetailLoading(false))
  }

  useEffect(() => {
    const syncSpotify = () => setSpotifyConnected(isSpotifyConnected())
    syncSpotify()
    window.addEventListener('storage', syncSpotify)
    window.addEventListener('focus', syncSpotify)
    return () => {
      window.removeEventListener('storage', syncSpotify)
      window.removeEventListener('focus', syncSpotify)
    }
  }, [settingsOpen, showSettingsScreen])

  useEffect(() => {
    if (!openGymSettingsToken) return
    if (!isDesktop) setSettingsOpen(true)
    const cur = readGymBarcode()
    setGymDraftNumber(cur?.number ?? '')
    setGymDraftFormat(cur?.format ?? 'code128')
    setGymDraftGymName(cur?.gymName ?? '')
    setGymSettingsOpen(true)
  }, [openGymSettingsToken, isDesktop])

  const levelInfo = useMemo(() => getLevelInfo(state.lifetimeXp ?? 0), [state.lifetimeXp])
  const xpLabels = useMemo(() => xpBarLabels(state.lifetimeXp ?? 0), [state.lifetimeXp])
  const displayName = state.settings.displayName.trim() || 'Lift Athlete'

  const prDisplayRows = useMemo(
    () => computePersonalRecordDisplayRows(state.setLogs, state.settings.unit),
    [state.setLogs, state.settings.unit],
  )

  const prsMonthCount = useMemo(
    () => prsThisMonth(state.setLogs),
    [state.setLogs],
  )

  useEffect(() => {
    if (!showMeTab) return
    let cancelled = false
    setFriendCodeLoading(true)
    void (async () => {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser()
        const authUserId = authUser?.id ?? userId

        const { data: rows, error } = await supabase
          .from('tended_user_state')
          .select('date_key, friend_code')
          .eq('user_id', authUserId)
          .order('updated_at', { ascending: false })
          .limit(1)

        if (error) throw error

        const existingRow = rows?.[0]
        let code: string | null = sanitizeMeFriendCode(existingRow?.friend_code ?? null)

        if (!code && existingRow) {
          code = generateMeFriendCode()
          await supabase
            .from('tended_user_state')
            .update({
              friend_code: code,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', authUserId)
            .eq('date_key', String(existingRow.date_key))
        }

        if (!code) {
          code = generateMeFriendCode()
          await supabase.from('tended_user_state').insert({
            user_id: authUserId,
            date_key: TENDED_FRIEND_CODE_PROFILE_DATE_KEY,
            friend_code: code,
            workout_done: false,
            volume_lbs: 0,
            muscle_groups_trained: [],
            water_oz: 0,
            source_app: 'apex',
            updated_at: new Date().toISOString(),
          })
        }

        if (!cancelled) setFriendCode(code)
      } catch {
        if (!cancelled) setFriendCode(generateMeFriendCode())
      } finally {
        if (!cancelled) setFriendCodeLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showMeTab, userId])

  useEffect(() => {
    setFriendLbMe(buildMeLeaderboardMe(userId, displayName, state.lifetimeXp ?? 0))
  }, [userId, displayName, state.lifetimeXp])

  useEffect(() => {
    if (!showMeTab) return
    let cancelled = false
    setFriendLbLoading(true)
    setFriendLbTop(sortedMeLeaderboardBots())
    const timeout = setTimeout(() => {
      if (!cancelled) setFriendLbLoading(false)
    }, 5000)
    void (async () => {
      try {
        const profile = await ensureFriendProfile(userId)
        if (cancelled) return
        const friendXp = profile?.friends.length
          ? await fetchLeaderboardXpForUsers(profile.friends)
          : []
        if (cancelled) return
        setFriendLbTop(buildMeLeaderboardTop(friendXp))
      } catch {
        // silently fall back to bots
      } finally {
        if (!cancelled) setFriendLbLoading(false)
        clearTimeout(timeout)
      }
    })()
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [showMeTab, userId, friendsRefresh])

  useEffect(() => {
    if (!globalLbOpen) return
    let cancelled = false
    setGlobalLbLoading(true)
    void fetchGlobalLeaderboardByXp(50).then((rows) => {
      if (!cancelled) {
        setGlobalLbRows(rows)
        setGlobalLbLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [globalLbOpen])

  async function submitAddFriend() {
    const code = addFriendCode.trim()
    if (!code) return
    setAddFriendBusy(true)
    setAddFriendError('')
    const result: AddFriendResult = await addFriendByCode(userId, code)
    setAddFriendBusy(false)
    if (result === 'ok') {
      setAddFriendOpen(false)
      setAddFriendCode('')
      notify('Friend added')
      const profile = await ensureFriendProfile(userId)
      if (profile) {
        const friendXp = await fetchLeaderboardXpForUsers(profile.friends)
        setFriendLbTop(buildMeLeaderboardTop(friendXp))
        setFriendsRefresh((n) => n + 1)
      }
      return
    }
    if (result === 'not_found') setAddFriendError('Code not found')
    else if (result === 'self') setAddFriendError('That is your own code')
    else if (result === 'already') setAddFriendError('Already friends')
    else setAddFriendError('Could not add friend')
  }

  function toggleAppearanceTheme() {
    const next: ApexThemeMode = appearanceTheme === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(APEX_THEME_STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
    setAppearanceTheme(next)
    applyApexAppearanceFromStorage()
  }

  const clientDetailPr = useMemo(() => {
    if (!clientDetailState) return []
    const share = clientDetailState.trainerShare
    if (share && !share.personalRecords) return []
    return computePersonalRecords(
      clientDetailState.setLogs,
      clientDetailState.settings.unit,
    )
  }, [clientDetailState])

  const clientDetailGrouped = useMemo(() => {
    if (!clientDetailState?.setLogs.length) return []
    const sorted = [...clientDetailState.setLogs].sort((a, b) => b.at - a.at)
    const m = new Map<string, typeof sorted>()
    for (const l of sorted) {
      const k = dateKey(new Date(l.at))
      const arr = m.get(k) ?? []
      arr.push(l)
      m.set(k, arr)
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
  }, [clientDetailState])
  const streakDays = useMemo(
    () => streakCurrent(state, Date.now()),
    [state.setLogs, state.cardioEntries],
  )

  const clientDetailShare = clientDetailState?.trainerShare
  const clientAllSharingOff = Boolean(
    clientDetailShare &&
      !clientDetailShare.workoutLogs &&
      !clientDetailShare.bodyweight &&
      !clientDetailShare.personalRecords,
  )

  const gcalConfigured = isGoogleCalendarConfigured()
  const gcalConnected = isGoogleCalendarConnected()
  return (
    <>
      <GlobalLeaderboardOverlay
        open={globalLbOpen}
        rows={globalLbRows}
        loading={globalLbLoading}
        userId={userId}
        onClose={() => setGlobalLbOpen(false)}
      />
      <PrListOverlay open={prListOpen} rows={prDisplayRows} onClose={() => setPrListOpen(false)} />
      <AddFriendSheet
        open={addFriendOpen}
        code={addFriendCode}
        error={addFriendError}
        busy={addFriendBusy}
        onCodeChange={(v) => {
          setAddFriendCode(v)
          setAddFriendError('')
        }}
        onClose={() => {
          setAddFriendOpen(false)
          setAddFriendError('')
        }}
        onSubmit={() => void submitAddFriend()}
      />
      <div className={`apex-tab-stack ${isDesktop ? 'pb-4' : 'pb-28'}`}>
      {showMeTab ? (
        <MeTabProfileView
          displayName={displayName}
          profileInitials={profileInitials}
          lifetimeXp={state.lifetimeXp ?? 0}
          levelLabel={levelInfo.label}
          xpLeft={xpLabels.left}
          xpRight={xpLabels.right}
          progressPct={Math.round(levelInfo.progressInTier * 100)}
          sessionsWeek={sessionsThisWeek(state)}
          setsWeek={setsThisWeek(state)}
          streakDays={streakDays}
          prsMonth={prsMonthCount}
          prRows={prDisplayRows}
          strengthAge={strengthAge}
          appearanceTheme={appearanceTheme}
          onToggleTheme={toggleAppearanceTheme}
          friendCode={friendCode}
          friendCodeLoading={friendCodeLoading}
          friendTopRows={friendLbTop}
          meLeaderboardRow={friendLbMe}
          friendLoading={friendLbLoading}
          onCopyFriendCode={() => {
            if (!friendCode) return
            void navigator.clipboard.writeText(friendCode).then(
              () => notify('Friend code copied'),
              () => notify('Could not copy code'),
            )
          }}
          onAddFriend={() => setAddFriendOpen(true)}
          onViewAllPr={() => setPrListOpen(true)}
          onViewAllLeaderboard={() => setGlobalLbOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : null}

      {isDesktop && desktopSection === 'profile' ? (
        <div className="grid grid-cols-2 gap-4 mt-5">
          <button
            type="button"
            className={`apex-btn apex-stats-achievements-divider w-full text-[14px] font-medium border-white/[0.1] ${
              isDesktop ? 'col-span-2' : ''
            }`}
            onClick={onOpenAchievements}
          >
            Achievements
          </button>
          <TopLiftsProgressCard className={isDesktop ? 'col-span-2' : ''} onOpenLibrary={() => {}} />
          <LongevityScoreCard className={isDesktop ? 'col-span-2' : ''} />
          <InjuryRiskScoreCard className={isDesktop ? 'col-span-2' : ''} />
          <PerformanceInsightsCard className={isDesktop ? 'col-span-2' : ''} />
          {trainerMode ? (
            <>
              <div className={`apex-card p-5 space-y-3 ${isDesktop ? 'col-span-2' : ''}`}>
                <p className="apex-section-label">Your trainer code</p>
                <p className="text-[12px] font-medium text-[#a0a0a8] leading-relaxed">
                  Share this code with clients so they can connect in Settings.
                </p>
                <div className="flex items-center gap-3">
                  <p className="flex-1 text-[26px] font-medium tracking-[0.22em] text-[#ececee] tabular-nums">
                    {trainerCode || ensureTrainerCode()}
                  </p>
                  <button
                    type="button"
                    className="apex-btn min-h-11 px-5 text-[13px] font-medium shrink-0"
                    onClick={() => {
                      const code = trainerCode || ensureTrainerCode()
                      void navigator.clipboard.writeText(code).then(
                        () => notify('Trainer code copied'),
                        () => notify('Could not copy code'),
                      )
                    }}
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div className={`space-y-3 ${isDesktop ? 'col-span-2' : ''}`}>
                <p className="apex-section-label">My Clients</p>
                {clientsLoading ? (
                  <p className="text-[13px] font-medium text-[#a0a0a8]">Loading clients…</p>
                ) : clients.length === 0 ? (
                  <p className="text-[13px] font-medium text-[#a0a0a8] leading-relaxed">
                    No clients connected yet. Share your trainer code so they can connect in Settings.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {clients.map((c) => (
                      <li key={c.connection.id}>
                        <button
                          type="button"
                          className="apex-card w-full p-4 text-left touch-manipulation hover:border-white/[0.14]"
                          onClick={() => openClientDetail(c)}
                        >
                          <p className="text-[15px] font-medium text-[#ececee]">{c.displayName}</p>
                          <p className="text-[12px] font-medium text-[#a0a0a8] mt-1">
                            Last active · {formatLastActive(c.lastActiveMs)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-medium text-[#7d7d88]">
                            {c.sharePrefs.workoutLogs ? (
                              <>
                                <span>This week · {formatLeaderboardVolume(c.weeklyVolumeLbs)}</span>
                                <span>Streak · {c.currentStreak}d</span>
                              </>
                            ) : (
                              <span>Workout data hidden by client</span>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
          <div className="apex-card p-5">
            <p className="text-[0.8125rem] font-medium text-[#7d7d88] mb-2">Muscle groups</p>
            <p className="text-[15px] font-medium text-[#ececee] leading-relaxed">
              {muscleGroupsThisWeek(state).length
                ? muscleGroupsThisWeek(state).join(', ')
                : 'None yet'}
            </p>
            <p className="text-[12px] font-medium text-[#a0a0a8] mt-2">Hit this week</p>
          </div>
          <div className="apex-card p-5 space-y-4">
            <p className="apex-section-label">Log bodyweight</p>
            {lastBodyweight ? (
              <p className="text-[13px] font-normal text-[#e0e0e0]">
                Last entry:{' '}
                <span className="tabular-nums">
                  {lastBodyweight.value} {state.settings.unit}
                </span>
                <span className="text-[#a8a8b0] text-[12px] ml-2">
                  {new Date(lastBodyweight.at).toLocaleDateString()}
                </span>
              </p>
            ) : (
              <p className="text-[13px] font-normal text-[#a8a8b0]">No bodyweight logged yet.</p>
            )}
            <div className="flex gap-2">
              <input
                inputMode="decimal"
                className={`min-h-11 flex-1 ${inp}`}
                placeholder={state.settings.unit === 'kg' ? 'Weight (kg)' : 'Weight (lbs)'}
                value={bwInput}
                onChange={(e) => setBwInput(e.target.value)}
              />
              <button
                type="button"
                className="apex-btn-primary min-h-11 px-6 text-[13px] font-medium shrink-0 rounded-[8px] "
                onClick={() => {
                  const v = Number(bwInput)
                  if (!Number.isFinite(v)) return
                  addBodyweight(v)
                  setBwInput('')
                  notify('Bodyweight saved')
                }}
              >
                Save
              </button>
            </div>
          </div>
          <div className="apex-card p-5 h-64">
            <p className="text-[0.8125rem] font-medium text-[#7d7d88] mb-3">Weekly volume (8 wks)</p>
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={vol} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke={chart.tick}
                  tick={{ fill: chart.tick, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke={chart.tick}
                  tick={{ fill: chart.tick, fontSize: 10 }}
                  width={44}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{ background: chart.tooltipBg, border: `0.5px solid ${chart.tooltipBorder}` }}
                  labelStyle={{ color: chart.tooltipText }}
                  itemStyle={{ color: chart.tooltipText }}
                />
                <Bar dataKey="volume" fill={chart.bar} radius={[3, 3, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="apex-card p-5 h-56 flex flex-col">
            <p className="text-[0.8125rem] font-medium text-[#7d7d88] mb-3">Bodyweight</p>
            {bw.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-[13px] font-medium" style={{ color: 'rgba(255, 255, 255, 0.3)' }}>
                  Log your weight to start tracking
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="85%">
                <LineChart data={bw}>
                  <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="at"
                    stroke={chart.tick}
                    tick={{ fill: chart.tick, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke={chart.tick}
                    tick={{ fill: chart.tick, fontSize: 10 }}
                    width={36}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{ background: chart.tooltipBg, border: `0.5px solid ${chart.tooltipBorder}` }}
                    labelStyle={{ color: chart.tooltipText }}
                    itemStyle={{ color: chart.tooltipText }}
                  />
                  <Line type="monotone" dataKey="value" stroke={chart.line} dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className={isDesktop ? 'col-span-2' : ''}>
            <BodyMeasurementsSection
              userId={userId}
              weightUnit={state.settings.unit}
              inputClassName={inp}
              active={isDesktop ? desktopSection === 'profile' : sub === 'stats'}
              onWeightLogged={addBodyweight}
              notify={notify}
            />
          </div>
        </div>
      ) : null}

      {showSettingsScreen ? (
        <div
          className={`apex-settings-screen flex flex-col bg-[var(--apex-surface-page)] ${
            !isDesktop ? 'apex-settings-screen--overlay fixed inset-0 min-h-0' : 'min-h-0'
          }`}
        >
          {!isDesktop ? (
            <header className="apex-settings-screen__header apex-safe-top shrink-0">
              <button
                type="button"
                className="apex-settings-screen__back"
                aria-label="Back"
                onClick={() => setSettingsOpen(false)}
              >
                ‹
              </button>
              <h1 className="apex-settings-screen__title">Settings</h1>
              <span aria-hidden className="w-[2.75rem]" />
            </header>
          ) : (
            <h1 className="apex-settings-screen__title px-4 pt-2 pb-1 shrink-0">Settings</h1>
          )}
          <div className="apex-settings-screen__scroll">
            <p className="apex-settings-v2-label">Units</p>
            <div className="apex-settings-v2-card">
              <div className="apex-settings-v2-row">
                <span className="apex-settings-icon" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M6 8h12M8 8V6a2 2 0 012-2h4a2 2 0 012 2v2M6 16h12M8 16v2a2 2 0 002 2h4a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="apex-settings-v2-row__main apex-settings-v2-row__label">Weight</span>
                <SettingsSegment
                  value={state.settings.unit}
                  left={{ id: 'lbs', label: 'LBS' }}
                  right={{ id: 'kg', label: 'KG' }}
                  onChange={(id) => updateSettings({ unit: id as 'lbs' | 'kg' })}
                />
              </div>
              <div className="apex-settings-v2-row">
                <span className="apex-settings-icon" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M12 5v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </span>
                <span className="apex-settings-v2-row__main apex-settings-v2-row__label">Distance</span>
                <SettingsSegment
                  value={distanceUnit}
                  left={{ id: 'km', label: 'KM' }}
                  right={{ id: 'mi', label: 'MI' }}
                  onChange={(id) => {
                    const u = id as ApexDistanceUnit
                    setDistanceUnit(u)
                    writeDistanceUnit(u)
                  }}
                />
              </div>
            </div>

            <p className="apex-settings-v2-label">Appearance</p>
            <div className="apex-settings-v2-card">
              <div className="apex-settings-v2-row">
                <span className="apex-settings-icon" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </span>
                <span className="apex-settings-v2-row__main apex-settings-v2-row__label">Dark mode</span>
                <IosSwitch
                  checked={appearanceTheme === 'dark'}
                  ariaLabel="Dark mode"
                  onChange={(on) => {
                    const next: ApexThemeMode = on ? 'dark' : 'light'
                    try {
                      localStorage.setItem(APEX_THEME_STORAGE_KEY, next)
                    } catch {
                      /* ignore */
                    }
                    setAppearanceTheme(next)
                    applyApexAppearanceFromStorage()
                  }}
                />
              </div>
              <div className="apex-settings-v2-row">
                <span className="apex-settings-icon" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3M9 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                <div className="apex-settings-v2-row__main">
                  <p className="apex-settings-v2-row__label">Text size</p>
                  <p className="apex-settings-v2-row__sub">{fontSizeStopLabel(appearanceFontSize)}</p>
                </div>
              </div>
              <div className="apex-settings-text-size">
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={1}
                  value={fontSizeStopIndex(appearanceFontSize)}
                  className="apex-settings-text-size__slider"
                  aria-label="Text size"
                  onChange={(e) => {
                    const size = fontSizeFromStop(Number(e.target.value))
                    try {
                      localStorage.setItem(APEX_FONT_SIZE_STORAGE_KEY, size)
                    } catch {
                      /* ignore */
                    }
                    setAppearanceFontSize(size)
                    applyApexAppearanceFromStorage()
                  }}
                />
                <p className="apex-settings-text-size__label">{fontSizeStopLabel(appearanceFontSize)}</p>
              </div>
            </div>

            <p className="apex-settings-v2-label">Gym</p>
            <div className="apex-settings-v2-card">
              <button
                type="button"
                className="apex-settings-v2-row apex-settings-v2-row--tap"
                onClick={() => {
                  const cur = readGymBarcode()
                  setGymDraftNumber(cur?.number ?? '')
                  setGymDraftFormat(cur?.format ?? 'code128')
                  setGymDraftGymName(cur?.gymName ?? '')
                  setGymSettingsOpen(true)
                }}
              >
                <span className="apex-settings-icon" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M4 7V6a2 2 0 012-2h2M4 17v1a2 2 0 002 2h2M16 4h2a2 2 0 012 2v1M20 16v1a2 2 0 01-2 2h-2M7 10h10v4H7z" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </span>
                <span className="apex-settings-v2-row__main apex-settings-v2-row__label">Gym barcode</span>
                <span className="apex-settings-v2-row__value">
                  {gymBarcode?.number ?? 'Not set'}
                </span>
              </button>
              <div className="apex-settings-v2-row">
                <span className="apex-settings-icon" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 12a4 4 0 100-8 4 4 0 000 8zM6 20v-1a6 6 0 0112 0v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                <div className="apex-settings-v2-row__main">
                  <p className="apex-settings-v2-row__label">Trainer mode</p>
                  <p className="apex-settings-v2-row__sub">
                    Lets a coach prescribe and review your sessions
                  </p>
                </div>
                <IosSwitch
                  checked={trainerMode}
                  ariaLabel="Trainer mode"
                  onChange={toggleTrainerMode}
                />
              </div>
              {trainerMode ? (
                <div className="apex-settings-v2-trainer-code">
                  <p className="apex-settings-v2-row__sub text-center">
                    Share this code with clients
                  </p>
                  <p className="apex-settings-v2-trainer-code__value tabular-nums">
                    {trainerCode || ensureTrainerCode()}
                  </p>
                  <button
                    type="button"
                    className="apex-settings-connect-pill w-full mt-2"
                    onClick={() => {
                      const code = trainerCode || ensureTrainerCode()
                      void navigator.clipboard.writeText(code).then(
                        () => notify('Trainer code copied'),
                        () => notify('Could not copy code'),
                      )
                    }}
                  >
                    Copy code
                  </button>
                </div>
              ) : !trainerMode && !clientConnection ? (
                <div className="apex-settings-v2-trainer-code">
                  <input
                    className={`${inp} w-full min-h-11`}
                    placeholder="6-character trainer code"
                    value={connectCodeInput}
                    maxLength={6}
                    autoCapitalize="characters"
                    aria-invalid={connectCodeError ? true : undefined}
                    onChange={(e) => {
                      setConnectCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                      if (connectCodeError) setConnectCodeError('')
                    }}
                  />
                  {connectCodeError ? (
                    <p className="text-[12px] text-[#3d7ab5] mt-2" role="alert">
                      {connectCodeError}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    disabled={connectCodeInput.length !== 6 || busy}
                    className="apex-settings-connect-pill w-full mt-3 disabled:opacity-50"
                    onClick={() => {
                      setConnectCodeError('')
                      setBusy(true)
                      void connectClientToTrainer(userId, connectCodeInput)
                        .then((row) => {
                          setClientConnection(row)
                          setConnectCodeInput('')
                          persistSharePrefs()
                          notify('Connected to trainer')
                        })
                        .catch((e) => setConnectCodeError(trainerConnectErrorMessage(e)))
                        .finally(() => setBusy(false))
                    }}
                  >
                    Connect
                  </button>
                </div>
              ) : null}
            </div>
            <p className="apex-settings-v2-helper">
              Your barcode lets you check in at participating gyms without a separate card.
            </p>

            <p className="apex-settings-v2-label">Connections</p>
            <div className="apex-settings-v2-card">
              <div className="apex-settings-v2-row">
                <span className="apex-settings-icon" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M8 4h8v2M6 10h12M6 14h8M6 18h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <rect x="4" y="4" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </span>
                <span className="apex-settings-v2-row__main apex-settings-v2-row__label">Google Calendar</span>
                {gcalConfigured && gcalConnected ? (
                  <span className="apex-settings-connected-link">Connected ›</span>
                ) : gcalConfigured ? (
                  <button
                    type="button"
                    className="apex-settings-connect-pill"
                    onClick={() => {
                      try {
                        startGoogleCalendarOAuth()
                      } catch (e) {
                        notify(e instanceof Error ? e.message : 'Could not start Google sign-in')
                      }
                    }}
                  >
                    Connect
                  </button>
                ) : (
                  <span className="apex-settings-v2-row__value">Not configured</span>
                )}
              </div>
              <button
                type="button"
                className="apex-settings-v2-row apex-settings-v2-row--tap"
                disabled={!isSpotifyConfigured()}
                onClick={() => {
                  if (spotifyConnected) return
                  try {
                    startSpotifyOAuth()
                  } catch (e) {
                    notify(e instanceof Error ? e.message : 'Could not start Spotify sign-in')
                  }
                }}
              >
                <span className="apex-settings-icon" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </span>
                <div className="apex-settings-v2-row__main min-w-0">
                  <p className="apex-settings-v2-row__label">Spotify</p>
                  {spotifyConnected ? (
                    <p className="apex-settings-v2-row__sub truncate">Liked Songs · Workout Mix</p>
                  ) : null}
                </div>
                {isSpotifyConfigured() ? (
                  spotifyConnected ? (
                    <span className="apex-settings-connected-link">Connected ›</span>
                  ) : (
                    <span className="apex-settings-connect-pill">Connect</span>
                  )
                ) : (
                  <span className="apex-settings-v2-row__value">Not configured</span>
                )}
              </button>
            </div>

            <p className="apex-settings-v2-label">Notifications</p>
            <div className="apex-settings-v2-card">
              <div className="apex-settings-v2-row">
                <span className="apex-settings-icon apex-settings-icon--muted apex-settings-icon--notification" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M18 16v-5a6 6 0 10-12 0v5l-2 2h16l-2-2zM10 20a2 2 0 004 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                <div className="apex-settings-v2-row__main">
                  <p className="apex-settings-v2-row__label">Workout reminders</p>
                  <p className="apex-settings-v2-row__sub">Daily at 6:30 AM</p>
                </div>
                <IosSwitch
                  checked={workoutReminders}
                  ariaLabel="Workout reminders"
                  onChange={(on) => {
                    setWorkoutReminders(on)
                    writeWorkoutRemindersEnabled(on)
                  }}
                />
              </div>
              <div className="apex-settings-v2-row">
                <span className="apex-settings-icon apex-settings-icon--muted apex-settings-icon--notification" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M8 6h8v3a4 4 0 01-4 4 4 4 0 01-4-4V6zM6 20h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="apex-settings-v2-row__main apex-settings-v2-row__label">PR alerts</span>
                <IosSwitch
                  checked={state.settings.celebrationsEnabled !== false}
                  ariaLabel="PR alerts"
                  onChange={(on) => updateSettings({ celebrationsEnabled: on })}
                />
              </div>
              <div className="apex-settings-v2-row">
                <span className="apex-settings-icon apex-settings-icon--muted apex-settings-icon--notification" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M18 16v-5a6 6 0 10-12 0v5l-2 2h16l-2-2zM10 20a2 2 0 004 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                <div className="apex-settings-v2-row__main">
                  <p className="apex-settings-v2-row__label">Weekly summary</p>
                  <p className="apex-settings-v2-row__sub">Sundays at 8:00 PM</p>
                </div>
                <IosSwitch
                  checked={weeklySummary}
                  ariaLabel="Weekly summary"
                  onChange={(on) => {
                    setWeeklySummary(on)
                    writeWeeklySummaryEnabled(on)
                  }}
                />
              </div>
            </div>

            {clientConnection ? (
              <>
                <p className="apex-settings-v2-label">Privacy</p>
                <div className="apex-settings-v2-card">
                  <div className="apex-settings-v2-row">
                    <span className="apex-settings-icon apex-settings-icon--muted" aria-hidden>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M7 11V8a5 5 0 0110 0v3M6 11h12v10H6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span className="apex-settings-v2-row__main apex-settings-v2-row__label">
                      Share workouts with trainer
                    </span>
                    <IosSwitch
                      checked={sharePrefs.workoutLogs}
                      ariaLabel="Share workouts with trainer"
                      onChange={(on) => toggleSharePref('workout_logs', on)}
                    />
                  </div>
                  <div className="apex-settings-v2-row">
                    <span className="apex-settings-icon apex-settings-icon--muted" aria-hidden>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M8 6h8v3a4 4 0 01-4 4 4 4 0 01-4-4V6zM6 20h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span className="apex-settings-v2-row__main apex-settings-v2-row__label">
                      Share PRs with trainer
                    </span>
                    <IosSwitch
                      checked={sharePrefs.personalRecords}
                      ariaLabel="Share PRs with trainer"
                      onChange={(on) => toggleSharePref('personal_records', on)}
                    />
                  </div>
                </div>
                <p className="apex-settings-v2-helper">
                  Choose what your trainer can see when Trainer mode is on.
                </p>
              </>
            ) : null}

            <p className="apex-settings-v2-label">Post-workout</p>
            <div className="apex-settings-v2-card">
              <div className="apex-settings-v2-row">
                <span className="apex-settings-icon apex-settings-icon--muted" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M8 6h8v3a4 4 0 01-4 4 4 4 0 01-4-4V6zM6 20h12"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <div className="apex-settings-v2-row__main">
                  <p className="apex-settings-v2-row__label">Post-workout check-in</p>
                  <p className="apex-settings-v2-row__sub">Two quick questions after each session</p>
                </div>
                <IosSwitch
                  checked={postWorkoutCheckin}
                  ariaLabel="Post-workout check-in"
                  onChange={(on) => {
                    setPostWorkoutCheckin(on)
                    writePostWorkoutCheckinEnabled(on)
                    void upsertTendedPostWorkoutCheckin(userId, on).catch(() => {})
                  }}
                />
              </div>
            </div>

            <button
              type="button"
              className="w-full min-h-11 mt-6 text-[13px] font-medium text-[#a0a0a8] bg-transparent"
              disabled={clearDataBusy}
              onClick={() => setConfirmClearData(true)}
            >
              {clearDataBusy ? 'Clearing…' : 'Clear all data'}
            </button>
            <button
              type="button"
              className="apex-sign-out-btn w-full min-h-12 text-[13px] mt-6"
              onClick={() => void supabase.auth.signOut()}
            >
              Sign out
            </button>
            <p className="apex-settings-footer-version">Lift v3.2.0 · Build 11842</p>
          </div>
        </div>
      ) : null}

      {selectedClient ? (
        <div className="apex-safe-top apex-theme-shell fixed inset-0 z-[90] flex flex-col bg-[var(--apex-surface-page)] text-[var(--apex-text-primary)]">
          <header className="px-4 py-3 border-b border-[0.5px] border-[#1e1e1e] flex items-center justify-between gap-2">
            <div>
              <p className="text-[15px] font-medium text-[#f4f4f5]">{selectedClient.displayName}</p>
              <p className="text-[12px] font-medium text-[#a0a0a8] mt-0.5">
                Last active · {formatLastActive(selectedClient.lastActiveMs)}
              </p>
            </div>
            <button
              type="button"
              className="min-h-11 min-w-11 rounded-[8px] border-[0.5px] border-[#1e1e1e] bg-[#161616] text-[13px] text-[#e0e0e0]"
              onClick={() => {
                setSelectedClient(null)
                setClientDetailState(null)
                setClientNoteDraft('')
              }}
            >
              ✕
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-4 space-y-5 pb-28">
            {clientDetailLoading ? (
              <p className="text-[13px] font-medium text-[#a0a0a8]">Loading…</p>
            ) : !clientDetailState ? (
              <p className="text-[13px] font-medium text-[#a0a0a8]">
                No shared data yet. Ask your client to enable sharing in Settings.
              </p>
            ) : clientAllSharingOff ? (
              <p className="text-[13px] font-medium text-[#a0a0a8] leading-relaxed">
                This client has turned off all sharing. Workout logs, bodyweight, and personal records
                are hidden until they enable them in Settings.
              </p>
            ) : (
              <>
                {clientDetailShare?.workoutLogs ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-[12px] border-[0.5px] border-white/[0.055] p-4">
                      <p className="text-[0.75rem] font-medium text-[#7d7d88]">Sessions</p>
                      <p className="apex-stat-num mt-2 tabular-nums">
                        {sessionsThisWeek(clientDetailState)}
                      </p>
                      <p className="text-[0.8125rem] font-medium text-[#a0a0a8] mt-1">This week</p>
                    </div>
                    <div className="rounded-[12px] border-[0.5px] border-white/[0.055] p-4">
                      <p className="text-[0.75rem] font-medium text-[#7d7d88]">Streak</p>
                      <p className="apex-stat-num mt-2 tabular-nums">
                        {streakCurrent(clientDetailState)}d
                      </p>
                      <p className="text-[0.8125rem] font-medium text-[#a0a0a8] mt-1">Current</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] font-medium text-[#a0a0a8]">
                    Workout logs are hidden by this client.
                  </p>
                )}
                {clientDetailShare?.personalRecords && clientDetailPr.length > 0 ? (
                  <div className="apex-card p-5">
                    <p className="apex-section-label mb-3">Personal records</p>
                    <ul className="space-y-2">
                      {clientDetailPr.slice(0, 12).map((row) => (
                        <li
                          key={row.exerciseId}
                          className="flex justify-between gap-2 text-[13px] text-[#e0e0e0]"
                        >
                          <span className="font-medium">{row.exerciseName}</span>
                          <span className="text-[#a0a0a8] tabular-nums shrink-0">{row.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : clientDetailShare?.personalRecords ? (
                  <p className="text-[13px] font-medium text-[#a0a0a8]">No personal records logged yet.</p>
                ) : (
                  <p className="text-[13px] font-medium text-[#a0a0a8]">
                    Personal records are hidden by this client.
                  </p>
                )}
                {clientDetailShare?.bodyweight ? (
                clientDetailState.bodyweightLogs.length > 0 ? (
                  <div className="apex-card p-5">
                    <p className="apex-section-label mb-2">Bodyweight</p>
                    <p className="text-[15px] font-medium text-[#ececee] tabular-nums">
                      {(() => {
                        const latest = [...clientDetailState.bodyweightLogs].sort(
                          (a, b) => b.at - a.at,
                        )[0]
                        return latest
                          ? `${latest.value} ${clientDetailState.settings.unit}`
                          : '—'
                      })()}
                    </p>
                    <p className="text-[12px] font-medium text-[#a0a0a8] mt-1">Latest log</p>
                  </div>
                ) : (
                  <p className="text-[13px] font-medium text-[#a0a0a8]">No bodyweight logs yet.</p>
                )
                ) : (
                  <p className="text-[13px] font-medium text-[#a0a0a8]">
                    Bodyweight is hidden by this client.
                  </p>
                )}
                <div>
                  <p className="apex-section-label mb-2">Workout history</p>
                  {!clientDetailShare?.workoutLogs ? (
                    <p className="text-[13px] font-medium text-[#a0a0a8]">
                      Workout logs are hidden by this client.
                    </p>
                  ) : clientDetailGrouped.length === 0 ? (
                    <p className="text-[13px] font-medium text-[#a0a0a8]">
                      No workout logs shared.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {clientDetailGrouped.map(([day, logs]) => (
                        <section key={day}>
                          <h2 className="apex-section-label mb-2">{day}</h2>
                          <ul className="space-y-2">
                            {logs.map((l) => (
                              <li key={l.id} className="apex-card p-3">
                                <div className="flex justify-between gap-2">
                                  <p className="text-[13px] font-normal text-[#bbb]">
                                    {l.exerciseName}
                                  </p>
                                  {l.isPr ? (
                                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-black">
                                      PR
                                    </span>
                                  ) : null}
                                </div>
                                <p className="text-[13px] font-normal text-[#bbb] mt-1">
                                  {l.kind === 'weighted'
                                    ? `${l.bodyweight ? 'BW' : `${l.weight ?? 0} ${clientDetailState.settings.unit}`} × ${l.reps} · ${l.sets} sets`
                                    : `${l.durationSec}s`}
                                </p>
                                {l.note ? (
                                  <p className="text-[12px] text-[#a0a0a8] mt-1">{l.note}</p>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="shrink-0 border-t border-[0.5px] border-[#1e1e1e] p-4 bg-[var(--apex-surface-page)] space-y-2">
            <p className="apex-section-label">Coach note</p>
            <textarea
              className="apex-input w-full min-h-20 px-3 py-3 resize-y"
              placeholder="Message for client's Today screen…"
              value={clientNoteDraft}
              onChange={(e) => setClientNoteDraft(e.target.value)}
            />
            <button
              type="button"
              disabled={!clientNoteDraft.trim() || busy}
              className="apex-btn-primary w-full min-h-11 text-[13px] font-medium disabled:opacity-50"
              onClick={() => {
                if (!selectedClient) return
                setBusy(true)
                void insertTrainerNote(
                  userId,
                  selectedClient.connection.client_user_id,
                  clientNoteDraft,
                )
                  .then(() => {
                    setClientNoteDraft('')
                    notify('Coach note sent')
                  })
                  .catch((e) =>
                    notify(e instanceof Error ? e.message : 'Could not send note'),
                  )
                  .finally(() => setBusy(false))
              }}
            >
              Send to client
            </button>
          </div>
        </div>
      ) : null}

      {gymSettingsOpen ? (
        <div
          role="presentation"
          className="apex-modal-overlay fixed inset-0 z-[85] flex items-center justify-center p-4"
          onClick={() => setGymSettingsOpen(false)}
        >
          <div
            className="w-full max-w-md apex-card p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-medium text-[#f4f4f5]">Gym Membership</h3>
            <p className="mt-2 text-[12px] font-medium text-[#a0a0a8] leading-relaxed">
              Save your membership barcode for quick check-in from Today.
            </p>
            <label className="mt-4 block">
              <span className="apex-section-label block mb-2">Barcode number</span>
              <input
                className={inp}
                value={gymDraftNumber}
                onChange={(e) => setGymDraftNumber(e.target.value)}
                placeholder="Membership / barcode number"
                autoComplete="off"
              />
            </label>
            <label className="mt-4 block">
              <span className="apex-section-label block mb-2">Barcode format</span>
              <select
                className={`${inp} appearance-none`}
                value={gymDraftFormat}
                onChange={(e) => setGymDraftFormat(e.target.value as GymBarcodeFormat)}
              >
                {GYM_BARCODE_FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block">
              <span className="apex-section-label block mb-2">Gym name (optional)</span>
              <input
                className={inp}
                value={gymDraftGymName}
                onChange={(e) => setGymDraftGymName(e.target.value)}
                placeholder="e.g. LA Fitness"
              />
            </label>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                className="apex-btn-primary w-full min-h-12 text-[13px] font-medium"
                onClick={() => {
                  const number = gymDraftNumber.trim()
                  if (!number) {
                    writeGymBarcode(null)
                    setGymBarcode(null)
                    setGymSettingsOpen(false)
                    notify('Gym membership removed')
                    return
                  }
                  const saved: GymBarcodeStored = {
                    number,
                    format: gymDraftFormat,
                    ...(gymDraftGymName.trim() ? { gymName: gymDraftGymName.trim() } : {}),
                  }
                  writeGymBarcode(saved)
                  setGymBarcode(saved)
                  setGymSettingsOpen(false)
                  notify('Gym membership saved')
                }}
              >
                Save
              </button>
              {gymBarcode ? (
                <button
                  type="button"
                  className="apex-btn w-full min-h-11 text-[13px] font-medium text-[#e85d5d] border-[#e85d5d]/35"
                  onClick={() => {
                    writeGymBarcode(null)
                    setGymBarcode(null)
                    setGymDraftNumber('')
                    setGymDraftGymName('')
                    setGymSettingsOpen(false)
                    notify('Gym membership removed')
                  }}
                >
                  Remove membership
                </button>
              ) : null}
              <button
                type="button"
                className="apex-btn w-full min-h-11 text-[13px] font-medium"
                onClick={() => setGymSettingsOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>

    <ConfirmDialog
      open={confirmClearData}
      title="Clear all data?"
      message="This permanently deletes your entire workout history, PRs, and settings. This cannot be undone."
      confirmLabel="Clear all data"
      destructive
      onCancel={() => setConfirmClearData(false)}
      onConfirm={() => {
        setConfirmClearData(false)
        setClearDataBusy(true)
        void (async () => {
          try { await clearUserSupabaseData(userId) } catch { /* ignore */ }
          try { await supabase.auth.signOut() } catch { /* ignore */ }
          try { localStorage.clear() } catch { /* ignore */ }
          window.location.assign('/')
        })()
      }}
    />
    </>
  )
}
