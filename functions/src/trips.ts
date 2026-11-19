import { onDocumentDeleted, onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore'
import { db, deleteFolder } from './admin'
import { notify } from './notify'
import { memberName } from './util'
import { formatShortDate } from '@shared/dates'

/** Deleting a trip removes all of its subcollections, and tells the other members (otherwise it just vanishes for them). */
export const onTripDeleted = onDocumentDeleted('trips/{tripId}', async (event) => {
  const { tripId } = event.params
  const data = event.data?.data()
  // Names must be read before the members subcollection is deleted.
  // Only the owner may delete a trip (firestore.rules), so the owner is who did it.
  // (event.authId isn't a uid in the emulator, so it isn't relied on here.)
  const actor = (data?.ownerId as string | undefined) ?? null
  // The profile outlives the trip, so read the name there first.
  const profileName = actor ? ((await db.doc(`users/${actor}`).get()).get('displayName') as string | undefined) : undefined
  const actorName = profileName || (actor ? await memberName(tripId, actor) : '') || 'The trip owner'
  await db.recursiveDelete(db.doc(`trips/${tripId}`))
  await deleteFolder(`trips/${tripId}/`)
  if (!data) return
  const others = ((data.memberIds as string[] | undefined) ?? []).filter((m) => m !== actor)
  await Promise.all(
    others.map((uid) =>
      notify(uid, {
        type: 'tripDeleted',
        tripId: null,
        refPath: null,
        title: `${actorName} deleted ${data.name as string}`,
        body: 'The itinerary, costs and payment history for this trip are gone.',
        url: '/',
      }),
    ),
  )
})

/** Fields whose change is worth telling others about (not reordering etc). */
const MEANINGFUL = ['title', 'date', 'startTime', 'endTime', 'location', 'checkIn', 'checkOut', 'type']

/** Optional "item added/edited" notifications (off by default in preferences). */
export const onItemWrite = onDocumentWrittenWithAuthContext('trips/{tripId}/items/{itemId}', async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : null
  const after = event.data?.after.exists ? event.data.after.data() : null
  if (!after) return
  if (before && !MEANINGFUL.some((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))) return
  const { tripId, itemId } = event.params
  const actor = event.authId ?? (after.createdBy as string)
  const trip = await db.doc(`trips/${tripId}`).get()
  if (!trip.exists) return
  const name = await memberName(tripId, actor)
  const others = (trip.get('memberIds') as string[]).filter((m) => m !== actor)
  await Promise.all(
    others.map((uid) =>
      notify(uid, {
        type: 'itemChanged',
        tripId,
        refPath: `trips/${tripId}/items/${itemId}`,
        title: `${name} ${before ? 'updated' : 'added'} ${after.title}`,
        body: `${trip.get('name')} · ${formatShortDate(after.date)}`,
        url: `/trips/${tripId}/itinerary?day=${after.date}&item=${itemId}`,
      }),
    ),
  )
})
