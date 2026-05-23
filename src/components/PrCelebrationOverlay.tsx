import { useCallback, useEffect, useRef } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import type { PrCelebrationData } from '../types'

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
        await navigator.share({ files: [file], title: 'Apex PR', text })
        return
      }
      await navigator.share({ title: 'Apex PR', text })
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

export function PrCelebrationOverlay() {
  const { prCelebration, dismissPrCelebration, notify } = useWorkout()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!prCelebration || !canvasRef.current) return
    drawPrShareCard(canvasRef.current, prCelebration)
    if (previewRef.current) {
      drawPrShareCard(previewRef.current, prCelebration)
    }
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="apex-pr-title"
      className="fixed inset-0 z-[99] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={dismissPrCelebration}
    >
      <canvas ref={canvasRef} className="hidden" aria-hidden />
      <div
        className="w-full max-w-sm rounded-[20px] border border-white/[0.12] bg-[#141414] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="apex-pr-title" className="apex-section-label text-center mb-4">
          Personal record
        </p>
        <canvas
          ref={previewRef}
          className="w-full rounded-[14px] border border-white/[0.08]"
          style={{ aspectRatio: '1080 / 1350' }}
        />
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="apex-btn flex-1 min-h-11 text-[13px] font-semibold"
            onClick={dismissPrCelebration}
          >
            Done
          </button>
          <button
            type="button"
            className="apex-btn-primary flex-1 min-h-11 text-[13px] font-semibold"
            onClick={() => void handleShare()}
          >
            Share
          </button>
        </div>
      </div>
    </div>
  )
}
