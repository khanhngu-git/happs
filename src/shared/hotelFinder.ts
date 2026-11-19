/**
 * Hotel finder: live Trip.com listings scraped by the Apify Actor
 * "hotels-scrapers/trip-hotel-scraper", trimmed to what the app shows.
 * No booking happens in the app; a chosen hotel prefills an itinerary stay.
 *
 * Pure functions, unit tested, used by the `hotelFinder` Cloud Function.
 * Scraped prices are decimals in major units; they become integer minor
 * units here (money is never a float in the app).
 */
import { z } from 'zod'
import { currencyDigits, parseDecimalToMinor } from './money'
import { diffDays, isDateString } from './dates'

export interface HotelResult {
  id: string
  name: string
  stars: number | null
  /** Guest score as Trip.com shows it (out of 5 or 10, see ratingScale). */
  rating: number | null
  ratingScale: 5 | 10 | null
  ratingText: string | null
  reviews: number | null
  /** Area / transport hint from the listing, e.g. "0.8 km from Eiffel Tower". */
  area: string | null
  roomType: string | null
  features: string[]
  nightlyMinor: number | null
  /** Total for the stay; from the listing when shown, else nightly × nights. */
  totalMinor: number | null
  /** True when the total was computed from the nightly price (taxes may be extra). */
  totalEstimated: boolean
  currency: string
  images: string[]
}

export const hotelSearchInput = z
  .object({
    tripId: z.string().min(1),
    destination: z.string().trim().min(2).max(80),
    checkIn: z.string().refine(isDateString),
    checkOut: z.string().refine(isDateString),
    adults: z.number().int().min(1).max(10),
    rooms: z.number().int().min(1).max(8),
  })
  .refine((v) => v.checkOut > v.checkIn, { message: 'Check-out must be after check-in' })
  .refine((v) => diffDays(v.checkOut, v.checkIn) <= 30, { message: 'Search up to 30 nights at a time' })
export type HotelSearchInput = z.input<typeof hotelSearchInput>

type J = Record<string, unknown>
const obj = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {})
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/[^\d.]/g, '')) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

export function priceToMinor(value: unknown, currency: string): number | null {
  const n = num(value)
  if (n === null) return null
  const d = currencyDigits(currency)
  return parseDecimalToMinor(n.toFixed(d), d)
}

/** Normalise scraped dataset items. Skips rows without a name or any price; drops duplicates. */
export function normalizeHotels(items: unknown, currency: string, nights: number): HotelResult[] {
  const seen = new Set<string>()
  const out: HotelResult[] = []
  for (const raw of Array.isArray(items) ? items : []) {
    const h = obj(raw)
    const name = str(h.name)
    const id = str(h.hotel_id) || name
    if (!name || seen.has(id)) continue
    const nightlyMinor = priceToMinor(h.current_price, currency)
    const listedTotal = priceToMinor(h.total_price, currency)
    const totalMinor = listedTotal ?? (nightlyMinor !== null ? nightlyMinor * Math.max(1, nights) : null)
    if (totalMinor === null) continue
    seen.add(id)
    const rating = num(h.rating)
    out.push({
      id,
      name,
      stars: num(h.star_rating),
      rating,
      ratingScale: rating === null ? null : rating > 5 ? 10 : 5,
      ratingText: str(h.rating_description) || null,
      reviews: num(h.reviews),
      area: str(h.location) || null,
      roomType: str(h.room_type) || null,
      features: (Array.isArray(h.room_features) ? h.room_features : []).map(str).filter(Boolean).slice(0, 4),
      nightlyMinor,
      totalMinor,
      totalEstimated: listedTotal === null,
      currency,
      images: (Array.isArray(h.images) ? h.images : []).map(str).filter((u) => u.startsWith('https://')).slice(0, 6),
    })
  }
  return out
}

/** The Actor's input for one search: small, fast and cheap (one page, up to `limit` hotels). */
export function actorInput(q: z.output<typeof hotelSearchInput>, currency: string, limit = 20) {
  return {
    searchWord: q.destination,
    checkIn: q.checkIn,
    checkOut: q.checkOut,
    adults: q.adults,
    children: 0,
    childAges: [],
    rooms: q.rooms,
    currency,
    locale: 'en-US',
    lowPrice: 0,
    highPrice: -1,
    sortBy: 'recommended',
    proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'], apifyProxyCountry: 'US' },
    limitPerPage: limit,
    totalLimit: limit,
  }
}
