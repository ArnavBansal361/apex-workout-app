/** Preset workout plans — IDs must match `exercises.ts` slugs. */
export type PlanPreset = {
  id: string
  title: string
  subtitle: string
  exerciseIds: string[]
}

export const PLAN_PRESETS: PlanPreset[] = [
  {
    id: 'push-day',
    title: 'Push Day',
    subtitle: 'Chest, shoulders, triceps',
    exerciseIds: [
      'bench-press',
      'incline-bench-press',
      'shoulder-press',
      'tricep-rope-pushdown',
      'pec-fly',
      'dips',
    ],
  },
  {
    id: 'pull-day',
    title: 'Pull Day',
    subtitle: 'Back, biceps, rear delts',
    exerciseIds: [
      'lat-pulldown',
      'seated-cable-row',
      'rows',
      'barbell-curl',
      'dumbbell-curl',
      'face-pull',
    ],
  },
  {
    id: 'leg-day',
    title: 'Leg Day',
    subtitle: 'Quads, hamstrings, glutes',
    exerciseIds: [
      'squat',
      'leg-press',
      'leg-extension',
      'leg-curl',
      'calf-raises',
      'hip-thrust',
    ],
  },
  {
    id: 'upper-body',
    title: 'Upper Body',
    subtitle: 'Balanced upper session',
    exerciseIds: [
      'bench-press',
      'rows',
      'shoulder-press',
      'dumbbell-curl',
      'tricep-rope-pushdown',
    ],
  },
  {
    id: 'lower-body',
    title: 'Lower Body',
    subtitle: 'Legs & glutes focus',
    exerciseIds: ['squat', 'leg-press', 'leg-curl', 'leg-extension', 'hip-thrust'],
  },
  {
    id: 'full-body',
    title: 'Full Body',
    subtitle: 'Compound full-body',
    exerciseIds: [
      'bench-press',
      'rows',
      'squat',
      'shoulder-press',
      'dumbbell-curl',
      'plank',
    ],
  },
]
