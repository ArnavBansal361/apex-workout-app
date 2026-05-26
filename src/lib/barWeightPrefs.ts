export const APEX_BAR_WEIGHT_KEY = 'apex-bar-weight'

export type BarWeightMode = 'standard' | 'custom'

export type BarWeightPrefs = {
  mode: BarWeightMode
  customLbs: number
  customKg: number
}

const DEFAULT_PREFS: BarWeightPrefs = {
  mode: 'standard',
  customLbs: 45,
  customKg: 20,
}

export const STANDARD_BAR_LBS = 45
export const STANDARD_BAR_KG = 20

function clampBar(n: number, unit: 'lbs' | 'kg'): number {
  if (!Number.isFinite(n) || n <= 0) return unit === 'lbs' ? STANDARD_BAR_LBS : STANDARD_BAR_KG
  const max = unit === 'lbs' ? 100 : 50
  return Math.min(max, Math.max(1, Math.round(n * 10) / 10))
}

export function readBarWeightPrefs(): BarWeightPrefs {
  try {
    const raw = localStorage.getItem(APEX_BAR_WEIGHT_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const p = JSON.parse(raw) as Partial<BarWeightPrefs>
    return {
      mode: p.mode === 'custom' ? 'custom' : 'standard',
      customLbs: clampBar(Number(p.customLbs), 'lbs'),
      customKg: clampBar(Number(p.customKg), 'kg'),
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function writeBarWeightPrefs(prefs: BarWeightPrefs): void {
  try {
    localStorage.setItem(APEX_BAR_WEIGHT_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore quota / private mode */
  }
}

export function resolveBarWeight(unit: 'lbs' | 'kg', prefs: BarWeightPrefs): number {
  if (prefs.mode === 'standard') {
    return unit === 'lbs' ? STANDARD_BAR_LBS : STANDARD_BAR_KG
  }
  return unit === 'lbs' ? prefs.customLbs : prefs.customKg
}

export function formatBarLabel(unit: 'lbs' | 'kg', prefs: BarWeightPrefs): string {
  const w = resolveBarWeight(unit, prefs)
  return unit === 'lbs' ? `${w}lb bar` : `${w}kg bar`
}

export function standardBarLabel(unit: 'lbs' | 'kg'): string {
  return unit === 'lbs' ? `${STANDARD_BAR_LBS}lb bar` : `${STANDARD_BAR_KG}kg bar`
}

export function patchBarWeightPrefs(patch: Partial<BarWeightPrefs>): BarWeightPrefs {
  const next: BarWeightPrefs = {
    ...readBarWeightPrefs(),
    ...patch,
  }
  if (patch.customLbs != null) next.customLbs = clampBar(patch.customLbs, 'lbs')
  if (patch.customKg != null) next.customKg = clampBar(patch.customKg, 'kg')
  writeBarWeightPrefs(next)
  return next
}
