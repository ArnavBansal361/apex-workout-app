/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Anthropic API key for AI coach (Anthropic), import parse, and session summary in the browser.
   * Uses `anthropic-dangerous-direct-browser-access`; treat as personal/dev only.
   */
  readonly VITE_ANTHROPIC_API_KEY?: string
  /** Alternate env name for the same key (some setups use this). */
  readonly VITE_CLAUDE_API_KEY?: string
  readonly VITE_GOOGLE_CALENDAR_CLIENT_ID?: string
  /** Optional; defaults to `window.location.origin`. Must match Google Cloud OAuth redirect URIs. */
  readonly VITE_GOOGLE_CALENDAR_REDIRECT_URI?: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  lang: string
  start(): void
  stop(): void
  onresult: ((ev: SpeechRecognitionEvent) => void) | null
  onerror: ((ev: Event) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}

declare const SpeechRecognition: {
  prototype: SpeechRecognition
  new (): SpeechRecognition
}

interface Window {
  SpeechRecognition: typeof SpeechRecognition
  webkitSpeechRecognition: typeof SpeechRecognition
}

declare module '*.svg?raw' {
  const content: string
  export default content
}

declare module 'bwip-js' {
  export interface BwipRenderOptions {
    bcid: string
    text: string
    scale?: number
    height?: number
    includetext?: boolean
    backgroundcolor?: string
    barcolor?: string
  }
  export function toCanvas(
    canvas: HTMLCanvasElement,
    opts: BwipRenderOptions,
  ): HTMLCanvasElement
}
