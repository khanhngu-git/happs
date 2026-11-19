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

/** "HH:mm" → minutes after midnight. */
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/** Timed plans (not stays) that clash with a candidate on the same day. A plan with no end time is treated as a moment. */
export function findOverlaps<T extends ItineraryItemLike & { endTime: string | null }>(
  items: T[],
  candidate: { id?: string | null; date: string; startTime: string | null; endTime: string | null },
): T[] {
  if (!candidate.startTime) return []
  const cs = toMinutes(candidate.startTime)
  const ce = candidate.endTime ? toMinutes(candidate.endTime) : cs
  return items
    .filter((o) => o.id !== candidate.id && o.type !== 'stay' && o.date === candidate.date && o.startTime)
    .filter((o) => {
      const os = toMinutes(o.startTime!)
      const oe = o.endTime ? toMinutes(o.endTime) : os
      if (cs === os) return true
      return cs < oe && os < ce
    })
    .sort(compareItems)
}

/** Plans without an end time count as "now" for this long after they start. */
export const DEFAULT_PLAN_MINUTES = 60

export interface NowNext<T> {
  now: T | null
  next: T | null
  /** Minutes until `next` starts. */
  minutesToNext: number | null
}

/** What's happening at `time` on `date` and what's coming up next that day (timed plans only). */
export function nowAndNext<T extends ItineraryItemLike & { endTime: string | null }>(items: T[], date: string, time: string): NowNext<T> {
  const t = toMinutes(time)
  const timed = items.filter((i) => i.type !== 'stay' && i.date === date && i.startTime).sort(compareItems)
  const now =
    [...timed].reverse().find((i) => {
      const s = toMinutes(i.startTime!)
      const e = i.endTime && toMinutes(i.endTime) > s ? toMinutes(i.endTime) : s + DEFAULT_PLAN_MINUTES
      return s <= t && t < e
    }) ?? null
  const next = timed.find((i) => toMinutes(i.startTime!) > t) ?? null
  return { now, next, minutesToNext: next ? toMinutes(next.startTime!) - t : null }
}

/** Plans whose day falls outside the trip (e.g. after the dates were shortened), so they can still be found. */
export function itemsOutsideTrip<T extends ItineraryItemLike>(items: T[], startDate: string, endDate: string): T[] {
  return items.filter((i) => i.date < startDate || i.date > endDate).sort((a, b) => a.date.localeCompare(b.date) || compareItems(a, b))
}

/** Local "YYYY-MM-DD" and hour (0–23) in a time zone. */
export function localDateHour(timeZone: string, now = new Date()): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 }
}

/**
 * The evening-before summary of a trip day: stays checking in or out, then
 * timed plans in order, then anytime plans. Empty when nothing is planned.
 */
export function dayLines<T extends ItineraryItemLike & { endTime: string | null }>(items: T[], date: string, formatTime: (t: string) => string, max = 4): string[] {
  const lines: string[] = []
  for (const s of staysForDay(items, date)) {
    if (s.checkingOut && !s.sleeping) lines.push(`Check out of ${s.stay.title}${s.stay.checkOut?.time ? ` by ${formatTime(s.stay.checkOut.time)}` : ''}`)
  }
  const plans = itemsForDay(items, date).filter((i) => i.type !== 'stay')
  for (const p of [...plans.filter((p) => p.startTime), ...plans.filter((p) => !p.startTime)]) lines.push(p.startTime ? `${formatTime(p.startTime)} ${p.title}` : p.title)
  for (const s of staysForDay(items, date)) {
    if (s.checkingIn) lines.push(`Check in to ${s.stay.title}${s.stay.checkIn?.time ? ` at ${formatTime(s.stay.checkIn.time)}` : ''}`)
  }
  return lines.length > max ? [...lines.slice(0, max - 1), `and ${lines.length - (max - 1)} more`] : lines
}
