/** Radius for “at the gym” geofence (meters). */
export const GYM_GEOFENCE_RADIUS_M = 200

export type SavedGymLocation = {
  lat: number
  lng: number
  label?: string
}

export function geolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator
}

/** Great-circle distance in meters. */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const r = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function isWithinGymRadius(
  userLat: number,
  userLng: number,
  gym: SavedGymLocation,
  radiusM = GYM_GEOFENCE_RADIUS_M,
): boolean {
  return distanceMeters(userLat, userLng, gym.lat, gym.lng) <= radiusM
}

export function requestCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!geolocationSupported()) {
      reject(new Error('Geolocation is not supported in this browser.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 60_000,
    })
  })
}

export type GymGeofenceHandlers = {
  onEnterGym: () => void
  onLeaveGym: () => void
  isSessionActive: () => boolean
}

/**
 * Watches device position and fires handlers on geofence enter/leave transitions.
 */
export function startGymGeofenceWatch(
  gym: SavedGymLocation | null,
  enabled: boolean,
  handlers: GymGeofenceHandlers,
): () => void {
  if (!enabled || !gym || !geolocationSupported()) return () => {}

  let inside = false
  let watchId: number | null = null

  const onPosition = (pos: GeolocationPosition) => {
    const nowInside = isWithinGymRadius(
      pos.coords.latitude,
      pos.coords.longitude,
      gym,
    )

    if (nowInside && !inside) {
      inside = true
      if (!handlers.isSessionActive()) handlers.onEnterGym()
    } else if (!nowInside && inside) {
      inside = false
      if (handlers.isSessionActive()) handlers.onLeaveGym()
    } else {
      inside = nowInside
    }
  }

  watchId = navigator.geolocation.watchPosition(onPosition, () => {}, {
    enableHighAccuracy: true,
    maximumAge: 45_000,
    timeout: 25_000,
  })

  return () => {
    if (watchId != null) navigator.geolocation.clearWatch(watchId)
  }
}
