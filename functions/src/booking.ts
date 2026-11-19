/**
 * Booking via RouteStack (Custom Travel Solutions): flights, hotels and
 * activities. RouteStack is the merchant of record; we never take payment.
 * Searches return trimmed results; "checkout" returns RouteStack's hosted
 * portal URL (checkout mode `deeplink`), where the traveller pays.
 *
 * Credentials stay server-side: the partner token is an HMAC of the API key
 * signed with the API secret. Only trip members can search, because every
 * search spends a RouteStack token.
 */
import { createHmac, randomUUID } from 'node:crypto'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions/v2'
import { db } from './admin'
import { parseInput, requireAuth } from './util'
import {
  bookingInput,
  checkoutUrl,
  activityCancellation,
  normalizeActivities,
  normalizeActivityOptions,
  normalizeFlights,
  normalizeHotels,
  normalizePlaces,
  normalizeRooms,
  withDisplayPrice,
} from '@shared/booking'
import { fetchFxRate } from '@shared/fx'

const API_KEY = defineSecret('ROUTESTACK_API_KEY')
const API_SECRET = defineSecret('ROUTESTACK_API_SECRET')
const host = () => (process.env.ROUTESTACK_HOST || 'https://evolvemcp.routestack.ai').replace(/\/$/, '')

let cached: { token: string; expiresAt: number; host: string } | null = null

function expiresInMs(v: unknown): number {
  const m = /^(\d+)\s*([smhd])?$/.exec(String(v ?? ''))
  if (!m) return 60 * 60 * 1000
  const n = Number(m[1])
  return n * ({ s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[(m[2] ?? 's') as 's' | 'm' | 'h' | 'd'])
}

async function partnerToken(force = false): Promise<string> {
  const h = host()
  if (!force && cached && cached.host === h && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token
  const apiKey = API_KEY.value()
  const secret = API_SECRET.value()
  if (!apiKey || !secret) throw new HttpsError('failed-precondition', 'Booking isn’t set up yet: RouteStack credentials are missing.')
  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = randomUUID()
  const hmac = createHmac('sha256', secret).update(`${apiKey}:${timestamp}:${nonce}`).digest('base64url')
  const res = await fetch(`${h}/mcp/auth/partner-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, timestamp, nonce, hmac }),
  })
  const json = (await res.json().catch(() => ({}))) as { token?: string; expiresIn?: string; message?: string; code?: string }
  if (!res.ok || !json.token) {
    logger.error('RouteStack partner-token failed', { status: res.status, code: json.code, message: json.message })
    throw new HttpsError('failed-precondition', 'Couldn’t sign in to RouteStack. Check the API key and secret.')
  }
  cached = { token: json.token, expiresAt: Date.now() + expiresInMs(json.expiresIn), host: h }
  return json.token
}

/** POST a RouteStack endpoint, refreshing the token once on 401. */
async function rs(path: string, body: unknown, retry = true): Promise<unknown> {
  const res = await fetch(`${host()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await partnerToken()}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  })
  if (res.status === 401 && retry) {
    await partnerToken(true)
    return rs(path, body, false)
  }
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; code?: string | number }
  if (res.status === 402) throw new HttpsError('resource-exhausted', 'The booking search allowance is used up for now.')
  if (!res.ok || json.success === false) {
    logger.warn('RouteStack call failed', { path, status: res.status, code: json.code, message: json.message })
    throw new HttpsError('unavailable', json.message ? `Booking provider: ${json.message}` : 'The booking provider didn’t respond. Try again.')
  }
  return json
}

type J = Record<string, unknown>

/** Reference FX rates (Frankfurter/ECB), cached for an hour per instance. */
const fxCache = new Map<string, { rate: number | null; at: number }>()
async function rateLookup(base: string, currencies: string[]): Promise<(c: string) => number | null> {
  const need = [...new Set(currencies.filter((c) => c !== base))]
  await Promise.all(
    need.map(async (c) => {
      const key = `${c}>${base}`
      const hit = fxCache.get(key)
      if (hit && Date.now() - hit.at < 3_600_000) return
      fxCache.set(key, { rate: await fetchFxRate(c, base, AbortSignal.timeout(5000)), at: Date.now() })
    }),
  )
  return (c) => (c === base ? 1 : (fxCache.get(`${c}>${base}`)?.rate ?? null))
}

/** Results in the trip's base currency for display (converted where the provider can't quote it). */
async function inBase<T extends { priceMinor: number; currency: string }>(list: T[], base: string) {
  return withDisplayPrice(list, base, await rateLookup(base, list.map((x) => x.currency)))
}

/** Spread adults over rooms as evenly as possible (RouteStack wants one entry per room). */
function occupancy(adults: number, rooms: number) {
  return Array.from({ length: rooms }, (_, i) => ({ adults: Math.floor(adults / rooms) + (i < adults % rooms ? 1 : 0), children: 0, childAges: [] as number[] }))
}

function checkoutBody(kind: 'flight' | 'hotel' | 'activity', ref: J): { path: string; body: J } {
  if (kind === 'flight') {
    const search = (ref.search ?? {}) as J
    return {
      path: '/mcp/flight/get-payment-url',
      body: {
        flight: ref.offer,
        origin: search.origin,
        destination: search.destination,
        departureDate: search.departureDate,
        returnDate: search.returnDate ?? undefined,
        tripType: search.tripType,
        adults: search.adults,
        children: 0,
        infants: 0,
        currency: search.currency,
        sessionId: search.sessionId,
        searchFilterObj: search.searchFilterObj,
        correlationId: search.correlationId,
      },
    }
  }
  if (kind === 'hotel') {
    const rooms = (ref.rooms ?? []) as { adults: number; childAges: number[] }[]
    return {
      path: '/mcp/hotel/get-payment-url',
      body: {
        hotelId: ref.hotelId,
        roomId: ref.roomId,
        recommendationId: ref.recommendationId,
        correlationId: ref.correlationId,
        checkIn: ref.checkIn,
        checkOut: ref.checkOut,
        hotelName: ref.hotelName,
        rooms,
        travellers: rooms.map((r) => ({ numOfAdults: r.adults, childAges: r.childAges ?? [] })),
        token: ref.token,
        publishedRate: ref.publishedRate,
        destinationId: ref.destinationId,
        roomCount: rooms.length,
        currency: ref.currency,
      },
    }
  }
  return {
    path: '/mcp/activity/get-payment-url',
    body: {
      activityCode: ref.activityCode,
      gradeCode: ref.gradeCode,
      travelDate: ref.travelDate,
      startTime: ref.startTime ?? undefined,
      adults: ref.adults,
      currency: ref.currency,
      ageBands: [{ ageBand: 'ADULT', numberOfTravelers: ref.adults }],
    },
  }
}

export const booking = onCall({ secrets: [API_KEY, API_SECRET], timeoutSeconds: 60, memory: '256MiB' }, async (req) => {
  const uid = requireAuth(req.auth)
  const input = parseInput(bookingInput, req.data)
  const trip = await db.doc(`trips/${input.tripId}`).get()
  if (!trip.exists || !(trip.get('memberIds') as string[]).includes(uid)) throw new HttpsError('permission-denied', 'Only trip members can book for this trip.')
  const currency = (trip.get('baseCurrency') as string) || 'USD'

  switch (input.action) {
    case 'places': {
      const [path, body] =
        input.kind === 'flight'
          ? ['/mcp/flight/locations', { term: input.term }]
          : input.kind === 'hotel'
            ? ['/mcp/hotel/search-destinations', { query: input.term, type: 'DESTINATION' }]
            : ['/mcp/activity/locations', { searchTerm: input.term }]
      return { places: normalizePlaces(input.kind, await rs(path, body)).slice(0, 8) }
    }
    case 'flights': {
      const tripType = input.returnDate ? 'Return' : 'OneWay'
      const search = {
        type: tripType,
        tripType,
        origin: input.from.toUpperCase(),
        destination: input.to.toUpperCase(),
        departureDate: input.date,
        returnDate: input.returnDate ?? undefined,
        adults: input.adults,
        children: 0,
        infants: 0,
        cabin: input.cabin,
        currency,
        page: 1,
        limit: 20,
      }
      return { flights: await inBase(normalizeFlights(await rs('/mcp/flight/search', search), search), currency) }
    }
    case 'hotels': {
      const rooms = occupancy(input.adults, Math.min(input.rooms, input.adults))
      const search = {
        destinationId: input.destination.id,
        destinationType: input.destination.type ?? undefined,
        lat: input.destination.lat,
        long: input.destination.lng,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        rooms,
        roomCount: rooms.length,
        currency,
        page: 1,
        limit: 20,
      }
      return { hotels: await inBase(normalizeHotels(await rs('/mcp/hotel/search-hotels', search), search), currency) }
    }
    case 'hotelRooms': {
      const h = input.hotel
      const res = await rs('/mcp/hotel/get-rooms-and-rates', {
        hotelId: h.hotelId,
        hotelName: h.hotelName,
        checkIn: h.checkIn,
        checkOut: h.checkOut,
        rooms: h.rooms,
        token: h.token,
        correlationId: h.correlationId,
        currency: h.currency,
      })
      return { rooms: await inBase(normalizeRooms(res, h), currency) }
    }
    case 'activities': {
      const res = await rs('/mcp/activity/search-v2', {
        filtering: { destination: input.destinationId, locationName: input.locationName, startDate: input.date },
        pagination: { start: 1, count: 20 },
        // Activities can be quoted in the trip currency directly.
        currency,
      })
      return { activities: await inBase(normalizeActivities(res), currency) }
    }
    case 'activityOptions': {
      // Availability has prices and times; details names the options and gives the cancellation policy.
      const [res, details] = await Promise.all([
        rs('/mcp/activity/availability', {
          activityCode: input.activityCode,
          travelDate: input.date,
          ageBands: [{ ageBand: 'ADULT', numberOfTravelers: input.adults }],
          currency,
        }),
        rs('/mcp/activity/details', { activityCode: input.activityCode, startDate: input.date, endDate: input.date }).catch(() => null),
      ])
      return {
        cancellation: activityCancellation(details),
        options: (await inBase(normalizeActivityOptions(res, details), currency)).map((o) => ({
          ...o,
          ref: { activityCode: input.activityCode, gradeCode: o.gradeCode, travelDate: input.date, adults: input.adults, currency },
        })),
      }
    }
    case 'checkout': {
      if (JSON.stringify(input.ref).length > 100_000) throw new HttpsError('invalid-argument', 'That selection is too large.')
      const { path, body } = checkoutBody(input.kind, input.ref)
      const res = await rs(path, body)
      const url = checkoutUrl(res)
      if (!url) {
        logger.error('RouteStack did not return a portal URL; set checkout mode to Portal (deeplink) in the dashboard', { mode: (res as J).checkoutMode })
        throw new HttpsError('failed-precondition', 'Online checkout isn’t switched on for this booking provider yet.')
      }
      return { url }
    }
  }
})
