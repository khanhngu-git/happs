/**
 * Per-user daily allowances for calls that cost real money (each Apify run
 * is billed). Cached answers don't count. Counters live in `usage/{uid}_{day}`,
 * which clients can't read or write.
 */
import { HttpsError } from 'firebase-functions/v2/https'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './admin'

/** Paid calls per person per UTC day. Override in functions/.env. */
export const dailyLimits = {
  hotelSearch: () => Number(process.env.HOTEL_SEARCH_DAILY_LIMIT) || 20,
  hotelReviews: () => Number(process.env.HOTEL_REVIEWS_DAILY_LIMIT) || 30,
}
const LABELS: Record<string, string> = { hotelSearch: 'hotel searches', hotelReviews: 'review lookups' }

export async function consumeQuota(uid: string, bucket: string, limit: number, now = new Date()): Promise<number> {
  const day = now.toISOString().slice(0, 10)
  const ref = db.doc(`usage/${uid}_${day}`)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const used = (snap.get(bucket) as number | undefined) ?? 0
    if (used >= limit) {
      throw new HttpsError('resource-exhausted', `You’ve reached today’s limit of ${limit} ${LABELS[bucket] ?? 'searches'}. It resets at midnight UTC.`)
    }
    tx.set(ref, { uid, day, [bucket]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    return used + 1
  })
}
