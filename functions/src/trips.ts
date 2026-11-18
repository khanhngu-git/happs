import { onDocumentDeleted, onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore'
import { db, deleteFolder } from './admin'
import { notify } from './notify'
import { memberName } from './util'
import { formatShortDate } from '@shared/dates'

/** Deleting a trip removes all of its subcollections. */
export const onTripDeleted = onDocumentDeleted('trips/{tripId}', async (event) => {
  await db.recursiveDelete(db.doc(`trips/${event.params.tripId}`))
  await deleteFolder(`trips/${event.params.tripId}/`)
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
