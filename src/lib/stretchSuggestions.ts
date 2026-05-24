import { STRETCH_DEFINITIONS, type StretchDefinition } from '../data/stretches'
import type { MuscleGroup, SetLog } from '../types'

const TRAINING_GROUPS: MuscleGroup[] = [
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
]

export function muscleGroupsTrainedToday(
  logs: SetLog[],
  todayKey: string,
): MuscleGroup[] {
  const groups = new Set<MuscleGroup>()
  for (const l of logs) {
    if (dateKeyFromLog(l) !== todayKey) continue
    if (l.muscleGroup === 'Stretches' || l.muscleGroup === 'Cardio') continue
    groups.add(l.muscleGroup)
  }
  return TRAINING_GROUPS.filter((g) => groups.has(g))
}

function dateKeyFromLog(l: SetLog): string {
  const d = new Date(l.at)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Post-workout stretch picks ranked by overlap with muscle groups trained today. */
export function suggestPostWorkoutStretches(
  trained: MuscleGroup[],
  max = 8,
): StretchDefinition[] {
  if (!trained.length) {
    return STRETCH_DEFINITIONS.filter((s) => s.universal).slice(0, max)
  }

  const scored: { def: StretchDefinition; score: number }[] = []
  for (const def of STRETCH_DEFINITIONS) {
    let score = def.universal ? 1 : 0
    for (const g of trained) {
      if (def.forMuscleGroups.includes(g)) score += 10
    }
    if (score > 0) scored.push({ def, score })
  }

  scored.sort((a, b) => b.score - a.score || a.def.name.localeCompare(b.def.name))

  const picked: StretchDefinition[] = []
  const seenTarget = new Set<string>()
  for (const { def } of scored) {
    if (picked.length >= max) break
    const key = def.targets[0] ?? def.id
    if (seenTarget.has(key) && !def.universal) continue
    seenTarget.add(key)
    picked.push(def)
  }

  if (picked.length < 4) {
    for (const def of STRETCH_DEFINITIONS.filter((s) => s.universal)) {
      if (picked.length >= max) break
      if (!picked.some((p) => p.id === def.id)) picked.push(def)
    }
  }

  return picked
}
