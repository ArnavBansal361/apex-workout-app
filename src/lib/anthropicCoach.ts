import type { AppPersisted, ChatMessage, ExerciseHelp } from '../types'
import { cycleCoachInstruction } from './cycleTracking'
import { resolveCoachContextBlock } from './coachContext'
import { touchAiIntelligenceUpdated } from './aiIntelligenceStatus'
import { workoutDaysFromLogs } from './achievements'
import { dateKey, formatCoachTodayLine, parseDateKey, weekStartMonday } from './dates'
import { scheduledTrainingModeForDay, trainingModeCoachInstruction } from './trainingMode'
import { weeklyVolumeSeries } from './stats'
import type { PrimaryCalendarEvent } from './googleCalendar'
import { isCoachUiPromptLine, sanitizeCoachBubbleText } from './persist'

const ANTHROPIC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/anthropic-proxy`
const ANTHROPIC_VERSION = '2023-06-01'
const ANTHROPIC_BETA = 'prompt-caching-2024-07-31'
const CLAUDE_MODEL = 'claude-sonnet-4-6'
const CLAUDE_FAST_MODEL = 'claude-sonnet-4-6'

type AnthropicContentBlock = { type: string; text?: string }

function formatAnthropicApiError(
  status: number,
  data: unknown,
  rawText: string,
): string {
  const err = (data as { error?: { message?: string; type?: string } })?.error
  const apiMsg = err?.message?.trim() ?? ''
  if (err?.type === 'not_found_error' && /^model:\s*/i.test(apiMsg)) {
    return 'AI coach is temporarily unavailable (model not found). Please try again later.'
  }
  if (apiMsg && !/^model:\s*/i.test(apiMsg)) return apiMsg
  if (rawText.trim() && !/^model:\s*/i.test(rawText.trim())) {
    return rawText.trim().slice(0, 200)
  }
  return `AI coach request failed (${status})`
}

function extractAssistantText(data: unknown): string {
  const d = data as {
    content?: AnthropicContentBlock[]
    error?: { message?: string }
  }
  if (d.error?.message) throw new Error(d.error.message)
  const parts = d.content?.filter((b) => b.type === 'text' && typeof b.text === 'string') ?? []
  const text = parts.map((b) => b.text).join('')
  if (!text.trim()) throw new Error('No text in assistant response')
  return text.trim()
}

export type AnthropicCoachContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image'
      source: { type: 'base64'; media_type: string; data: string }
    }

export type AnthropicCoachMessage = {
  role: 'user' | 'assistant'
  content: string | AnthropicCoachContentBlock[]
}

const COACH_IMAGE_ONLY_FALLBACK =
  'The athlete attached a photo (e.g. form check or meal). Use the image and their training context to give specific, practical feedback.'

function coachMessageToAnthropicContent(m: ChatMessage): string | AnthropicCoachContentBlock[] {
  const text = m.text.trim()
  if (!m.image) return text

  const blocks: AnthropicCoachContentBlock[] = [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: m.image.mediaType,
        data: m.image.data,
      },
    },
  ]
  if (text) blocks.push({ type: 'text', text })
  else if (m.role === 'user') blocks.push({ type: 'text', text: COACH_IMAGE_ONLY_FALLBACK })
  return blocks
}

function canMergeAnthropicContent(
  a: string | AnthropicCoachContentBlock[],
  b: string | AnthropicCoachContentBlock[],
): boolean {
  return typeof a === 'string' && typeof b === 'string'
}

/**
 * Maps chat UI roles to Anthropic message roles. Drops leading assistant-only turns (welcome).
 * Merges consecutive same-role text-only turns so the API gets user/assistant alternation.
 */
export function chatHistoryToAnthropicMessages(messages: ChatMessage[]): AnthropicCoachMessage[] {
  let i = 0
  while (i < messages.length && messages[i]!.role === 'model') i++
  const out: AnthropicCoachMessage[] = []
  for (; i < messages.length; i++) {
    const m = messages[i]!
    const role = m.role === 'user' ? 'user' : 'assistant'
    const content = coachMessageToAnthropicContent(m)
    const prev = out[out.length - 1]
    if (prev && prev.role === role && canMergeAnthropicContent(prev.content, content)) {
      prev.content = `${prev.content}\n\n${content}`
    } else {
      out.push({ role, content })
    }
  }
  return out
}

function coachTodaySystemPrefix(nowMs: number): string {
  return formatCoachTodayLine(new Date(nowMs))
}

const COACH_SYSTEM = `You are a strength and conditioning coach inside Lift. You have access to this athlete's full training history.

Your job is to help them train better — on their terms. People train differently. Some run 5/3/1. Some do bro splits. Some make it up as they go. Some do calisthenics. Some are powerlifters. Some just want to look good. You don't push a specific methodology. You ask, you listen, you adapt.

When they ask for help, lead with their data. Reference their actual lifts, their PRs, their recent sessions. If you don't have context, ask one clarifying question before giving advice.

Never use markdown. No bullet points, no headers, no asterisks. Write the way a good coach talks — direct, specific, no filler. Answers should be as long as they need to be and no longer.

When recommending sets, reps, or weight, always ask or infer their current style first. A powerlifter and a bodybuilder training the same movement need completely different guidance. If you don't know their style, ask.

You are not a cheerleader. Don't say "great question" or "awesome." Give real answers.`

const COACH_VISION_HINT = `- The athlete attached a photo in their latest message. Analyze the image (form, equipment setup, meals, body composition cues, etc.) and connect your answer to their goals and logged training.`

const COACH_PLAN_SYSTEM = `- Respond in plain conversational text only. No markdown, bullet points, numbered lists, headers, tables, dividers, or emoji.
- The athlete finished plan personalization — deliver a personalized workout plan now (weekly structure, example sessions, progression).
- You may use up to 10 short lines separated by line breaks for days or sessions. Still no bullets or emoji.
- End with one clear next step they can take in the app (e.g. log a session or add exercises to schedule).
- On the very last line only, output exactly: APEX_PLAN: id1, id2, id3 (comma-separated exercise slug ids from the app library for today's main session, e.g. bench-press, squat, lat-pulldown; up to 12 ids).`

export const PLAN_PERSONALIZATION_QUESTIONS = [
  {
    key: 'goal',
    text: "What's your main goal right now? (strength, muscle, fat loss, endurance)",
  },
  {
    key: 'days',
    text: 'How many days a week can you train?',
  },
  {
    key: 'equipment',
    text: 'What equipment do you have access to? (full gym, home, bodyweight only)',
  },
  {
    key: 'limitations',
    text: 'Any injuries or exercises to avoid?',
  },
] as const

export type PlanPersonalizationKey = (typeof PLAN_PERSONALIZATION_QUESTIONS)[number]['key']
export type PlanPersonalizationAnswers = Partial<Record<PlanPersonalizationKey, string>>

const PLAN_REQUEST_RE =
  /\b(workout\s+plan|training\s+plan|program\s+me|design\s+(me\s+)?(a\s+)?(workout|training)|build\s+(me\s+)?(a\s+)?(workout|training)|create\s+(a\s+)?(workout|training)|make\s+(me\s+)?(a\s+)?plan)\b/i

/** User asked to design or build a workout / training plan. */
export function isWorkoutPlanRequest(text: string): boolean {
  const t = text.trim()
  if (t === 'Design me a workout plan') return true
  return PLAN_REQUEST_RE.test(t)
}

function questionTextForKey(key: PlanPersonalizationKey): string {
  return PLAN_PERSONALIZATION_QUESTIONS.find((q) => q.key === key)!.text
}

function questionKeyForModelText(text: string): PlanPersonalizationKey | null {
  const t = text.trim()
  const hit = PLAN_PERSONALIZATION_QUESTIONS.find((q) => q.text === t)
  return hit?.key ?? null
}

/** Parse plan Q&A already stored in this chat session. */
export function extractPlanPersonalizationFromChat(messages: ChatMessage[]): PlanPersonalizationAnswers {
  const answers: PlanPersonalizationAnswers = {}
  let awaiting: PlanPersonalizationKey | null = null

  for (const m of messages) {
    if (m.role === 'model') {
      const key = questionKeyForModelText(m.text)
      if (key) awaiting = key
      continue
    }
    const t = m.text.trim()
    if (!t || isWorkoutPlanRequest(t) || isCoachUiPromptLine(t)) {
      continue
    }
    if (awaiting) {
      answers[awaiting] = t
      awaiting = null
    }
  }
  return answers
}

function isCompletePlanAnswers(
  answers: PlanPersonalizationAnswers,
): answers is Record<PlanPersonalizationKey, string> {
  return PLAN_PERSONALIZATION_QUESTIONS.every((q) => Boolean(answers[q.key]?.trim()))
}

function formatPlanAnswersForSystem(answers: PlanPersonalizationAnswers): string {
  const lines = PLAN_PERSONALIZATION_QUESTIONS.map((q) => {
    const v = answers[q.key]?.trim()
    return v ? `- ${q.key}: ${v}` : null
  }).filter(Boolean)
  if (!lines.length) return ''
  return `\n\nPlan personalization (this chat session):\n${lines.join('\n')}`
}

export type PlanPersonalizationFlow =
  | { type: 'normal' }
  | { type: 'ask'; questionText: string; pushUserBubble: boolean }
  | { type: 'generate'; answers: Record<PlanPersonalizationKey, string>; pushUserBubble: boolean }

/** Decide whether to ask the next plan question, generate a plan, or use normal coach chat. */
export function resolvePlanPersonalizationFlow(
  messages: ChatMessage[],
  userText: string,
  opts?: { hideUserBubble?: boolean },
): PlanPersonalizationFlow {
  const pending = userText.trim()
  if (!pending) return { type: 'normal' }

  const existing = extractPlanPersonalizationFromChat(messages)
  const lastModel = [...messages].reverse().find((m) => m.role === 'model')
  const awaitingKey = lastModel ? questionKeyForModelText(lastModel.text) : null

  if (awaitingKey) {
    const merged = { ...existing, [awaitingKey]: pending }
    const idx = PLAN_PERSONALIZATION_QUESTIONS.findIndex((q) => q.key === awaitingKey)
    if (idx < PLAN_PERSONALIZATION_QUESTIONS.length - 1) {
      return {
        type: 'ask',
        questionText: PLAN_PERSONALIZATION_QUESTIONS[idx + 1]!.text,
        pushUserBubble: true,
      }
    }
    if (isCompletePlanAnswers(merged)) {
      return { type: 'generate', answers: merged, pushUserBubble: true }
    }
  }

  if (isWorkoutPlanRequest(pending)) {
    if (isCompletePlanAnswers(existing)) {
      return {
        type: 'generate',
        answers: existing,
        pushUserBubble: !opts?.hideUserBubble,
      }
    }
    const firstMissing = PLAN_PERSONALIZATION_QUESTIONS.find((q) => !existing[q.key]?.trim())
    return {
      type: 'ask',
      questionText: firstMissing
        ? questionTextForKey(firstMissing.key)
        : PLAN_PERSONALIZATION_QUESTIONS[0]!.text,
      pushUserBubble: !opts?.hideUserBubble,
    }
  }

  return { type: 'normal' }
}

export type CoachCompleteOptions = {
  mode?: 'default' | 'workout_plan'
  planAnswers?: Record<PlanPersonalizationKey, string>
  maxTokens?: number
  /** When set, merges Supabase mood logs with local logs for coach context. */
  userId?: string
}

export async function claudeCoachComplete(
  state: AppPersisted,
  chatHistory: ChatMessage[],
  options: CoachCompleteOptions = {},
): Promise<string> {
  const messages = chatHistoryToAnthropicMessages(chatHistory)
  if (messages.length === 0 || messages[messages.length - 1]!.role !== 'user') {
    throw new Error('Coach conversation must end with a user message.')
  }
  const lastContent = messages[messages.length - 1]!.content
  const lastHasImage =
    Array.isArray(lastContent) && lastContent.some((b) => b.type === 'image')
  const sessionAnswers = extractPlanPersonalizationFromChat(chatHistory)
  const planAnswers = options.planAnswers ?? sessionAnswers
  const isPlan = options.mode === 'workout_plan' && isCompletePlanAnswers(planAnswers)
  const nowMs = Date.now()
  const todayLine = coachTodaySystemPrefix(nowMs)
  const coachContext = await resolveCoachContextBlock(state, {
    userId: options.userId,
    nowMs,
  })
  const planBlock = formatPlanAnswersForSystem(planAnswers)
  const modeInstruction = trainingModeCoachInstruction(
    scheduledTrainingModeForDay(state.schedule, dateKey(new Date(nowMs))),
  )
  const cycleInstruction = cycleCoachInstruction(state, dateKey(new Date(nowMs)))
  const visionBlock = lastHasImage && !isPlan ? `\n${COACH_VISION_HINT}` : ''
const maxTokens = options.maxTokens ?? (isPlan ? 1200 : lastHasImage ? 800 : 600)
  const staticSystemText = isPlan ? COACH_PLAN_SYSTEM : COACH_SYSTEM
  const dynamicSystemText = isPlan
    ? `${todayLine}${planBlock}${modeInstruction}${cycleInstruction}\n\n--- Athlete context ---\n${coachContext}`
    : `${todayLine}${visionBlock}${planBlock}${modeInstruction}${cycleInstruction}\n\n--- Athlete context (updated each request) ---\n${coachContext}`
  const requestBody = {
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    system: [
      { type: 'text', text: staticSystemText, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: dynamicSystemText },
    ],
    messages,
  }

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-beta': ANTHROPIC_BETA,
    },
    body: JSON.stringify(requestBody),
  })

  const rawText = await res.text()
  let data: unknown = {}
  try {
    data = rawText ? JSON.parse(rawText) : {}
  } catch (parseErr) {
    console.error('[Apex Coach] failed to parse API response JSON', parseErr, rawText.slice(0, 800))
  }

  if (!res.ok) {
    console.error('[Apex Coach] API error', {
      status: res.status,
      statusText: res.statusText,
      body: data,
      raw: rawText.slice(0, 800),
      messageCount: messages.length,
      lastRole: messages[messages.length - 1]?.role,
    })
    throw new Error(formatAnthropicApiError(res.status, data, rawText))
  }

  return sanitizeCoachBubbleText(extractAssistantText(data))
}

export type DailyMotivationInput = {
  displayName: string
  streak: number
  daysTrainedThisWeek: number
  lastPrExercise: string
  lastPrWeight: string
  prsThisWeek: string[]
  volumeTrend: string
  setsLoggedThisWeek: number
  isRestDayToday: boolean
  /** Last up to 7 daily lines (prior days) so the model avoids repetition. */
  recentMotivations: string[]
  /** Rotate style: data, mindset, recovery, performance, encouragement. */
  styleHint: string
  todayDateKey: string
}

const DAILY_MOTIVATION_STYLES = [
  'data-driven observation tied to their numbers',
  'mindset coaching — process and consistency',
  'recovery advice — sleep, deload, or post-workout mood',
  'performance insight — progression or technique focus',
  'straight encouragement without repeating data points',
] as const

function dailyMotivationStyleHint(dateKey: string): string {
  let h = 0
  for (let i = 0; i < dateKey.length; i++) h = (h * 31 + dateKey.charCodeAt(i)) >>> 0
  return DAILY_MOTIVATION_STYLES[h % DAILY_MOTIVATION_STYLES.length]!
}

export function buildDailyMotivationInput(
  state: AppPersisted,
  streak: number,
  nowMs: number = Date.now(),
  recentMotivations: string[] = [],
  isRestDayToday = false,
): DailyMotivationInput {
  const todayDateKey = dateKey(new Date(nowMs))
  const weekStart = weekStartMonday(new Date(nowMs)).getTime()
  const displayName = state.settings.displayName.trim() || 'there'
  const prLogs = [...state.setLogs].filter((l) => l.isPr).sort((a, b) => b.at - a.at)
  const last = prLogs[0]
  let lastPrExercise = 'none yet'
  let lastPrWeight = ''
  if (last) {
    lastPrExercise = last.exerciseName
    if (last.kind === 'weighted') {
      lastPrWeight = last.bodyweight
        ? `bodyweight × ${last.reps} reps`
        : `${last.weight ?? 0} ${state.settings.unit} × ${last.reps} reps`
    } else {
      lastPrWeight = `${last.durationSec} second hold`
    }
  }
  const prsThisWeek = prLogs
    .filter((l) => l.at >= weekStart)
    .slice(0, 5)
    .map((l) => {
      if (l.kind === 'weighted') {
        const load = l.bodyweight
          ? `BW × ${l.reps}`
          : `${l.weight ?? 0} ${state.settings.unit} × ${l.reps}`
        return `${l.exerciseName} (${load})`
      }
      return `${l.exerciseName} (${l.durationSec}s)`
    })
  const workoutDays = workoutDaysFromLogs(state.setLogs)
  let daysTrainedThisWeek = 0
  for (const dk of workoutDays) {
    const t = parseDateKey(dk).getTime()
    if (t >= weekStart) daysTrainedThisWeek++
  }
  let setsLoggedThisWeek = 0
  for (const l of state.setLogs) {
    if (l.at >= weekStart) setsLoggedThisWeek++
  }
  const series = weeklyVolumeSeries(state, nowMs)
  const thisWeek = series[series.length - 1]?.volume ?? 0
  const lastWeek = series[series.length - 2]?.volume ?? 0
  let volumeTrend = `this week ${thisWeek.toLocaleString()} lb total volume vs last week ${lastWeek.toLocaleString()} lb`
  if (lastWeek > 0) {
    const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100)
    volumeTrend += ` (${pct >= 0 ? '+' : ''}${pct}% change)`
  } else if (thisWeek > 0) {
    volumeTrend += ' (no volume logged last week)'
  }
  return {
    displayName,
    streak,
    daysTrainedThisWeek,
    lastPrExercise,
    lastPrWeight,
    prsThisWeek,
    volumeTrend,
    setsLoggedThisWeek,
    isRestDayToday,
    recentMotivations,
    styleHint: dailyMotivationStyleHint(todayDateKey),
    todayDateKey,
  }
}

const DAILY_MOTIVATION_SYSTEM = `Write exactly one sentence of daily motivation for this lifter.

Rules:
- Address them by first name when a name is provided (first word of display name).
- Sound like it was written only for them — cite real numbers from their data (PRs, streak, days trained, volume).
- Use their real training data when the chosen style calls for it; do not invent numbers.
- Today's assigned style is given in the user message — follow that angle only.
- Do not repeat themes, metaphors, or phrases from the "Previous daily lines" list (prior days). Use fresh wording.
- Do not repeat themes or phrases from previous days.
- Vary across days between: data-driven observations, mindset coaching, recovery advice, performance insights, and encouragement.
- Never sign as a coach, never mention "Coach Mara", "Apex Method", or any brand attribution.
- Be direct and specific, not generic. No quotes, no hashtags, no exclamation marks.`

function sanitizeDailyMotivation(text: string): string {
  return text
    .replace(/["'#]/g, '')
    .replace(/!/g, '')
    .replace(/\s*[-–—]\s*Coach Mara.*$/i, '')
    .replace(/\s*Coach Mara[^.]*\.?/gi, '')
    .replace(/\s*Apex Method[^.]*\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function fetchDailyMotivation(input: DailyMotivationInput): Promise<string> {
  const prior =
    input.recentMotivations.length > 0
      ? input.recentMotivations.map((line, i) => `${i + 1}. ${line}`).join('\n')
      : '(none — first motivation stored)'
  const firstName = input.displayName.split(/\s+/)[0] || input.displayName
  const user = [
    `Date: ${input.todayDateKey}`,
    `Display name: ${input.displayName} (address as ${firstName})`,
    `Today's style: ${input.styleHint}`,
    `Calendar today: ${input.isRestDayToday ? 'rest day scheduled' : 'workout day scheduled'}`,
    `Training streak: ${input.streak} consecutive day(s)`,
    `Days with logged work this week: ${input.daysTrainedThisWeek}`,
    `Sets logged this week: ${input.setsLoggedThisWeek}`,
    `Most recent PR: ${input.lastPrExercise}${input.lastPrWeight ? ` — ${input.lastPrWeight}` : ''}`,
    `PRs this week: ${input.prsThisWeek.length ? input.prsThisWeek.join('; ') : 'none yet'}`,
    `Volume trend: ${input.volumeTrend}`,
    '',
    'Previous daily lines (do not echo these themes or phrases):',
    prior,
  ].join('\n')
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-beta': ANTHROPIC_BETA,
    },
    body: JSON.stringify({
      model: CLAUDE_FAST_MODEL,
      max_tokens: 120,
      system: [
        { type: 'text', text: DAILY_MOTIVATION_SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: coachTodaySystemPrefix(Date.now()) },
      ],
      messages: [{ role: 'user', content: user }],
    }),
  })
  const rawText = await res.text()
  let data: unknown = {}
  try {
    data = rawText ? JSON.parse(rawText) : {}
  } catch {
    /* fall through */
  }
  if (!res.ok) {
    throw new Error(formatAnthropicApiError(res.status, data, rawText))
  }
  const text = sanitizeDailyMotivation(sanitizeCoachBubbleText(extractAssistantText(data)))
  if (!text) throw new Error('Empty motivation response')
  touchAiIntelligenceUpdated()
  return text
}

export type ParsedMeal = {
  name: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
}

function normalizeParsedMeal(raw: unknown): ParsedMeal {
  const o = raw as Record<string, unknown>
  const name = typeof o.name === 'string' ? o.name.trim().slice(0, 120) : ''
  const num = (k: string) => {
    const v = o[k]
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0
  }
  if (!name) throw new Error('Could not parse meal name')
  return {
    name,
    calories: num('calories'),
    proteinG: num('proteinG'),
    carbsG: num('carbsG'),
    fatG: num('fatG'),
  }
}

export async function claudeParseMeal(rawText: string): Promise<ParsedMeal> {
  const text = rawText.trim().slice(0, 2000)
  if (!text) throw new Error('Describe what you ate first')
  const user = `Estimate nutrition for what the user ate. Return ONLY valid JSON:
{"name":string,"calories":number,"proteinG":number,"carbsG":number,"fatG":number}

Use reasonable estimates for typical portions. Round macros to whole grams and calories to whole numbers.
Meal description:
${text}`
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: CLAUDE_FAST_MODEL,
      max_tokens: 512,
      system: 'You return only valid JSON, no markdown fences. Estimate macros realistically.',
      messages: [{ role: 'user', content: user }],
    }),
  })
  const raw = await res.text()
  let data: unknown = {}
  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    /* fall through */
  }
  if (!res.ok) {
    throw new Error(formatAnthropicApiError(res.status, data, raw))
  }
  const assistant = extractAssistantText(data)
  const jsonStart = assistant.indexOf('{')
  const jsonEnd = assistant.lastIndexOf('}')
  if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error('No JSON in model response')
  return normalizeParsedMeal(JSON.parse(assistant.slice(jsonStart, jsonEnd + 1)))
}

export async function claudeOneSentenceWorkoutSummary(
  state: AppPersisted,
  sessionPayload: string,
): Promise<string> {
  const user = `Write exactly one short sentence summarizing this gym session for the user's calendar. Plain English, no quotes.\n\nSession details:\n${sessionPayload}`
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: CLAUDE_FAST_MODEL,
      max_tokens: 256,
      system: `${coachTodaySystemPrefix(Date.now())}\n\nYou output a single calendar-friendly sentence only. No quotes.\n\n--- Athlete context ---\n${await resolveCoachContextBlock(state, { nowMs: Date.now() })}`,
      messages: [{ role: 'user', content: user }],
    }),
  })
  const rawText = await res.text()
  let data: unknown = {}
  try {
    data = rawText ? JSON.parse(rawText) : {}
  } catch (parseErr) {
    console.error('[Apex Coach] failed to parse workout summary response', parseErr, rawText.slice(0, 800))
  }
  if (!res.ok) {
    console.error('[Apex Coach] workout summary API error', {
      status: res.status,
      body: data,
      raw: rawText.slice(0, 800),
    })
    throw new Error(formatAnthropicApiError(res.status, data, rawText))
  }
  return sanitizeCoachBubbleText(extractAssistantText(data))
}

export async function claudeParseImport(
  state: AppPersisted,
  rawText: string,
  options?: { signal?: AbortSignal },
): Promise<unknown> {
  const hasApiKey = Boolean(
    import.meta.env.VITE_ANTHROPIC_API_KEY?.trim() || import.meta.env.VITE_CLAUDE_API_KEY?.trim(),
  )
  if (import.meta.env.DEV) console.log('[Apex Parser] preparing Anthropic parse request', { hasApiKey })
  const atMs = Date.now()
  const unit = state.settings.unit
  const user = `You parse workout notes in any format into JSON for an app. Return ONLY valid JSON with this shape:
{"setLogs": [...], "bodyweightLogs": [...], "cardioEntries": [...], "schedule": [...] }
Each weighted set log (one row per exercise): {"kind":"weighted","exerciseId":string,"exerciseName":string,"muscleGroup":string,"at":number,"isPr":false,"note":"","bodyweight":false,"weight":number|null,"reps":number,"sets":number}
- "sets" = how many sets performed; "reps" = reps per set; "weight" = load per set in ${unit} (null if bodyweight).
- exerciseId must be a slug id (lowercase, hyphens), e.g. bench-press for Bench Press, squat for Squat. Pick the closest built-in id.
- "at" = Unix timestamp in milliseconds for when that workout actually happened. If the notes mention a date (e.g. "June 15", "last Monday", "2024-03-10"), parse it and use the correct timestamp. If no date is given for a session, use ${atMs} (now). Never use 0.
- Today's date for reference: ${new Date(atMs).toDateString()}.
Timed: {"kind":"timed","durationSec":number,"exerciseId":...,"exerciseName":...,"muscleGroup":...,"at":number,"isPr":false,"note":""}
Cardio entries: {"name":string,"durationMinutes":number|null,"at":number}
Use durationMinutes for cardio (not seconds). Use empty arrays if missing. MuscleGroup one of Chest,Back,Legs,Shoulders,Arms,Core,Cardio,Stretches.
Raw notes:
${rawText.slice(0, 12000)}`
  const coachContext = await resolveCoachContextBlock(state, { nowMs: Date.now() })
  const requestBody = {
    model: CLAUDE_FAST_MODEL,
    max_tokens: 8192,
    system: `${coachTodaySystemPrefix(Date.now())}\n\nYou return only valid JSON, no markdown fences.\n\n--- Athlete context ---\n${coachContext}`,
    messages: [{ role: 'user', content: user }],
  }
  if (import.meta.env.DEV) console.log('[Apex Parser] sending Anthropic fetch', { model: CLAUDE_FAST_MODEL })
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(requestBody),
    signal: options?.signal,
  })
  if (import.meta.env.DEV) console.log('[Apex Parser] Anthropic fetch finished', { status: res.status, ok: res.ok })
  const importRaw = await res.text()
  let data: unknown = {}
  try {
    data = importRaw ? JSON.parse(importRaw) : {}
  } catch (parseErr) {
    console.error('[Apex Coach] failed to parse import response', parseErr, importRaw.slice(0, 800))
  }
  if (!res.ok) {
    console.error('[Apex Coach] import API error', {
      status: res.status,
      body: data,
      raw: importRaw.slice(0, 800),
    })
    throw new Error(formatAnthropicApiError(res.status, data, importRaw))
  }
  const text = extractAssistantText(data)
  const jsonStart = text.indexOf('{')
  const jsonEnd = text.lastIndexOf('}')
  if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error('No JSON in model response')
  return JSON.parse(text.slice(jsonStart, jsonEnd + 1))
}

export async function claudeExerciseFormTips(exerciseName: string): Promise<ExerciseHelp> {
  const name = exerciseName.trim().slice(0, 120)
  if (!name) throw new Error('Enter an exercise name first')
  const user = `Exercise name: ${name}

Return ONLY valid JSON:
{"formTips":string,"commonMistakes":string,"beginnerAdvice":string}

Each field: 2–4 short plain sentences. No markdown, bullets, or emoji. Be specific to this movement.`
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: CLAUDE_FAST_MODEL,
      max_tokens: 720,
      system: `${coachTodaySystemPrefix(Date.now())}\n\nYou write concise strength-training form guidance. Return only valid JSON with the three requested keys.`,
      messages: [{ role: 'user', content: user }],
    }),
  })
  const rawText = await res.text()
  let data: unknown = {}
  try {
    data = rawText ? JSON.parse(rawText) : {}
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(formatAnthropicApiError(res.status, data, rawText))
  }
  const text = extractAssistantText(data)
  const jsonStart = text.indexOf('{')
  const jsonEnd = text.lastIndexOf('}')
  if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error('No JSON in model response')
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>
  const formTips = String(parsed.formTips ?? '').trim()
  const commonMistakes = String(parsed.commonMistakes ?? '').trim()
  const beginnerAdvice = String(parsed.beginnerAdvice ?? '').trim()
  if (!formTips || !commonMistakes || !beginnerAdvice) {
    throw new Error('Incomplete tips in model response')
  }
  return {
    formTips,
    commonMistakes,
    beginnerAdvice,
    diagramDescription: `${name} — custom exercise`,
  }
}

const CALENDAR_PLAN_MODEL = 'claude-sonnet-4-6'

export type CalendarPlanSuggestion = {
  day: string
  workoutType: string
  time: string
}

export type CalendarWeekPlanJson = {
  suggestedDays: CalendarPlanSuggestion[]
}

async function anthropicMessagesRequest(
  model: string,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  const rawText = await res.text()
  let data: unknown = {}
  try {
    data = rawText ? JSON.parse(rawText) : {}
  } catch (parseErr) {
    console.error('[Apex Coach] failed to parse API response JSON', parseErr, rawText.slice(0, 800))
  }
  if (!res.ok) {
    throw new Error(formatAnthropicApiError(res.status, data, rawText))
  }
  return extractAssistantText(data)
}

function parseJsonObjectFromModelText(text: string): unknown {
  const jsonStart = text.indexOf('{')
  const jsonEnd = text.lastIndexOf('}')
  if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error('No JSON in model response')
  return JSON.parse(text.slice(jsonStart, jsonEnd + 1))
}

function formatScheduleForCalendarPlan(state: AppPersisted): string {
  return state.schedule
    .map((d) => {
      const wd = parseDateKey(d.dateKey).toLocaleDateString('en-US', { weekday: 'long' })
      const name = d.workoutName.trim() || 'Rest'
      const note = d.notes.trim() ? ` — ${d.notes.trim()}` : ''
      return `${wd} (${d.dateKey}): ${name}${note}`
    })
    .join('\n')
}

/** AI week plan from Google Calendar busy times + current schedule + fitness goal. */
export async function claudePlanWeekFromCalendar(
  state: AppPersisted,
  calendarEvents: PrimaryCalendarEvent[],
  fitnessGoal: string,
  todayKey: string,
): Promise<CalendarWeekPlanJson> {
  const eventLines = calendarEvents.length
    ? calendarEvents.map((e) => `${e.start} → ${e.end}: ${e.summary}`).join('\n')
    : '(no events in the next 7 days)'

  const nowMs = Date.now()
  const todayLine = formatCoachTodayLine(new Date(nowMs))
  const system = `${todayLine}\n\nYou plan workouts for the Lift app. Return ONLY valid JSON (no markdown fences) in this exact shape:
{"suggestedDays":[{"day":"monday","workoutType":"Push","time":"7:00 AM"}]}
Rules:
- Include exactly one entry per weekday (monday through sunday) for the athlete's current schedule week.
- day must be the lowercase full English weekday name.
- workoutType is a short label (Push, Pull, Legs, Upper, Lower, Full body, Cardio, or Rest).
- time is a suggested start time that avoids calendar conflicts (e.g. "7:00 AM"). Use "Rest day" for time when workoutType is Rest.`

  const user = `${todayLine}
Calendar date key: ${todayKey}
Fitness goal: ${fitnessGoal.trim() || '(not set)'}

Google Calendar events (next 7 days):
${eventLines}

Current weekly schedule in the app:
${formatScheduleForCalendarPlan(state)}

Analyze busy times and suggest optimal workout days and times that avoid conflicts. Align with the fitness goal.`

  const text = await anthropicMessagesRequest(CALENDAR_PLAN_MODEL, system, user, 1024)
  const parsed = parseJsonObjectFromModelText(text) as CalendarWeekPlanJson
  if (!parsed || !Array.isArray(parsed.suggestedDays)) {
    throw new Error('Invalid plan JSON from AI')
  }
  return {
    suggestedDays: parsed.suggestedDays.map((row) => ({
      day: String(row.day ?? '').trim(),
      workoutType: String(row.workoutType ?? '').trim(),
      time: String(row.time ?? '').trim(),
    })),
  }
}

const COACH_SUGGESTION_SEEDS = [
  'What should I work on today?',
  'Review my progress this week',
  'Design me a workout plan',
  'How should I fix a plateau?',
  'Am I recovering well enough?',
  'What muscles am I neglecting?',
  'How do I improve my bench press?',
  'When should I take a deload week?',
  'What does my weekly volume look like?',
  'Give me advice on my training balance',
  'How can I add more intensity this week?',
  'What should I do on rest days?',
] as const

function hashDateKey(todayKey: string): number {
  let h = 2166136261
  for (let i = 0; i < todayKey.length; i++) {
    h ^= todayKey.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const a = [...arr]
  let s = seed || 1
  function rand() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/** Context-aware suggestions: prioritize prompts most relevant to the user's current state. */
export function dailyCoachSuggestions(todayDateKey: string, state?: AppPersisted): string[] {
  if (!state) return seededShuffle(COACH_SUGGESTION_SEEDS, hashDateKey(todayDateKey))

  const seed = hashDateKey(todayDateKey)
  const priority: string[] = []

  // Deload: suggest talking about it if active or due
  const weekStartStr = weekStartMonday(new Date()).toISOString().split('T')[0]
  const isDeloadActive = state.deloadActiveWeekStart === weekStartStr
  if (isDeloadActive) {
    priority.push('How do I make the most of a deload week?')
  }

  // Streak: if they have a streak going, surface recovery awareness
  const workoutDays = workoutDaysFromLogs(state.setLogs)
  const streakDays = workoutDays.size
  if (streakDays >= 5) {
    priority.push('Am I recovering well enough?')
  }

  // If nothing logged today, push "what should I work on today"
  const todayLogs = state.setLogs.filter((l) => dateKey(new Date(l.at)) === todayDateKey)
  if (todayLogs.length === 0) {
    priority.push('What should I work on today?')
  }

  // Check muscle balance: if setLogs show heavy push/pull imbalance, surface it
  const muscleCounts: Record<string, number> = {}
  const recentCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
  for (const l of state.setLogs) {
    if (l.at >= recentCutoff) {
      muscleCounts[l.muscleGroup] = (muscleCounts[l.muscleGroup] ?? 0) + 1
    }
  }
  const back = muscleCounts['Back'] ?? 0
  const chest = muscleCounts['Chest'] ?? 0
  const legs = muscleCounts['Legs'] ?? 0
  const shoulders = muscleCounts['Shoulders'] ?? 0
  if (Math.abs(back - chest) > 6 || legs < 2 || shoulders < 2) {
    priority.push('What muscles am I neglecting?')
  }

  // Weekly progress review — push mid/late week
  const dayOfWeek = new Date().getDay() // 0=Sun
  if (dayOfWeek >= 4) {
    priority.push('Review my progress this week')
  }

  // Fill remaining slots from shuffled seeds (deduplicate)
  const seen = new Set(priority)
  const filler = seededShuffle(COACH_SUGGESTION_SEEDS, seed).filter((s) => !seen.has(s))
  return [...priority, ...filler].slice(0, COACH_SUGGESTION_SEEDS.length)
}
