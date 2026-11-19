/**
 * RouteStack (Custom Travel Solutions) booking: shared request/response
 * shapes plus normalisers that turn RouteStack's JSON into the small, typed
 * objects the app shows. Pure functions, unit tested with the documented
 * examples, used by the `booking` Cloud Function.
 *
 * Prices from RouteStack are decimals in major units; they are converted
 * to integer minor units here (money is never a float in the app).
 * `ref` fields are opaque: the server hands them back to RouteStack when the
 * traveller picks something (rooms, availability, checkout).
 */
import { z } from 'zod'
import { currencyDigits, parseDecimalToMinor } from './money'

export type BookingKind = 'flight' | 'hotel' | 'activity'

export interface PlaceOption {
  id: string
  label: string
  sub: string
  lat: number | null
  lng: number | null
  /** RouteStack's own type marker (e.g. hotel DESTINATION vs HOTEL). */
  type: string | null
}

export interface FlightLeg {
  airline: string
  flightNumber: string
  from: string
  fromName: string
  to: string
  toName: string
  depart: string
  arrive: string
  durationMin: number
}

export interface FlightOffer {
  id: string
  legs: FlightLeg[]
  stops: number
  cabin: string
  priceMinor: number
  currency: string
  seatsLeft: number | null
  baggage: string | null
  ref: unknown
}

export interface HotelOffer {
  id: string
  name: string
  stars: number | null
  rating: number | null
  reviewCount: number | null
  image: string | null
  address: string | null
  priceMinor: number
  currency: string
  ref: unknown
}

export interface HotelRoom {
  id: string
  name: string
  board: string | null
  refundable: boolean
  priceMinor: number
  currency: string
  ref: unknown
}

export interface ActivityOffer {
  code: string
  name: string
  image: string | null
  place: string | null
  priceMinor: number
  currency: string
}

export interface ActivityOption {
  gradeCode: string
  startTimes: string[]
  priceMinor: number
  currency: string
}

/* ---------- callable input ---------- */

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const code = z.string().trim().min(1).max(80)

export const bookingInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('places'), tripId: z.string().min(1), kind: z.enum(['flight', 'hotel', 'activity']), term: z.string().trim().min(2).max(80) }),
  z.object({
    action: z.literal('flights'),
    tripId: z.string().min(1),
    from: code,
    to: code,
    date,
    returnDate: date.nullable(),
    adults: z.number().int().min(1).max(9),
    cabin: z.enum(['Economy', 'PremiumEconomy', 'Business', 'First']).default('Economy'),
  }),
  z.object({
    action: z.literal('hotels'),
    tripId: z.string().min(1),
    destination: z.object({ id: code, lat: z.number(), lng: z.number(), type: z.string().nullable() }),
    checkIn: date,
    checkOut: date,
    adults: z.number().int().min(1).max(16),
    rooms: z.number().int().min(1).max(8),
  }),
  z.object({ action: z.literal('hotelRooms'), tripId: z.string().min(1), hotel: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal('activities'), tripId: z.string().min(1), destinationId: code, locationName: z.string().max(120), date }),
  z.object({ action: z.literal('activityOptions'), tripId: z.string().min(1), activityCode: code, date, adults: z.number().int().min(1).max(20) }),
  z.object({
    action: z.literal('checkout'),
    tripId: z.string().min(1),
    kind: z.enum(['flight', 'hotel', 'activity']),
    ref: z.record(z.string(), z.unknown()),
  }),
])
export type BookingInput = z.input<typeof bookingInput>

/* ---------- helpers ---------- */

type J = Record<string, unknown>
const obj = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

/** Decimal price in major units → integer minor units, rounded to the currency's digits. */
export function priceToMinor(value: unknown, currency: string): number | null {
  const n = num(value)
  if (n === null || n < 0) return null
  return parseDecimalToMinor(n.toFixed(currencyDigits(currency)), currencyDigits(currency))
}

/** RouteStack wraps payloads as { success, result | data }. */
export function payload(res: unknown): unknown {
  const r = obj(res)
  return r.result ?? r.data ?? null
}

function coords(v: unknown): { lat: number | null; lng: number | null } {
  const c = obj(v)
  return { lat: num(c.lat ?? c.latitude), lng: num(c.lng ?? c.long ?? c.longitude) }
}

/* ---------- normalisers ---------- */

export function normalizePlaces(kind: BookingKind, res: unknown): PlaceOption[] {
  const list = arr(payload(res))
  return list.flatMap((raw): PlaceOption[] => {
    const p = obj(raw)
    if (kind === 'flight') {
      const id = str(p.code)
      if (!id) return []
      return [{ id, label: `${str(p.city) || str(p.name)} (${id})`, sub: [str(p.name), str(p.country)].filter(Boolean).join(', '), lat: null, lng: null, type: null }]
    }
    if (kind === 'hotel') {
      const id = str(p.id)
      if (!id) return []
      const c = coords(p.coordinates ?? p)
      return [{ id, label: str(p.fullName) || str(p.name) || str(p.city), sub: [str(p.city), str(p.country)].filter(Boolean).join(', '), ...c, type: str(p.type) || null }]
    }
    const id = str(p.destinationId)
    if (!id) return []
    return [{ id, label: str(p.name), sub: str(p.destinationName), lat: null, lng: null, type: str(p.type) || null }]
  })
}

export function normalizeFlights(res: unknown, search: J): FlightOffer[] {
  const r = obj(res)
  const currency = (str(r.currency) || str(search.currency) || 'USD').toUpperCase()
  return arr(r.result).flatMap((raw, i): FlightOffer[] => {
    const o = obj(raw)
    const priceMinor = priceToMinor(o.ourprice ?? o.showOurprice ?? o.totalFare, currency)
    const legs = arr(o.flights).map((f): FlightLeg => {
      const l = obj(f)
      return {
        airline: str(l.airline),
        flightNumber: `${str(l.flightCode)}${str(l.flightNumber)}`,
        from: str(l.departure),
        fromName: str(l.departairport) || str(l.departurelocation),
        to: str(l.arrival),
        toName: str(l.arrivalairport) || str(l.arrivallocation),
        depart: str(l.departureTime).slice(0, 16),
        arrive: str(l.arrivalTime).slice(0, 16),
        durationMin: num(l.triptime) ?? 0,
      }
    })
    if (priceMinor === null || legs.length === 0) return []
    const first = obj(arr(o.flights)[0])
    const bag = arr(first.checkInBaggage).map((b) => str(obj(b).value)).find(Boolean) ?? null
    return [
      {
        id: str(o.fareSourceCode).slice(0, 40) || `f${i}`,
        legs,
        stops: num(o.stops) ?? Math.max(0, legs.length - 1),
        cabin: str(first.cabin) || 'Economy',
        priceMinor,
        currency,
        seatsLeft: num(first.remainingSeats),
        baggage: bag,
        ref: { offer: o, search: { ...search, sessionId: str(r.alphaSessionId) || undefined, searchFilterObj: r.searchFilterObj, correlationId: str(r.correlationId) || undefined } },
      },
    ]
  })
}

export function normalizeHotels(res: unknown, search: J): HotelOffer[] {
  const env = obj(payload(res))
  const currency = (str(env.currency) || str(search.currency) || 'USD').toUpperCase()
  return arr(env.result).flatMap((raw): HotelOffer[] => {
    const h = obj(raw)
    const id = str(h.id)
    const priceMinor = priceToMinor(h.ourprice ?? h.baseprice, currency)
    if (!id || priceMinor === null) return []
    const reviews = obj(h.reviews)
    return [
      {
        id,
        name: str(h.name),
        stars: num(h.starRating),
        rating: num(reviews.rating),
        reviewCount: num(reviews.count),
        image: str(h.heroImage) || null,
        address: str(obj(h.contact).address) || str(obj(obj(h.contact).address).line1) || null,
        priceMinor,
        currency,
        ref: { ...search, hotelId: id, hotelName: str(h.name), token: str(env.token), correlationId: str(env.correlationId), currency },
      },
    ]
  })
}

export function normalizeRooms(res: unknown, hotelRef: J): HotelRoom[] {
  const env = obj(payload(res))
  const currency = (str(hotelRef.currency) || 'USD').toUpperCase()
  const token = str(env.token) || str(hotelRef.token)
  const correlationId = str(env.correlationId) || str(hotelRef.correlationId)
  return arr(env.groups).flatMap((g) =>
    arr(obj(g).rooms).flatMap((raw): HotelRoom[] => {
      const r = obj(raw)
      const priceMinor = priceToMinor(r.ourprice ?? r.totalRate, currency)
      if (!str(r.id) || priceMinor === null) return []
      return [
        {
          id: `${str(r.id)}:${str(r.recommendationId)}`,
          name: str(r.name) || str(obj(g).name),
          board: str(obj(r.boardBasis).displayText) || null,
          refundable: r.refundable === true,
          priceMinor,
          currency,
          ref: { ...hotelRef, token, correlationId, roomId: str(r.id), recommendationId: str(r.recommendationId), publishedRate: num(r.publishedRate) },
        },
      ]
    }),
  )
}

export function normalizeActivities(res: unknown): ActivityOffer[] {
  const env = obj(payload(res))
  const list = arr(env.activities ?? env.result ?? payload(res))
  return list.flatMap((raw): ActivityOffer[] => {
    const a = obj(raw)
    const currency = (str(a.currency) || 'USD').toUpperCase()
    const priceMinor = priceToMinor(a.showOurPrice ?? a.ourPrice, currency)
    if (!str(a.activityCode) || priceMinor === null) return []
    return [{ code: str(a.activityCode), name: str(a.name), image: str(a.thumbnailURL) || null, place: str(a.destinationName) || null, priceMinor, currency }]
  })
}

export function normalizeActivityOptions(res: unknown): ActivityOption[] {
  const env = obj(payload(res))
  const currency = (str(env.currency) || 'USD').toUpperCase()
  return arr(env.bookableItems).flatMap((raw): ActivityOption[] => {
    const item = obj(raw)
    const slots = arr(item.availabilityDetails).map(obj).filter((s) => s.available !== false)
    if (!str(item.gradeCode) || slots.length === 0) return []
    const prices = slots.map((s) => priceToMinor(obj(obj(s.totalPrice).price).showOurPrice ?? obj(obj(s.totalPrice).price).ourPrice, currency)).filter((p): p is number => p !== null)
    if (prices.length === 0) return []
    return [{ gradeCode: str(item.gradeCode), startTimes: slots.map((s) => str(s.startTime)).filter(Boolean), priceMinor: Math.min(...prices), currency }]
  })
}

/** Checkout handle: we only support the hosted (deeplink) portal URL. */
export function checkoutUrl(res: unknown): string | null {
  const r = obj(res)
  const url = str(r.url) || str(obj(r.result).url) || str(obj(r.data).url)
  return /^https:\/\//.test(url) ? url : null
}
