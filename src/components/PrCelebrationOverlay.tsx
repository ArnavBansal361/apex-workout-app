import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import type { PrCelebrationData } from '../types'

const CONFETTI_COUNT = 30

function mulberry32(seed: number) {
  return function next() {
    let a = (seed += 0x6d2b79f5)
    a = Math.imul(a ^ (a >>> 15), a | 1)
    a ^= a + Math.imul(a ^ (a >>> 7), a | 61)
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296
  }
}

function buildConfettiPieces() {
  const rand = mulberry32(0xae42)
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => {
    const r = rand()
    const size = 8 + Math.floor(rand() * 9)
    return {
      id: i,
      left: `${r * 100}%`,
      delay: `${r * 2.2}s`,
      duration: `${2.5 + rand() * 2}s`,
      rotation: `${Math.floor(rand() * 360)}deg`,
      width: size,
      height: i % 3 === 0 ? size : 8 + Math.floor(rand() * 9),
      diamond: i % 3 === 0,
      muted: i % 2 === 1,
    }
  })
}

/** Same mountain path as /public/apex-logo.svg */
function drawMountain(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size / 24
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(s, s)
  ctx.translate(-12, -12)
  ctx.beginPath()
  ctx.moveTo(3, 18)
  ctx.lineTo(9, 10)
  ctx.lineTo(13, 15)
  ctx.lineTo(16, 11)
  ctx.lineTo(21, 18)
  ctx.closePath()
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.restore()
}

function drawPrShareCard(canvas: HTMLCanvasElement, data: PrCelebrationData): void {
  const w = 1080
  const h = 1350
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#1a1a1a')
  bg.addColorStop(1, '#0a0a0a')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 3
  ctx.strokeRect(48, 48, w - 96, h - 96)

  drawMountain(ctx, w / 2, 200, 120)

  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '600 36px system-ui, -apple-system, sans-serif'
  ctx.fillText('NEW PERSONAL RECORD', w / 2, 320)

  ctx.fillStyle = '#ffffff'
  ctx.font = '700 72px system-ui, -apple-system, sans-serif'
  const nameLines = wrapText(ctx, data.exerciseName, w - 160)
  let y = 480
  for (const line of nameLines) {
    ctx.fillText(line, w / 2, y)
    y += 84
  }

  ctx.fillStyle = 'rgba(255,255,255,0.88)'
  ctx.font = '500 48px system-ui, -apple-system, sans-serif'
  ctx.fillText(data.detail, w / 2, y + 40)

  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = '500 34px system-ui, -apple-system, sans-serif'
  ctx.fillText(data.dateLabel, w / 2, y + 120)

  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = '700 42px system-ui, -apple-system, sans-serif'
  ctx.fillText('APEX', w / 2, h - 120)
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines: string[] = []
  let line = words[0]!
  for (let i = 1; i < words.length; i++) {
    const test = `${line} ${words[i]}`
    if (ctx.measureText(test).width > maxWidth) {
      lines.push(line)
      line = words[i]!
    } else {
      line = test
    }
  }
  lines.push(line)
  return lines.slice(0, 3)
}

async function sharePrCanvas(canvas: HTMLCanvasElement, data: PrCelebrationData): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not create image')
  const file = new File([blob], 'apex-pr.png', { type: 'image/png' })
  const text = `New PR — ${data.exerciseName}: ${data.detail} (${data.dateLabel})`
  if (navigator.share) {
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Lift PR', text })
        return
      }
      await navigator.share({ title: 'Lift PR', text })
      return
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'apex-pr.png'
  a.click()
  URL.revokeObjectURL(url)
}

function TrophyIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M8 4h8v2.5c0 2.2 1.4 4.1 3.3 4.8L19 13H5l2.7-1.7C9.6 10.6 11 8.7 11 6.5V4z"
        stroke="#3d7ab5"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M9 17h6v3H9v-3z" fill="#3d7ab5" />
      <path d="M7 20h10" stroke="#3d7ab5" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

async function firePrCelebrationHaptics(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({ style: ImpactStyle.Heavy })
      await new Promise((r) => setTimeout(r, 150))
      await Haptics.impact({ style: ImpactStyle.Heavy })
      return
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([100, 60, 100])
      await new Promise((r) => setTimeout(r, 150))
      navigator.vibrate([100, 60, 100])
    }
  } catch {
    /* unavailable */
  }
}

export function PrCelebrationOverlay() {
  const { prCelebration, dismissPrCelebration, notify } = useWorkout()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const confetti = useMemo(() => buildConfettiPieces(), [])

  useEffect(() => {
    if (!prCelebration) return
    void firePrCelebrationHaptics()
  }, [prCelebration])

  useEffect(() => {
    if (!prCelebration || !canvasRef.current) return
    drawPrShareCard(canvasRef.current, prCelebration)
  }, [prCelebration])

  const handleShare = useCallback(async () => {
    if (!canvasRef.current || !prCelebration) return
    drawPrShareCard(canvasRef.current, prCelebration)
    try {
      await sharePrCanvas(canvasRef.current, prCelebration)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not share')
    }
  }, [prCelebration, notify])

  if (!prCelebration) return null

  const { exerciseName, headlineValue, headlineUnit, pillLast, pillDelta } = prCelebration

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="apex-pr-title"
      className="apex-pr-celebration fixed inset-0 z-[101] flex flex-col bg-[#090d14] text-white overflow-hidden"
    >
      <canvas ref={canvasRef} className="hidden" aria-hidden />

      <div className="apex-pr-celebration__confetti pointer-events-none" aria-hidden>
        {confetti.map((p) => (
          <span
            key={p.id}
            className={`apex-pr-celebration__confetti-piece${
              p.diamond ? ' apex-pr-celebration__confetti-piece--diamond' : ''
            }${p.muted ? ' apex-pr-celebration__confetti-piece--muted' : ''}`}
            style={{
              left: p.left,
              width: p.width,
              height: p.height,
              marginLeft: -(p.width / 2),
              animationDelay: p.delay,
              animationDuration: p.duration,
              ['--apex-pr-confetti-rot' as string]: p.rotation,
            }}
          />
        ))}
      </div>

      <div className="apex-pr-celebration__center flex-1 flex flex-col items-center justify-center px-6 min-h-0 relative z-[1]">
        <div className="apex-pr-celebration__trophy" aria-hidden>
          <TrophyIcon />
        </div>
        <h1 id="apex-pr-title" className="apex-pr-celebration__title">
          New PR 🏆
        </h1>
        <p className="apex-pr-celebration__exercise">{exerciseName}</p>
        <p className="apex-pr-celebration__weight tabular-nums">
          {headlineValue}
          <span className="apex-pr-celebration__weight-unit">{headlineUnit}</span>
        </p>
        {pillLast && pillDelta ? (
          <p className="apex-pr-celebration__pill">
            <span className="apex-pr-celebration__pill-last">{pillLast}</span>
            <span className="apex-pr-celebration__pill-delta">{pillDelta}</span>
          </p>
        ) : null}
      </div>

      <footer className="apex-pr-celebration__footer apex-safe-bottom shrink-0 px-4 pb-4 relative z-[1]">
        <button type="button" className="apex-pr-celebration__share-btn" onClick={() => void handleShare()}>
          ↑ Share PR card
        </button>
        <button type="button" className="apex-pr-celebration__continue-btn" onClick={dismissPrCelebration}>
          Keep going →
        </button>
      </footer>
    </div>
  )
}
