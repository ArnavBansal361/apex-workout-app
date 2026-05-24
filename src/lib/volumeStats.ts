import type { AppPersisted, MuscleGroup, WeightedSetLog } from '../types'
import { dateKey, weekStartMonday } from './dates'

const RADAR_GROUPS: MuscleGroup[] = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core']

/** Convert stored weight to pounds for volume math. */
export function weightToLbs(weight: number, unit: 'lbs' | 'kg'): number {
  return unit === 'kg' ? weight * 2.2046226218 : weight
}

function volumeInWeek(
  state: AppPersisted,
  weekStart: Date,
): Record<MuscleGroup, number> {
  const out = {} as Record<MuscleGroup, number>
  for (const g of RADAR_GROUPS) out[g] = 0
  out.Cardio = 0
  out.Stretches = 0
  const we = new Date(weekStart)
  we.setDate(weekStart.getDate() + 7)
  for (const l of state.setLogs) {
    if (l.kind !== 'weighted') continue
    const t = new Date(l.at)
    if (t < weekStart || t >= we) continue
    const w = l as WeightedSetLog
    if (w.bodyweight || w.weight == null || !Number.isFinite(w.weight)) continue
    const lbs = weightToLbs(w.weight, state.settings.unit)
    const vol = w.sets * w.reps * lbs
    if (out[w.muscleGroup] != null) out[w.muscleGroup] += vol
  }
  return out
}

/** Sum of sets × reps × weight (lbs) per muscle group for current week. */
export function weeklyVolumeLoadByMuscleLbs(state: AppPersisted, nowMs: number): Record<MuscleGroup, number> {
  return volumeInWeek(state, weekStartMonday(new Date(nowMs)))
}

export type BurnoutWarning = {
  muscle: MuscleGroup
  pctAbove: number
  thisWeekVol: number
  avgVol: number
}

export type InjuryRiskWarning = {
  kind: 'volume-spike' | 'push-pull-imbalance'
  muscle?: MuscleGroup
  pctSpike?: number
  message: string
}

const INJURY_SPIKE_PCT = 40
const INJURY_MIN_PRIOR_WEEK_VOL = 200
const INJURY_MIN_PUSH_PULL_VOL = 400
const INJURY_PUSH_PULL_RATIO = 1.4

function volumeSpikeSuggestion(muscle: MuscleGroup): string {
  switch (muscle) {
    case 'Shoulders':
      return 'Add face pulls to balance your shoulder volume.'
    case 'Chest':
      return 'Add rows or band pull-aparts to balance chest-dominant pushing.'
    case 'Back':
      return 'Ramp pulling volume gradually after last week’s lighter load.'
    case 'Arms':
      return 'Balance arm work with opposing movements and extra recovery.'
    case 'Legs':
      return 'Consider a lighter leg session or extra mobility after this jump.'
    case 'Core':
      return 'Pair high core volume with anti-rotation and recovery work.'
    default:
      return 'Balance this group with opposing work and gradual progression.'
  }
}

function pushPullImbalanceSuggestion(
  thisWeek: Record<MuscleGroup, number>,
  pushVol: number,
): string {
  const shoulders = thisWeek.Shoulders ?? 0
  const chest = thisWeek.Chest ?? 0
  if (shoulders >= chest * 0.55 || shoulders / Math.max(1, pushVol) >= 0.38) {
    return 'Add face pulls to balance your shoulder volume.'
  }
  if (chest > shoulders * 1.25) {
    return 'Add rows or band pull-aparts to balance chest-dominant pushing.'
  }
  return 'Add rows or face pulls to balance your pushing volume.'
}

/** Volume spike >40% WoW or push volume significantly outweighing pull. */
export function detectInjuryRiskWarnings(state: AppPersisted, nowMs: number): InjuryRiskWarning[] {
  const thisMonday = weekStartMonday(new Date(nowMs))
  const lastMonday = new Date(thisMonday)
  lastMonday.setDate(thisMonday.getDate() - 7)

  const thisWeek = volumeInWeek(state, thisMonday)
  const lastWeek = volumeInWeek(state, lastMonday)
  const warnings: InjuryRiskWarning[] = []

  for (const muscle of RADAR_GROUPS) {
    const prev = lastWeek[muscle] ?? 0
    const curr = thisWeek[muscle] ?? 0
    if (prev < INJURY_MIN_PRIOR_WEEK_VOL) continue
    const pctIncrease = ((curr - prev) / prev) * 100
    if (pctIncrease <= INJURY_SPIKE_PCT) continue
    const suggestion = volumeSpikeSuggestion(muscle)
    warnings.push({
      kind: 'volume-spike',
      muscle,
      pctSpike: Math.round(pctIncrease),
      message: `${muscle} volume is up ${Math.round(pctIncrease)}% vs last week. ${suggestion}`,
    })
  }

  const pushVol = (thisWeek.Chest ?? 0) + (thisWeek.Shoulders ?? 0)
  const pullVol = thisWeek.Back ?? 0
  const pushHeavy =
    pushVol >= INJURY_MIN_PUSH_PULL_VOL &&
    (pullVol < INJURY_MIN_PUSH_PULL_VOL || pushVol > pullVol * INJURY_PUSH_PULL_RATIO)

  if (pushHeavy) {
    const ratioLabel =
      pullVol >= INJURY_MIN_PUSH_PULL_VOL
        ? `${Math.round((pushVol / pullVol - 1) * 100)}% more push than pull volume`
        : 'much more push than pull volume'
    warnings.push({
      kind: 'push-pull-imbalance',
      message: `Chest and shoulder volume is ${ratioLabel} this week. ${pushPullImbalanceSuggestion(thisWeek, pushVol)}`,
    })
  }

  const spikes = warnings.filter((w) => w.kind === 'volume-spike')
  const other = warnings.filter((w) => w.kind !== 'volume-spike')
  spikes.sort((a, b) => (b.pctSpike ?? 0) - (a.pctSpike ?? 0))
  const topSpikes = spikes.slice(0, 2)

  const seen = new Set<string>()
  return [...topSpikes, ...other].filter((w) => {
    if (seen.has(w.message)) return false
    seen.add(w.message)
    return true
  })
}

/** Muscles with this week volume ≥150% of prior 4-week average (RADAR_GROUPS only). */
export function detectBurnoutWarnings(state: AppPersisted, nowMs: number): BurnoutWarning[] {
  const thisMonday = weekStartMonday(new Date(nowMs))
  const thisWeek = volumeInWeek(state, thisMonday)
  const warnings: BurnoutWarning[] = []

  for (const muscle of RADAR_GROUPS) {
    let sum = 0
    for (let back = 1; back <= 4; back++) {
      const ws = new Date(thisMonday)
      ws.setDate(thisMonday.getDate() - back * 7)
      sum += volumeInWeek(state, ws)[muscle] ?? 0
    }
    const avg = sum / 4
    const current = thisWeek[muscle] ?? 0
    if (avg <= 0 || current <= 0) continue
    if (current >= avg * 1.5) {
      const pctAbove = Math.round(((current - avg) / avg) * 100)
      warnings.push({ muscle, pctAbove, thisWeekVol: Math.round(current), avgVol: Math.round(avg) })
    }
  }
  return warnings.sort((a, b) => b.pctAbove - a.pctAbove)
}

export function currentWeekStartKey(nowMs = Date.now()): string {
  return dateKey(weekStartMonday(new Date(nowMs)))
}

export function weeklyVolumeHorizontalBarData(
  state: AppPersisted,
  nowMs: number,
): { muscle: string; volume: number; label: string }[] {
  const vol = weeklyVolumeLoadByMuscleLbs(state, nowMs)
  return RADAR_GROUPS.map((muscle) => ({
    muscle,
    volume: Math.round(vol[muscle] ?? 0),
    label: `${Math.round(vol[muscle] ?? 0)} lbs`,
  }))
}

/** Radar data: relative 0–100 scale vs max axis among the 6. */
export function weeklyVolumeRadarData(
  state: AppPersisted,
  nowMs: number,
): { subject: string; volume: number; fullMark: number }[] {
  const vol = weeklyVolumeLoadByMuscleLbs(state, nowMs)
  const vals = RADAR_GROUPS.map((g) => vol[g] ?? 0)
  const max = Math.max(1, ...vals)
  return RADAR_GROUPS.map((g) => ({
    subject: g,
    volume: Math.round(((vol[g] ?? 0) / max) * 100),
    fullMark: 100,
  }))
}
