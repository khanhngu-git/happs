import type { Item } from '@/lib/firestore'
import { compareItems, type ItemType } from '@/shared/itinerary'

export interface MapStop {
  item: Item
  lat: number
  lng: number
  /** 1-based order within a single selected day; null in "All days". */
  number: number | null
}

/** Items (and stays) with coordinates, filtered by day and type, numbered when a single day is selected. */
export function mapStops(items: Item[], day: string | null, types: Set<ItemType>): MapStop[] {
  const located = items.filter((i) => i.location?.lat != null && i.location?.lng != null && types.has(i.type))
  const onDay = day
    ? located.filter((i) => (i.type === 'stay' && i.checkIn && i.checkOut ? day >= i.checkIn.date && day <= i.checkOut.date : i.date === day))
    : located
  const sorted = [...onDay].sort((a, b) => a.date.localeCompare(b.date) || compareItems(a, b))
  let n = 0
  return sorted.map((item) => ({
    item,
    lat: item.location!.lat!,
    lng: item.location!.lng!,
    // Stays aren't "stops" in the day's order, they're where you sleep.
    number: day && item.type !== 'stay' ? ++n : null,
  }))
}
