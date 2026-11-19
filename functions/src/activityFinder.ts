/**
 * Activity finder via RouteStack (Custom Travel Solutions): search for
 * activities by name or place, then fetch one activity's options, price,
 * meeting point and photos so the app can prefill an itinerary entry.
 * No booking or checkout happens here.
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
  activityCancellation,
  activityLocation,
  activityPhotos,
  activitySummary,
  finderInput,
  normalizeActivities,
  normalizeActivityOptions,
  normalizePlaces,
  withDisplayPrice,
  type ActivityDetails,
} from '@shared/activityFinder'
import { fetchFxRate } from '@shared/fx'

const API_KEY = defineSecret('ROUTESTACK_API_KEY')
const API_SECRET = defineSecret('ROUTESTACK_API_SECRET')
const host = () => (process.env.ROUTESTACK_HOST || 'https://evolvemcp.routestack.ai').replace(/\/$/, '')

let cached: { token: string; expiresAt: number; host: string } | null = null

function expiresInMs(v: unknown): number {
  const m = /^(\d+)\s*([smhd])?$/.exec(String(v ?? ''))
  if (!m) return 60 * 60 * 1000
  return Number(m[1]) * { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[(m[2] ?? 's') as 's' | 'm' | 'h' | 'd']
}

async function partnerToken(force = false): Promise<string> {
  const h = host()
  if (!force && cached && cached.host === h && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token
  const apiKey = API_KEY.value()
  const secret = API_SECRET.value()
  if (!apiKey || !secret) throw new HttpsError('failed-precondition', 'Activity search isn’t set up yet: RouteStack credentials are missing.')
  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = randomUUID()
  const hmac = createHmac('sha256', secret).update(`${apiKey}:${timestamp}:${nonce}`).digest('base64url')
  const res = await fetch(`${h}/mcp/auth/partner-token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey, timestamp, nonce, hmac }) })
  const json = (await res.json().catch(() => ({}))) as { token?: string; expiresIn?: string; message?: string; code?: string }
  if (!res.ok || !json.token) {
    logger.error('RouteStack partner-token failed', { status: res.status, code: json.code, message: json.message })
    throw new HttpsError('failed-precondition', 'Couldn’t sign in to RouteStack. Check the API key, secret and host (sandbox and live keys differ).')
  }
  cached = { token: json.token, expiresAt: Date.now() + expiresInMs(json.expiresIn), host: h }
  return json.token
}

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
  if (res.status === 402) throw new HttpsError('resource-exhausted', 'The activity search allowance is used up for now.')
  if (!res.ok || json.success === false) {
    logger.warn('RouteStack call failed', { path, status: res.status, code: json.code, message: json.message })
    throw new HttpsError('unavailable', 'Activity search didn’t respond. Try again.')
  }
  return json
}

/** Reference FX rates (Frankfurter/ECB), cached for an hour per instance. */
const fxCache = new Map<string, { rate: number | null; at: number }>()
async function inBase<T extends { priceMinor: number; currency: string }>(list: T[], base: string) {
  const need = [...new Set(list.map((x) => x.currency).filter((c) => c !== base))]
  await Promise.all(
    need.map(async (c) => {
      const hit = fxCache.get(`${c}>${base}`)
      if (hit && Date.now() - hit.at < 3_600_000) return
      fxCache.set(`${c}>${base}`, { rate: await fetchFxRate(c, base, AbortSignal.timeout(5000)), at: Date.now() })
    }),
  )
  return withDisplayPrice(list, base, (c) => fxCache.get(`${c}>${base}`)?.rate ?? null)
}

export const activityFinder = onCall({ secrets: [API_KEY, API_SECRET], timeoutSeconds: 60, memory: '256MiB' }, async (req) => {
  const uid = requireAuth(req.auth)
  const input = parseInput(finderInput, req.data)
  const trip = await db.doc(`trips/${input.tripId}`).get()
  if (!trip.exists || !(trip.get('memberIds') as string[]).includes(uid)) throw new HttpsError('permission-denied', 'Only trip members can search activities for this trip.')
  const currency = (trip.get('baseCurrency') as string) || 'USD'

  switch (input.action) {
    case 'places':
      return { places: normalizePlaces(await rs('/mcp/activity/locations', { searchTerm: input.term })).slice(0, 8) }

    case 'search': {
      // A name ("teamLab") narrows within the destination; without a destination RouteStack matches products by name.
      const filtering: Record<string, unknown> = { startDate: input.date }
      if (input.destinationId) filtering.destination = input.destinationId
      if (input.query) filtering.searchTerm = input.query
      const res = await rs('/mcp/activity/search-v2', { filtering, pagination: { start: 1, count: 20 }, currency })
      return { activities: await inBase(normalizeActivities(res), currency) }
    }

    case 'details': {
      // Availability has prices and times; details has option names, the meeting point, photos and policy.
      const [availability, details] = await Promise.all([
        rs('/mcp/activity/availability', { activityCode: input.activityCode, travelDate: input.date, ageBands: [{ ageBand: 'ADULT', numberOfTravelers: input.adults }], currency }).catch(() => null),
        rs('/mcp/activity/details', { activityCode: input.activityCode, startDate: input.date, endDate: input.date }),
      ])
      const result: ActivityDetails = {
        options: availability ? await inBase(normalizeActivityOptions(availability, details), currency) : [],
        location: activityLocation(details),
        photos: activityPhotos(details, null),
        summary: activitySummary(details),
        cancellation: activityCancellation(details),
      }
      return result
    }
  }
})
