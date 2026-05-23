import { EXERCISE_BY_ID } from '../data/exercises'
import type { AppPersisted, ChatMessage, ExerciseHelp } from '../types'
import { dateKey, formatCoachTodayLine, parseDateKey, weekStartMonday } from './dates'
import { streakCurrent } from './achievements'
import { weeklyVolumeSeries } from './stats'
import type { PrimaryCalendarEvent } from './googleCalendar'
import { isCoachUiPromptLine, sanitizeCoachBubbleText } from './persist'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const CLAUDE_MODEL = 'claude-sonnet-4-6'

function getAnthropicApiKey(): string {
  const k =
    import.meta.env.VITE_ANTHROPIC_API_KEY?.trim() || import.meta.env.VITE_CLAUDE_API_KEY?.trim()
  if (!k)
    throw new Error(
      'Missing Anthropic API key. Add VITE_ANTHROPIC_API_KEY (or VITE_CLAUDE_API_KEY) to `.env` in the project root (same folder as vite.config.ts), then restart `npm run dev`.',
    )
  return k
}

/** Keep coach system block under a safe size so requests don’t fail on huge weekly logs. */
const COACH_CONTEXT_CHAR_CAP = 14_000

function truncateCoachContextBlock(ctx: string): string {
  if (ctx.length <= COACH_CONTEXT_CHAR_CAP) return ctx
  return `${ctx.slice(0, COACH_CONTEXT_CHAR_CAP)}\n\n(truncated — oldest lines omitted to stay within API limits.)`
}

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

/**
 * Maps chat UI roles to Anthropic message roles. Drops leading assistant-only turns (welcome).
 * Merges consecutive same-role turns so the API always gets strict user/assistant alternation.
 */
export function chatHistoryToAnthropicMessages(
  messages: ChatMessage[],
): { role: 'user' | 'assistant'; content: string }[] {
  let i = 0
  while (i < messages.length && messages[i]!.role === 'model') i++
  const out: { role: 'user' | 'assistant'; content: string }[] = []
  for (; i < messages.length; i++) {
    const m = messages[i]!
    const role = m.role === 'user' ? 'user' : 'assistant'
    const prev = out[out.length - 1]
    if (prev && prev.role === role) {
      prev.content = `${prev.content}\n\n${m.text}`
    } else {
      out.push({ role, content: m.text })
    }
  }
  return out
}

function inThisWeek(at: number, weekStart: Date): boolean {
  const we = new Date(weekStart)
  we.setDate(weekStart.getDate() + 7)
  const t = new Date(at)
  return t >= weekStart && t < we
}

function resolveExerciseName(state: AppPersisted, id: string): string {
  const custom = state.customExercises?.find((e) => e.id === id)
  if (custom) return custom.name
  return EXERCISE_BY_ID[id]?.name ?? id
}

function coachTodaySystemPrefix(nowMs: number): string {
  return formatCoachTodayLine(new Date(nowMs))
}

/** Coach context: goals, this week’s strength/timed & cardio logs, schedule, streak. */
export function buildApexCoachContext(state: AppPersisted, nowMs: number = Date.now()): string {
  const now = new Date(nowMs)
  const todayKey = dateKey(now)
  const goals = state.settings.fitnessGoals?.trim() || '(not set)'
  const name = state.settings.displayName?.trim() || 'Athlete'
  const ws = weekStartMonday(now)
  const weekSets = [...state.setLogs]
    .filter((l) => inThisWeek(l.at, ws))
    .sort((a, b) => a.at - b.at)
  const setLines = weekSets.map((l) => {
    if (l.kind === 'weighted') {
      const load = l.bodyweight ? 'bodyweight' : `${l.weight ?? 0} ${state.settings.unit}`
      return `${dateKey(new Date(l.at))} | ${l.muscleGroup} | ${l.exerciseName} | ${load} | reps:${l.reps} sets:${l.sets}${l.isPr ? ' PR' : ''}`
    }
    return `${dateKey(new Date(l.at))} | ${l.muscleGroup} | ${l.exerciseName} | timed:${l.durationSec}s${l.isPr ? ' PR' : ''}`
  })
  const cardioWeek = [...state.cardioEntries]
    .filter((c) => inThisWeek(c.at, ws))
    .sort((a, b) => a.at - b.at)
  const cardioLines = cardioWeek.map(
    (c) =>
      `${dateKey(new Date(c.at))} | ${c.name} | ${c.durationMinutes != null ? `${c.durationMinutes} min` : 'no duration'}`,
  )
  const sched = state.schedule
    .map((d) => {
      const planned = d.plannedExerciseIds
        .map((id) => resolveExerciseName(state, id))
        .filter(Boolean)
        .join(', ')
      const planPart = planned ? ` | planned: ${planned}` : ''
      return `${d.dateKey}: ${d.workoutName.trim() || 'Rest'}${planPart}${d.notes?.trim() ? ` — ${d.notes.trim()}` : ''}`
    })
    .join('\n')
  const streak = streakCurrent(state, nowMs)
  return [
    formatCoachTodayLine(now),
    `Calendar date key: ${todayKey}`,
    `Athlete name: ${name}`,
    `Fitness goals: ${goals}`,
    `Current training streak: ${streak} day(s)`,
    `Full weekly schedule (all days in current week plan):`,
    sched || '(empty)',
    `Strength / timed sets logged this week (Mon–Sun, ${dateKey(ws)} week start):`,
    setLines.length ? setLines.join('\n') : '(none yet)',
    `Cardio logged this week:`,
    cardioLines.length ? cardioLines.join('\n') : '(none)',
  ].join('\n')
}

const COACH_SYSTEM = `- Respond in plain conversational text only. Never use markdown, bullet points, numbered lists, headers, tables, dividers, or emoji.
- Keep every reply to a maximum of 3 sentences total. Be direct and specific.
- Sound like a knowledgeable friend, not a formal coach or essay writer.
- Always end with exactly one specific actionable suggestion the athlete can do next (training, recovery, or scheduling).

You are the Apex AI Coach in the Apex workout app. Use the athlete context below (today's date, full weekly schedule, goals, this week's logged work, streak). If data is sparse, say so briefly and still help.`

const COACH_PLAN_SYSTEM = `- Respond in plain conversational text only. No markdown, bullet points, numbered lists, headers, tables, dividers, or emoji.
- The athlete finished plan personalization — deliver a personalized workout plan now (weekly structure, example sessions, progression).
- You may use up to 10 short lines separated by line breaks for days or sessions. Still no bullets or emoji.
- End with one clear next step they can take in the app (e.g. log a session or add exercises to schedule).`

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
}

export async function claudeCoachComplete(
  state: AppPersisted,
  chatHistory: ChatMessage[],
  options: CoachCompleteOptions = {},
): Promise<string> {
  const apiKey = getAnthropicApiKey()
  const messages = chatHistoryToAnthropicMessages(chatHistory)
  if (messages.length === 0 || messages[messages.length - 1]!.role !== 'user') {
    throw new Error('Coach conversation must end with a user message.')
  }
  const sessionAnswers = extractPlanPersonalizationFromChat(chatHistory)
  const planAnswers = options.planAnswers ?? sessionAnswers
  const isPlan = options.mode === 'workout_plan' && isCompletePlanAnswers(planAnswers)
  const nowMs = Date.now()
  const todayLine = coachTodaySystemPrefix(nowMs)
  const coachContext = truncateCoachContextBlock(buildApexCoachContext(state, nowMs))
  const planBlock = formatPlanAnswersForSystem(planAnswers)
  const system = isPlan
    ? `${todayLine}\n\n${COACH_PLAN_SYSTEM}${planBlock}\n\n--- Athlete context ---\n${coachContext}`
    : `${todayLine}\n\n${COACH_SYSTEM}${planBlock}\n\n--- Athlete context (updated each request) ---\n${coachContext}`
  const maxTokens = options.maxTokens ?? (isPlan ? 720 : 320)
  const requestBody = {
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    system,
    messages,
  }

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
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
  streak: number
  lastPrExercise: string
  lastPrWeight: string
  volumeTrend: string
}

export function buildDailyMotivationInput(
  state: AppPersisted,
  streak: number,
  nowMs: number = Date.now(),
): DailyMotivationInput {
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
  return { streak, lastPrExercise, lastPrWeight, volumeTrend }
}

const DAILY_MOTIVATION_SYSTEM = `In one sentence, give a specific motivating observation about this user's recent training. Use their actual data. Be direct, not generic. No quotes, no hashtags, no exclamation marks.`

function sanitizeDailyMotivation(text: string): string {
  return text
    .replace(/["'#]/g, '')
    .replace(/!/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function fetchDailyMotivation(input: DailyMotivationInput): Promise<string> {
  const apiKey = getAnthropicApiKey()
  const user = [
    `Training streak: ${input.streak} day(s)`,
    `Most recent PR: ${input.lastPrExercise}${input.lastPrWeight ? ` — ${input.lastPrWeight}` : ''}`,
    `Volume trend: ${input.volumeTrend}`,
  ].join('\n')
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 120,
      system: `${coachTodaySystemPrefix(Date.now())}\n\n${DAILY_MOTIVATION_SYSTEM}`,
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
  const apiKey = getAnthropicApiKey()
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
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
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
  const apiKey = getAnthropicApiKey()
  const user = `Write exactly one short sentence summarizing this gym session for the user's calendar. Plain English, no quotes.\n\nSession details:\n${sessionPayload}`
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 256,
      system: `${coachTodaySystemPrefix(Date.now())}\n\nYou output a single calendar-friendly sentence only. No quotes.\n\n--- Athlete context ---\n${buildApexCoachContext(state, Date.now())}`,
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

export async function claudeParseImport(state: AppPersisted, rawText: string): Promise<unknown> {
  const apiKey = getAnthropicApiKey()
  const user = `You parse workout notes in any format into JSON for an app. Return ONLY valid JSON with this shape:
{"setLogs": [...], "bodyweightLogs": [...], "cardioEntries": [...], "schedule": [...] }
Each set log: {"kind":"weighted"|"timed","exerciseId":string,"exerciseName":string,"muscleGroup":string,"at":number ms optional 0 if unknown,"isPr":boolean,"note":string,"bodyweight":bool,"weight":number|null,"reps":number,"sets":number} OR timed: {"kind":"timed","durationSec":number,...}
Cardio entries: {"name":string,"durationMinutes":number|null,"at":number ms optional}
Use durationMinutes for cardio (not seconds). Use empty arrays if missing. MuscleGroup one of Chest,Back,Legs,Shoulders,Arms,Core,Cardio,Stretches.
Raw notes:
${rawText.slice(0, 12000)}`
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      system: `${coachTodaySystemPrefix(Date.now())}\n\nYou return only valid JSON, no markdown fences.\n\n--- Athlete context ---\n${buildApexCoachContext(state, Date.now())}`,
      messages: [{ role: 'user', content: user }],
    }),
  })
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
  const apiKey = getAnthropicApiKey()
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
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
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

const CALENDAR_PLAN_MODEL = 'claude-sonnet-4-20250514'

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
  const apiKey = getAnthropicApiKey()
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
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
  const system = `${todayLine}\n\nYou plan workouts for the Apex app. Return ONLY valid JSON (no markdown fences) in this exact shape:
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

/** Same three prompts, order shuffled by calendar day. */
export function dailyCoachSuggestions(todayDateKey: string): string[] {
  return seededShuffle(COACH_SUGGESTION_SEEDS, hashDateKey(todayDateKey))
}
