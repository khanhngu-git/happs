import type { PayTo } from '@/shared/schemas'
import { arrayRemove, arrayUnion, collectionGroup, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where, writeBatch, collection, type DocumentReference } from 'firebase/firestore'
import { notify } from '@/features/notifications/notify'
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
  notes?: string
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

/** Owner or an admin removes someone, or a member leaves: one batch, checked by the rules. An admin stops being one. */
export async function removeMember(tripId: string, uid: string) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'trips', tripId), { memberIds: arrayRemove(uid), adminIds: arrayRemove(uid), updatedAt: serverTimestamp() })
  batch.delete(doc(db, 'trips', tripId, 'members', uid))
  // Their live location goes with them.
  batch.delete(doc(db, 'trips', tripId, 'locations', uid))
  await batch.commit()
}

/** Run deletes in batches of up to 450 (Firestore allows 500 writes per batch). */
async function deleteAll(refsToDelete: DocumentReference[]) {
  for (let i = 0; i < refsToDelete.length; i += 450) {
    const batch = writeBatch(db)
    refsToDelete.slice(i, i + 450).forEach((r) => batch.delete(r))
    await batch.commit()
  }
}

/**
 * Delete a trip and everything in it (owner only). Subcollections go first,
 * while the trip still exists for the rules to check; the trip doc goes last.
 * Other members are told first, while they can still be found.
 */
export async function deleteTrip(trip: Trip, uid: string, ownerName: string) {
  await notify(uid, trip.memberIds, {
    type: 'tripDeleted',
    tripId: trip.id,
    refPath: null,
    title: `${ownerName} deleted ${trip.name}`,
    body: 'The itinerary, costs and payment history for this trip are gone.',
    url: '/',
  })
  const t = (name: string) => collection(db, 'trips', trip.id, name)
  const expenses = await getDocs(t('expenses'))
  // Each expense with its shares, so the share rules see the expense going too.
  for (const e of expenses.docs) {
    const shares = await getDocs(collection(e.ref, 'shares'))
    await deleteAll([...shares.docs.map((d) => d.ref), e.ref])
  }
  const rest = await Promise.all(['items', 'ideas', 'files', 'settlementBatches', 'locations'].map((n) => getDocs(t(n))))
  await deleteAll(rest.flatMap((snap) => snap.docs.map((d) => d.ref)))
  const invites = await getDocs(query(collection(db, 'invites'), where('tripId', '==', trip.id)))
  await deleteAll(invites.docs.map((d) => d.ref))
  if (trip.shareToken) await deleteDoc(doc(db, 'publicTrips', trip.shareToken)).catch(() => undefined)
  const members = await getDocs(t('members'))
  await deleteAll(members.docs.filter((d) => d.id !== uid).map((d) => d.ref))
  const batch = writeBatch(db)
  batch.delete(doc(db, 'trips', trip.id, 'members', uid))
  batch.delete(doc(db, 'trips', trip.id))
  await batch.commit()
}

/** Payments involving `uid` that aren't confirmed yet, across all their trips. */
export async function outstandingPayments(uid: string): Promise<number> {
  const [owe, owed] = await Promise.all([
    getDocs(query(collectionGroup(db, 'shares'), where('debtorUid', '==', uid))),
    getDocs(query(collectionGroup(db, 'shares'), where('payerUid', '==', uid))),
  ])
  return [...owe.docs, ...owed.docs].filter((d) => d.get('debtorUid') !== d.get('payerUid') && d.get('status') !== 'confirmed').length
}

/**
 * Leave every trip before an account is deleted: trips where I'm alone are
 * deleted; where I'm the owner, the longest-standing member takes over.
 */
export async function leaveAllTrips(uid: string, myName: string) {
  const trips = await getDocs(query(refs.trips(), where('memberIds', 'array-contains', uid)))
  for (const snap of trips.docs) {
    const trip = snap.data()
    const others = trip.memberIds.filter((m) => m !== uid)
    if (others.length === 0) {
      await deleteTrip(trip, uid, myName)
      continue
    }
    if (trip.ownerId === uid) {
      const members = await getDocs(query(refs.members(trip.id), orderBy('joinedAt')))
      const next = members.docs.find((m) => m.id !== uid)?.id ?? others[0]!
      await transferOwnership(trip.id, uid, next)
    }
    await removeMember(trip.id, uid)
  }
}

/** Owner only: make a member an admin, or take it away. */
export async function setAdmin(tripId: string, uid: string, admin: boolean) {
  await updateDoc(doc(db, 'trips', tripId), { adminIds: admin ? arrayUnion(uid) : arrayRemove(uid), updatedAt: serverTimestamp() })
}

/** Hand ownership to another member: trip.ownerId and both member roles. The new owner stops being an admin. */
export async function transferOwnership(tripId: string, fromUid: string, toUid: string) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'trips', tripId), { ownerId: toUid, adminIds: arrayRemove(toUid), updatedAt: serverTimestamp() })
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

export class AccountDeletionError extends Error {}

/**
 * Delete my account: refused while any payment involving me isn't confirmed.
 * Firebase only lets an account delete itself shortly after signing in, so
 * that's checked before anything is removed.
 */
export async function deleteMyAccount(user: User, myName: string) {
  const lastSignIn = Date.parse(user.metadata.lastSignInTime ?? '')
  if (!lastSignIn || Date.now() - lastSignIn > 4 * 60_000) {
    throw new AccountDeletionError('For your security, sign out and sign back in, then delete your account straight away.')
  }
  const open = await outstandingPayments(user.uid)
  if (open > 0) {
    throw new AccountDeletionError(`You have ${open} payment${open === 1 ? '' : 's'} that ${open === 1 ? 'isn’t' : 'aren’t'} confirmed yet. Settle up before deleting your account.`)
  }
  await leaveAllTrips(user.uid, myName)
  const notes = await getDocs(collection(db, 'users', user.uid, 'notifications'))
  await deleteAll(notes.docs.map((d) => d.ref))
  await deleteDoc(doc(db, 'users', user.uid))
  const { deleteUser } = await import('firebase/auth')
  await deleteUser(user)
}
