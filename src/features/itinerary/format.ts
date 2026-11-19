import type { Item } from '@/lib/firestore'
import { formatTime } from '@/shared/dates'

export function timeLabel(item: Item): string {
  if (item.type === 'stay') return item.checkIn?.time ? `Check in ${formatTime(item.checkIn.time)}` : 'Check in'
  if (!item.startTime) return 'Anytime'
  return item.endTime ? `${formatTime(item.startTime)} – ${formatTime(item.endTime)}` : formatTime(item.startTime)
}

/** Deep link that opens Google Maps on the exact place when we have its placeId. */
export function googleMapsUrl(loc: NonNullable<Item['location']>): string {
  const q = encodeURIComponent(loc.lat !== null && loc.lng !== null ? `${loc.lat},${loc.lng}` : `${loc.name} ${loc.address}`)
  return `https://www.google.com/maps/search/?api=1&query=${q}${loc.placeId ? `&query_place_id=${encodeURIComponent(loc.placeId)}` : ''}`
}

/** "in 45 min", "in 2 h 10 min". */
export function inMinutes(m: number): string {
  if (m < 60) return `in ${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `in ${h} h ${r} min` : `in ${h} h`
}
