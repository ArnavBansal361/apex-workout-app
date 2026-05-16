import type { AppPersisted, SetLog } from '../types'
import { dateKey } from './dates'

function escapeCell(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function rowsFromLogs(sorted: SetLog[]): string[][] {
  const rows: string[][] = [
    [
      'date',
      'time',
      'kind',
      'exercise',
      'muscle',
      'weight',
      'bodyweight',
      'reps',
      'sets',
      'durationSec',
      'note',
      'pr',
    ],
  ]
  for (const l of sorted) {
    const d = new Date(l.at)
    const base = [
      dateKey(d),
      d.toISOString(),
      l.kind,
      l.exerciseName,
      l.muscleGroup,
      l.kind === 'weighted' ? String(l.weight ?? '') : '',
      l.kind === 'weighted' ? String(l.bodyweight) : '',
      l.kind === 'weighted' ? String(l.reps) : '',
      l.kind === 'weighted' ? String(l.sets) : '',
      l.kind === 'timed' ? String(l.durationSec) : '',
      l.note ?? '',
      String(l.isPr),
    ]
    rows.push(base)
  }
  return rows
}

export function exportLogsCsv(state: AppPersisted): string {
  const sorted = [...state.setLogs].sort((a, b) => b.at - a.at)
  return rowsFromLogs(sorted)
    .map((r) => r.map((c) => escapeCell(String(c))).join(','))
    .join('\n')
}

export function exportLogsCsvFromLogs(logs: SetLog[]): string {
  const sorted = [...logs].sort((a, b) => b.at - a.at)
  return rowsFromLogs(sorted)
    .map((r) => r.map((c) => escapeCell(String(c))).join(','))
    .join('\n')
}

export function exportFullDataCsv(state: AppPersisted): string {
  const logPart = exportLogsCsv(state)
  const bw = [
    'bodyweight_date,value',
    ...[...state.bodyweightLogs]
      .sort((a, b) => b.at - a.at)
      .map((b) => `${dateKey(new Date(b.at))},${b.value}`),
  ].join('\n')
  const cardio = [
    'cardio_date,name,durationMinutes',
    ...[...state.cardioEntries]
      .sort((a, b) => b.at - a.at)
      .map((c) => `${dateKey(new Date(c.at))},${escapeCell(c.name)},${c.durationMinutes ?? ''}`),
  ].join('\n')
  return `${logPart}\n\n---BODYWEIGHT---\n${bw}\n\n---CARDIO---\n${cardio}`
}

export function filterLogs(
  logs: SetLog[],
  exerciseId: string | null,
  from: string | null,
  to: string | null,
): SetLog[] {
  return logs.filter((l) => {
    if (exerciseId && l.exerciseId !== exerciseId) return false
    const k = dateKey(new Date(l.at))
    if (from && k < from) return false
    if (to && k > to) return false
    return true
  })
}
