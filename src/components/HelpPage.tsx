import { useMemo, useState } from 'react'
import { EXERCISES, getExerciseHelp } from '../data/exercises'
import { ApexLogo } from './ApexLogo'
import { HelpExerciseAnimation } from './HelpExerciseAnimation'

type Props = { onClose: () => void }

export function HelpPage({ onClose }: Props) {
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return EXERCISES.filter(
      (e) =>
        !s ||
        e.name.toLowerCase().includes(s) ||
        e.muscleGroup.toLowerCase().includes(s),
    )
  }, [q])

  return (
    <div className="apex-theme-shell fixed inset-0 z-[90] flex flex-col bg-[var(--apex-surface-page)] text-[var(--apex-text-primary)]">
      <header className="px-4 pt-3 pb-2 border-b border-[#1e1e1e] space-y-2">
        <div className="flex items-center justify-between gap-2">
          <ApexLogo />
          <button
            type="button"
            className="min-h-11 min-w-11 rounded-[12px] border border-[#1e1e1e] bg-[#161616] text-[13px] text-[#e0e0e0]"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <input
          className="w-full min-h-12 rounded-[12px] border border-[#1e1e1e] bg-[#161616] px-3 text-[13px] text-[#e0e0e0] placeholder:text-[#9898a0]"
          placeholder="Search exercises"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24">
        {list.map((e) => {
          const h = getExerciseHelp(e)
          return (
            <details key={e.id} className="apex-card p-4">
              <summary className="cursor-pointer list-none flex justify-between gap-2 min-h-12 items-start">
                <div>
                  <span className="text-[13px] font-normal text-[#e0e0e0] block">{e.name}</span>
                  <span className="text-[11px] text-[#a8a8b0] mt-0.5 block">{e.muscleGroup}</span>
                </div>
                <span className="text-[#a8a8b0] text-lg leading-none">▼</span>
              </summary>
              <div className="mt-4 border-t border-[#1e1e1e] pt-4 space-y-4">
                <HelpExerciseAnimation exerciseId={e.id} />
                <div>
                  <p className="apex-section-label mb-2">Form tips</p>
                  <p className="text-[11px] font-normal text-[#a8a8b0] leading-relaxed">{h.formTips}</p>
                </div>
                <div>
                  <p className="apex-section-label mb-2">Common mistakes</p>
                  <p className="text-[11px] font-normal text-[#a8a8b0] leading-relaxed">{h.commonMistakes}</p>
                </div>
                <div>
                  <p className="apex-section-label mb-2">Beginner advice</p>
                  <p className="text-[11px] font-normal text-[#a8a8b0] leading-relaxed">{h.beginnerAdvice}</p>
                </div>
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}
