import { useRef } from 'react'
import html2canvas from 'html2canvas'
import { formatDuration } from '../lib/timers'
import type { SessionBadge } from '../lib/streakShield'

export type SessionStretchSuggestion = {
  id: string
  name: string
  hold: string
  targets: string
  instructions: string
}

export type SessionSummaryData = {
  dateLabel: string
  durationSec: number
  exerciseNames: string[]
  totalSets: number
  prCount: number
  headline: string
  badges: SessionBadge[]
  comebackMessage: string | null
  stretchSuggestions?: SessionStretchSuggestion[]
}

type Props = {
  open: boolean
  data: SessionSummaryData | null
  shareText: string
  onClose: () => void
}

export function SessionSummaryModal({ open, data, shareText, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)

  async function downloadImage() {
    if (!cardRef.current) return
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0c0c0c',
        scale: 2,
        logging: false,
      })
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `apex-workout-${new Date().toISOString().slice(0, 10)}.png`
      a.click()
    } catch {
      /* ignore */
    }
  }

  async function shareOut() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Lift workout', text: shareText })
      } catch {
        await navigator.clipboard.writeText(shareText)
      }
    } else {
      await navigator.clipboard.writeText(shareText)
    }
  }

  if (!open || !data) return null

  return (
    <div
      role="presentation"
      className="apex-modal-overlay fixed inset-0 z-[85] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <div ref={cardRef} className="apex-card p-6">
          <p className="apex-section-label">Apex</p>
          <p className="mt-2 text-[13px] font-normal text-[#e0e0e0]">{data.headline}</p>
          {data.comebackMessage ? (
            <p className="mt-2 text-[13px] font-medium text-[#ececee] leading-relaxed">
              {data.comebackMessage}
            </p>
          ) : null}
          <p className="mt-2 text-[13px] font-normal text-[#a0a0a8]">{data.dateLabel}</p>
          {data.badges.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {data.badges.map((badge) => (
                <span
                  key={badge.id}
                  className={`apex-session-badge apex-session-badge--${badge.id}`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-[12px] border border-[#1e1e1e] bg-[#121212] px-4 py-3">
              <p className="apex-section-label mb-2">Duration</p>
              <p className="apex-stat-num tabular-nums">{formatDuration(data.durationSec)}</p>
            </div>
            <div className="rounded-[12px] border border-[#1e1e1e] bg-[#121212] px-4 py-3">
              <p className="apex-section-label mb-2">Total sets</p>
              <p className="apex-stat-num tabular-nums">{data.totalSets}</p>
            </div>
            <div className="rounded-[12px] border border-[#1e1e1e] bg-[#121212] px-4 py-3">
              <p className="apex-section-label mb-2">PRs</p>
              <p className="apex-stat-num tabular-nums">{data.prCount}</p>
            </div>
            <div className="rounded-[12px] border border-[#1e1e1e] bg-[#121212] px-4 py-3">
              <p className="apex-section-label mb-2">Exercises</p>
              <p className="apex-stat-num">{data.exerciseNames.length}</p>
            </div>
          </div>
          {data.exerciseNames.length > 0 ? (
            <div className="mt-5 rounded-[12px] border border-[#1e1e1e] bg-[#121212] p-3">
              <p className="apex-section-label mb-2">Exercises</p>
              <ul className="text-[13px] font-normal text-[#bbb] space-y-1 max-h-32 overflow-y-auto">
                {data.exerciseNames.map((n) => (
                  <li key={n}>· {n}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.stretchSuggestions && data.stretchSuggestions.length > 0 ? (
            <div className="mt-5 rounded-[12px] border border-[#1e1e1e] bg-[#121212] p-3">
              <p className="apex-section-label mb-2">Cooldown stretches</p>
              <ul className="space-y-2.5 max-h-48 overflow-y-auto">
                {data.stretchSuggestions.map((s) => (
                  <li key={s.id} className="text-[12px] leading-relaxed">
                    <p className="font-medium text-[#e8e8ea]">{s.name}</p>
                    <p className="text-[#9898a0] mt-0.5">
                      {s.targets} · {s.hold}
                    </p>
                    <p className="text-[#a8a8b0] mt-1">{s.instructions}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.badges.some((b) => b.id === 'short-session') ? (
            <p className="mt-4 text-[12px] font-medium text-[#a0a0a8] leading-relaxed">
              Short sessions still count toward your streak and weekly progress.
            </p>
          ) : null}
          {data.badges.some((b) => b.id === 'efficient-session') ? (
            <p className="mt-2 text-[12px] font-medium text-[#a0a0a8] leading-relaxed">
              20 minutes counts — a focused session beats skipping the gym.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="min-h-12 w-full rounded-[12px] border border-[#1e1e1e] bg-[#161616] text-[13px] font-normal text-[#e0e0e0]"
            onClick={downloadImage}
          >
            Download as image
          </button>
          <button
            type="button"
            className="min-h-12 w-full rounded-[12px] border border-[#1e1e1e] bg-[#161616] text-[13px] font-normal text-[#e0e0e0]"
            onClick={() => void shareOut()}
          >
            Share text summary
          </button>
          <button type="button" className="min-h-11 text-[13px] font-normal text-[#a0a0a8]" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
