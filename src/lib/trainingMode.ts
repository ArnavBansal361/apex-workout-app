export type TrainingMode = 'energy' | 'focus' | 'discipline' | 'recovery' | 'confidence'

export type TrainingModeDef = {
  id: TrainingMode
  label: string
  hint: string
  framing: string
  coachTone: string
}

export const TRAINING_MODES: TrainingModeDef[] = [
  {
    id: 'energy',
    label: 'Energy',
    hint: 'Move fast, stay light, build heat',
    framing: "Today's session is designed to lift your energy and leave you feeling switched on.",
    coachTone:
      'Coach tone: upbeat and energizing. Emphasize momentum, quick wins, and leaving the athlete feeling charged up. Keep cues punchy.',
  },
  {
    id: 'focus',
    label: 'Focus',
    hint: 'Quality reps, tight execution',
    framing: "Today's session is designed to sharpen technique and stay present on every set.",
    coachTone:
      'Coach tone: calm and precise. Emphasize form, breathing, and intentional reps over ego lifting.',
  },
  {
    id: 'discipline',
    label: 'Discipline',
    hint: 'Show up, follow the plan',
    framing: "Today's session is designed to honor the plan — consistency over comfort.",
    coachTone:
      'Coach tone: direct and accountable. Emphasize structure, finishing what was planned, and steady effort.',
  },
  {
    id: 'recovery',
    label: 'Recovery',
    hint: "Restore, don't redline",
    framing: "Today's session is designed to rebuild momentum without digging a deeper hole.",
    coachTone:
      'Coach tone: gentle and restorative. Emphasize mobility, manageable loads, and leaving room to recover.',
  },
  {
    id: 'confidence',
    label: 'Confidence',
    hint: 'Stack wins, trust your strength',
    framing: "Today's session is designed to rebuild confidence one solid set at a time.",
    coachTone:
      'Coach tone: encouraging and affirming. Highlight progress, celebrate effort, and suggest challenges that feel achievable.',
  },
]

const BY_ID = Object.fromEntries(TRAINING_MODES.map((m) => [m.id, m])) as Record<
  TrainingMode,
  TrainingModeDef
>

export function trainingModeDef(mode: TrainingMode): TrainingModeDef {
  return BY_ID[mode]
}

export function trainingModeFraming(mode: TrainingMode): string {
  return BY_ID[mode].framing
}

export function trainingModeCoachInstruction(mode: TrainingMode | null | undefined): string {
  if (!mode) return ''
  return `\n\nActive training mode for today's workout: ${BY_ID[mode].label}.\n${BY_ID[mode].coachTone}`
}
