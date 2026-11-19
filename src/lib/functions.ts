import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import type { InvitePreview } from '@/shared/schemas'
import type { ActivityDetails, ActivityOffer, DisplayPrice, FinderInput, PlaceOption } from '@/shared/activityFinder'

/** Typed wrappers around callable Cloud Functions. */
const call =
  <I, O>(name: string) =>
  async (input: I): Promise<O> =>
    (await httpsCallable<I, O>(functions, name)(input)).data

export const api = {
  getInvitePreview: call<{ code: string }, InvitePreview>('getInvitePreview'),
  joinTrip: call<{ code: string }, { tripId: string; alreadyMember: boolean }>('joinTrip'),
  removeMember: call<{ tripId: string; uid: string }, { removed: boolean }>('removeMember'),
  deleteAccount: call<Record<string, never>, { deleted: boolean }>('deleteAccount'),
  activityFinder: call<FinderInput, Partial<{ places: PlaceOption[]; activities: (ActivityOffer & { display: DisplayPrice })[] } & ActivityDetails>>('activityFinder'),
}

/** Callable errors carry a friendly message from the server. */
export function callableMessage(err: unknown): string {
  const e = err as { message?: string; code?: string }
  if (e?.code === 'functions/unavailable' || e?.code === 'functions/internal')
    return 'Couldn’t reach the server. Check your connection and try again.'
  return e?.message?.replace(/^FirebaseError:\s*/, '').replace(/\s*\[\d+\]$/, '') || 'Something went wrong.'
}
