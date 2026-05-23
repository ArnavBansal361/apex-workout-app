import { useApexChartColors } from '../lib/stats'
import type { MuscleGroup } from '../types'

const ORDER: MuscleGroup[] = [
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
  'Cardio',
  'Stretches',
]

type Props = {
  counts: Record<string, number>
}

export function MuscleBarChart({ counts }: Props) {
  const chart = useApexChartColors()
  const max = Math.max(1, ...ORDER.map((m) => counts[m] ?? 0))
  return (
    <div className="apex-card p-4">
      <h3 className="apex-section-label mb-4">Volume today</h3>
      <div className="space-y-2">
        {ORDER.map((m) => {
          const v = counts[m] ?? 0
          const pct = (v / max) * 100
          return (
            <div key={m}>
              <div className="flex justify-between text-[13px] font-normal mb-1" style={{ color: chart.label }}>
                <span>{m}</span>
                <span className="tabular-nums" style={{ color: chart.tick }}>
                  {v}
                </span>
              </div>
              <div
                className="h-[2px] rounded-full overflow-hidden"
                style={{ backgroundColor: chart.grid }}
              >
                <div
                  className="h-[2px] rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${pct}%`, backgroundColor: chart.bar }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
