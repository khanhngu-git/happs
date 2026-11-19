import type { PayTo } from '@/shared/schemas'
import { deleteDoc, doc, orderBy, query, serverTimestamp, updateDoc, where, writeBatch, collection } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { refs, useLiveDoc, useLiveQuery, type Member, type Trip } from '@/lib/firestore'
import type { User } from 'firebase/auth'

export interface TripInput {
  name: string
  destination: string
  startDate: string
  endDate: string
  timeZone: string
  baseCurrency: string
  coverEmoji: string | null
  coverColor: string | null
  coverPhotoURL?: string | null
}

/** Trip + the creator's owner member doc in one batch (rules check both together). */
export async function createTrip(user: User, profile: { displayName: string; photoURL: string | null; payTo?: PayTo | null } | null, input: TripInput) {
  const tripRef = doc(collection(db, 'trips'))
  const batch = writeBatch(db)
  batch.set(tripRef, {
    ...input,
    ownerId: user.uid,
    memberIds: [user.uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  batch.set(doc(db, 'trips', tripRef.id, 'members', user.uid), {
    role: 'owner',
    displayName: profile?.displayName || user.displayName || 'Me',
    photoURL: profile?.photoURL ?? user.photoURL ?? null,
    joinedAt: serverTimestamp(),
    payTo: profile?.payTo ?? null,
  })
  await batch.commit()
  return tripRef.id
}

export async function updateTrip(tripId: string, input: Partial<TripInput>) {
  await updateDoc(doc(db, 'trips', tripId), { ...input, updatedAt: serverTimestamp() })
}

export async function deleteTrip(tripId: string) {
  await deleteDoc(doc(db, 'trips', tripId))
}

/** Hand ownership to another member: trip.ownerId and both member roles. */
export async function transferOwnership(tripId: string, fromUid: string, toUid: string) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'trips', tripId), { ownerId: toUid, updatedAt: serverTimestamp() })
  batch.update(doc(db, 'trips', tripId, 'members', toUid), { role: 'owner' })
  batch.update(doc(db, 'trips', tripId, 'members', fromUid), { role: 'member' })
  await batch.commit()
}

export function useMyTrips(uid: string) {
  const q = query(refs.trips(), where('memberIds', 'array-contains', uid), orderBy('startDate', 'asc'))
  return useLiveQuery<Trip>(q, `trips:${uid}`)
}

export function useTripDoc(tripId: string | undefined) {
  return useLiveDoc<Trip>(tripId ? refs.trip(tripId) : null)
}

export function useMembers(tripId: string | undefined) {
  return useLiveQuery<Member>(tripId ? refs.members(tripId) : null, tripId ? `members:${tripId}` : null)
}

export const COVER_COLORS = [
  { value: 'teal', className: 'from-teal-500 to-cyan-600' },
  { value: 'blue', className: 'from-sky-500 to-blue-700' },
  { value: 'indigo', className: 'from-indigo-500 to-violet-700' },
  { value: 'pink', className: 'from-pink-500 to-rose-600' },
  { value: 'orange', className: 'from-amber-500 to-orange-600' },
  { value: 'green', className: 'from-emerald-500 to-green-700' },
  { value: 'slate', className: 'from-slate-500 to-slate-800' },
] as const

export function coverClass(color: string | null | undefined): string {
  return (COVER_COLORS.find((c) => c.value === color) ?? COVER_COLORS[0]).className
}
