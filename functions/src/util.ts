import { HttpsError, type CallableOptions } from 'firebase-functions/v2/https'
import type { z } from 'zod'
import { db } from './admin'

export function requireAuth(auth: { uid: string } | undefined): string {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Please sign in first.')
  return auth.uid
}

export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data)
  if (!r.success) throw new HttpsError('invalid-argument', r.error.issues[0]?.message ?? 'Invalid request')
  return r.data
}

/** Display name for a trip member, from the trip's members subcollection. */
export async function memberName(tripId: string, uid: string): Promise<string> {
  const snap = await db.doc(`trips/${tripId}/members/${uid}`).get()
  return (snap.get('displayName') as string | undefined) || 'Someone'
}

/** Find an invite by code across all trips (codes are globally unique random strings). */
export async function findInvite(code: string) {
  const q = await db.collectionGroup('invites').where('code', '==', code).limit(1).get()
  const snap = q.docs[0]
  if (!snap) throw new HttpsError('not-found', 'This invite link is not valid.')
  const tripRef = snap.ref.parent.parent!
  return { inviteRef: snap.ref, invite: snap.data(), tripRef }
}

export function inviteProblem(invite: FirebaseFirestore.DocumentData, now = Date.now()): string | null {
  if (invite.revoked) return 'This invite link has been revoked. Ask for a new one.'
  const expiresAt = invite.expiresAt as FirebaseFirestore.Timestamp | null | undefined
  if (expiresAt && expiresAt.toMillis() < now) return 'This invite link has expired. Ask for a new one.'
  if (typeof invite.maxUses === 'number' && (invite.uses ?? 0) >= invite.maxUses) return 'This invite link has been used up.'
  return null
}

/**
 * Options for every callable. Set ENFORCE_APP_CHECK=true in functions/.env once
 * App Check is registered and the web app sends tokens (VITE_APPCHECK_SITE_KEY):
 * calls from scripts outside the app are then rejected.
 */
export const callableOptions: CallableOptions = { enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' }
