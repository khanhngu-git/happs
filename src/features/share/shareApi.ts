/**
 * Read-only trip links (`/share/:token`). With no server to answer for
 * signed-out visitors, the app keeps a public copy of the plan at
 * `publicTrips/{token}`: the trip's name, dates and plans, without costs,
 * notes, bookings, photos or member names. Anyone with the token can read
 * it; it's refreshed whenever the plan changes, and deleted when the owner
 * turns the link off.
 */
import { doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { refs, type Item, type Trip } from '@/lib/firestore'
import type { SharedTrip } from '@/shared/schemas'

export function newShareToken(): string {
  const alphabet = 'ABCDEFGHIJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

function snapshot(trip: Trip, items: Item[]) {
  const shared: SharedTrip & { tripId: string } = {
    tripId: trip.id,
    name: trip.name,
    destination: trip.destination ?? '',
    startDate: trip.startDate,
    endDate: trip.endDate,
    timeZone: trip.timeZone,
    coverEmoji: trip.coverEmoji ?? null,
    coverPhotoURL: trip.coverPhotoURL ?? null,
    items: items.slice(0, 400).map((i) => ({
      id: i.id,
      type: i.type,
      title: i.title,
      date: i.date,
      startTime: i.startTime ?? null,
      endTime: i.endTime ?? null,
      checkIn: i.checkIn ?? null,
      checkOut: i.checkOut ?? null,
      location: i.location ?? null,
      toLocation: i.toLocation ?? null,
      photoURL: null,
      order: i.order ?? 0,
    })),
  }
  return { ...shared, updatedAt: serverTimestamp() }
}

/** Turn the link on (with a new token) or off. Owner only. */
export async function setShareLink(trip: Trip, on: boolean): Promise<void> {
  const batch = writeBatch(db)
  if (trip.shareToken) batch.delete(doc(db, 'publicTrips', trip.shareToken))
  const token = on ? newShareToken() : null
  batch.update(doc(db, 'trips', trip.id), { shareToken: token, updatedAt: serverTimestamp() })
  if (token) {
    const items = (await getDocs(refs.items(trip.id))).docs.map((d) => d.data())
    batch.set(doc(db, 'publicTrips', token), snapshot({ ...trip, shareToken: token }, items))
  }
  await batch.commit()
}

/** After a plan or the trip changes: bring the public copy up to date (if the link is on). */
export async function refreshSharedTrip(tripId: string): Promise<void> {
  try {
    const t = await getDoc(refs.trip(tripId))
    const trip = t.exists() ? t.data() : null
    if (!trip?.shareToken) return
    const items = (await getDocs(refs.items(tripId))).docs.map((d) => d.data())
    await setDoc(doc(db, 'publicTrips', trip.shareToken), snapshot(trip, items))
  } catch (err) {
    console.warn('Couldn’t update the read-only link', err)
  }
}

export async function loadSharedTrip(token: string): Promise<SharedTrip> {
  if (!/^[A-Za-z0-9]{24,64}$/.test(token)) throw new Error('This link isn’t valid.')
  const snap = await getDoc(doc(db, 'publicTrips', token)).catch(() => null)
  if (!snap?.exists()) throw new Error('This link has been turned off, or the trip was deleted.')
  return snap.data() as SharedTrip
}
