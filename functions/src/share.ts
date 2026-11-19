import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { db } from './admin'
import { callableOptions, parseInput } from './util'
import { sharedTripInput, type SharedTrip } from '@shared/schemas'

/**
 * Read-only trip link (`/share/:token`), for family and friends who aren't on
 * the trip. No sign-in needed. Only the plan: no costs, notes, booking
 * references or member names. The owner can turn the link off at any time.
 */
export const getSharedTrip = onCall(callableOptions, async (req): Promise<SharedTrip> => {
  const { token } = parseInput(sharedTripInput, req.data)
  const q = await db.collection('trips').where('shareToken', '==', token).limit(1).get()
  const trip = q.docs[0]
  if (!trip) throw new HttpsError('not-found', 'This link has been turned off, or the trip was deleted.')
  const t = trip.data()
  const items = await trip.ref.collection('items').get()
  return {
    name: t.name,
    destination: t.destination ?? '',
    startDate: t.startDate,
    endDate: t.endDate,
    timeZone: t.timeZone,
    coverEmoji: t.coverEmoji ?? null,
    coverPhotoURL: t.coverPhotoURL ?? null,
    items: items.docs.map((d) => {
      const i = d.data()
      return {
        id: d.id,
        type: i.type,
        title: i.title,
        date: i.date,
        startTime: i.startTime ?? null,
        endTime: i.endTime ?? null,
        checkIn: i.checkIn ?? null,
        checkOut: i.checkOut ?? null,
        location: i.location ?? null,
        photoURL: i.photoURL ?? null,
        order: i.order ?? 0,
      }
    }),
  }
})
