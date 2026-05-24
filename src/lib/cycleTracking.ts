import type { AppPersisted } from '../types'
import { dateKey, parseDateKey } from './dates'

export const CYCLE_LENGTH_DAYS = 28

export type CyclePhase = 'follicular' | 'luteal'

export type CycleStatus = {
  phase: CyclePhase
  dayInCycle: number
  label: string
  shortLabel: string
}

export function getCycleStatus(
  enabled: boolean,
  cycleStartDateKey: string | null | undefined,
  todayKey: string = dateKey(new Date()),
): CycleStatus | null {
  if (!enabled || !cycleStartDateKey?.trim()) return null

  const start = parseDateKey(cycleStartDateKey.trim())
  const today = parseDateKey(todayKey)
  const daysSince = Math.floor((today.getTime() - start.getTime()) / 86_400_000)
  if (daysSince < 0) return null

  const dayInCycle = (daysSince % CYCLE_LENGTH_DAYS) + 1
  const phase: CyclePhase = dayInCycle <= 14 ? 'follicular' : 'luteal'

  return {
    phase,
    dayInCycle,
    label: phase === 'follicular' ? 'Follicular phase' : 'Luteal phase',
    shortLabel: phase === 'follicular' ? 'Follicular' : 'Luteal',
  }
}

export function cycleCoachInstruction(
  state: AppPersisted,
  todayKey: string = dateKey(new Date()),
): string {
  const status = getCycleStatus(
    Boolean(state.settings.cycleTrackingEnabled),
    state.cycleStartDateKey,
    todayKey,
  )
  if (!status) return ''

  if (status.phase === 'follicular') {
    return `\n\nMenstrual cycle (follicular phase, day ${status.dayInCycle} of ${CYCLE_LENGTH_DAYS}): The athlete tracks their cycle locally. Favor higher-intensity training when readiness is good — heavier loads, progressive volume, and ambitious sessions are reasonable if form stays solid.`
  }

  return `\n\nMenstrual cycle (luteal phase, day ${status.dayInCycle} of ${CYCLE_LENGTH_DAYS}): The athlete tracks their cycle locally. Favor lower intensity, extra recovery, and sustainable volume — moderate loads, technique focus, and rest over max-effort pushes unless readiness is exceptional.`
}

export function cycleContextLines(
  state: AppPersisted,
  todayKey: string = dateKey(new Date()),
): string[] {
  const status = getCycleStatus(
    Boolean(state.settings.cycleTrackingEnabled),
    state.cycleStartDateKey,
    todayKey,
  )
  if (!status) return []

  const intent =
    status.phase === 'follicular'
      ? 'higher intensity training is generally appropriate'
      : 'lower intensity and more recovery are generally appropriate'

  return [
    `Cycle tracking: enabled (local only, not shared to cloud)`,
    `Cycle start date key: ${state.cycleStartDateKey}`,
    `Current phase: ${status.label} (day ${status.dayInCycle} of ${CYCLE_LENGTH_DAYS}) — ${intent}`,
  ]
}

/** Remove cycle fields before syncing workout state to Supabase. */
export function stateForCloudSync(state: AppPersisted): AppPersisted {
  const { cycleStartDateKey: _dropStart, ...rest } = state
  const { cycleTrackingEnabled: _dropToggle, ...settingsForCloud } = state.settings
  return {
    ...rest,
    cycleStartDateKey: null,
    settings: settingsForCloud as AppPersisted['settings'],
  }
}

/** Keep device-local cycle data when merging cloud workout state. */
export function preserveLocalOnlyFields(
  local: AppPersisted,
  merged: AppPersisted,
): AppPersisted {
  return {
    ...merged,
    cycleStartDateKey: local.cycleStartDateKey ?? null,
    settings: {
      ...merged.settings,
      cycleTrackingEnabled: Boolean(local.settings.cycleTrackingEnabled),
    },
  }
}
