/**
 * Hotel finder: runs the Apify Actor "hotels-scrapers/trip-hotel-scraper"
 * (live Trip.com listings) for a trip's destination, dates and group, and
 * returns trimmed results. Nothing is booked.
 *
 * The Apify token stays server-side (secret APIFY_TOKEN). Only trip members
 * can search, because every run spends Apify credit (about US$0.07 for 20
 * hotels). Identical searches within 30 minutes are served from memory.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions/v2'
import { db } from './admin'
import { parseInput, requireAuth } from './util'
import { actorInput, hotelPageUrl, hotelReviewsInput, hotelSearchInput, normalizeHotels, normalizeReviews, type HotelResult, type HotelReviews } from '@shared/hotelFinder'
import { diffDays } from '@shared/dates'

const APIFY_TOKEN = defineSecret('APIFY_TOKEN')
const ACTOR = 'hotels-scrapers~trip-hotel-scraper'
const LIMIT = 20
const CACHE_MS = 30 * 60 * 1000

const cache = new Map<string, { at: number; hotels: HotelResult[] }>()

export const hotelFinder = onCall({ secrets: [APIFY_TOKEN], timeoutSeconds: 180, memory: '256MiB' }, async (req) => {
  const uid = requireAuth(req.auth)
  const q = parseInput(hotelSearchInput, req.data)
  const trip = await db.doc(`trips/${q.tripId}`).get()
  if (!trip.exists || !(trip.get('memberIds') as string[]).includes(uid)) throw new HttpsError('permission-denied', 'Only trip members can search hotels for this trip.')
  const currency = (trip.get('baseCurrency') as string) || 'USD'
  const nights = diffDays(q.checkOut, q.checkIn)

  const key = JSON.stringify([q.destination.toLowerCase(), q.checkIn, q.checkOut, q.adults, q.rooms, currency])
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return { hotels: hit.hotels, cached: true }

  const token = APIFY_TOKEN.value()
  if (!token) throw new HttpsError('failed-precondition', 'Hotel search isn’t set up yet: the Apify token is missing.')

  // Synchronous run: waits for the Actor and returns its dataset items (Apify caps this at 300 s).
  const url = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=150&maxItems=${LIMIT}&clean=true&format=json`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(actorInput(q, currency, LIMIT)),
      signal: AbortSignal.timeout(170_000),
    })
  } catch (err) {
    logger.warn('Apify request failed', err)
    throw new HttpsError('deadline-exceeded', 'Trip.com took too long to answer. Try again in a minute.')
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    logger.warn('Apify run failed', { status: res.status, body: body.slice(0, 300) })
    if (res.status === 401) throw new HttpsError('failed-precondition', 'The Apify token was rejected. Check APIFY_TOKEN.')
    if (res.status === 402) throw new HttpsError('resource-exhausted', 'The Apify account is out of credit.')
    if (res.status === 408) throw new HttpsError('deadline-exceeded', 'Trip.com took too long to answer. Try again in a minute.')
    throw new HttpsError('unavailable', 'Hotel search didn’t work this time. Try again.')
  }

  const hotels = normalizeHotels(await res.json().catch(() => []), currency, nights)
  cache.set(key, { at: Date.now(), hotels })
  logger.info(`hotelFinder: ${hotels.length} hotels for ${q.destination} ${q.checkIn}→${q.checkOut}`)
  return { hotels, cached: false }
})

/* ---------- Guest reviews ---------- */

const REVIEWS_ACTOR = 'knagymate~trip-com-reviews-scraper'
const REVIEWS_LIMIT = 10
const REVIEWS_CACHE_MS = 6 * 60 * 60 * 1000
const reviewsCache = new Map<string, { at: number; reviews: HotelReviews }>()

/**
 * The 10 most relevant Trip.com guest reviews for a hotel, via the Apify
 * Actor "knagymate/trip-com-reviews-scraper" (about US$0.004 per review).
 * Loaded on demand from the hotel details; cached for 6 hours per hotel.
 */
export const hotelReviews = onCall({ secrets: [APIFY_TOKEN], timeoutSeconds: 150, memory: '256MiB' }, async (req) => {
  const uid = requireAuth(req.auth)
  const q = parseInput(hotelReviewsInput, req.data)
  const trip = await db.doc(`trips/${q.tripId}`).get()
  if (!trip.exists || !(trip.get('memberIds') as string[]).includes(uid)) throw new HttpsError('permission-denied', 'Only trip members can read reviews for this trip.')

  const hit = reviewsCache.get(q.hotelId)
  if (hit && Date.now() - hit.at < REVIEWS_CACHE_MS) return { ...hit.reviews, cached: true }

  const token = APIFY_TOKEN.value()
  if (!token) throw new HttpsError('failed-precondition', 'Reviews aren’t set up yet: the Apify token is missing.')

  const url = `https://api.apify.com/v2/acts/${REVIEWS_ACTOR}/run-sync-get-dataset-items?timeout=120&maxItems=${REVIEWS_LIMIT}&clean=true&format=json`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ hotelUrl: hotelPageUrl(q.hotelId), maxReviews: REVIEWS_LIMIT, sortBy: 'mostRelevant' }),
      signal: AbortSignal.timeout(140_000),
    })
  } catch (err) {
    logger.warn('Apify reviews request failed', err)
    throw new HttpsError('deadline-exceeded', 'Reviews took too long to load. Try again in a minute.')
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    logger.warn('Apify reviews run failed', { status: res.status, body: body.slice(0, 300) })
    if (res.status === 401) throw new HttpsError('failed-precondition', 'The Apify token was rejected. Check APIFY_TOKEN.')
    if (res.status === 402) throw new HttpsError('resource-exhausted', 'The Apify account is out of credit.')
    if (res.status === 408) throw new HttpsError('deadline-exceeded', 'Reviews took too long to load. Try again in a minute.')
    throw new HttpsError('unavailable', 'Couldn’t load reviews this time. Try again.')
  }
  const reviews = normalizeReviews(await res.json().catch(() => []))
  reviewsCache.set(q.hotelId, { at: Date.now(), reviews })
  return { ...reviews, cached: false }
})
