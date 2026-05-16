/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Anthropic API key for AI coach (Anthropic), import parse, and session summary in the browser.
   * Uses `anthropic-dangerous-direct-browser-access`; treat as personal/dev only.
   */
  readonly VITE_ANTHROPIC_API_KEY?: string
  readonly VITE_GOOGLE_CALENDAR_CLIENT_ID?: string
  /** Optional; defaults to current origin + pathname (SPA). Must match Google Cloud OAuth client redirect URIs. */
  readonly VITE_GOOGLE_CALENDAR_REDIRECT_URI?: string
  /** Giphy API key from https://developers.giphy.com/dashboard/ — powers exercise form GIFs in the library modal. */
  readonly VITE_GIPHY_API_KEY?: string
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
