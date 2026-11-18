import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './admin'
import { findInvite, inviteProblem, parseInput, requireAuth, memberName } from './util'
import { notify } from './notify'
import { invitePreviewInput, joinTripInput, type InvitePreview } from '@shared/schemas'

/** What someone sees on /join/:code before they are a member (they can't read the trip yet). */
export const getInvitePreview = onCall(async (req): Promise<InvitePreview> => {
  const uid = requireAuth(req.auth)
  const { code } = parseInput(invitePreviewInput, req.data)
  const { invite, tripRef } = await findInvite(code)
  const problem = inviteProblem(invite)
  if (problem) throw new HttpsError('failed-precondition', problem)
  const trip = await tripRef.get()
  if (!trip.exists) throw new HttpsError('not-found', 'This trip no longer exists.')
  const t = trip.data()!
  return {
    tripId: trip.id,
    tripName: t.name,
    destination: t.destination ?? '',
    startDate: t.startDate,
    endDate: t.endDate,
    coverEmoji: t.coverEmoji ?? null,
    coverPhotoURL: t.coverPhotoURL ?? null,
    invitedBy: await memberName(trip.id, invite.createdBy),
    alreadyMember: (t.memberIds as string[]).includes(uid),
  }
})

/**
 * Join a trip with an invite code. Runs in a transaction so `uses` and
 * `maxUses` stay consistent under concurrent joins.
 */
export const joinTrip = onCall(async (req): Promise<{ tripId: string; alreadyMember: boolean }> => {
  const uid = requireAuth(req.auth)
  const { code } = parseInput(joinTripInput, req.data)
  const { inviteRef, tripRef } = await findInvite(code)
  const user = await db.doc(`users/${uid}`).get()
  const displayName = (user.get('displayName') as string) || (req.auth?.token.name as string) || 'Traveller'
  const photoURL = (user.get('photoURL') as string | null) ?? (req.auth?.token.picture as string | undefined) ?? null

  const result = await db.runTransaction(async (tx) => {
    const [inviteSnap, tripSnap] = await Promise.all([tx.get(inviteRef), tx.get(tripRef)])
    if (!tripSnap.exists) throw new HttpsError('not-found', 'This trip no longer exists.')
    const memberIds = tripSnap.get('memberIds') as string[]
    if (memberIds.includes(uid)) return { alreadyMember: true, others: [] as string[] }
    const problem = inviteProblem(inviteSnap.data() ?? { revoked: true })
    if (problem) throw new HttpsError('failed-precondition', problem)
    if (memberIds.length >= 50) throw new HttpsError('resource-exhausted', 'This trip is full (50 members).')

    tx.update(tripRef, { memberIds: FieldValue.arrayUnion(uid), updatedAt: FieldValue.serverTimestamp() })
    tx.set(tripRef.collection('members').doc(uid), {
      role: 'member',
      displayName,
      photoURL,
      joinedAt: FieldValue.serverTimestamp(),
    })
    tx.update(inviteRef, { uses: FieldValue.increment(1) })
    return { alreadyMember: false, others: memberIds }
  })

  if (!result.alreadyMember) {
    const tripName = (await tripRef.get()).get('name') as string
    await Promise.all(
      result.others.map((other) =>
        notify(other, {
          type: 'memberJoined',
          tripId: tripRef.id,
          refPath: tripRef.path,
          title: `${displayName} joined ${tripName}`,
          body: 'Say hi and start planning together.',
          url: `/trips/${tripRef.id}/members`,
        }),
      ),
    )
  }
  return { tripId: tripRef.id, alreadyMember: result.alreadyMember }
})
