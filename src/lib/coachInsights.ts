import type { AppPersisted, MuscleGroup, SetLog, WorkoutMoodLogEntry } from '../types'
import { dateKey, parseDateKey } from './dates'
import {
  consecutiveProgressiveVolumeIncreases,
  isDeloadWeekActive,
  shouldSuggestDeloadWeek,
} from './deload'
import { computeLongevityScore } from './longevityScore'
import type { TrainingMode } from './trainingMode'
import { trainingModeDef } from './trainingMode'
import type { DeloadWeekRecord } from './supabase'
import { detectInjuryRiskWarnings } from './volumeStats'

const RADAR_GROUPS: MuscleGroup[] = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core']
const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000
const MIN_REST_SEC = 15
const MAX_REST_SEC = 600

export type WorkoutSessionModeRow = {
  dateKey: string
  trainingMode: TrainingMode
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

export function todayScheduleCoachLine(state: AppPersisted, todayKey: string): string {
  const sched = state.schedule.find((d) => d.dateKey === todayKey)
  const planName = sched?.workoutName?.trim() ?? ''
  if (!planName) {
    return `Today (${todayKey}): scheduled rest day (no workout name on calendar).`
  }
  const planned = sched?.plannedExerciseIds?.length ?? 0
  const extra =
    planned > 0 ? ` | ${planned} exercise(s) planned` : ' | no exercises listed yet'
  return `Today (${todayKey}): scheduled workout day — "${planName}"${extra}.`
}

export function muscleTrainingBalanceLines(
  state: AppPersisted,
  nowMs: number,
): { frequent: string; neglected: string } {
  const cutoff = nowMs - FOUR_WEEKS_MS
  const counts = {} as Record<MuscleGroup, number>
  for (const g of RADAR_GROUPS) counts[g] = 0

  for (const l of state.setLogs) {
    if (l.at < cutoff) continue
    if (!RADAR_GROUPS.includes(l.muscleGroup as MuscleGroup)) continue
    const sets = l.kind === 'weighted' ? l.sets : 1
    counts[l.muscleGroup as MuscleGroup] += sets
  }

  const ranked = RADAR_GROUPS.map((g) => ({ g, n: counts[g] }))
    .sort((a, b) => b.n - a.n)

  const withWork = ranked.filter((r) => r.n > 0)
  const top = withWork.slice(0, 3)
  const bottom = [...withWork].reverse().slice(0, 3)

  const frequent =
    top.length > 0
      ? top.map((r) => `${r.g} (${r.n} set-entries)`).join(', ')
      : '(no strength sets in past 4 weeks)'

  const zeroed = ranked.filter((r) => r.n === 0).map((r) => r.g)
  const neglectedParts: string[] = []
  if (zeroed.length) neglectedParts.push(`zero volume: ${zeroed.join(', ')}`)
  if (bottom.length) {
    const low = bottom.map((r) => `${r.g} (${r.n})`).join(', ')
    if (low !== frequent) neglectedParts.push(`lowest trained: ${low}`)
  }
  const neglected = neglectedParts.length
    ? neglectedParts.join(' | ')
    : '(all muscle groups have logged volume)'

  return { frequent, neglected }
}

export function averageWorkoutDurationMinutes(
  state: AppPersisted,
  nowMs: number,
): number | null {
  const cutoff = nowMs - FOUR_WEEKS_MS
  const byDay = new Map<string, { min: number; max: number }>()

  for (const l of state.setLogs) {
    if (l.at < cutoff) continue
    const dk = dateKey(new Date(l.at))
    const row = byDay.get(dk) ?? { min: l.at, max: l.at }
    row.min = Math.min(row.min, l.at)
    row.max = Math.max(row.max, l.at)
    byDay.set(dk, row)
  }

  const durationsMin: number[] = []
  for (const { min, max } of byDay.values()) {
    const spanSec = (max - min) / 1000
    if (spanSec < 120) continue
    durationsMin.push(spanSec / 60)
  }
  if (!durationsMin.length) return null
  return durationsMin.reduce((a, b) => a + b, 0) / durationsMin.length
}

export function averageRestBetweenSetsSec(
  state: AppPersisted,
  nowMs: number,
): { observedSec: number | null; configuredSec: number } {
  const configured = Math.max(1, Math.floor(state.settings.restTimerSeconds) || 90)
  const cutoff = nowMs - FOUR_WEEKS_MS
  const gaps: number[] = []

  const byDay = new Map<string, SetLog[]>()
  for (const l of state.setLogs) {
    if (l.at < cutoff) continue
    const dk = dateKey(new Date(l.at))
    const list = byDay.get(dk) ?? []
    list.push(l)
    byDay.set(dk, list)
  }

  for (const logs of byDay.values()) {
    logs.sort((a, b) => a.at - b.at)
    for (let i = 1; i < logs.length; i++) {
      const gap = (logs[i]!.at - logs[i - 1]!.at) / 1000
      if (gap >= MIN_REST_SEC && gap <= MAX_REST_SEC) gaps.push(gap)
    }
  }

  if (!gaps.length) return { observedSec: null, configuredSec: configured }
  return {
    observedSec: Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length),
    configuredSec: configured,
  }
}

export function moodTrendLines(
  moodLogs: WorkoutMoodLogEntry[],
  nowMs: number,
): string[] {
  const cutoff = nowMs - TWO_WEEKS_MS
  const recent = moodLogs.filter((m) => parseDateKey(m.dateKey).getTime() >= cutoff)
  if (!recent.length) {
    return ['(no post-workout mood check-ins in past 14 days)']
  }

  const avg = (vals: number[]) => vals.reduce((a, b) => a + b, 0) / vals.length
  const lifts = recent.map((m) => m.moodLift)
  const before = recent.map((m) => m.moodBefore)
  const after = recent.map((m) => m.moodAfter)

  const mid = Math.floor(recent.length / 2)
  const first = recent.slice(0, mid)
  const second = recent.slice(mid)
  let trend = 'stable'
  if (first.length && second.length) {
    const d =
      avg(second.map((m) => m.moodLift)) - avg(first.map((m) => m.moodLift))
    if (d >= 0.35) trend = 'improving (mood lift trending up)'
    else if (d <= -0.35) trend = 'declining (mood lift trending down)'
  }

  return [
    `${recent.length} check-in(s) in past 14 days`,
    `avg mood before: ${avg(before).toFixed(1)}/5 | after: ${avg(after).toFixed(1)}/5 | lift: +${avg(lifts).toFixed(1)}`,
    `trend: ${trend}`,
  ]
}

export function coachInjuryRiskSummary(
  state: AppPersisted,
  nowMs: number,
): { level: 'low' | 'moderate' | 'elevated'; lines: string[] } {
  const warnings = detectInjuryRiskWarnings(state, nowMs)
  if (!warnings.length) {
    return {
      level: 'low',
      lines: ['No volume-spike or push/pull imbalance flags this week.'],
    }
  }

  const spikes = warnings.filter((w) => w.kind === 'volume-spike')
  const maxSpike = Math.max(0, ...spikes.map((w) => w.pctSpike ?? 0))
  const hasImbalance = warnings.some((w) => w.kind === 'push-pull-imbalance')
  let level: 'moderate' | 'elevated' = 'moderate'
  if (hasImbalance && (spikes.length >= 2 || maxSpike >= 35)) level = 'elevated'
  else if (maxSpike >= 50 || warnings.length >= 3) level = 'elevated'

  return {
    level,
    lines: warnings.map((w) => w.message),
  }
}

export function trainingModeStreakLine(
  currentMode: TrainingMode | null,
  sessions: WorkoutSessionModeRow[],
  todayKey: string,
  nowMs: number,
): string {
  if (!sessions.length) {
    if (currentMode) {
      return `Training mode streak: 1 (current session only — ${trainingModeDef(currentMode).label}; sign in and log sessions to build history).`
    }
    return 'Training mode streak: (no logged sessions with a training mode yet).'
  }

  const byDay = new Map<string, TrainingMode>()
  for (const s of sessions) {
    if (!byDay.has(s.dateKey)) byDay.set(s.dateKey, s.trainingMode)
  }

  const anchorMode =
    byDay.get(todayKey) ??
    dateKeysSince(nowMs, 90)
      .map((k) => byDay.get(k))
      .find(Boolean) ??
    currentMode

  if (!anchorMode) {
    return 'Training mode streak: (sessions logged but no training mode recorded).'
  }

  let streak = 0
  for (const k of dateKeysSince(nowMs, 90)) {
    const mode = byDay.get(k)
    if (!mode) {
      if (k === todayKey) continue
      break
    }
    if (mode === anchorMode) streak++
    else break
  }

  return `Training mode streak: ${streak} workout day(s) on ${trainingModeDef(anchorMode).label} mode (most recent mode in streak).`
}

export function deloadCoachLines(
  state: AppPersisted,
  nowMs: number,
  remoteHistory: DeloadWeekRecord[] = [],
): string[] {
  const lines: string[] = []
  const increases = consecutiveProgressiveVolumeIncreases(state, nowMs)
  lines.push(
    `Progressive volume increases (completed weeks): ${increases} consecutive rise(s)`,
  )
  lines.push(
    shouldSuggestDeloadWeek(state, nowMs)
      ? 'Deload suggestion: yes (3–4 weeks rising volume pattern)'
      : 'Deload suggestion: no active pattern',
  )
  if (state.deloadActiveWeekStart) {
    lines.push(
      `Active deload week: yes (week starting ${state.deloadActiveWeekStart})${isDeloadWeekActive(state.deloadActiveWeekStart, nowMs) ? '' : ' — may be stale'}`,
    )
  } else {
    lines.push('Active deload week: no')
  }
  if (state.deloadDismissedWeekStart) {
    lines.push(`Last dismissed deload suggestion: week ${state.deloadDismissedWeekStart}`)
  }

  if (remoteHistory.length) {
    lines.push('Deload history (cloud, newest first):')
    for (const row of remoteHistory.slice(0, 8)) {
      lines.push(
        `  ${row.weekStartKey} | ${row.action} | −${row.weightReductionPct}% | exercises:${row.exerciseIds.length}`,
      )
    }
  } else {
    lines.push('Deload history (cloud): (none synced or not signed in)')
  }

  return lines
}

export function longevityCoachLines(state: AppPersisted, nowMs: number): string[] {
  const r = computeLongevityScore(state, nowMs)
  const drivers =
    r.drivers.length > 0
      ? r.drivers.map((d) => `${d.direction === 'up' ? '+' : '−'} ${d.text}`).join('; ')
      : '(no driver notes)'
  return [
    `Longevity score: ${r.score}/100 (${r.weekLabel})${r.hasEnoughData ? '' : ' — limited data'}`,
    `Pillars (0–100 each): workouts ${Math.round(r.pillars.workoutConsistency * 100)}, cardio ${Math.round(r.pillars.cardioConsistency * 100)}, balance ${Math.round(r.pillars.strengthBalance * 100)}, sleep ${Math.round(r.pillars.sleep * 100)}`,
    `Drivers: ${drivers}`,
  ]
}
