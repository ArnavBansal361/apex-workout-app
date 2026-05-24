export type ReadinessTier = 'full' | 'moderate' | 'recovery'

export type ReadinessResponses = {
  recovery: number
  /** 1 = alert, 5 = mentally exhausted */
  cognitiveFatigue: number
  /** 1 = very calm, 5 = very stressed */
  stress: number
  sleepQuality: number
}

export type ReadinessResult = {
  combinedScore: number
  tier: ReadinessTier
  title: string
  message: string
}

/** Higher = better readiness (stress and cognitive fatigue inverted). */
export function readinessCombinedScore(responses: ReadinessResponses): number {
  const { recovery, stress, sleepQuality, cognitiveFatigue } = responses
  return recovery + sleepQuality + (6 - stress) + (6 - cognitiveFatigue)
}

export function isHighCognitiveFatigue(score: number): boolean {
  return score >= 4
}

export function isHighStressLevel(score: number): boolean {
  return score >= 4
}

export function readinessFromResponses(responses: ReadinessResponses): ReadinessResult {
  const combinedScore = readinessCombinedScore(responses)
  if (combinedScore >= 16) {
    return {
      combinedScore,
      tier: 'full',
      title: 'Full workout',
      message: 'You look well recovered — train as planned and push for your usual volume.',
    }
  }
  if (combinedScore >= 11) {
    return {
      combinedScore,
      tier: 'moderate',
      title: 'Moderate day',
      message: 'Energy is mixed — keep the session, but trim a set or two or hold loads steady.',
    }
  }
  return {
    combinedScore,
    tier: 'recovery',
    title: 'Recovery focus',
    message: 'Readiness is low — consider a deload, mobility work, or an easy recovery session.',
  }
}

/** Dynamic coach guidance from today's readiness check (cognitive fatigue + stress). */
export function readinessCoachInstruction(
  entry: {
    cognitiveFatigue?: number
    stress: number
  } | null,
): string {
  if (!entry) return ''

  const parts: string[] = []
  if (entry.cognitiveFatigue != null && isHighCognitiveFatigue(entry.cognitiveFatigue)) {
    parts.push(
      `Today's cognitive fatigue is ${entry.cognitiveFatigue}/5 (high). Name that number in your reply. Prefer zone 2 cardio or mobility work over heavy lifting unless they clearly want strength work.`,
    )
  }
  if (isHighStressLevel(entry.stress)) {
    parts.push(
      `Today's stress is ${entry.stress}/5 (high). Name that number in your reply. Suggest a shorter workout with more rest between sets and lower total volume.`,
    )
  }
  if (!parts.length) return ''
  return `\n\nReadiness coaching rules:\n${parts.join(' ')}`
}
