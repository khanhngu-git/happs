import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import type { InvitePreview } from '@/shared/schemas'
import type { HotelResult, HotelReviews, HotelReviewsInput, HotelSearchInput } from '@/shared/hotelFinder'

/** Typed wrappers around callable Cloud Functions. */
const call =
  <I, O>(name: string, timeout?: number) =>
  async (input: I): Promise<O> =>
    (await httpsCallable<I, O>(functions, name, timeout ? { timeout } : undefined)(input)).data

export const api = {
  getInvitePreview: call<{ code: string }, InvitePreview>('getInvitePreview'),
  joinTrip: call<{ code: string }, { tripId: string; alreadyMember: boolean }>('joinTrip'),
  removeMember: call<{ tripId: string; uid: string }, { removed: boolean }>('removeMember'),
  deleteAccount: call<Record<string, never>, { deleted: boolean }>('deleteAccount'),
  // Scraping Trip.com can take a minute or two.
  hotelFinder: call<HotelSearchInput, { hotels: HotelResult[]; cached: boolean }>('hotelFinder', 180_000),
  hotelReviews: call<HotelReviewsInput, HotelReviews & { cached: boolean }>('hotelReviews', 150_000),
}

/** Callable errors carry a friendly message from the server. */
export function callableMessage(err: unknown): string {
  const e = err as { message?: string; code?: string }
  if (e?.code === 'functions/unavailable' || e?.code === 'functions/internal')
    return 'Couldn’t reach the server. Check your connection and try again.'
  return e?.message?.replace(/^FirebaseError:\s*/, '') || 'Something went wrong.'
}
