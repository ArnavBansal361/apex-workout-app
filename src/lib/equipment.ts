import type { EquipmentType, MuscleGroup } from '../types'

export const EQUIPMENT_TYPES: EquipmentType[] = [
  'Barbell',
  'Dumbbell',
  'Cable',
  'Machine',
  'Bodyweight',
]

const MACHINE_PHRASES = [
  'machine',
  'smith',
  'leg press',
  'hack squat',
  'pec deck',
  'inner thigh',
  'outer thigh',
  'seated row machine',
  'chest press machine',
  'hamstring curl machine',
  'rowing machine',
  'treadmill',
  'stair climber',
  'stationary bike',
  'spin bike',
  'assisted',
  'iso-lateral',
  'hammer strength',
  'selectorized',
  'lat pulldown machine',
]

const BODYWEIGHT_PHRASES = [
  'push up',
  'push-up',
  'pull up',
  'pull-up',
  'pullup',
  'chin up',
  'chin-up',
  'dip',
  'plank',
  'burpee',
  'inverted row',
  'bodyweight',
  'glute bridge',
  'wall sit',
  'muscle up',
  'muscle-up',
  'pistol squat',
  'nordic curl',
  'sissy squat',
  'bear crawl',
  'mountain climber',
  'box jump',
  'jumping jack',
  'air squat',
  'crunch',
  'sit-up',
  'sit up',
  'hanging leg raise',
  'dragon flag',
  'l-sit',
  'handstand',
]

/** Infer equipment from exercise name (and muscle group). */
export function equipmentForExercise(name: string, muscleGroup: MuscleGroup): EquipmentType {
  const n = name.toLowerCase().trim()

  if (muscleGroup === 'Stretches') return 'Bodyweight'

  if (muscleGroup === 'Cardio') {
    if (
      n.includes('treadmill') ||
      n.includes('rowing machine') ||
      n.includes('stair climber') ||
      n.includes('stationary') ||
      n.includes('spin bike') ||
      n.includes('elliptical') ||
      n.includes('cycling') ||
      n.includes('bike')
    ) {
      return 'Machine'
    }
    return 'Bodyweight'
  }

  if (BODYWEIGHT_PHRASES.some((p) => n.includes(p))) return 'Bodyweight'
  if (n.includes('kettlebell')) return 'Dumbbell'
  if (n.includes('dumbbell') || /\bdb\b/.test(n)) return 'Dumbbell'
  if (n.includes('cable') || n.includes('crossover') || n.includes('pulldown')) return 'Cable'
  if (MACHINE_PHRASES.some((p) => n.includes(p))) return 'Machine'
  if (n.includes('barbell') || n.includes('landmine')) return 'Barbell'

  if (
    n.includes('squat') ||
    n.includes('deadlift') ||
    n.includes('bench press') ||
    n.includes('floor press') ||
    n.includes('overhead press') ||
    n.includes('military press') ||
    n.includes('good morning') ||
    n.includes('rack pull') ||
    n.includes('hip thrust') && !n.includes('dumbbell') ||
    n.includes('romanian deadlift') ||
    n.includes('sumo deadlift') ||
    n === 'rows' ||
    n.includes('barbell row') ||
    n.includes('pendlay') ||
    n.includes('t-bar') ||
    n.includes('meadows row')
  ) {
    return 'Barbell'
  }

  if (n.includes('leg extension') || n.includes('leg curl') || n.includes('calf raise')) {
    return 'Machine'
  }

  if (n.includes('fly') && !n.includes('dumbbell')) return 'Cable'
  if (n.includes('press') && !n.includes('dumbbell') && !n.includes('machine')) return 'Barbell'
  if (n.includes('curl') && !n.includes('dumbbell') && !n.includes('cable')) return 'Barbell'
  if (n.includes('row') && !n.includes('dumbbell') && !n.includes('cable')) return 'Barbell'

  return 'Barbell'
}

export function isEquipmentType(v: unknown): v is EquipmentType {
  return typeof v === 'string' && (EQUIPMENT_TYPES as string[]).includes(v)
}
