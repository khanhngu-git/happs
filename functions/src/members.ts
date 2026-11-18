import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { FieldValue } from 'firebase-admin/firestore'
import { db, adminAuth } from './admin'
import { parseInput, requireAuth } from './util'
import { removeMemberInput } from '@shared/schemas'

/** Shares in a trip involving `uid` (either side) that aren't confirmed yet. */
async function outstandingSharesCount(uid: string, tripId?: string): Promise<number> {
  const base = db.collectionGroup('shares')
  const queries = tripId
    ? [base.where('tripId', '==', tripId)]
    : [base.where('debtorUid', '==', uid), base.where('payerUid', '==', uid)]
  const snaps = await Promise.all(queries.map((q) => q.get()))
  let n = 0
  for (const snap of snaps) {
    for (const d of snap.docs) {
      const s = d.data()
      if (s.debtorUid === s.payerUid || s.status === 'confirmed') continue
      if (s.debtorUid === uid || s.payerUid === uid) n++
    }
  }
  return n
}

/**
 * Owner removes a member, or a member leaves. Blocked while the member has
 * outstanding (non-confirmed) shares so nobody walks away from a debt.
 */
export const removeMember = onCall(async (req) => {
  const caller = requireAuth(req.auth)
  const { tripId, uid } = parseInput(removeMemberInput, req.data)
  const tripRef = db.doc(`trips/${tripId}`)
  const trip = await tripRef.get()
  if (!trip.exists) throw new HttpsError('not-found', 'Trip not found.')
  const ownerId = trip.get('ownerId') as string
  const memberIds = trip.get('memberIds') as string[]
  const leaving = caller === uid
  if (!leaving && caller !== ownerId) throw new HttpsError('permission-denied', 'Only the trip owner can remove members.')
  if (uid === ownerId) throw new HttpsError('failed-precondition', 'Transfer ownership before the owner leaves the trip.')
  if (!memberIds.includes(uid)) return { removed: false }

  const outstanding = await outstandingSharesCount(uid, tripId)
  if (outstanding > 0) {
    throw new HttpsError(
      'failed-precondition',
      `${leaving ? 'You have' : 'This member has'} ${outstanding} payment${outstanding === 1 ? '' : 's'} that aren’t confirmed yet. Settle up first.`,
    )
  }
  await db.runTransaction(async (tx) => {
    tx.update(tripRef, { memberIds: FieldValue.arrayRemove(uid), updatedAt: FieldValue.serverTimestamp() })
    tx.delete(tripRef.collection('members').doc(uid))
  })
  return { removed: true }
})

/**
 * Delete the caller's account. Refuses while any share involving them is not
 * confirmed. Otherwise removes them from every trip (handing ownership to the
 * longest-standing member, or deleting trips where they were alone).
 */
export const deleteAccount = onCall(async (req) => {
  const uid = requireAuth(req.auth)
  const outstanding = await outstandingSharesCount(uid)
  if (outstanding > 0) {
    throw new HttpsError(
      'failed-precondition',
      `You have ${outstanding} payment${outstanding === 1 ? '' : 's'} that aren’t confirmed yet. Settle up before deleting your account.`,
    )
  }
  const trips = await db.collection('trips').where('memberIds', 'array-contains', uid).get()
  for (const t of trips.docs) {
    const memberIds = (t.get('memberIds') as string[]).filter((m) => m !== uid)
    if (memberIds.length === 0) {
      await db.recursiveDelete(t.ref)
      continue
    }
    const updates: Record<string, unknown> = { memberIds: FieldValue.arrayRemove(uid), updatedAt: FieldValue.serverTimestamp() }
    const batch = db.batch()
    if (t.get('ownerId') === uid) {
      const members = await t.ref.collection('members').orderBy('joinedAt').get()
      const next = members.docs.find((m) => m.id !== uid)?.id ?? memberIds[0]!
      updates.ownerId = next
      batch.update(t.ref.collection('members').doc(next), { role: 'owner' })
    }
    batch.update(t.ref, updates)
    batch.delete(t.ref.collection('members').doc(uid))
    await batch.commit()
  }
  await db.recursiveDelete(db.doc(`users/${uid}`))
  await adminAuth.deleteUser(uid)
  return { deleted: true }
})
