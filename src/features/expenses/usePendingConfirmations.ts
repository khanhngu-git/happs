import { query, where } from 'firebase/firestore'
import { collectionGroup } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { converters, useLiveQuery } from '@/lib/firestore'

/** Shares in this trip that others marked as sent and are waiting on me. */
export function usePendingConfirmations(tripId: string | undefined, uid: string): number {
  const q = tripId
    ? query(
        collectionGroup(db, 'shares').withConverter(converters.share),
        where('payerUid', '==', uid),
        where('status', '==', 'sent'),
        where('tripId', '==', tripId),
      )
    : null
  return useLiveQuery(q, tripId ? `pending:${tripId}:${uid}` : null).data.length
}
