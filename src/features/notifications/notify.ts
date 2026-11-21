/**
 * In-app notifications, written by the app itself (there is no server).
 *
 * The person who does something writes a notification into each affected
 * member's `users/{uid}/notifications`. Security rules only allow this between
 * members of the same trip. Each person's notification switches decide what
 * they see (NotificationsPage and the badge filter by type). Notifications
 * expire after 90 days through a Firestore TTL policy on `expireAt`.
 */
import { collection, doc, getDocs, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { NotificationType } from '@/shared/schemas'

const TTL_DAYS = 90

export interface NotifyInput {
  type: NotificationType
  tripId: string
  refPath: string | null
  title: string
  body: string
  url: string
}

/** Best effort: a failed notification never fails the action that caused it. */
export async function notify(fromUid: string, recipients: string[], n: NotifyInput): Promise<void> {
  const to = [...new Set(recipients)].filter((uid) => uid && uid !== fromUid)
  if (to.length === 0) return
  try {
    const batch = writeBatch(db)
    for (const uid of to) {
      batch.set(doc(collection(db, 'users', uid, 'notifications')), {
        ...n,
        title: n.title.slice(0, 200),
        body: n.body.slice(0, 500),
        fromUid,
        read: false,
        createdAt: serverTimestamp(),
        expireAt: Timestamp.fromMillis(Date.now() + TTL_DAYS * 86_400_000),
      })
    }
    await batch.commit()
  } catch (err) {
    console.warn('Couldn’t send notifications', err)
  }
}

/** Display names of a trip's members (from the offline cache when possible). */
export async function memberNames(tripId: string): Promise<(uid: string) => string> {
  const snap = await getDocs(collection(db, 'trips', tripId, 'members')).catch(() => null)
  const names = new Map(snap?.docs.map((d) => [d.id, (d.get('displayName') as string) || 'Someone']) ?? [])
  return (uid) => names.get(uid) ?? 'Someone'
}
