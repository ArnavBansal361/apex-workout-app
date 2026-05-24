import type { Exercise, MuscleGroup } from '../types'

export type WarmupMovement = {
  name: string
  prescription: string
}

export type WarmupPlan = {
  estimatedMinutes: number
  muscleGroups: MuscleGroup[]
  basedOn: string[]
  movements: WarmupMovement[]
}

const TRAINING_GROUPS: MuscleGroup[] = [
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
]

type WarmupCandidate = {
  key: string
  name: string
  prescription: string
  minutes: number
  priority: number
  forGroups: MuscleGroup[] | 'general'
}

const WARMUP_POOL: WarmupCandidate[] = [
  {
    key: 'cardio',
    name: 'Light cardio',
    prescription: '2 min easy bike, row, or brisk walk',
    minutes: 2,
    priority: 100,
    forGroups: 'general',
  },
  {
    key: 'arm-circles',
    name: 'Arm circles',
    prescription: '2 sets × 10 forward and backward',
    minutes: 1,
    priority: 85,
    forGroups: ['Chest', 'Shoulders', 'Back', 'Arms'],
  },
  {
    key: 'hip-circles',
    name: 'Hip circles',
    prescription: '1 set × 8 each direction per leg',
    minutes: 1,
    priority: 84,
    forGroups: ['Legs', 'Core'],
  },
  {
    key: 'leg-swings',
    name: 'Leg swings',
    prescription: '2 sets × 10 front-to-back per leg',
    minutes: 1,
    priority: 83,
    forGroups: ['Legs'],
  },
  {
    key: 'bw-squat',
    name: 'Bodyweight squats',
    prescription: '2 sets × 10 controlled reps',
    minutes: 1,
    priority: 82,
    forGroups: ['Legs'],
  },
  {
    key: 'walking-lunge',
    name: 'Walking lunges',
    prescription: '1 set × 8 steps per leg (bodyweight)',
    minutes: 1,
    priority: 81,
    forGroups: ['Legs'],
  },
  {
    key: 'hip-flexor-lunge',
    name: 'Hip flexor lunge stretch',
    prescription: '1 set × 30 sec per side',
    minutes: 1,
    priority: 80,
    forGroups: ['Legs'],
  },
  {
    key: 'wall-pushup',
    name: 'Incline wall push-ups',
    prescription: '2 sets × 12 reps',
    minutes: 1,
    priority: 79,
    forGroups: ['Chest'],
  },
  {
    key: 'band-pullapart',
    name: 'Band pull-aparts',
    prescription: '2 sets × 15 reps',
    minutes: 1,
    priority: 78,
    forGroups: ['Chest', 'Back', 'Shoulders'],
  },
  {
    key: 'cat-cow',
    name: 'Cat-cow',
    prescription: '2 sets × 8 slow reps',
    minutes: 1,
    priority: 77,
    forGroups: ['Back', 'Core'],
  },
  {
    key: 'scap-retract',
    name: 'Scapular retractions',
    prescription: '2 sets × 12 (band or bodyweight row squeeze)',
    minutes: 1,
    priority: 76,
    forGroups: ['Back'],
  },
  {
    key: 'shoulder-dislocate',
    name: 'Band shoulder pass-throughs',
    prescription: '2 sets × 10 reps',
    minutes: 1,
    priority: 75,
    forGroups: ['Shoulders', 'Chest'],
  },
  {
    key: 'dead-bug',
    name: 'Dead bug',
    prescription: '2 sets × 8 per side',
    minutes: 1,
    priority: 74,
    forGroups: ['Core'],
  },
  {
    key: 'wrist-prep',
    name: 'Wrist circles',
    prescription: '1 set × 30 sec each direction',
    minutes: 1,
    priority: 73,
    forGroups: ['Arms'],
  },
  {
    key: 'worlds-greatest',
    name: "World's greatest stretch",
    prescription: '3 reps per side (slow)',
    minutes: 1,
    priority: 72,
    forGroups: 'general',
  },
  {
    key: 'torso-twist',
    name: 'Standing torso twists',
    prescription: '2 sets × 10 per side',
    minutes: 1,
    priority: 71,
    forGroups: ['Core', 'Back'],
  },
]

const GENERIC_FALLBACK_KEYS = ['cardio', 'arm-circles', 'hip-circles', 'bw-squat', 'cat-cow']

function matchesGroups(candidate: WarmupCandidate, groups: Set<MuscleGroup>): boolean {
  if (candidate.forGroups === 'general') return true
  return candidate.forGroups.some((g) => groups.has(g))
}

function pickCandidates(groups: Set<MuscleGroup>): WarmupCandidate[] {
  const picked: WarmupCandidate[] = []
  const used = new Set<string>()

  const pool = [...WARMUP_POOL].sort((a, b) => b.priority - a.priority)

  const cardio = pool.find((c) => c.key === 'cardio')
  if (cardio && !used.has(cardio.key)) {
    picked.push(cardio)
    used.add(cardio.key)
  }

  for (const g of TRAINING_GROUPS) {
    if (!groups.has(g)) continue
    const match = pool.find(
      (c) => !used.has(c.key) && c.forGroups !== 'general' && c.forGroups.includes(g),
    )
    if (match) {
      picked.push(match)
      used.add(match.key)
    }
  }

  for (const c of pool) {
    if (picked.length >= 5) break
    if (used.has(c.key)) continue
    if (!matchesGroups(c, groups)) continue
    picked.push(c)
    used.add(c.key)
  }

  if (picked.length < 3) {
    for (const key of GENERIC_FALLBACK_KEYS) {
      if (picked.length >= 5) break
      const c = pool.find((x) => x.key === key)
      if (c && !used.has(c.key)) {
        picked.push(c)
        used.add(c.key)
      }
    }
  }

  return picked.slice(0, 5)
}

export function plannedExerciseIdsForSession(
  todayPlanExerciseIds: string[],
  schedulePlannedIds: string[] | undefined,
): string[] {
  return [...new Set([...todayPlanExerciseIds, ...(schedulePlannedIds ?? [])])]
}

export function muscleGroupsFromPlannedExercises(
  exerciseIds: string[],
  resolve: (id: string) => Exercise | null,
): { groups: MuscleGroup[]; names: string[] } {
  const groupSet = new Set<MuscleGroup>()
  const names: string[] = []
  for (const id of exerciseIds) {
    const ex = resolve(id)
    if (!ex) continue
    names.push(ex.name)
    if (ex.muscleGroup !== 'Stretches' && ex.muscleGroup !== 'Cardio') {
      groupSet.add(ex.muscleGroup)
    }
  }
  return {
    groups: TRAINING_GROUPS.filter((g) => groupSet.has(g)),
    names,
  }
}

/** ~5 min warm-up from today's planned exercise ids (3–5 movements). */
export function generateWarmupPlan(
  exerciseIds: string[],
  resolve: (id: string) => Exercise | null,
): WarmupPlan {
  const { groups, names } = muscleGroupsFromPlannedExercises(exerciseIds, resolve)
  const groupSet = new Set(groups)

  if (!groupSet.size) {
    const fallback = pickCandidates(new Set(['Legs', 'Back', 'Chest']))
    const movements = fallback.map((c) => ({ name: c.name, prescription: c.prescription }))
    const minutes = fallback.reduce((s, c) => s + c.minutes, 0)
    return {
      estimatedMinutes: Math.min(6, Math.max(4, minutes)),
      muscleGroups: [],
      basedOn: names.length ? names : ['General session'],
      movements,
    }
  }

  const candidates = pickCandidates(groupSet)
  const movements = candidates.map((c) => ({ name: c.name, prescription: c.prescription }))
  const minutes = candidates.reduce((s, c) => s + c.minutes, 0)

  return {
    estimatedMinutes: Math.min(6, Math.max(4, minutes)),
    muscleGroups: groups,
    basedOn: names,
    movements,
  }
}
