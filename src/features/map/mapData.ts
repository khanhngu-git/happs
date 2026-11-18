import type { Item } from '@/lib/firestore'
import { compareItems, type ItemType } from '@/shared/itinerary'

export interface MapStop {
  item: Item
  lat: number
  lng: number
  /** 1-based position in the day's timed schedule; null for stays, "Anytime" plans and the all-days view. */
  number: number | null
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
    ...timed.map((item, i) => ({ item, lat: item.location!.lat!, lng: item.location!.lng!, number: day ? i + 1 : null })),
    ...rest.map((item) => ({ item, lat: item.location!.lat!, lng: item.location!.lng!, number: null })),
  ]
}
