/** XP awards (documented for balance tweaks). */
export const XP_PER_SET = 5
export const XP_PER_WORKOUT_COMPLETE = 50
export const XP_PER_PR = 100

export type LevelTier = 'beginner' | 'intermediate' | 'advanced' | 'elite'

export type LevelInfo = {
  tier: LevelTier
  label: string
  /** XP at start of this tier */
  minXp: number
  /** XP at start of next tier, or null for elite (open-ended) */
  nextThreshold: number | null
  /** Progress 0–1 within this tier */
  progressInTier: number
  /** Avatar / accent ring color for this tier */
  ringColor: string
}

const TIERS: Omit<LevelInfo, 'progressInTier'>[] = [
  { tier: 'beginner', label: 'Beginner', minXp: 0, nextThreshold: 500, ringColor: 'rgba(255,255,255,0.35)' },
  { tier: 'intermediate', label: 'Intermediate', minXp: 500, nextThreshold: 2000, ringColor: 'rgba(255,255,255,0.5)' },
  { tier: 'advanced', label: 'Advanced', minXp: 2000, nextThreshold: 5000, ringColor: 'rgba(255,255,255,0.7)' },
  { tier: 'elite', label: 'Elite', minXp: 5000, nextThreshold: null, ringColor: '#ffffff' },
]

export function getLevelInfo(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp))
  let tierIdx = 0
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (xp >= TIERS[i]!.minXp) {
      tierIdx = i
      break
    }
  }
  const t = TIERS[tierIdx]!
  const next = t.nextThreshold
  let progressInTier: number
  if (next != null) {
    const span = next - t.minXp
    progressInTier = span <= 0 ? 1 : Math.min(1, Math.max(0, (xp - t.minXp) / span))
  } else {
    const span = 5000
    progressInTier = Math.min(1, Math.max(0, (xp - t.minXp) / span))
  }
  return { ...t, progressInTier }
}
