export type WorkoutMoodResponses = {
  moodBefore: number
  moodAfter: number
}

export function workoutMoodLift(responses: WorkoutMoodResponses): number {
  return responses.moodAfter - responses.moodBefore
}

export function formatMoodLift(average: number): string {
  const rounded = Math.round(average * 10) / 10
  if (rounded > 0) return `+${rounded}`
  if (rounded === 0) return '0'
  return String(rounded)
}
