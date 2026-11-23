import type { Item } from '@/lib/firestore'
import { compareItems, type ItemType } from '@/shared/itinerary'
import { transportMode, type TransportMode } from '@/features/itinerary/itemTypes'

export interface MapStop {
  item: Item
  lat: number
  lng: number
  /** 1-based position in the day's timed schedule; null for stays, "Anytime" plans and the all-days view. */
  number: number | null
  /** Transport with a pinned destination: where it goes, and how. */
  to: { lat: number; lng: number; name: string } | null
  mode: TransportMode | null
}

function journey(item: Item): Pick<MapStop, 'to' | 'mode'> {
  if (item.type !== 'transport') return { to: null, mode: null }
  const t = item.toLocation
  return {
    to: t?.lat != null && t?.lng != null ? { lat: t.lat, lng: t.lng, name: t.name } : null,
    mode: transportMode(item.title),
  }
}

type Pt = { lat: number; lng: number }

/**
 * A gentle arc between two points, the way flight routes are drawn: a
 * quadratic curve bowed to one side by a fifth of the distance. Longitudes
 * are unwrapped so a route never goes the long way round the world.
 */
export function arcPath(a: Pt, b: Pt, steps = 48): Pt[] {
  let bLng = b.lng
  if (bLng - a.lng > 180) bLng -= 360
  if (a.lng - bLng > 180) bLng += 360
  const dx = bLng - a.lng
  const dy = b.lat - a.lat
  const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + bLng) / 2 }
  // Perpendicular offset (bowed towards the pole side, like airline maps).
  const c = { lat: mid.lat + dx * 0.2 * Math.sign(a.lat + b.lat || 1), lng: mid.lng - dy * 0.2 * Math.sign(a.lat + b.lat || 1) }
  const out: Pt[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    out.push({ lat: u * u * a.lat + 2 * u * t * c.lat + t * t * b.lat, lng: u * u * a.lng + 2 * u * t * c.lng + t * t * bLng })
  }
  return out
}

/**
 * Items (and stays) with coordinates, filtered by day and type. On a single
 * day only *timed* stops are numbered, strictly by start time, because
 * that's the order you'll actually visit them. Anytime plans have no place
 * in a sequence, so they show as plain icons.
 */
export function mapStops(items: Item[], day: string | null, types: Set<ItemType>): MapStop[] {
  const located = items.filter((i) => i.location?.lat != null && i.location?.lng != null && types.has(i.type))
  const onDay = day
    ? located.filter((i) => (i.type === 'stay' && i.checkIn && i.checkOut ? day >= i.checkIn.date && day <= i.checkOut.date : i.date === day))
    : located
  const timed = onDay.filter((i) => i.type !== 'stay' && i.startTime).sort((a, b) => a.date.localeCompare(b.date) || a.startTime!.localeCompare(b.startTime!) || a.title.localeCompare(b.title))
  const rest = onDay.filter((i) => !timed.includes(i)).sort((a, b) => a.date.localeCompare(b.date) || compareItems(a, b))
  return [
    ...timed.map((item, i) => ({ item, lat: item.location!.lat!, lng: item.location!.lng!, number: day ? i + 1 : null, ...journey(item) })),
    ...rest.map((item) => ({ item, lat: item.location!.lat!, lng: item.location!.lng!, number: null, ...journey(item) })),
  ]
}
