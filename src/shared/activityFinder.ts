/**
 * Activity finder (RouteStack / Custom Travel Solutions). Helps people add
 * a real activity to the itinerary, with price, meeting-point location and
 * a cover photo. There's no booking or checkout in the app.
 *
 * Pure normalisers, unit tested, used by the `activityFinder` Cloud
 * Function. RouteStack prices are decimals in major units; they're turned
 * into integer minor units here (money is never a float in the app).
 */
import { z } from 'zod'
import { convertMinor, currencyDigits, parseDecimalToMinor } from './money'
import type { Location } from './schemas'

export interface PlaceOption {
  id: string
  label: string
  sub: string
}

/** A price in the trip's base currency; `approximate` if converted with a reference FX rate. */
export interface DisplayPrice {
  priceMinor: number
  currency: string
  approximate: boolean
}

export interface ActivityOffer {
  code: string
  name: string
  image: string | null
  place: string | null
  priceMinor: number
  currency: string
  duration: string | null
  rating: number | null
  reviewCount: number | null
  freeCancellation: boolean
}

export interface ActivityOption {
  gradeCode: string
  title: string | null
  description: string | null
  startTimes: string[]
  priceMinor: number
  currency: string
}

export interface ActivityDetails {
  options: (ActivityOption & { display: DisplayPrice })[]
  location: Location | null
  photos: string[]
  summary: string | null
  cancellation: string | null
}

/* ---------- callable input ---------- */

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const finderInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('places'), tripId: z.string().min(1), term: z.string().trim().min(2).max(80) }),
  z
    .object({
      action: z.literal('search'),
      tripId: z.string().min(1),
      /** Activity name or keywords, e.g. "teamLab". */
      query: z.string().trim().max(80).default(''),
      /** RouteStack destination id; optional when searching by name. */
      destinationId: z.string().trim().max(20).nullable(),
      date,
    })
    .refine((v) => v.query.length >= 2 || v.destinationId, { message: 'Type an activity name or pick a place' }),
  z.object({ action: z.literal('details'), tripId: z.string().min(1), activityCode: z.string().trim().min(1).max(40), date, adults: z.number().int().min(1).max(20) }),
])
export type FinderInput = z.input<typeof finderInput>

/* ---------- helpers ---------- */

type J = Record<string, unknown>
const obj = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

export function priceToMinor(value: unknown, currency: string): number | null {
  const n = num(value)
  if (n === null || n < 0) return null
  return parseDecimalToMinor(n.toFixed(currencyDigits(currency)), currencyDigits(currency))
}

export function payload(res: unknown): unknown {
  const r = obj(res)
  return r.result ?? r.data ?? null
}

/** Add `display` (trip base currency) to each priced item. `rateFor(c)` = units of base per unit of c. */
export function withDisplayPrice<T extends { priceMinor: number; currency: string }>(list: T[], base: string, rateFor: (c: string) => number | null): (T & { display: DisplayPrice })[] {
  return list.map((x) => {
    if (x.currency === base) return { ...x, display: { priceMinor: x.priceMinor, currency: base, approximate: false } }
    const rate = rateFor(x.currency)
    if (!rate) return { ...x, display: { priceMinor: x.priceMinor, currency: x.currency, approximate: false } }
    return { ...x, display: { priceMinor: convertMinor(x.priceMinor, x.currency, base, rate), currency: base, approximate: true } }
  })
}

/* ---------- normalisers ---------- */

/** Activity destinations (cities, regions) for the "In" field. */
export function normalizePlaces(res: unknown): PlaceOption[] {
  return arr(payload(res)).flatMap((raw): PlaceOption[] => {
    const p = obj(raw)
    const id = str(p.destinationId)
    if (!id || (str(p.type) && str(p.type) !== 'destination')) return []
    return [{ id, label: str(p.name), sub: str(p.destinationName) }]
  })
}

export function normalizeActivities(res: unknown): ActivityOffer[] {
  const env = obj(payload(res))
  const list = arr(env.activities ?? env.result ?? payload(res))
  return list.flatMap((raw): ActivityOffer[] => {
    const a = obj(raw)
    const currency = (str(a.currency) || str(obj(a.pricing).currency) || str(env.currency) || 'USD').toUpperCase()
    const priceMinor = priceToMinor(a.showOurPrice ?? a.ourPrice, currency)
    const name = str(a.title) || str(a.name)
    if (!str(a.activityCode) || priceMinor === null || !name) return []
    return [
      {
        code: str(a.activityCode),
        name,
        image: str(a.thumbnailHiResURL) || str(a.thumbnailURL) || null,
        place: str(a.destinationName) || null,
        priceMinor,
        currency,
        duration: str(a.duration) || null,
        rating: num(a.rating),
        reviewCount: num(a.reviewCount),
        freeCancellation: a.freeCancellation === true,
      },
    ]
  })
}

/** Bookable options from availability, named from details (availability leaves titles empty). */
export function normalizeActivityOptions(res: unknown, details?: unknown): ActivityOption[] {
  const env = obj(payload(res))
  const currency = (str(env.currency) || 'USD').toUpperCase()
  const named = new Map(arr(obj(payload(details)).bookableItems).map((b) => [str(obj(b).gradeCode), obj(b)]))
  return arr(env.bookableItems).flatMap((raw): ActivityOption[] => {
    const item = obj(raw)
    const slots = arr(item.availabilityDetails).map(obj).filter((s) => s.available !== false)
    if (!str(item.gradeCode) || slots.length === 0) return []
    const prices = slots
      .map((s) => priceToMinor(obj(obj(s.totalPrice).price).showOurPrice ?? obj(obj(s.totalPrice).price).ourPrice, currency))
      .filter((p): p is number => p !== null)
    if (prices.length === 0) return []
    const info = named.get(str(item.gradeCode))
    const description = (str(item.description) || str(info?.description)).split('\n')[0]?.replace(/^\W+/, '').trim() || null
    return [
      {
        gradeCode: str(item.gradeCode),
        title: str(item.title) || str(info?.title) || null,
        description,
        startTimes: slots.map((s) => str(s.startTime)).filter(Boolean),
        priceMinor: Math.min(...prices),
        currency,
      },
    ]
  })
}

/**
 * Where the activity starts, for the itinerary and the map: the first
 * meeting point with coordinates, else the first end point.
 */
export function activityLocation(details: unknown): Location | null {
  const logistics = obj(obj(payload(details)).logistics)
  const points = [...arr(logistics.start), ...arr(logistics.end)].map((p) => obj(obj(p).location))
  const hit = points.find((l) => num(obj(l.center).lat) !== null && num(obj(l.center).lng) !== null) ?? points.find((l) => str(l.name))
  if (!hit) return null
  const c = obj(hit.center)
  return {
    placeId: str(hit.provider) === 'GOOGLE' ? str(hit.providerReference) || null : null,
    name: str(hit.name) || str(hit.address),
    address: str(hit.address),
    lat: num(c.lat),
    lng: num(c.lng),
  }
}

export function activityPhotos(details: unknown, fallback: string | null): string[] {
  const photos = arr(obj(payload(details)).productPhotos).map((p) => str(obj(p).photoURL)).filter((u) => u.startsWith('https://'))
  return photos.length ? photos.slice(0, 6) : fallback ? [fallback] : []
}

export function activitySummary(details: unknown): string | null {
  const d = str(obj(payload(details)).description).trim()
  if (!d) return null
  return d.length > 400 ? `${d.slice(0, 397).trimEnd()}…` : d
}

export function activityCancellation(details: unknown): string | null {
  return str(obj(obj(payload(details)).cancellationPolicy).description) || null
}
