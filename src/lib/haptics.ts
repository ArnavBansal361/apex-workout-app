import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

async function runImpact(style: ImpactStyle): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Haptics.impact({ style })
    } catch {
      /* unavailable */
    }
    return
  }
  if (typeof navigator === 'undefined' || !navigator.vibrate) return
  try {
    switch (style) {
      case ImpactStyle.Light:
        navigator.vibrate(12)
        break
      case ImpactStyle.Medium:
        navigator.vibrate(36)
        break
      case ImpactStyle.Heavy:
        navigator.vibrate([100, 60, 100])
        break
      default:
        navigator.vibrate(24)
    }
  } catch {
    /* ignore */
  }
}

/** Always fires when a set is saved (independent of Celebrations toggle). */
export function hapticOnSetLogged(): void {
  void runImpact(ImpactStyle.Light)
}

function celebrationsOn(celebrationsEnabled: boolean | undefined): boolean {
  return celebrationsEnabled !== false
}

export function hapticOnRestTimerEnd(celebrationsEnabled: boolean | undefined): void {
  if (!celebrationsOn(celebrationsEnabled)) return
  void runImpact(ImpactStyle.Medium)
}

/** Rest timer reached zero — always medium impact (independent of Celebrations). */
export function hapticRestTimerComplete(): void {
  void runImpact(ImpactStyle.Medium)
}

export function hapticOnPrDetected(celebrationsEnabled: boolean | undefined): void {
  if (!celebrationsOn(celebrationsEnabled)) return
  void runImpact(ImpactStyle.Heavy)
}

export function hapticOnPrCelebrationShown(celebrationsEnabled: boolean | undefined): void {
  if (!celebrationsOn(celebrationsEnabled)) return
  void runImpact(ImpactStyle.Heavy)
}

export function hapticOnWorkoutComplete(celebrationsEnabled: boolean | undefined): void {
  if (!celebrationsOn(celebrationsEnabled)) return
  void runImpact(ImpactStyle.Heavy)
}
