/**
 * Write an imported itinerary: create the trip (or use an existing one), pin
 * places, then save every plan under its own id. Importing again updates the
 * same plans and keeps what people added since (photos, tickets, costs, and
 * places they pinned themselves).
 */
import { doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { db } from '@/lib/firebase'
import { refs, type Item, type UserProfile } from '@/lib/firestore'
import { createTrip } from '@/features/trips/tripApi'
import { refreshSharedTrip } from '@/features/share/shareApi'
import { lookUp } from './geocode'
import type { ImportPlan } from './seed'

export interface ImportResult {
  tripId: string
  created: number
  updated: number
  pinned: number
  review: { id: string; title: string; reason: string }[]
}

export async function importItinerary(opts: {
  plan: ImportPlan
  user: User
  profile: UserProfile | null
  /** An existing trip to add to, or null to create one. */
  tripId: string | null
  places: google.maps.PlacesLibrary | null
  onProgress(done: number, total: number): void
}): Promise<ImportResult> {
  const { plan, user, places } = opts
  const t = plan.trip
  const tripId =
    opts.tripId ??
    (await createTrip(user, opts.profile, {
      name: t.name,
      destination: t.destination,
      startDate: t.startDate,
      endDate: t.endDate,
      timeZone: t.timeZone,
      baseCurrency: t.baseCurrency,
      coverEmoji: '🧳',
      coverColor: null,
      notes: t.notes.slice(0, 2000),
    }))

  const existing = new Map<string, Item>((await getDocs(refs.items(tripId))).docs.map((d) => [d.id, d.data()]))
  const review: ImportResult['review'] = []
  let pinned = 0
  const toLookUp = plan.items.filter((i) => i.lookup && !(existing.get(i.id)?.location?.lat != null))
  let done = 0
  opts.onProgress(0, toLookUp.length)

  const located = new Map<string, ImportPlan['items'][number]['values']['location']>()
  // A few at a time, to stay well inside the Places API's rate limits.
  for (let n = 0; n < toLookUp.length; n += 3) {
    await Promise.all(
      toLookUp.slice(n, n + 3).map(async (item) => {
        try {
          if (!places) throw new Error('Maps isn’t set up')
          const r = await lookUp(places, item)
          if (r.status === 'pinned') {
            located.set(item.id, r.location)
            pinned++
          } else review.push({ id: item.id, title: item.values.title, reason: r.reason })
        } catch (err) {
          console.warn('Place lookup failed', item.id, err)
          review.push({ id: item.id, title: item.values.title, reason: 'Lookup failed' })
        }
        opts.onProgress(++done, toLookUp.length)
      }),
    )
  }

  let created = 0
  let updated = 0
  const reviewIds = new Set(review.map((r) => r.id))
  for (let n = 0; n < plan.items.length; n += 400) {
    const batch = writeBatch(db)
    for (const item of plan.items.slice(n, n + 400)) {
      const ref = doc(db, 'trips', tripId, 'items', item.id)
      const before = existing.get(item.id)
      // Keep a place someone already pinned; otherwise use the lookup (or leave it unpinned).
      const location = before?.location?.lat != null ? before.location : (located.get(item.id) ?? item.values.location)
      const meta = { ...item.values.meta, needsLocationReview: reviewIds.has(item.id) }
      const data = { ...item.values, location, meta, updatedAt: serverTimestamp() }
      if (before) {
        batch.set(ref, data, { merge: true })
        updated++
      } else {
        batch.set(ref, { ...data, photoURL: null, attachments: [], linkedExpenseId: null, createdBy: user.uid, createdAt: serverTimestamp() })
        created++
      }
    }
    await batch.commit()
  }
  void refreshSharedTrip(tripId)
  return { tripId, created, updated, pinned, review }
}
