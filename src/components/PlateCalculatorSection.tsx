import { useMemo } from 'react'
import {
  formatBarLabel,
  patchBarWeightPrefs,
  resolveBarWeight,
  standardBarLabel,
  type BarWeightPrefs,
} from '../lib/barWeightPrefs'
import { platesPerSide } from '../lib/stats'

const inp =
  'rounded-[8px] border-[0.5px] border-[var(--apex-border)] bg-[var(--apex-surface-nested)] px-3 text-[16px] font-normal text-[#e0e0e0] placeholder:text-[#9898a0]'

type Props = {
  totalWeight: number
  unit: 'lbs' | 'kg'
  barPrefs: BarWeightPrefs
  onBarPrefsChange: (prefs: BarWeightPrefs) => void
}

export function PlateCalculatorSection({ totalWeight, unit, barPrefs, onBarPrefsChange }: Props) {
  const barWeight = resolveBarWeight(unit, barPrefs)
  const plateBreakdown = useMemo(
    () => platesPerSide(totalWeight, unit, barWeight),
    [totalWeight, unit, barWeight],
  )

  if (!plateBreakdown) return null

  const standardLabel = standardBarLabel(unit)

  function setMode(mode: BarWeightPrefs['mode']) {
    onBarPrefsChange(patchBarWeightPrefs({ mode }))
  }

  function setCustomValue(raw: string) {
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    onBarPrefsChange(
      patchBarWeightPrefs(unit === 'lbs' ? { customLbs: n } : { customKg: n }),
    )
  }

  const customValue = unit === 'lbs' ? barPrefs.customLbs : barPrefs.customKg

  return (
    <div className="mt-3">
      <p
        className="mb-2 text-[10px] font-normal uppercase tracking-[0.08em]"
        style={{ color: 'rgba(255,255,255,0.3)' }}
      >
        Plates per side
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {plateBreakdown.chips.map((chip, i) => (
          <span
            key={`${chip.label}-${i}`}
            className="text-[12px] font-medium text-white"
            style={{
              borderRadius: 99,
              padding: '4px 10px',
              border: `0.5px solid rgba(255,255,255,${chip.opacity})`,
              background: 'transparent',
            }}
          >
            {chip.label}
          </span>
        ))}
        <span className="text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {formatBarLabel(unit, barPrefs)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`min-h-9 rounded-[8px] border-[0.5px] px-3 text-[12px] font-medium touch-manipulation ${
            barPrefs.mode === 'standard'
              ? 'border-white/25 bg-white/[0.1] text-[#ececee]'
              : 'border-white/[0.08] text-[#a0a0a8]'
          }`}
          onClick={() => setMode('standard')}
        >
          {standardLabel}
        </button>
        <button
          type="button"
          className={`min-h-9 rounded-[8px] border-[0.5px] px-3 text-[12px] font-medium touch-manipulation ${
            barPrefs.mode === 'custom'
              ? 'border-white/25 bg-white/[0.1] text-[#ececee]'
              : 'border-white/[0.08] text-[#a0a0a8]'
          }`}
          onClick={() => setMode('custom')}
        >
          Custom bar
        </button>
        {barPrefs.mode === 'custom' ? (
          <input
            inputMode="decimal"
            className={`min-h-9 w-24 ${inp}`}
            value={String(customValue)}
            onChange={(e) => setCustomValue(e.target.value)}
            aria-label={`Custom bar weight (${unit})`}
          />
        ) : null}
      </div>
    </div>
  )
}
