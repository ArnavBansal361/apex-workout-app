import { EXERCISE_BY_ID } from '../data/exercises'
import type {
  AppPersisted,
  MuscleGroup,
  ReadinessLogEntry,
  SetLog,
  WorkoutMoodLogEntry,
} from '../types'
import { streakCurrent } from './achievements'
import { formatCoachTodayLine, dateKey, parseDateKey, weekStartMonday } from './dates'
import { computePersonalRecords } from './personalRecords'
import {
  formatSleepDuration,
  sleepWeeklyAverages,
  waterWeeklyAverageOz,
} from './stats'
import {
  averageRestBetweenSetsSec,
  averageWorkoutDurationMinutes,
  coachInjuryRiskSummary,
  deloadCoachLines,
  longevityCoachLines,
  moodTrendLines,
  muscleTrainingBalanceLines,
  todayScheduleCoachLine,
  trainingModeStreakLine,
  type WorkoutSessionModeRow,
} from './coachInsights'
import {
  fetchDeloadWeekHistory,
  fetchReadinessChecksForCoach,
  fetchWorkoutMoodCheckinsForCoach,
  fetchWorkoutSessionsForCoach,
  type DeloadWeekRecord,
} from './supabase'
import { cycleContextLines } from './cycleTracking'
import { trainingModeDef } from './trainingMode'
import { weeklyVolumeLoadByMuscleLbs } from './volumeStats'

const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000
const COACH_HISTORY_GROUPS: MuscleGroup[] = [
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
]

export const COACH_CONTEXT_CHAR_CAP = 32_000

function resolveExerciseName(state: AppPersisted, id: string): string {
  const custom = state.customExercises?.find((e) => e.id === id)
  if (custom) return custom.name
  return EXERCISE_BY_ID[id]?.name ?? id
}

function formatSetLogLine(l: SetLog, unit: 'lbs' | 'kg'): string {
  const dk = dateKey(new Date(l.at))
  if (l.kind === 'weighted') {
    const load = l.bodyweight ? 'bodyweight' : `${l.weight ?? 0} ${unit}`
    return `${dk} | ${l.muscleGroup} | ${l.exerciseName} | ${load} | reps:${l.reps} sets:${l.sets}${l.isPr ? ' PR' : ''}`
  }
  return `${dk} | ${l.muscleGroup} | ${l.exerciseName} | timed:${l.durationSec}s${l.isPr ? ' PR' : ''}`
}

function dateKeysSince(nowMs: number, days: number): string[] {
  const keys: string[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(nowMs)
    d.setDate(d.getDate() - i)
    keys.push(dateKey(d))
  }
  return keys
}

function mergeReadinessLogs(
  local: ReadinessLogEntry[],
  remote: ReadinessLogEntry[],
): ReadinessLogEntry[] {
  const byDay = new Map<string, ReadinessLogEntry>()
  for (const r of [...remote, ...local]) {
    const prev = byDay.get(r.dateKey)
    if (!prev || r.at >= prev.at) byDay.set(r.dateKey, r)
  }
  return [...byDay.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}

function mergeMoodLogs(
  local: WorkoutMoodLogEntry[],
  remote: WorkoutMoodLogEntry[],
): WorkoutMoodLogEntry[] {
  const byKey = new Map<string, WorkoutMoodLogEntry>()
  for (const m of [...remote, ...local]) {
    const k = `${m.dateKey}:${m.at}`
    byKey.set(k, m)
  }
  return [...byKey.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.at - b.at)
}

export type CoachContextExtras = {
  readinessLogs?: ReadinessLogEntry[]
  workoutMoodLogs?: WorkoutMoodLogEntry[]
  deloadHistory?: DeloadWeekRecord[]
  workoutSessions?: WorkoutSessionModeRow[]
}

export function todayReadinessLog(
  state: AppPersisted,
  dayKey: string,
  extras: CoachContextExtras = {},
): ReadinessLogEntry | null {
  const readiness = mergeReadinessLogs(
    state.readinessLogs ?? [],
    extras.readinessLogs ?? [],
  )
  return [...readiness].filter((r) => r.dateKey === dayKey).sort((a, b) => b.at - a.at)[0] ?? null
}

export type ResolvedCoachContext = {
  context: string
  todayReadiness: ReadinessLogEntry | null
}

export function buildApexCoachContext(
  state: AppPersisted,
  nowMs: number = Date.now(),
  extras: CoachContextExtras = {},
): string {
  const now = new Date(nowMs)
  const todayKey = dateKey(now)
  const cutoffMs = nowMs - FOUR_WEEKS_MS
  const goals = state.settings.fitnessGoals?.trim() || '(not set)'
  const name = state.settings.displayName?.trim() || 'Athlete'
  const unit = state.settings.unit
  const ws = weekStartMonday(now)

  const readiness = mergeReadinessLogs(
    state.readinessLogs ?? [],
    extras.readinessLogs ?? [],
  )
  const last7Keys = new Set(dateKeysSince(nowMs, 7))
  const readiness7 = readiness.filter((r) => last7Keys.has(r.dateKey))

  const allMoodLogs = mergeMoodLogs(state.workoutMoodLogs ?? [], extras.workoutMoodLogs ?? [])
  const moodLogs = allMoodLogs.filter((m) => parseDateKey(m.dateKey).getTime() >= cutoffMs)

  const volMap = weeklyVolumeLoadByMuscleLbs(state, nowMs)
  const volLines = COACH_HISTORY_GROUPS.map((g) => {
    const lbs = Math.round(volMap[g] ?? 0)
    return `${g}: ${lbs.toLocaleString()} lb`
  })

  const prs = computePersonalRecords(state.setLogs, unit).sort((a, b) =>
    a.exerciseName.localeCompare(b.exerciseName),
  )
  const prLines = prs.length
    ? prs.map((r) => `${r.exerciseName} (${r.muscleGroup}) | ${r.detail}`)
    : ['(none logged yet)']

  const sleepAvg = sleepWeeklyAverages(state, nowMs)
  const waterAvgOz = waterWeeklyAverageOz(state, nowMs)

  const trainingMode = state.gymSession.trainingMode
  const modeLines = trainingMode
    ? [
        `Current training mode: ${trainingModeDef(trainingMode).label}`,
        `Mode framing: ${trainingModeDef(trainingMode).framing}`,
      ]
    : ['Current training mode: (not set this session)']

  const historySets = [...state.setLogs]
    .filter((l) => l.at >= cutoffMs)
    .sort((a, b) => a.at - b.at)
  const setLines = historySets.map((l) => formatSetLogLine(l, unit))

  const cardioLines = [...state.cardioEntries]
    .filter((c) => c.at >= cutoffMs)
    .sort((a, b) => a.at - b.at)
    .map(
      (c) =>
        `${dateKey(new Date(c.at))} | ${c.name} | ${c.durationMinutes != null ? `${c.durationMinutes} min` : 'no duration'}`,
    )

  const todayReadiness = todayReadinessLog(state, todayKey, extras)

  const readinessLines = readiness7.length
    ? readiness7.map((r) => {
        const cog =
          r.cognitiveFatigue != null ? `cognitive_fatigue:${r.cognitiveFatigue}` : 'cognitive_fatigue:n/a'
        return `${r.dateKey} | score:${r.combinedScore} | tier:${r.recommendation} | recovery:${r.recovery} ${cog} stress:${r.stress} sleep_q:${r.sleepQuality}`
      })
    : ['(none in past 7 days)']

  const moodLines = moodLogs.length
    ? moodLogs.map(
        (m) =>
          `${m.dateKey} | mood before:${m.moodBefore} after:${m.moodAfter} | lift:+${m.moodLift}`,
      )
    : ['(none in past 4 weeks)']

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
  const cycleLines = cycleContextLines(state, todayKey)
  const muscleBalance = muscleTrainingBalanceLines(state, nowMs)
  const avgDurationMin = averageWorkoutDurationMinutes(state, nowMs)
  const restStats = averageRestBetweenSetsSec(state, nowMs)
  const injury = coachInjuryRiskSummary(state, nowMs)
  const moodTrend = moodTrendLines(allMoodLogs, nowMs)

  const sections: string[] = [
    formatCoachTodayLine(now),
    `Calendar date key (today): ${todayKey}`,
    `Week start (Monday): ${dateKey(ws)}`,
    `Athlete name: ${name}`,
    `Fitness goals: ${goals}`,
    `Unit for weights: ${unit}`,
    `Current training streak: ${streak} day(s)`,
    todayScheduleCoachLine(state, todayKey),
    ...modeLines,
    trainingModeStreakLine(
      trainingMode,
      extras.workoutSessions ?? [],
      todayKey,
      nowMs,
    ),
    ...(cycleLines.length
      ? ['', '--- Menstrual cycle (local tracking) ---', ...cycleLines]
      : []),
    '',
    '--- Coach snapshot (use these numbers in replies) ---',
    ...longevityCoachLines(state, nowMs),
    ...deloadCoachLines(state, nowMs, extras.deloadHistory ?? []),
    `Injury risk level: ${injury.level}`,
    ...injury.lines.map((l) => `  ${l}`),
    `Most trained muscle groups (4 wks): ${muscleBalance.frequent}`,
    `Most neglected muscle groups (4 wks): ${muscleBalance.neglected}`,
    avgDurationMin != null
      ? `Average workout duration (4 wks, from set timestamps): ${Math.round(avgDurationMin)} min`
      : 'Average workout duration: (not enough session data)',
    restStats.observedSec != null
      ? `Average rest between sets: ~${restStats.observedSec}s observed | ${restStats.configuredSec}s rest-timer default`
      : `Average rest between sets: ${restStats.configuredSec}s rest-timer default (not enough gaps in logs to estimate)`,
    'Post-workout mood trends (past 14 days):',
    ...moodTrend.map((l) => `  ${l}`),
    todayReadiness
      ? `Today's readiness check: cognitive fatigue ${todayReadiness.cognitiveFatigue ?? 'not logged'}/5, stress ${todayReadiness.stress}/5, recovery ${todayReadiness.recovery}/5, sleep quality ${todayReadiness.sleepQuality}/5 (combined score ${todayReadiness.combinedScore}, tier ${todayReadiness.recommendation})`
      : "Today's readiness check: not logged yet",
    '',
    '--- Current week volume by muscle group (lbs load) ---',
    volLines.join('\n'),
    '',
    '--- Personal records / best performances (all exercises) ---',
    ...prLines,
    '',
    '--- Readiness scores (past 7 days) ---',
    ...readinessLines,
    '',
    '--- Workout mood check-ins (past 4 weeks, detail) ---',
    ...moodLines,
    '',
    '--- Recovery averages (past 7 days) ---',
    sleepAvg
      ? `Sleep: avg ${formatSleepDuration(sleepAvg.durationMinutes)} per night, quality ${sleepAvg.quality.toFixed(1)}/5`
      : 'Sleep: (no logs in past 7 days)',
    `Water: avg ${waterAvgOz} oz/day (goal ${state.settings.waterGoalOz ?? 64} oz)`,
    '',
    '--- Weekly schedule (current plan) ---',
    sched || '(empty)',
    '',
    `--- Strength / timed sets (full log, past 4 weeks, ${setLines.length} entries) ---`,
    setLines.length ? setLines.join('\n') : '(none)',
    '',
    `--- Cardio (past 4 weeks) ---`,
    cardioLines.length ? cardioLines.join('\n') : '(none)',
  ]

  return sections.join('\n')
}

export function truncateCoachContextBlock(ctx: string): string {
  if (ctx.length <= COACH_CONTEXT_CHAR_CAP) return ctx
  const marker = '--- Strength / timed sets'
  const idx = ctx.indexOf(marker)
  if (idx < 0) {
    return `${ctx.slice(0, COACH_CONTEXT_CHAR_CAP - 80)}\n\n(context truncated for API limits.)`
  }
  const head = ctx.slice(0, idx)
  const tail = ctx.slice(idx)
  const tailBudget = Math.max(4000, COACH_CONTEXT_CHAR_CAP - head.length - 120)
  let trimmedTail = tail
  if (tail.length > tailBudget) {
    const lines = tail.split('\n')
    const kept: string[] = []
    let len = 0
    for (const line of lines) {
      if (len + line.length + 1 > tailBudget) break
      kept.push(line)
      len += line.length + 1
    }
    trimmedTail = `${kept.join('\n')}\n(older set logs omitted — most recent lines kept.)`
  }
  return head + trimmedTail
}

/** Builds truncated coach context, merging Supabase readiness/mood when signed in. */
export async function resolveCoachContextBlock(
  state: AppPersisted,
  options?: { userId?: string; nowMs?: number },
): Promise<ResolvedCoachContext> {
  const nowMs = options?.nowMs ?? Date.now()
  const todayKey = dateKey(new Date(nowMs))
  let extras: CoachContextExtras = {}
  if (options?.userId) {
    try {
      const [readinessLogs, workoutMoodLogs, deloadHistory, workoutSessions] =
        await Promise.all([
          fetchReadinessChecksForCoach(options.userId, 7),
          fetchWorkoutMoodCheckinsForCoach(options.userId, 28),
          fetchDeloadWeekHistory(options.userId, 12),
          fetchWorkoutSessionsForCoach(options.userId, 90),
        ])
      extras = { readinessLogs, workoutMoodLogs, deloadHistory, workoutSessions }
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn('[Apex Coach] remote coach data fetch failed', e)
      }
    }
  }
  return {
    context: truncateCoachContextBlock(buildApexCoachContext(state, nowMs, extras)),
    todayReadiness: todayReadinessLog(state, todayKey, extras),
  }
}
