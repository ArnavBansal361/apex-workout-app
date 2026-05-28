import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'

const NAV_STATE_KEY = 'apexSwipeBack'

/** Selectors for visible custom back / dismiss controls (topmost first). */
const BACK_CONTROL_SELECTORS = [
  '.apex-me-back',
  '.apex-settings-screen__back',
  '.apex-onboarding__back',
  '[data-apex-swipe-back]',
] as const

let installed = false
let edgeListenerInstalled = false

function isCapacitorNative(): boolean {
  return Capacitor.isNativePlatform()
}

function findTopBackControl(): HTMLElement | null {
  for (const selector of BACK_CONTROL_SELECTORS) {
    const nodes = document.querySelectorAll<HTMLElement>(selector)
    for (let i = nodes.length - 1; i >= 0; i--) {
      const el = nodes[i]!
      if (!el.isConnected) continue
      const rect = el.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) continue
      const style = window.getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      return el
    }
  }
  return null
}

function tryActivateBackControl(): boolean {
  const control = findTopBackControl()
  if (!control) return false
  control.click()
  return true
}

function installEdgeSwipeFallback() {
  if (edgeListenerInstalled || typeof window === 'undefined') return
  edgeListenerInstalled = true

  const EDGE_PX = 28
  const MIN_SWIPE_PX = 56
  let startX = 0
  let startY = 0
  let tracking = false

  window.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]!
      if (t.clientX > EDGE_PX) return
      const target = e.target
      if (target instanceof Element && target.closest('.apex-log-set-sheet__handle-wrap')) {
        return
      }
      startX = t.clientX
      startY = t.clientY
      tracking = true
    },
    { passive: true, capture: true },
  )

  window.addEventListener(
    'touchend',
    (e) => {
      if (!tracking) return
      tracking = false
      if (e.changedTouches.length !== 1) return
      const t = e.changedTouches[0]!
      const dx = t.clientX - startX
      const dy = Math.abs(t.clientY - startY)
      if (dx < MIN_SWIPE_PX || dy > dx * 0.85) return
      if (window.history.state?.[NAV_STATE_KEY]) {
        window.history.back()
        return
      }
      tryActivateBackControl()
    },
    { passive: true, capture: true },
  )
}

/**
 * Enables iOS WKWebView swipe-back (via native config) and syncs in-app overlays with history.
 * Call once at app root.
 */
export function installSwipeBackNavigation(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  if (isCapacitorNative()) {
    document.documentElement.classList.add('apex-capacitor-native')
  }

  window.addEventListener('popstate', () => {
    if (!window.history.state?.[NAV_STATE_KEY]) {
      tryActivateBackControl()
    }
  })

  installEdgeSwipeFallback()
}

/**
 * Pushes a history entry while `active` so native swipe-back and history.back() invoke `onBack`.
 */
export function useSwipeBackLayer(active: boolean, onBack: () => void): void {
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  const pushedRef = useRef(false)

  useEffect(() => {
    if (!active) return

    window.history.pushState({ [NAV_STATE_KEY]: true }, '')
    pushedRef.current = true

    const onPopState = () => {
      pushedRef.current = false
      onBackRef.current()
    }

    window.addEventListener('popstate', onPopState, { capture: true })
    return () => {
      window.removeEventListener('popstate', onPopState, { capture: true })
      if (pushedRef.current) {
        pushedRef.current = false
        window.history.back()
      }
    }
  }, [active])
}
