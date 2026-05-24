import { useEffect, useMemo, useState } from 'react'
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
  minutesThisWeek,
  sessionsThisWeek,
  setsThisWeek,
  streakCurrent,
} from '../lib/achievements'
import { computePersonalRecords } from '../lib/personalRecords'
import { getLevelInfo } from '../lib/xpLevel'
import { exportFullDataCsv } from '../lib/csv'
import {
  claudeCoachComplete,
  claudeExerciseFormTips,
  claudeParseImport,
  dailyCoachSuggestions,
  resolvePlanPersonalizationFlow,
} from '../lib/anthropicCoach'
import { formatMoodLift } from '../lib/workoutMood'
import { computeStrengthAge, formatStrengthAgeLiftLabel } from '../lib/strengthAge'
import { computePerformanceInsights } from '../lib/performanceInsights'
import type { MoodLiftStats } from '../lib/supabase'
import { dateKey } from '../lib/dates'
import {
  connectClientToTrainer,
  disconnectTrainerClient,
  fetchMyTrainerConnection,
  fetchTrainerClientSummaries,
  fetchUserWorkoutStateForTrainer,
  fetchLeaderboard,
  fetchAverageMoodLift,
  formatLeaderboardVolume,
  insertTrainerNote,
  supabase,
  upsertTrainerCode,
  upsertUserWorkoutState,
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
import {
  normalizeImportedCardio,
  getCoachMessageDisplayText,
  isCoachUiPromptLine,
  applyApexAppearanceFromStorage,
  APEX_COACH_PROFILE_KEY,
  APEX_THEME_STORAGE_KEY,
  APEX_FONT_SIZE_STORAGE_KEY,
  type ApexThemeMode,
  type ApexFontSizeMode,
} from '../lib/persist'
import { bodyweightSeries, useApexChartColors, weeklyVolumeSeries } from '../lib/stats'
import { currentWeekStartKey, detectBurnoutWarnings } from '../lib/volumeStats'
import type { BurnoutWarning } from '../lib/volumeStats'
import {
  formatGoogleCalendarExpiryLabel,
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
import type { AppPersisted, SetLog, ChatMessage } from '../types'
import { DEFAULT_WATER_GOAL_OZ, WATER_LOG_INCREMENT_OZ } from '../types'
import {
  DEFAULT_MACRO_GOAL_CALORIES,
  DEFAULT_MACRO_GOAL_CARBS_G,
  DEFAULT_MACRO_GOAL_FAT_G,
  DEFAULT_MACRO_GOAL_PROTEIN_G,
} from '../types'
import { ConfirmDialog } from './ConfirmDialog'
import { PROFILE_AVATAR_IDS, ProfileAvatarGlyph } from './ProfileAvatarIcons'
type Sub = 'stats' | 'settings' | 'ai'
type AiSub = 'coach' | 'parser' | 'form' | 'insights'

const AI_PILLS: { id: AiSub; label: string }[] = [
  { id: 'coach', label: 'Coach' },
  { id: 'parser', label: 'Parser' },
  { id: 'form', label: 'Form tips' },
  { id: 'insights', label: 'Insights' },
]

function AiPillNav({ active, onChange }: { active: AiSub; onChange: (id: AiSub) => void }) {
  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-1">
      <div className="flex gap-2 min-w-min">
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
  const { state, pushChat, clearChat, notify, todayKey } = useWorkout()
  const [chatInput, setChatInput] = useState('')
  const [busy, setBusy] = useState(false)
  const coachSuggestions = useMemo(() => dailyCoachSuggestions(todayKey), [todayKey])

  async function runCoachTurn(userText: string, opts?: { hideUserBubble?: boolean }) {
    const msg = userText.trim()
    if (!msg || busy) return

    const flow = resolvePlanPersonalizationFlow(state.chatMessages, msg, opts)
    if (flow.type === 'ask') {
      if (flow.pushUserBubble && !isCoachUiPromptLine(msg)) {
        pushChat('user', msg)
      }
      pushChat('model', flow.questionText)
      return
    }

    const pending: ChatMessage = {
      id: 'pending-user',
      role: 'user',
      text: msg,
      at: 0,
    }
    const historyForApi = [...state.chatMessages, pending]
    const pushUser = !opts?.hideUserBubble && !isCoachUiPromptLine(msg)

    if (flow.type === 'generate') {
      if (pushUser) pushChat('user', msg)
      setBusy(true)
      try {
        const reply = await claudeCoachComplete(state, historyForApi, {
          mode: 'workout_plan',
          planAnswers: flow.answers,
        })
        pushChat('model', reply)
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Coach error')
      } finally {
        setBusy(false)
      }
      return
    }

    if (pushUser) pushChat('user', msg)
    setBusy(true)
    try {
      const reply = await claudeCoachComplete(state, historyForApi)
      pushChat('model', reply)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Coach error')
    } finally {
      setBusy(false)
    }
  }

  async function sendCoach() {
    if (!chatInput.trim()) return
    const msg = chatInput.trim()
    setChatInput('')
    await runCoachTurn(msg)
  }

  const shellClass =
    variant === 'sidebar'
      ? 'flex flex-col h-full min-h-0'
      : 'flex flex-col min-h-[min(70vh,32rem)] max-h-[calc(100dvh-11rem)]'

  const isSidebar = variant === 'sidebar'

  return (
    <div className={`${shellClass}${isSidebar ? ' apex-coach-sidebar' : ''}`}>
      {showTitle ? <p className="apex-section-label shrink-0 mb-3">Coach</p> : null}
      <div className="relative flex flex-1 min-h-0 flex-col">
        <button
          type="button"
          disabled={busy}
          className="apex-coach-clear-btn absolute top-2 right-2 z-10"
          aria-label="Clear chat"
          onClick={() => {
            clearChat()
            notify('Chat cleared')
          }}
        >
          <i className="ti ti-trash" aria-hidden />
        </button>
        <div className="apex-coach-chat-scroll flex-1 min-h-0 overflow-y-auto space-y-3 rounded-[16px] p-4 pt-10 mb-2">
          {state.chatMessages.length === 0 ? (
            <p className="apex-coach-empty-hint font-normal text-[#a8a8b0] leading-relaxed">
              Ask for form cues, programming ideas, or recovery tips. Your goals, this week&apos;s logged work,
              schedule, and streak are sent with every message.
            </p>
          ) : null}
          {state.chatMessages.map((m) => {
            const display = getCoachMessageDisplayText(m)
            if (!display) return null
            return (
              <div
                key={m.id}
                className={`apex-coach-bubble max-w-[92%] rounded-[12px] font-normal leading-relaxed border ${
                  m.role === 'user'
                    ? 'apex-coach-bubble--user ml-auto text-white border-transparent'
                    : 'apex-coach-bubble--model mr-auto apex-coach-bubble-ai border-white/[0.08] text-white'
                }`}
                style={m.role === 'user' ? { backgroundColor: '#2a2a2a' } : undefined}
              >
                {display}
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
      <div className="grid grid-cols-1 gap-2 shrink-0 mt-2">
        {coachSuggestions.map((label) => (
          <button
            key={label}
            type="button"
            disabled={busy}
            className={`apex-btn min-h-10 px-2 font-medium leading-snug text-[#e8e8ec] border-white/[0.12] disabled:opacity-45 ${
              isSidebar ? 'text-[13px]' : 'text-[12px]'
            }`}
            onClick={() => void runCoachTurn(label, { hideUserBubble: true })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="shrink-0 flex gap-2 pt-3 border-t border-white/[0.08] mt-2">
        <input
          className={`min-h-11 flex-1 ${inp}`}
          placeholder="Message coach…"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void sendCoach()
          }}
        />
        <button
          type="button"
          disabled={busy}
          className="apex-btn-primary min-h-11 px-5 text-[13px] font-medium disabled:opacity-50"
          onClick={() => void sendCoach()}
        >
          Send
        </button>
      </div>
    </div>
  )
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function ensureSetLogIds(logs: SetLog[]): SetLog[] {
  return logs.map((l) => {
    const row = l as SetLog & { id?: string }
    return row.id ? row : { ...row, id: crypto.randomUUID() }
  })
}

function sanitizeMerge(raw: unknown): Partial<AppPersisted> {
  if (!raw || typeof raw !== 'object') return {}
  const o = raw as Record<string, unknown>
  const out: Partial<AppPersisted> = {}
  if (Array.isArray(o.setLogs)) {
    const logs = o.setLogs.filter(Boolean) as SetLog[]
    out.setLogs = ensureSetLogIds(logs)
  }
  if (Array.isArray(o.bodyweightLogs)) {
    const bw = o.bodyweightLogs as AppPersisted['bodyweightLogs']
    out.bodyweightLogs = bw.map((b) =>
      b.id ? b : { ...b, id: crypto.randomUUID() },
    )
  }
  if (Array.isArray(o.cardioEntries) && o.cardioEntries.length) {
    out.cardioEntries = normalizeImportedCardio(o.cardioEntries)
  }
  if (Array.isArray(o.schedule) && o.schedule.length) {
    out.schedule = (o.schedule as AppPersisted['schedule']).map((d) => ({
      ...d,
      plannedExerciseIds: d.plannedExerciseIds ?? [],
    }))
  }
  return out
}

const inp = 'apex-input w-full min-h-12 px-3 py-2.5'

function AiParserPanel({
  importText,
  setImportText,
  busy,
  onParse,
}: {
  importText: string
  setImportText: (v: string) => void
  busy: boolean
  onParse: () => void
}) {
  return (
    <div className="apex-card p-5 space-y-3">
      <p className="apex-section-label">Import with AI</p>
      <p className="text-[12px] font-medium text-[#a0a0a8] leading-relaxed">
        Paste workout notes, preview structured entries, then confirm before they are saved.
      </p>
      <textarea
        className="apex-input w-full min-h-32 px-3 py-3 resize-y"
        placeholder="Paste workout notes…"
        value={importText}
        onChange={(e) => setImportText(e.target.value)}
      />
      <button
        type="button"
        disabled={busy}
        className="apex-btn-primary w-full min-h-12 text-[13px] font-medium disabled:opacity-50"
        onClick={onParse}
      >
        Parse
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
    <div className="space-y-4">
      <label className="block">
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
            <p className="text-[13px] font-medium text-[#a8a8b0] leading-relaxed">{tips.formTips}</p>
          </div>
          <div>
            <p className="apex-section-label mb-2">Common mistakes</p>
            <p className="text-[13px] font-medium text-[#a8a8b0] leading-relaxed">{tips.commonMistakes}</p>
          </div>
          <div>
            <p className="apex-section-label mb-2">Beginner advice</p>
            <p className="text-[13px] font-medium text-[#a8a8b0] leading-relaxed">{tips.beginnerAdvice}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AiInsightsPanel() {
  const { state, dismissBurnoutWarnings } = useWorkout()
  const weekKey = currentWeekStartKey()
  const warnings = useMemo(
    () => detectBurnoutWarnings(state, Date.now()),
    [state.setLogs, state.settings.unit],
  )
  const dismissed = state.burnoutDismissedWeekStart === weekKey
  const visible = !dismissed ? warnings : []

  if (visible.length === 0) {
    return (
      <div className="py-10 text-center">
        <i
          className="ti ti-check text-[22px] leading-none mx-auto block mb-3"
          style={{ color: 'rgba(255,255,255,0.3)' }}
          aria-hidden
        />
        <p className="text-[13px] font-normal" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Training load looks balanced this week.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {visible.map((w: BurnoutWarning) => (
        <div
          key={w.muscle}
          className="rounded-[12px]"
          style={{
            background: 'var(--apex-surface-nested)',
            border: '0.5px solid var(--apex-border)',
            padding: '14px 16px',
          }}
        >
          <div className="flex items-start gap-2">
            <i
              className="ti ti-alert-triangle shrink-0 mt-0.5 text-[16px] leading-none"
              style={{ color: 'var(--apex-text-secondary)' }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-white">High {w.muscle.toLowerCase()} volume</p>
              <p className="mt-2 text-[13px] font-normal leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Your {w.muscle.toLowerCase()} volume this week is {w.pctAbove}% above your 4-week average.
                Consider a deload or lighter accessory work.
              </p>
              <button
                type="button"
                className="mt-3 text-[11px] font-normal touch-manipulation"
                style={{ color: 'rgba(255,255,255,0.3)' }}
                onClick={() => dismissBurnoutWarnings()}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function AiHub({
  aiSub,
  setAiSub,
  variant = 'tab',
}: {
  aiSub: AiSub
  setAiSub: (s: AiSub) => void
  variant?: 'tab' | 'sidebar'
}) {
  const { state, mergeImport, notify } = useWorkout()
  const [importText, setImportText] = useState('')
  const [importPreview, setImportPreview] = useState<Partial<AppPersisted> | null>(null)
  const [busy, setBusy] = useState(false)

  async function runParseImport() {
    if (!importText.trim()) {
      notify('Paste workout notes first')
      return
    }
    setBusy(true)
    try {
      const raw = await claudeParseImport(state, importText)
      const partial = sanitizeMerge(raw)
      if (
        !partial.setLogs?.length &&
        !partial.cardioEntries?.length &&
        !partial.bodyweightLogs?.length &&
        !partial.schedule
      ) {
        notify('No entries found — try different wording')
        return
      }
      setImportPreview(partial)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Parse failed')
    } finally {
      setBusy(false)
    }
  }

  function confirmImportMerge() {
    if (!importPreview) return
    mergeImport(importPreview)
    setImportPreview(null)
    setImportText('')
  }

  return (
    <>
      <div className="space-y-4">
        <AiPillNav active={aiSub} onChange={setAiSub} />
        {aiSub === 'coach' ? (
          <AiCoachPanel variant={variant} showTitle={false} />
        ) : null}
        {aiSub === 'parser' ? (
          <AiParserPanel
            importText={importText}
            setImportText={setImportText}
            busy={busy}
            onParse={() => void runParseImport()}
          />
        ) : null}
        {aiSub === 'form' ? <AiFormTipsPanel /> : null}
        {aiSub === 'insights' ? <AiInsightsPanel /> : null}
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
              These entries will be merged into your data. Existing logs stay; new rows are appended.
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
              <div className="mt-4 max-h-40 overflow-y-auto rounded-[14px] border border-white/[0.08] p-3">
                <p className="apex-section-label mb-2">Sample sets</p>
                <ul className="space-y-1 text-[12px] text-[#a8a8b0]">
                  {importPreview.setLogs.slice(0, 8).map((l) => (
                    <li key={l.id}>
                      {l.exerciseName}
                      {l.kind === 'weighted'
                        ? ` · ${l.bodyweight ? 'BW' : l.weight} × ${l.reps}`
                        : ` · ${l.durationSec}s`}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                className="apex-btn min-h-12 flex-1 text-[14px] font-semibold"
                onClick={() => setImportPreview(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="apex-btn-primary min-h-12 flex-1 text-[13px] font-medium"
                onClick={confirmImportMerge}
              >
                Save merge
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
    resetAppData,
    disconnectGoogleCalendar,
  } = useWorkout()
  const [sub, setSub] = useState<Sub>(() =>
    layout === 'desktop' && desktopSection === 'settings' ? 'settings' : 'stats',
  )
  const [aiSub, setAiSub] = useState<AiSub>('coach')
  const [busy, setBusy] = useState(false)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [moodLift, setMoodLift] = useState<MoodLiftStats | null>(null)
  const [moodLiftLoading, setMoodLiftLoading] = useState(false)
  const [appearanceTheme, setAppearanceTheme] = useState<ApexThemeMode>(readThemeMode)
  const [appearanceFontSize, setAppearanceFontSize] = useState<ApexFontSizeMode>(readFontSizeMode)
  const [bwInput, setBwInput] = useState('')
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)
  const [gcalExpiryTick, setGcalExpiryTick] = useState(0)
  const [gymBarcode, setGymBarcode] = useState<GymBarcodeStored | null>(() => readGymBarcode())
  const [gymSettingsOpen, setGymSettingsOpen] = useState(false)
  const [gymDraftNumber, setGymDraftNumber] = useState('')
  const [gymDraftFormat, setGymDraftFormat] = useState<GymBarcodeFormat>('code128')
  const [gymDraftGymName, setGymDraftGymName] = useState('')
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

  const performanceInsights = useMemo(
    () => computePerformanceInsights(state),
  [state.setLogs, state.sleepLogs, state.mealLogs, state.settings.unit])

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
    if (isDesktop) {
      setSub(desktopSection === 'settings' ? 'settings' : 'stats')
    }
  }, [isDesktop, desktopSection])

  useEffect(() => {
    if (!openGymSettingsToken) return
    if (!isDesktop) setSub('settings')
    const cur = readGymBarcode()
    setGymDraftNumber(cur?.number ?? '')
    setGymDraftFormat(cur?.format ?? 'code128')
    setGymDraftGymName(cur?.gymName ?? '')
    setGymSettingsOpen(true)
  }, [openGymSettingsToken, isDesktop])

  useEffect(() => {
    const showStats = isDesktop ? desktopSection === 'profile' : sub === 'stats'
    if (!showStats) return
    let cancelled = false
    setLeaderboardLoading(true)
    void fetchLeaderboard(50).then((rows) => {
      if (!cancelled) {
        setLeaderboard(rows)
        setLeaderboardLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [sub, isDesktop, desktopSection, state.setLogs, state.lifetimeXp, userId])

  useEffect(() => {
    const showStats = isDesktop ? desktopSection === 'profile' : sub === 'stats'
    if (!showStats) return
    let cancelled = false
    setMoodLiftLoading(true)
    void fetchAverageMoodLift(userId)
      .then((stats) => {
        if (!cancelled) {
          setMoodLift(stats)
          setMoodLiftLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMoodLift(null)
          setMoodLiftLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [sub, isDesktop, desktopSection, userId])

  const levelInfo = useMemo(() => getLevelInfo(state.lifetimeXp ?? 0), [state.lifetimeXp])

  const prRows = useMemo(
    () => computePersonalRecords(state.setLogs, state.settings.unit),
    [state.setLogs, state.settings.unit],
  )

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
  const gcalExpiryLabel = useMemo(
    () => (gcalConnected ? formatGoogleCalendarExpiryLabel() : ''),
    [gcalConnected, gcalExpiryTick],
  )

  useEffect(() => {
    if (sub !== 'settings' || !gcalConnected) return
    const id = window.setInterval(() => setGcalExpiryTick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [sub, gcalConnected])

  return (
    <div className={`apex-tab-stack ${isDesktop ? 'pb-4' : 'pb-28'}`}>
      <section className="apex-card p-6">
        <div className="flex items-center gap-4">
          <div
            className="box-border flex h-[96px] w-[96px] shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-[#1a1a1a]"
          >
            {state.settings.profileAvatarId ? (
              <ProfileAvatarGlyph id={state.settings.profileAvatarId} className="h-12 w-12 text-[#ececee]" />
            ) : (
              <span className="text-[1.25rem] font-black tracking-tight text-white">{profileInitials}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="apex-page-sub">Profile</p>
            <h1 className="text-[1.375rem] font-bold text-[#f4f4f5] tracking-tight leading-tight truncate">
              {state.settings.displayName.trim() || 'Apex Athlete'}
            </h1>
            <p className="mt-1.5 text-[13px] font-medium text-[#a0a0a8] leading-relaxed line-clamp-2">
              {state.settings.fitnessGoals.trim() || 'Train consistently — stats update as you log work.'}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-[18px] border border-white/[0.06] px-4 py-3.5">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-[0.8125rem] font-medium text-[#7d7d88]">Level & XP</p>
            <p className="text-[12px] font-bold text-[#ececee] tabular-nums">{state.lifetimeXp ?? 0} XP</p>
          </div>
          <p className="text-[15px] font-bold text-[#f4f4f5]">{levelInfo.label}</p>
          <div className="mt-2 h-2 rounded-full bg-[#1a1a1e] overflow-hidden border border-white/[0.05]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.round(levelInfo.progressInTier * 100)}%`,
                backgroundColor: levelInfo.ringColor,
              }}
            />
          </div>
          <p className="mt-1.5 text-[11px] font-medium text-[#a0a0a8]">
            {levelInfo.nextThreshold != null
              ? `${Math.max(0, levelInfo.nextThreshold - (state.lifetimeXp ?? 0))} XP until next level`
              : 'Elite tier — keep stacking XP'}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-[18px] border border-white/[0.055] p-4">
            <p className="text-[0.75rem] font-medium text-[#7d7d88]">Sessions</p>
            <p className="apex-stat-num mt-2 tabular-nums">{sessionsThisWeek(state)}</p>
            <p className="text-[0.8125rem] font-medium text-[#a0a0a8] mt-1">This week</p>
          </div>
          <div className="rounded-[18px] border border-white/[0.055] p-4">
            <p className="text-[0.75rem] font-medium text-[#7d7d88]">Sets</p>
            <p className="apex-stat-num mt-2 tabular-nums">{setsThisWeek(state)}</p>
            <p className="text-[0.8125rem] font-medium text-[#a0a0a8] mt-1">This week</p>
          </div>
          <div className="rounded-[18px] border border-white/[0.055] p-4">
            <p className="text-[0.75rem] font-medium text-[#7d7d88]">Minutes</p>
            <p className="apex-stat-num mt-2 tabular-nums">{minutesThisWeek(state)}</p>
            <p className="text-[0.8125rem] font-medium text-[#a0a0a8] mt-1">Cardio · week</p>
          </div>
          <div className="rounded-[18px] border border-white/[0.055] p-4">
            <p className="text-[0.75rem] font-medium text-[#7d7d88]">Streak</p>
            <p className="apex-stat-num mt-2 tabular-nums">{streakDays}d</p>
            <p className="text-[0.8125rem] font-medium text-[#a0a0a8] mt-1">Keep it going</p>
          </div>
        </div>

        <div className="mt-3 rounded-[18px] border border-white/[0.055] p-4">
          <p className="text-[0.75rem] font-medium text-[#7d7d88]">Mood lift</p>
          {moodLiftLoading ? (
            <p className="apex-stat-num mt-2 tabular-nums text-[#7d7d88]">…</p>
          ) : moodLift ? (
            <>
              <p className="apex-stat-num mt-2 tabular-nums">{formatMoodLift(moodLift.averageLift)}</p>
              <p className="text-[0.8125rem] font-medium text-[#a0a0a8] mt-1">
                Avg mood improvement per workout · {moodLift.checkinCount}{' '}
                {moodLift.checkinCount === 1 ? 'check-in' : 'check-ins'}
              </p>
            </>
          ) : (
            <>
              <p className="apex-stat-num mt-2 tabular-nums text-[#7d7d88]">—</p>
              <p className="text-[0.8125rem] font-medium text-[#a0a0a8] mt-1">
                Complete a workout check-in to track mood lift
              </p>
            </>
          )}
        </div>

        <div className="mt-3 rounded-[18px] border border-white/[0.055] p-4">
          <p className="text-[0.75rem] font-medium text-[#7d7d88]">Strength age</p>
          {strengthAge.strengthAge != null ? (
            <>
              <p className="apex-stat-num mt-2 tabular-nums">{strengthAge.strengthAge}</p>
              <p className="text-[0.8125rem] font-medium text-[#a0a0a8] mt-1 leading-relaxed">
                Avg age of athletes at your strength-to-bodyweight on{' '}
                {strengthAge.liftsUsed.map(formatStrengthAgeLiftLabel).join(', ')}
              </p>
            </>
          ) : (
            <>
              <p className="apex-stat-num mt-2 tabular-nums text-[#7d7d88]">—</p>
              <p className="text-[0.8125rem] font-medium text-[#a0a0a8] mt-1 leading-relaxed">
                {strengthAge.missingBodyweight
                  ? 'Log bodyweight and PRs for bench, squat, deadlift, or overhead press'
                  : 'Log weighted sets for bench, squat, deadlift, or overhead press'}
              </p>
            </>
          )}
        </div>

        {performanceInsights.eligible && performanceInsights.insights.length > 0 ? (
          <div className="mt-3 rounded-[18px] border border-white/[0.055] p-4">
            <p className="text-[0.75rem] font-medium text-[#7d7d88]">Performance insights</p>
            <ul className="mt-3 space-y-2.5">
              {performanceInsights.insights.map((insight) => (
                <li
                  key={insight.id}
                  className="text-[0.8125rem] font-medium text-[#ececee] leading-relaxed pl-3 border-l-2"
                  style={{ borderLeftColor: 'var(--apex-accent)' }}
                >
                  {insight.text}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {!isDesktop ? (
      <div className="apex-profile-subtabs flex border-b border-white/10">
        {(
          [
            ['stats', 'Stats'],
            ['settings', 'Settings'],
            ['ai', 'AI'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`relative min-h-11 flex-1 text-[13px] font-medium transition-colors active:opacity-90 ${
              sub === k ? 'apex-profile-subtab-active' : 'apex-profile-subtab-inactive'
            }`}
            onClick={() => setSub(k)}
          >
            {label}
            {sub === k ? (
              <span className="apex-profile-subtab-indicator absolute bottom-0 left-[18%] right-[18%] h-px" aria-hidden />
            ) : null}
          </button>
        ))}
      </div>
      ) : null}

      {(isDesktop && desktopSection === 'profile') || (!isDesktop && sub === 'stats') ? (
        <div className={isDesktop ? 'grid grid-cols-2 gap-4' : 'space-y-5'}>
          <button
            type="button"
            className={`apex-btn apex-stats-achievements-divider w-full text-[14px] font-semibold border-white/[0.1] ${
              isDesktop ? 'col-span-2' : ''
            }`}
            onClick={onOpenAchievements}
          >
            Achievements
          </button>
          {trainerMode ? (
            <>
              <div className={`apex-card p-5 space-y-3 ${isDesktop ? 'col-span-2' : ''}`}>
                <p className="apex-section-label">Your trainer code</p>
                <p className="text-[12px] font-medium text-[#a0a0a8] leading-relaxed">
                  Share this code with clients so they can connect in Settings.
                </p>
                <div className="flex items-center gap-3">
                  <p className="flex-1 text-[26px] font-bold tracking-[0.22em] text-[#ececee] tabular-nums">
                    {trainerCode || ensureTrainerCode()}
                  </p>
                  <button
                    type="button"
                    className="apex-btn min-h-11 px-5 text-[13px] font-semibold shrink-0"
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
                          <p className="text-[15px] font-semibold text-[#ececee]">{c.displayName}</p>
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
            <p className="text-[15px] font-semibold text-[#ececee] leading-relaxed">
              {muscleGroupsThisWeek(state).length
                ? muscleGroupsThisWeek(state).join(', ')
                : 'None yet'}
            </p>
            <p className="text-[12px] font-medium text-[#a0a0a8] mt-2">Hit this week</p>
          </div>
          <div className="apex-card p-5">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <p className="apex-section-label">Personal records</p>
              <span className="rounded-md border border-white/10 bg-white/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white/80">
                PR
              </span>
            </div>
            <p className="text-[12px] font-medium text-[#a0a0a8] mb-3 leading-relaxed">
              Best logged performance per exercise (max weight, bodyweight reps, or timed hold).
            </p>
            {prRows.length ? (
              <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {prRows.slice(0, 24).map((r) => (
                  <li
                    key={r.exerciseId}
                    className="flex items-center justify-between gap-2 rounded-[12px] border border-white/[0.06] px-3 py-2.5"
                  >
                    <span className="min-w-0 truncate text-[13px] font-semibold text-[#ececee]">
                      {r.exerciseName}
                    </span>
                    <span className="shrink-0 rounded-lg border border-white/10 bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white/80 tabular-nums">
                      {r.detail}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] font-medium text-[#a0a0a8]">Log sets to build your PR board.</p>
            )}
          </div>
          <div className={`apex-card p-5 ${isDesktop ? 'col-span-2' : ''}`}>
            <p className="apex-section-label mb-1">Weekly leaderboard</p>
            <p className="text-[13px] font-medium text-[#a0a0a8] mb-5 leading-relaxed">
              Global ranking by volume lifted this week (lbs). Updates when you log workouts.
            </p>
            {leaderboardLoading ? (
              <p className="text-[13px] font-medium text-[#a0a0a8] py-4">Loading leaderboard…</p>
            ) : leaderboard.length === 0 ? (
              <p className="text-[13px] font-medium text-[#a0a0a8] py-4">
                No entries yet — log a set to appear on the board.
              </p>
            ) : (
              <ul className="space-y-2">
                {leaderboard.map((row, index) => {
                  const isMe = row.user_id === userId
                  const rank = index + 1
                  const initials = row.display_name
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0]!)
                    .join('')
                    .toUpperCase()
                  return (
                    <li
                      key={row.user_id}
                      className={`flex items-center justify-between rounded-[14px] border px-4 py-3.5 border-white/[0.08] transition-colors hover:border-white/[0.12] ${
                        isMe ? 'bg-black/25' : 'bg-black/15'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[13px] font-normal text-[#a8a8b0] tabular-nums w-8 shrink-0">
                          #{rank}
                        </span>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/10 bg-[#1a1a1a] text-[11px] font-black tracking-tight text-white">
                          {initials || 'A'}
                        </span>
                        <span className="truncate text-[13px] font-normal text-[#e0e0e0]">
                          {row.display_name}
                          {isMe ? (
                            <span className="ml-2 text-[10px] uppercase tracking-[0.5px] text-[#a8a8b0]">
                              You
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <span className="apex-stat-num shrink-0 tabular-nums text-[13px]">
                        {formatLeaderboardVolume(row.weekly_volume_lbs)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
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
                className="apex-btn-primary min-h-11 px-6 text-[13px] font-semibold shrink-0 rounded-[14px]"
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
                  contentStyle={{ background: chart.tooltipBg, border: `1px solid ${chart.tooltipBorder}` }}
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
                    contentStyle={{ background: chart.tooltipBg, border: `1px solid ${chart.tooltipBorder}` }}
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

      {(isDesktop && desktopSection === 'settings') || (!isDesktop && sub === 'settings') ? (
        <div className="apex-settings-panel">
          <section className="apex-settings-section">
            <label className="block">
              <span className="apex-section-label block mb-2">Display name</span>
              <input
                className={`w-full min-h-12 ${inp}`}
                value={state.settings.displayName}
                onChange={(e) => updateSettings({ displayName: e.target.value })}
              />
            </label>
          </section>
          <div className="apex-settings-divider" aria-hidden />
          <section className="apex-settings-section">
            <label className="block">
              <span className="apex-section-label block mb-2">Daily water goal (oz)</span>
              <input
                type="number"
                min={8}
                step={8}
                className={`w-full min-h-12 ${inp}`}
                value={state.settings.waterGoalOz ?? DEFAULT_WATER_GOAL_OZ}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (!Number.isFinite(v) || v < 8) return
                  updateSettings({ waterGoalOz: Math.round(v) })
                }}
              />
            </label>
            <p className="text-[12px] font-medium text-[#a0a0a8] mt-2 leading-relaxed">
              Tap the Water card in Today → More to log {WATER_LOG_INCREMENT_OZ} oz at a time.
            </p>
          </section>
          <div className="apex-settings-divider" aria-hidden />
          <section className="apex-settings-section space-y-3">
            <span className="apex-section-label block">Daily macro goals</span>
            <label className="block">
              <span className="text-[12px] font-medium text-[#a0a0a8] mb-1.5 block">Calories</span>
              <input
                type="number"
                min={500}
                step={50}
                className={`w-full min-h-12 ${inp}`}
                value={state.settings.macroGoalCalories ?? DEFAULT_MACRO_GOAL_CALORIES}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (!Number.isFinite(v) || v < 500) return
                  updateSettings({ macroGoalCalories: Math.round(v) })
                }}
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="text-[12px] font-medium text-[#a0a0a8] mb-1.5 block">Protein (g)</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  className={`w-full min-h-12 ${inp}`}
                  value={state.settings.macroGoalProteinG ?? DEFAULT_MACRO_GOAL_PROTEIN_G}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (!Number.isFinite(v) || v < 1) return
                    updateSettings({ macroGoalProteinG: Math.round(v) })
                  }}
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-[#a0a0a8] mb-1.5 block">Carbs (g)</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  className={`w-full min-h-12 ${inp}`}
                  value={state.settings.macroGoalCarbsG ?? DEFAULT_MACRO_GOAL_CARBS_G}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (!Number.isFinite(v) || v < 1) return
                    updateSettings({ macroGoalCarbsG: Math.round(v) })
                  }}
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-[#a0a0a8] mb-1.5 block">Fat (g)</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  className={`w-full min-h-12 ${inp}`}
                  value={state.settings.macroGoalFatG ?? DEFAULT_MACRO_GOAL_FAT_G}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (!Number.isFinite(v) || v < 1) return
                    updateSettings({ macroGoalFatG: Math.round(v) })
                  }}
                />
              </label>
            </div>
          </section>
          <div className="apex-settings-divider" aria-hidden />
          <section className="apex-settings-section space-y-2">
            <span className="apex-section-label block">Profile</span>
            <button
              type="button"
              className="apex-card w-full min-h-12 px-4 flex items-center justify-between gap-3 text-left touch-manipulation hover:border-white/[0.14]"
              onClick={() => {
                const cur = readGymBarcode()
                setGymDraftNumber(cur?.number ?? '')
                setGymDraftFormat(cur?.format ?? 'code128')
                setGymDraftGymName(cur?.gymName ?? '')
                setGymSettingsOpen(true)
              }}
            >
              <span className="text-[13px] font-medium text-[#e0e0e0]">Gym Membership</span>
              <span className="text-[12px] font-medium text-[#a0a0a8] truncate max-w-[50%]">
                {gymBarcode ? gymBarcode.number : 'Not set'}
              </span>
            </button>
            <label className="apex-card flex items-center gap-3 min-h-12 px-4 text-[13px] font-normal text-[#e0e0e0] touch-manipulation">
              <input
                type="checkbox"
                checked={trainerMode}
                onChange={(e) => toggleTrainerMode(e.target.checked)}
                className="apex-checkbox"
              />
              <span className="flex-1">
                Trainer mode
                <span className="block text-[11px] font-medium text-[#7d7d88] mt-0.5">Premium</span>
              </span>
            </label>
            {trainerMode ? (
              <div className="apex-card p-4 space-y-2">
                <p className="text-[12px] font-medium text-[#a0a0a8] leading-relaxed">
                  Share this code with clients so they can connect in Settings.
                </p>
                <p className="text-[22px] font-bold tracking-[0.2em] text-[#ececee] tabular-nums">
                  {trainerCode || ensureTrainerCode()}
                </p>
                <button
                  type="button"
                  className="apex-btn w-full min-h-10 text-[12px] font-semibold"
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
            ) : !trainerMode && clientConnection ? (
              <div className="apex-card p-4 space-y-3">
                <p className="text-[13px] font-medium text-[#e0e0e0]">Connected to trainer</p>
                <p className="text-[12px] font-medium text-[#a0a0a8]">
                  Code {clientConnection.trainer_code}
                </p>
                <button
                  type="button"
                  className="apex-btn w-full min-h-10 text-[12px] font-semibold text-[#e85d5d] border-[#e85d5d]/35"
                  onClick={() => {
                    void disconnectTrainerClient(userId)
                      .then(() => {
                        setClientConnection(null)
                        notify('Disconnected from trainer')
                      })
                      .catch((e) =>
                        notify(e instanceof Error ? e.message : 'Could not disconnect'),
                      )
                  }}
                >
                  Disconnect
                </button>
                <div className="space-y-2 pt-1 border-t border-white/[0.08]">
                  <p className="apex-section-label">Share with trainer</p>
                  <label className="flex items-center gap-3 min-h-10 text-[13px] text-[#e0e0e0]">
                    <input
                      type="checkbox"
                      checked={sharePrefs.workoutLogs}
                      onChange={(e) => toggleSharePref('workout_logs', e.target.checked)}
                      className="apex-checkbox"
                    />
                    Workout logs
                  </label>
                  <label className="flex items-center gap-3 min-h-10 text-[13px] text-[#e0e0e0]">
                    <input
                      type="checkbox"
                      checked={sharePrefs.bodyweight}
                      onChange={(e) => toggleSharePref('bodyweight', e.target.checked)}
                      className="apex-checkbox"
                    />
                    Bodyweight
                  </label>
                  <label className="flex items-center gap-3 min-h-10 text-[13px] text-[#e0e0e0]">
                    <input
                      type="checkbox"
                      checked={sharePrefs.personalRecords}
                      onChange={(e) => toggleSharePref('personal_records', e.target.checked)}
                      className="apex-checkbox"
                    />
                    Personal records
                  </label>
                </div>
              </div>
            ) : !trainerMode ? (
              <div className="apex-card p-4 space-y-3">
                <p className="apex-section-label">Connect to trainer</p>
                <input
                  className={inp}
                  placeholder="6-character code"
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
                  <p className="text-[12px] font-medium text-[#e85d5d] leading-relaxed" role="alert">
                    {connectCodeError}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={connectCodeInput.length !== 6 || busy}
                  className="apex-btn-primary w-full min-h-11 text-[13px] font-semibold disabled:opacity-50"
                  onClick={() => {
                    setConnectCodeError('')
                    setBusy(true)
                    const codeAttempt = connectCodeInput
                    void connectClientToTrainer(userId, codeAttempt)
                      .then((row) => {
                        const wasSame = clientConnection?.trainer_code === row.trainer_code
                        setClientConnection(row)
                        setConnectCodeInput('')
                        persistSharePrefs()
                        notify(
                          wasSame ? 'Already connected to this trainer' : 'Connected to trainer',
                        )
                      })
                      .catch((e) => setConnectCodeError(trainerConnectErrorMessage(e)))
                      .finally(() => setBusy(false))
                  }}
                >
                  Connect
                </button>
              </div>
            ) : null}
          </section>
          <div className="apex-settings-divider" aria-hidden />
          <section className="apex-settings-section">
            <span className="apex-section-label block mb-2">Profile avatar</span>
            <p className="text-[12px] font-medium text-[#a0a0a8] mb-3 leading-relaxed">
              Choose a fitness icon, or use initials from your display name.
            </p>
            <div className="grid grid-cols-4 gap-2">
              {PROFILE_AVATAR_IDS.map((id) => {
                const selected = state.settings.profileAvatarId === id
                return (
                  <button
                    key={id}
                    type="button"
                    aria-label={`Avatar ${id}`}
                    aria-pressed={selected}
                    className={`apex-settings-avatar-btn flex min-h-[3.25rem] items-center justify-center rounded-[14px] border transition-colors active:scale-[0.98] ${
                      selected
                        ? 'border-white/25 bg-white/[0.12]'
                        : 'border-white/[0.08] hover:border-white/[0.14]'
                    }`}
                    onClick={() => updateSettings({ profileAvatarId: id })}
                  >
                    <ProfileAvatarGlyph id={id} className="h-7 w-7 text-[#ececee]" />
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              className="apex-btn mt-3 w-full min-h-11 text-[13px] font-semibold"
              onClick={() => updateSettings({ profileAvatarId: null })}
            >
              Use initials instead
            </button>
          </section>
          <div className="apex-settings-divider" aria-hidden />
          <section className="apex-settings-section space-y-4">
            <label className="block">
              <span className="apex-section-label block mb-2">Fitness goals</span>
            <textarea
              className="apex-input mt-1 w-full min-h-24 px-3 py-3 resize-y"
              value={state.settings.fitnessGoals}
              onChange={(e) => {
                const fitnessGoal = e.target.value
                updateSettings({ fitnessGoals: fitnessGoal })
                try {
                  localStorage.setItem(
                    APEX_COACH_PROFILE_KEY,
                    JSON.stringify({ fitnessGoal: fitnessGoal.trim() }),
                  )
                } catch {
                  /* ignore */
                }
              }}
            />
          </label>
          <div className="apex-unit-segment">
            <button
              type="button"
              className={state.settings.unit === 'lbs' ? 'apex-unit-segment--active' : ''}
              onClick={() => updateSettings({ unit: 'lbs' })}
            >
              lbs
            </button>
            <button
              type="button"
              className={state.settings.unit === 'kg' ? 'apex-unit-segment--active' : ''}
              onClick={() => updateSettings({ unit: 'kg' })}
            >
              kg
            </button>
          </div>
          </section>
          <div className="apex-settings-divider" aria-hidden />
          <section className="apex-settings-section space-y-4">
            <label className="flex items-center gap-3 min-h-12 text-[13px] font-normal text-[#e0e0e0]">
            <input
              type="checkbox"
              checked={state.settings.restTimerEnabled}
              onChange={(e) => updateSettings({ restTimerEnabled: e.target.checked })}
              className="apex-checkbox"
            />
            Start rest countdown after each set
          </label>
          <label className="block">
            <span className="apex-section-label block mb-2">Rest timer (seconds)</span>
            <input
              inputMode="numeric"
              className={`mt-1 w-full min-h-12 ${inp}`}
              value={String(state.settings.restTimerSeconds)}
              onChange={(e) =>
                updateSettings({ restTimerSeconds: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </label>
          </section>
          <div className="apex-settings-divider" aria-hidden />
          <section className="apex-settings-section space-y-4">
            <div className="space-y-2">
            <span className="apex-section-label block">Theme</span>
            <div className="flex gap-2">
              <button
                type="button"
                className={`apex-btn min-h-11 flex-1 text-[13px] font-semibold ${
                  appearanceTheme === 'dark' ? 'apex-appearance-btn--active' : ''
                }`}
                onClick={() => {
                  localStorage.setItem(APEX_THEME_STORAGE_KEY, 'dark')
                  applyApexAppearanceFromStorage()
                  setAppearanceTheme('dark')
                }}
              >
                Dark
              </button>
              <button
                type="button"
                className={`apex-btn min-h-11 flex-1 text-[13px] font-semibold ${
                  appearanceTheme === 'light' ? 'apex-appearance-btn--active' : ''
                }`}
                onClick={() => {
                  localStorage.setItem(APEX_THEME_STORAGE_KEY, 'light')
                  applyApexAppearanceFromStorage()
                  setAppearanceTheme('light')
                }}
              >
                Light
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <span className="apex-section-label block">Font size</span>
            <div className="flex gap-2">
              {(['small', 'medium', 'large', 'xlarge'] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`apex-btn min-h-11 flex-1 text-[13px] font-semibold capitalize ${
                    appearanceFontSize === size ? 'apex-appearance-btn--active' : ''
                  }`}
                  onClick={() => {
                    localStorage.setItem(APEX_FONT_SIZE_STORAGE_KEY, size)
                    applyApexAppearanceFromStorage()
                    setAppearanceFontSize(size)
                  }}
                >
                  {size === 'xlarge' ? 'Extra large' : size}
                </button>
              ))}
            </div>
          </div>
          </section>
          <div className="apex-settings-divider" aria-hidden />
          <section className="apex-settings-section space-y-2">
            <span className="apex-section-label block">Integrations</span>
            <div className="apex-card px-4 py-3.5 flex items-center justify-between gap-3 min-h-[3.25rem]">
              <span className="text-[13px] font-medium text-[#e0e0e0] shrink-0">Google Calendar</span>
              {gcalConfigured && gcalConnected ? (
                <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[12px] font-medium">
                  <span className="inline-flex items-center gap-1.5 text-[#e0e0e0]">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-white/70" aria-hidden />
                    Connected
                  </span>
                  {gcalExpiryLabel ? (
                    <span className="text-[#7d7d88] tabular-nums">{gcalExpiryLabel}</span>
                  ) : null}
                  <button
                    type="button"
                    className="text-[#a0a0a8] underline underline-offset-2 decoration-white/20 hover:text-[#e0e0e0]"
                    onClick={() => disconnectGoogleCalendar()}
                  >
                    Disconnect
                  </button>
                </div>
              ) : gcalConfigured ? (
                <button
                  type="button"
                  className="apex-btn-primary min-h-9 px-4 text-[12px] font-semibold shrink-0"
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
                <span className="text-[12px] font-medium text-[#7d7d88]">Not configured</span>
              )}
            </div>
          </section>
          <div className="apex-settings-divider" aria-hidden />
          <section className="apex-settings-section space-y-2">
            <button
              type="button"
              className="apex-btn w-full min-h-12 text-[14px] font-semibold"
              onClick={() => downloadText('workout-export.csv', exportFullDataCsv(state))}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="apex-btn w-full min-h-12 text-[14px] font-semibold text-[#e85d5d] border-[#e85d5d]/35"
              onClick={() => setConfirmResetOpen(true)}
            >
              Reset app data
            </button>
          </section>
        </div>
      ) : null}

      {!isDesktop && sub === 'ai' ? (
        <AiHub aiSub={aiSub} setAiSub={setAiSub} variant="tab" />
      ) : null}

      {!isDesktop || desktopSection === 'settings' ? (
        <button
          type="button"
          className="apex-sign-out-btn w-full min-h-12 text-[13px] mt-2"
          onClick={() => void supabase.auth.signOut()}
        >
          Sign out
        </button>
      ) : null}

      {selectedClient ? (
        <div className="apex-safe-top apex-theme-shell fixed inset-0 z-[90] flex flex-col bg-[var(--apex-surface-page)] text-[var(--apex-text-primary)]">
          <header className="px-4 py-3 border-b border-[#1e1e1e] flex items-center justify-between gap-2">
            <div>
              <p className="text-[15px] font-bold text-[#f4f4f5]">{selectedClient.displayName}</p>
              <p className="text-[12px] font-medium text-[#a0a0a8] mt-0.5">
                Last active · {formatLastActive(selectedClient.lastActiveMs)}
              </p>
            </div>
            <button
              type="button"
              className="min-h-11 min-w-11 rounded-[12px] border border-[#1e1e1e] bg-[#161616] text-[13px] text-[#e0e0e0]"
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
                    <div className="rounded-[18px] border border-white/[0.055] p-4">
                      <p className="text-[0.75rem] font-medium text-[#7d7d88]">Sessions</p>
                      <p className="apex-stat-num mt-2 tabular-nums">
                        {sessionsThisWeek(clientDetailState)}
                      </p>
                      <p className="text-[0.8125rem] font-medium text-[#a0a0a8] mt-1">This week</p>
                    </div>
                    <div className="rounded-[18px] border border-white/[0.055] p-4">
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
                    <p className="text-[15px] font-semibold text-[#ececee] tabular-nums">
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
          <div className="shrink-0 border-t border-[#1e1e1e] p-4 bg-[var(--apex-surface-page)] space-y-2">
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
              className="apex-btn-primary w-full min-h-11 text-[13px] font-semibold disabled:opacity-50"
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

      <ConfirmDialog
        open={confirmResetOpen}
        title="Reset app data?"
        message="This permanently deletes all logged workouts, your schedule, personal records, and other local data on this device. You will return to setup."
        confirmLabel="Reset everything"
        cancelLabel="Cancel"
        destructive
        onCancel={() => setConfirmResetOpen(false)}
        onConfirm={() => {
          setConfirmResetOpen(false)
          void resetAppData().then(() => notify('App data reset'))
        }}
      />

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
            <h3 className="text-[15px] font-bold text-[#f4f4f5]">Gym Membership</h3>
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
                className="apex-btn-primary w-full min-h-12 text-[13px] font-semibold"
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
                  className="apex-btn w-full min-h-11 text-[13px] font-semibold text-[#e85d5d] border-[#e85d5d]/35"
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
                className="apex-btn w-full min-h-11 text-[13px] font-semibold"
                onClick={() => setGymSettingsOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  )
}
