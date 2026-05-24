import type { CoachChatImage } from '../types'

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const MAX_INPUT_BYTES = 12 * 1024 * 1024
const MAX_EDGE_PX = 1568
const JPEG_QUALITY = 0.82

export function coachImageDataUrl(image: CoachChatImage): string {
  return `data:${image.mediaType};base64,${image.data}`
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image'))
    }
    img.src = url
  })
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Could not process image'))
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Could not encode image'))
        return
      }
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(new Error('Could not encode image'))
    reader.readAsDataURL(blob)
  })
}

/** Resize and compress a photo for coach vision API + local persistence. */
export async function prepareCoachChatImage(file: File): Promise<CoachChatImage> {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error('Use a JPEG, PNG, GIF, or WebP photo')
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Image is too large (max 12 MB)')
  }

  const img = await loadImageFromFile(file)
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  if (!w || !h) throw new Error('Invalid image dimensions')

  const scale = Math.min(1, MAX_EDGE_PX / Math.max(w, h))
  const tw = Math.max(1, Math.round(w * scale))
  const th = Math.max(1, Math.round(h * scale))

  const canvas = document.createElement('canvas')
  canvas.width = tw
  canvas.height = th
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process image')
  ctx.drawImage(img, 0, 0, tw, th)

  const blob = await canvasToJpegBlob(canvas)
  const data = await blobToBase64(blob)
  if (data.length > 4_500_000) {
    throw new Error('Image is still too large after compression — try a smaller photo')
  }

  return { mediaType: 'image/jpeg', data }
}
