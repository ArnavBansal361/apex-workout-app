import type { AppPersisted, ChatMessage } from '../types'
import { dateKey, weekStartMonday } from './dates'
import { streakCurrent } from './achievements'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const CLAUDE_MODEL = 'claude-sonnet-4-20250514'

function getAnthropicApiKey(): string {
  const k = import.meta.env.VITE_ANTHROPIC_API_KEY?.trim()
  if (!k)
    throw new Error(
      'Missing VITE_ANTHROPIC_API_KEY. Add it to `.env` in the project root (same folder as vite.config.ts), not server/.env, then restart `npm run dev`.',
    )
  return k
}

type AnthropicContentBlock = { type: string; text?: string }

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

/** Maps chat UI roles to Anthropic message roles. Drops leading assistant-only turns (welcome). */
export function chatHistoryToAnthropicMessages(
  messages: ChatMessage[],
): { role: 'user' | 'assistant'; content: string }[] {
  let i = 0
  while (i < messages.length && messages[i]!.role === 'model') i++
  const out: { role: 'user' | 'assistant'; content: string }[] = []
  for (; i < messages.length; i++) {
    const m = messages[i]!
    out.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })
  }
  return out
}

function inThisWeek(at: number, weekStart: Date): boolean {
  const we = new Date(weekStart)
  we.setDate(weekStart.getDate() + 7)
  const t = new Date(at)
  return t >= weekStart && t < we
}

/** Coach context: goals, this week’s strength/timed & cardio logs, schedule, streak. */
export function buildApexCoachContext(state: AppPersisted, nowMs: number = Date.now()): string {
  const goals = state.settings.fitnessGoals?.trim() || '(not set)'
  const name = state.settings.displayName?.trim() || 'Athlete'
  const ws = weekStartMonday(new Date(nowMs))
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
    .map((d) => `${d.dateKey}: ${d.workoutName.trim() || 'Rest'}${d.notes?.trim() ? ` — ${d.notes.trim()}` : ''}`)
    .join('\n')
  const streak = streakCurrent(state)
  return [
    `Athlete name: ${name}`,
    `Fitness goals: ${goals}`,
    `Current training streak: ${streak} day(s)`,
    `Weekly schedule (current week anchor):`,
    sched || '(empty)',
    `Strength / timed sets logged this week (Mon–Sun, ${dateKey(ws)} week start):`,
    setLines.length ? setLines.join('\n') : '(none yet)',
    `Cardio logged this week:`,
    cardioLines.length ? cardioLines.join('\n') : '(none)',
  ].join('\n')
}

const COACH_SYSTEM = `You are the Apex AI Coach, a supportive fitness coach in the Apex workout app. Use the athlete context (goals, this week's training, schedule, streak). Keep replies concise, practical, and encouraging. If data is sparse, say so briefly and still help.`

export async function claudeCoachComplete(
  state: AppPersisted,
  chatHistory: ChatMessage[],
  maxTokens = 2048,
): Promise<string> {
  const apiKey = getAnthropicApiKey()
  const messages = chatHistoryToAnthropicMessages(chatHistory)
  if (messages.length === 0 || messages[messages.length - 1]!.role !== 'user') {
    throw new Error('Coach conversation must end with a user message.')
  }
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
      max_tokens: maxTokens,
      system: `${COACH_SYSTEM}\n\n--- Athlete context (updated each request) ---\n${buildApexCoachContext(state)}`,
      messages,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = (data as { error?: { message?: string } })?.error?.message
    throw new Error(err || `AI coach request failed (${res.status})`)
  }
  return extractAssistantText(data)
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
      system: `You output a single calendar-friendly sentence only. No quotes.\n\n--- Athlete context ---\n${buildApexCoachContext(state)}`,
      messages: [{ role: 'user', content: user }],
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = (data as { error?: { message?: string } })?.error?.message
    throw new Error(err || `AI coach request failed (${res.status})`)
  }
  return extractAssistantText(data)
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
      system: `You return only valid JSON, no markdown fences.\n\n--- Athlete context ---\n${buildApexCoachContext(state)}`,
      messages: [{ role: 'user', content: user }],
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = (data as { error?: { message?: string } })?.error?.message
    throw new Error(err || `AI coach request failed (${res.status})`)
  }
  const text = extractAssistantText(data)
  const jsonStart = text.indexOf('{')
  const jsonEnd = text.lastIndexOf('}')
  if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error('No JSON in model response')
  return JSON.parse(text.slice(jsonStart, jsonEnd + 1))
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
