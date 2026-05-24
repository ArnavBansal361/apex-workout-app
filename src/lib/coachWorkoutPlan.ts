import { EXERCISES } from '../data/exercises'
import { resolveImportExercise } from './parseWorkoutImport'
import type { AppPersisted } from '../types'

const APEX_PLAN_LINE_RE = /^\s*APEX_PLAN:\s*(.+)\s*$/im

/** Remove machine-readable plan footer from coach bubble display. */
export function stripCoachPlanMachineLine(text: string): string {
  return text
    .split(/\n/)
    .filter((line) => !/^\s*APEX_PLAN:\s*/i.test(line))
    .join('\n')
    .trim()
}

/** Exercise ids mentioned in a coach workout plan (APEX_PLAN line + name matching). */
export function extractExerciseIdsFromCoachPlan(
  text: string,
  customExercises: AppPersisted['customExercises'],
): string[] {
  const ids: string[] = []
  const seen = new Set<string>()

  const add = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }

  const apexMatch = text.match(APEX_PLAN_LINE_RE)
  if (apexMatch?.[1]) {
    for (const token of apexMatch[1].split(/[,;]+/)) {
      const piece = token.trim()
      if (!piece) continue
      const resolved = resolveImportExercise(piece, undefined, customExercises)
      if (resolved) add(resolved.id)
    }
  }

  const body = stripCoachPlanMachineLine(text).toLowerCase()
  const byNameLen = [...EXERCISES].sort((a, b) => b.name.length - a.name.length)
  for (const e of byNameLen) {
    if (body.includes(e.name.toLowerCase())) add(e.id)
  }
  for (const c of customExercises) {
    if (body.includes(c.name.toLowerCase())) add(c.id)
  }

  return ids
}
