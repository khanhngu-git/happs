/**
 * Itinerary ordering and stay coverage.
 *
 * Within a day: "Anytime" (untimed) items come first in their stored `order`,
 * then timed items by start time. Stays appear as an item on their check-in
 * day and as a "Sleeping at" banner on every night they cover.
 */
export type ItemType = 'activity' | 'food' | 'transport' | 'stay' | 'other'

export interface ItineraryItemLike {
  id: string
  type: ItemType
  title: string
  date: string
  startTime: string | null
  order: number
  checkIn: { date: string; time: string | null } | null
  checkOut: { date: string; time: string | null } | null
}

export function compareItems(a: ItineraryItemLike, b: ItineraryItemLike): number {
  const aTimed = a.startTime !== null
  const bTimed = b.startTime !== null
  if (aTimed !== bTimed) return aTimed ? 1 : -1
  if (!aTimed) return a.order - b.order || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
  return a.startTime!.localeCompare(b.startTime!) || a.order - b.order || a.title.localeCompare(b.title)
}

export function itemsForDay<T extends ItineraryItemLike>(items: T[], date: string): T[] {
  return items.filter((i) => i.date === date).sort(compareItems)
}

export interface StayOnDay<T> {
  stay: T
  /** Night of `date` is spent here. */
  sleeping: boolean
  checkingIn: boolean
  checkingOut: boolean
}

/** Stays relevant to `date`: sleeping there that night, or checking in/out that day. */
export function staysForDay<T extends ItineraryItemLike>(items: T[], date: string): StayOnDay<T>[] {
  const out: StayOnDay<T>[] = []
  for (const stay of items) {
    if (stay.type !== 'stay' || !stay.checkIn) continue
    const inDate = stay.checkIn.date
    const outDate = stay.checkOut?.date ?? inDate
    if (date < inDate || date > outDate) continue
    out.push({
      stay,
      sleeping: date >= inDate && date < outDate,
      checkingIn: date === inDate,
      checkingOut: date === outDate && outDate !== inDate,
    })
  }
  return out
}

/** New `order` values after moving the item at `from` to `to` in an untimed list. */
export function reorder<T extends { id: string }>(list: T[], from: number, to: number): { id: string; order: number }[] {
  const next = [...list]
  const [moved] = next.splice(from, 1)
  if (!moved) return []
  next.splice(to, 0, moved)
  return next.map((item, i) => ({ id: item.id, order: (i + 1) * 1000 }))
}

export const ITEM_TYPES: ItemType[] = ['activity', 'food', 'transport', 'stay', 'other']
