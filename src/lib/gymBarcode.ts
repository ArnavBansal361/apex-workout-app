import * as bwipjs from 'bwip-js'
import { Preferences } from '@capacitor/preferences'

export const APEX_GYM_BARCODE_KEY = 'apex-gym-barcode'

export type GymBarcodeFormat = 'code128' | 'code39' | 'ean13' | 'qrcode'

export type GymBarcodeStored = {
  number: string
  format: GymBarcodeFormat
  gymName?: string
}

export const GYM_BARCODE_FORMAT_OPTIONS: { value: GymBarcodeFormat; label: string }[] = [
  { value: 'code128', label: 'Code128' },
  { value: 'code39', label: 'Code39' },
  { value: 'ean13', label: 'EAN-13' },
  { value: 'qrcode', label: 'QR Code' },
]

function parseStored(raw: string): GymBarcodeStored | null {
  const o = JSON.parse(raw) as Record<string, unknown>
  const number = typeof o.number === 'string' ? o.number.trim() : ''
  const format = o.format
  if (!number) return null
  if (format !== 'code128' && format !== 'code39' && format !== 'ean13' && format !== 'qrcode') {
    return null
  }
  const gymName = typeof o.gymName === 'string' ? o.gymName.trim() : ''
  return { number, format, ...(gymName ? { gymName } : {}) }
}

export function readGymBarcode(): GymBarcodeStored | null {
  try {
    const raw = localStorage.getItem(APEX_GYM_BARCODE_KEY)
    if (!raw) return null
    return parseStored(raw)
  } catch {
    return null
  }
}

/** Async read — checks Capacitor Preferences first (persists on iOS), falls back to localStorage. */
export async function readGymBarcodeAsync(): Promise<GymBarcodeStored | null> {
  try {
    const { value } = await Preferences.get({ key: APEX_GYM_BARCODE_KEY })
    if (value) return parseStored(value)
  } catch {
    // fall through to localStorage
  }
  return readGymBarcode()
}

export function writeGymBarcode(data: GymBarcodeStored | null): void {
  try {
    if (!data?.number.trim()) {
      localStorage.removeItem(APEX_GYM_BARCODE_KEY)
      void Preferences.remove({ key: APEX_GYM_BARCODE_KEY })
      return
    }
    const serialized = JSON.stringify({
      number: data.number.trim(),
      format: data.format,
      ...(data.gymName?.trim() ? { gymName: data.gymName.trim() } : {}),
    })
    localStorage.setItem(APEX_GYM_BARCODE_KEY, serialized)
    void Preferences.set({ key: APEX_GYM_BARCODE_KEY, value: serialized })
  } catch {
    /* ignore */
  }
}

function bwipBcid(format: GymBarcodeFormat): string {
  switch (format) {
    case 'code128':
      return 'code128'
    case 'code39':
      return 'code39'
    case 'ean13':
      return 'ean13'
    case 'qrcode':
      return 'qrcode'
  }
}

/** Render a scannable barcode onto a canvas using bwip-js. */
export function renderGymBarcodeToCanvas(
  canvas: HTMLCanvasElement,
  data: GymBarcodeStored,
): void {
  const isQr = data.format === 'qrcode'
  bwipjs.toCanvas(canvas, {
    bcid: bwipBcid(data.format),
    text: data.number,
    scale: isQr ? 5 : 3,
    ...(isQr ? {} : { height: 14 }),
    includetext: false,
    backgroundcolor: 'ffffff',
    barcolor: '000000',
  })
}

/** Keep screen awake while the gym card modal is open (best-effort). */
export async function requestGymCardScreenWakeLock(): Promise<() => void> {
  const nav = navigator as Navigator & {
    wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
  }
  if (!nav.wakeLock?.request) return () => {}
  try {
    const lock = await nav.wakeLock.request('screen')
    return () => {
      void lock.release()
    }
  } catch {
    return () => {}
  }
}
