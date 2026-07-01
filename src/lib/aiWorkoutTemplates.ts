import { EXERCISES } from '../data/exercises'
import type { AppPersisted, ScheduleDay } from '../types'
import { buildApexCoachContext, truncateCoachContextBlock } from './coachContext'
import { parseDateKey } from './dates'
import { muscleTrainingBalanceLines } from './coachInsights'
import { resolveImportExercise } from './parseWorkoutImport'
import { computePersonalRecords } from './personalRecords'

const ANTHROPIC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/anthropic-proxy`
const ANTHROPIC_VERSION = '2023-06-01'
const TEMPLATE_MODEL = 'claude-sonnet-4-6'

const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

export type AiTemplateExercise = {
  exerciseId: string
  sets: number
  reps: string
}

export type AiTemplateDay = {
  weekday: string
  sessionName: string
  exercises: AiTemplateExercise[]
}

export type AiWeeklyWorkoutTemplate = {
  id: string
  name: string
  subtitle: string
  days: AiTemplateDay[]
}

function formatAnthropicApiError(status: number, data: unknown, rawText: string): string {
  const err = (data as { error?: { message?: string; type?: string } })?.error
  const apiMsg = err?.message?.trim() ?? ''
  if (err?.type === 'not_found_error' && /^model:\s*/i.test(apiMsg)) {
    return `AI templates unavailable (model "${TEMPLATE_MODEL}" not found). Check your API key and model access.`
  }
  if (apiMsg && !/^model:\s*/i.test(apiMsg)) return apiMsg
  if (rawText.trim() && !/^model:\s*/i.test(rawText.trim())) {
    return rawText.trim().slice(0, 200)
  }
  return `AI templates request failed (${status})`
}

function parseJsonObjectFromModelText(text: string): unknown {
  const jsonStart = text.indexOf('{')
  const jsonEnd = text.lastIndexOf('}')
  if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error('No JSON in model response')
  return JSON.parse(text.slice(jsonStart, jsonEnd + 1))
}

function extractAssistantText(data: unknown): string {
  const d = data as { content?: { type: string; text?: string }[]; error?: { message?: string } }
  if (d.error?.message) throw new Error(d.error.message)
  const parts = d.content?.filter((b) => b.type === 'text' && typeof b.text === 'string') ?? []
  const text = parts.map((b) => b.text ?? '').join('\n').trim()
  if (!text) throw new Error('Empty response from AI')
  return text
}

export function normalizeWeekdayKey(day: string): string {
  const t = day.trim().toLowerCase()
  const map: Record<string, string> = {
    mon: 'monday',
    tue: 'tuesday',
    wed: 'wednesday',
    thu: 'thursday',
    fri: 'friday',
    sat: 'saturday',
    sun: 'sunday',
  }
  return map[t] ?? t
}

export function weekdayKeyFromDateKey(dateKeyVal: string): string {
  return parseDateKey(dateKeyVal).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
}

function exerciseCatalogForPrompt(): string {
  return EXERCISES.slice(0, 72)
    .map((e) => `${e.id}`)
    .join(', ')
}

function sanitizeExercise(
  raw: { exerciseId?: string; id?: string; name?: string; sets?: number; reps?: string },
  customExercises: AppPersisted['customExercises'],
): AiTemplateExercise | null {
  const token = String(raw.exerciseId ?? raw.id ?? raw.name ?? '').trim()
  if (!token) return null
  const resolved = resolveImportExercise(token, undefined, customExercises)
  if (!resolved) return null
  const sets = Math.min(8, Math.max(1, Math.round(Number(raw.sets) || 3)))
  const reps = String(raw.reps ?? '8-10').trim().slice(0, 12) || '8-10'
  return { exerciseId: resolved.id, sets, reps }
}

export function sanitizeAiWeeklyTemplates(
  raw: unknown,
  state: AppPersisted,
): AiWeeklyWorkoutTemplate[] {
  const root = raw as { templates?: unknown[] }
  if (!root?.templates || !Array.isArray(root.templates)) {
    throw new Error('Invalid templates JSON from AI')
  }

  const out: AiWeeklyWorkoutTemplate[] = []
  for (const t of root.templates.slice(0, 3)) {
    const row = t as {
      id?: string
      name?: string
      subtitle?: string
      days?: unknown[]
    }
    const name = String(row.name ?? '').trim()
    if (!name) continue

    const dayMap = new Map<string, AiTemplateDay>()
    for (const d of row.days ?? []) {
      const dr = d as {
        weekday?: string
        sessionName?: string
        exercises?: unknown[]
      }
      const weekday = normalizeWeekdayKey(String(dr.weekday ?? ''))
      if (!WEEKDAYS.includes(weekday as (typeof WEEKDAYS)[number])) continue

      const sessionName = String(dr.sessionName ?? '').trim() || 'Workout'
      const isRest = /^rest$/i.test(sessionName)
      const exercises: AiTemplateExercise[] = []
      if (!isRest) {
        for (const ex of dr.exercises ?? []) {
          const parsed = sanitizeExercise(
            ex as { exerciseId?: string; id?: string; name?: string; sets?: number; reps?: string },
            state.customExercises,
          )
          if (parsed) exercises.push(parsed)
        }
      }

      dayMap.set(weekday, { weekday, sessionName: isRest ? 'Rest' : sessionName, exercises })
    }

    const days: AiTemplateDay[] = WEEKDAYS.map((weekday) => {
      const hit = dayMap.get(weekday)
      return (
        hit ?? {
          weekday,
          sessionName: 'Rest',
          exercises: [],
        }
      )
    })

    const hasWorkout = days.some((d) => d.exercises.length > 0)
    if (!hasWorkout) continue

    out.push({
      id: String(row.id ?? name).trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40) || `tpl-${out.length}`,
      name,
      subtitle: String(row.subtitle ?? '').trim().slice(0, 120),
      days,
    })
  }

  if (out.length < 1) throw new Error('AI returned no usable templates')
  return out
}

export function templatesCacheKey(state: AppPersisted): string {
  return `apex-ai-weekly-templates-${state.scheduleWeekStart}-${state.setLogs.length}`
}

export function readCachedAiTemplates(key: string): AiWeeklyWorkoutTemplate[] | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AiWeeklyWorkoutTemplate[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch {
    return null
  }
}

export function writeCachedAiTemplates(key: string, templates: AiWeeklyWorkoutTemplate[]): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(templates))
  } catch {
    /* ignore */
  }
}

export async function generateAiWeeklyWorkoutTemplates(
  state: AppPersisted,
  nowMs = Date.now(),
): Promise<AiWeeklyWorkoutTemplate[]> {
  const muscle = muscleTrainingBalanceLines(state, nowMs)
  const prs = computePersonalRecords(state.setLogs, state.settings.unit)
    .slice(0, 18)
    .map((r) => `${r.exerciseName}: ${r.detail}`)
    .join('\n')

  const athleteContext = truncateCoachContextBlock(buildApexCoachContext(state, nowMs)).slice(
    0,
    14_000,
  )

  const system = `You are an expert strength coach for the Lift app. Return ONLY valid JSON (no markdown).
Shape:
{"templates":[{"id":"ppl","name":"Push / Pull / Legs","subtitle":"one line","days":[{"weekday":"monday","sessionName":"Push","exercises":[{"exerciseId":"bench-press","sets":4,"reps":"6-8"}]}]}]}
Rules:
- Exactly 3 templates. Each must use a distinct split style (e.g. Push/Pull/Legs, Upper/Lower, Full Body).
- Each template must include exactly 7 days (monday through sunday). Use sessionName "Rest" and exercises [] for rest days.
- Personalize exercise selection, sets, and reps from the athlete data. Favor exercises they already train; include neglected muscle groups where appropriate.
- exerciseId MUST be from the allowed slug list only.
- Workout days: 4-6 exercises each. sets: integer 2-5. reps: string like "8-10", "5", or "12-15".
- Do not include markdown or commentary outside JSON.`

  const user = `Allowed exercise slugs (use only these ids):
${exerciseCatalogForPrompt()}

Most trained (4 wks): ${muscle.frequent}
Most neglected (4 wks): ${muscle.neglected}

Personal records:
${prs || '(none yet)'}

Athlete context:
${athleteContext}

Generate 3 weekly templates now.`

  let res: Response
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: TEMPLATE_MODEL,
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error('Network error — could not reach Anthropic. Check your connection and try again.')
    }
    throw e instanceof Error ? e : new Error('AI templates request failed')
  }

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

  try {
    const text = extractAssistantText(data)
    const parsed = parseJsonObjectFromModelText(text)
    return sanitizeAiWeeklyTemplates(parsed, state)
  } catch (e) {
    throw e instanceof Error ? e : new Error('Could not parse AI templates response')
  }
}

export function buildSchedulePatchesFromTemplate(
  template: AiWeeklyWorkoutTemplate,
  schedule: ScheduleDay[],
  hiddenExerciseIds: string[],
  customExercises: AppPersisted['customExercises'],
): { dateKey: string; patch: Partial<ScheduleDay> }[] {
  const hidden = new Set(hiddenExerciseIds)
  const byWeekday = new Map<string, AiTemplateDay>()
  for (const d of template.days) {
    byWeekday.set(normalizeWeekdayKey(d.weekday), d)
  }

  return schedule.map((slot) => {
    const weekday = weekdayKeyFromDateKey(slot.dateKey)
    const day = byWeekday.get(weekday)
    if (!day) return { dateKey: slot.dateKey, patch: {} }

    const isRest = /^rest$/i.test(day.sessionName) || day.exercises.length === 0
    const validIds = [...new Set(day.exercises.map((e) => e.exerciseId))].filter((id) => {
      if (hidden.has(id)) return false
      return Boolean(resolveImportExercise(id, undefined, customExercises))
    })

    return {
      dateKey: slot.dateKey,
      patch: {
        workoutName: isRest ? '' : day.sessionName,
        plannedExerciseIds: isRest ? [] : validIds,
        notes: isRest ? slot.notes : '',
      },
    }
  })
}

export function todayPlanIdsFromTemplate(
  template: AiWeeklyWorkoutTemplate,
  todayKey: string,
  hiddenExerciseIds: string[],
  customExercises: AppPersisted['customExercises'],
): string[] {
  const weekday = weekdayKeyFromDateKey(todayKey)
  const day = template.days.find((d) => normalizeWeekdayKey(d.weekday) === weekday)
  if (!day || /^rest$/i.test(day.sessionName) || !day.exercises.length) return []

  const hidden = new Set(hiddenExerciseIds)
  return [...new Set(day.exercises.map((e) => e.exerciseId))].filter((id) => {
    if (hidden.has(id)) return false
    return Boolean(resolveImportExercise(id, undefined, customExercises))
  })
}
