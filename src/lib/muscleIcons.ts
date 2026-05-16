import type { MuscleGroup } from '../types'

/** Emoji indicators for muscle groups (Today plan + exercise rows). */
export const MUSCLE_GROUP_ICON: Record<MuscleGroup, string> = {
  Chest: '💎',
  Back: '🎯',
  Legs: '🦵',
  Shoulders: '🔷',
  Arms: '💪',
  Core: '⚡',
  Cardio: '❤️',
  Stretches: '🧘',
}

export function muscleGroupIcon(mg: MuscleGroup): string {
  return MUSCLE_GROUP_ICON[mg] ?? '·'
}
