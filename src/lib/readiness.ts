export type ReadinessTier = 'full' | 'moderate' | 'recovery'

export type ReadinessResponses = {
  recovery: number
  stress: number
  sleepQuality: number
}

export type ReadinessResult = {
  combinedScore: number
  tier: ReadinessTier
  title: string
  message: string
}

/** Higher = better readiness (stress inverted: 1 = calm, 5 = very stressed). */
export function readinessCombinedScore(responses: ReadinessResponses): number {
  const { recovery, stress, sleepQuality } = responses
  return recovery + sleepQuality + (6 - stress)
}

export function readinessFromResponses(responses: ReadinessResponses): ReadinessResult {
  const combinedScore = readinessCombinedScore(responses)
  if (combinedScore >= 12) {
    return {
      combinedScore,
      tier: 'full',
      title: 'Full workout',
      message: 'You look well recovered — train as planned and push for your usual volume.',
    }
  }
  if (combinedScore >= 8) {
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
