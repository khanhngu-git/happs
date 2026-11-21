/**
 * Itinerary import: turns a trip seed file (JSON) into app data, following the
 * file's own rules:
 * - items keep their `id` as the document id, so importing again updates them
 * - unknown values stay unknown: nothing is guessed; `todo` entries become
 *   "Missing info" on the plan
 * - status, bookingRequired, todo, a plan's own time zone and alternatives are
 *   kept in `meta`; a Trip.com link fills bookingUrl when that's empty
 * - coordinates are never invented: places are looked up later (see
 *   geocode.ts), and only named places are looked up
 * - no costs or expenses are created
 */
import { z } from 'zod'
import { isDateString, isTimeString } from '@/shared/dates'
import type { ItemMeta, ItemStatus, Location } from '@/shared/schemas'
import type { ItemType } from '@/shared/itinerary'

const str = z.string().nullish().transform((v) => (v ?? '').trim())
const time = z
  .string()
  .nullish()
  .transform((v) => (v && isTimeString(v) ? v : null))
const date = z.string().refine(isDateString, 'Use YYYY-MM-DD')

const seedLocation = z
  .object({
    name: str,
    nameZh: str,
    address: str,
    placeId: z.string().nullish(),
    lat: z.number().nullish(),
    lng: z.number().nullish(),
  })
  .nullish()

const seedItem = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/, 'Item ids may use letters, numbers, - and _'),
  type: z.enum(['activity', 'food', 'transport', 'stay', 'other']),
  title: z.string().min(1).max(200),
  date,
  timeZone: z.string().nullish(),
  startTime: time,
  endTime: time,
  checkIn: z.object({ date, time }).nullish(),
  checkOut: z.object({ date, time }).nullish(),
  location: seedLocation,
  notes: str,
  bookingUrl: str,
  bookingRef: str,
  tripComUrl: str,
  status: z.enum(['booked', 'planned', 'suggested', 'cancel']).nullish(),
  bookingRequired: z.boolean().nullish(),
  todo: z.array(z.string()).nullish(),
  alternatives: z
    .array(z.object({ name: z.string(), nameZh: z.string().nullish(), address: z.string().nullish(), tripComUrl: z.string().nullish() }))
    .nullish(),
})

export const seedSchema = z.object({
  trip: z.object({
    name: z.string().min(1).max(100),
    destination: str,
    startDate: date,
    endDate: date,
    timeZone: z.string().min(1).max(64),
    baseCurrency: z.string().regex(/^[A-Z]{3}$/),
    notes: str,
  }),
  items: z.array(seedItem).max(400),
})
export type Seed = z.infer<typeof seedSchema>
type SeedItem = Seed['items'][number]

export interface ImportedItem {
  id: string
  values: {
    type: ItemType
    title: string
    date: string
    startTime: string | null
    endTime: string | null
    checkIn: { date: string; time: string | null } | null
    checkOut: { date: string; time: string | null } | null
    location: Location | null
    notes: string
    bookingUrl: string
    bookingRef: string
    order: number
    meta: ItemMeta
  }
  /** What to search Google Places for (null: nothing named to look up). */
  lookup: { query: string; fallback: string | null; country: string | null } | null
}

export interface ImportPlan {
  trip: Seed['trip']
  items: ImportedItem[]
}

export class SeedError extends Error {}

/** Parse and check a seed file. Throws SeedError with a readable message. */
export function parseSeed(text: string): ImportPlan {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new SeedError('That isn’t valid JSON.')
  }
  const r = seedSchema.safeParse(raw)
  if (!r.success) {
    const issue = r.error.issues[0]!
    throw new SeedError(`The file doesn’t look like a trip: ${issue.path.join('.') || 'file'}: ${issue.message}`)
  }
  const { trip, items } = r.data
  if (trip.startDate > trip.endDate) throw new SeedError('The trip ends before it starts.')
  const ids = new Set<string>()
  for (const i of items) {
    if (ids.has(i.id)) throw new SeedError(`Two plans share the id “${i.id}”.`)
    ids.add(i.id)
    if (i.date < trip.startDate || i.date > trip.endDate) throw new SeedError(`“${i.title}” is on ${i.date}, outside the trip’s dates.`)
  }
  return { trip, items: items.map((i, n) => toItem(i, n, trip.timeZone)) }
}

/** The country at the end of an address ("…, Haikou, Hainan, China" → "China"). */
function countryOf(address: string): string | null {
  const last = address.split(',').at(-1)?.trim()
  return last && /^[A-Za-z ]{3,}$/.test(last) ? last : null
}

function toItem(i: SeedItem, n: number, tripZone: string): ImportedItem {
  const stay = i.type === 'stay'
  const loc = i.location
  const name = loc?.name ?? ''
  const address = loc?.address ?? ''
  const nameZh = loc?.nameZh ?? ''
  let location: Location | null = null
  if (name || address) {
    location = {
      placeId: loc?.placeId ?? null,
      // An unnamed place (a hotel not chosen yet) shows its area; it isn't looked up.
      name: name || address,
      address: name ? address : '',
      lat: loc?.lat ?? null,
      lng: loc?.lng ?? null,
      ...(nameZh ? { localName: nameZh } : {}),
    }
  }
  const pinned = location?.lat != null && location?.lng != null
  const lookup =
    name && !pinned
      ? { query: address ? `${name}, ${address}` : name, fallback: nameZh ? (address ? `${nameZh}, ${address}` : nameZh) : null, country: countryOf(address) }
      : null
  const meta: ItemMeta = {
    status: (i.status ?? null) as ItemStatus | null,
    bookingRequired: !!i.bookingRequired,
    todo: (i.todo ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 30),
    timeZone: i.timeZone && i.timeZone !== tripZone ? i.timeZone : null,
    alternatives: (i.alternatives ?? []).slice(0, 10).map((a) => ({ name: a.name, nameZh: a.nameZh ?? null, address: a.address ?? null, url: a.tripComUrl ?? null })),
    needsLocationReview: false,
  }
  const checkIn = stay ? (i.checkIn ?? { date: i.date, time: i.startTime }) : null
  return {
    id: i.id,
    values: {
      type: i.type,
      title: i.title,
      date: stay ? checkIn!.date : i.date,
      startTime: stay ? checkIn!.time : i.startTime,
      endTime: stay ? null : i.endTime,
      checkIn,
      checkOut: stay ? (i.checkOut ?? null) : null,
      location,
      notes: i.notes.slice(0, 5000),
      bookingUrl: (i.bookingUrl || i.tripComUrl).slice(0, 2000),
      bookingRef: i.bookingRef.slice(0, 200),
      order: n,
      meta,
    },
    lookup,
  }
}

/** Things a plan is still missing, for the "Missing info" list. */
export function missingInfo(meta: ItemMeta | null | undefined): string[] {
  return meta?.todo ?? []
}
