/**
 * Live location: pure helpers (no Firebase, no browser APIs), unit tested.
 *
 * Sharing is opt-in per trip and per device. While it's on and happs is open,
 * the phone's position is written to `trips/{tripId}/locations/{uid}`, which
 * only trip members can read. Turning it off deletes that document.
 */

export interface Fix {
  lat: number
  lng: number
  /** Metres, as reported by the device. */
  accuracy: number
  /** Milliseconds since the epoch. */
  at: number
}

/** Never write more often than this, however far you've moved. */
export const MIN_INTERVAL_MS = 10_000
/** Write at least this often while standing still, so others see you're still sharing. */
export const HEARTBEAT_MS = 2 * 60_000
/** Movement that's worth a write (metres). */
export const MIN_MOVE_M = 25
/** Older than this, a person's pin is shown faded with "last seen". */
export const STALE_MS = 10 * 60_000
/** Older than this, a person's pin is hidden (they closed happs and forgot to turn it off). */
export const HIDE_MS = 6 * 60 * 60_000

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Should this fix be written, given the last one that was? Keeps Firestore
 * writes (and battery) low: a write when you've moved more than the noise, or
 * a heartbeat when you haven't, never more than one every MIN_INTERVAL_MS.
 */
export function shouldSend(last: Fix | null, next: Fix): boolean {
  if (!last) return true
  const dt = next.at - last.at
  if (dt < MIN_INTERVAL_MS) return false
  if (dt >= HEARTBEAT_MS) return true
  // Moves smaller than the GPS error are just noise.
  const noise = Math.max(MIN_MOVE_M, Math.min(last.accuracy, next.accuracy))
  if (distanceM(last, next) > noise) return true
  // A much better fix (e.g. GPS after Wi-Fi) is worth sending.
  return next.accuracy < last.accuracy / 2
}

export type Freshness = 'live' | 'stale' | 'hidden'

export function freshness(updatedAt: number, now: number): Freshness {
  const age = now - updatedAt
  if (age > HIDE_MS) return 'hidden'
  if (age > STALE_MS) return 'stale'
  return 'live'
}

/** "Just now", "4 min ago", "2 hr ago". */
export function ageLabel(updatedAt: number, now: number): string {
  const min = Math.floor(Math.max(0, now - updatedAt) / 60_000)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min} min ago`
  return `${Math.floor(min / 60)} hr ago`
}

/** Where to turn location back on, in iOS's words. */
export const IOS_LOCATION_HELP = 'On iPhone: Settings › Privacy & Security › Location Services: turn it on, then Safari Websites › While Using the App.'
