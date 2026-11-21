import { arrayUnion, doc, getDoc, increment, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { db } from '@/lib/firebase'
import { refs, useLiveQuery, type Invite, type Trip, type UserProfile } from '@/lib/firestore'
import type { InvitePreview } from '@/shared/schemas'
import { notify } from '@/features/notifications/notify'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

/** 12 random characters from a 56-char alphabet (~70 bits of entropy). */
export function generateInviteCode(length = 12): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  // 256 % 56 bias is negligible for invite codes, but reject-sample anyway.
  let out = ''
  let i = 0
  while (out.length < length) {
    const b = bytes[i++ % length]!
    if (b < 224) out += ALPHABET[b % ALPHABET.length]
    else crypto.getRandomValues(bytes)
  }
  return out
}

/**
 * Invites live at the top level (`invites/{code}`) so someone who isn't on the
 * trip yet can read the one they were sent. They carry a small preview of the
 * trip, because non-members can't read the trip itself.
 */
export async function createInvite(trip: Trip, uid: string, invitedBy: string, opts: { expiresInDays: number | null; maxUses: number | null }) {
  const code = generateInviteCode()
  await setDoc(refs.invite(code), {
    code,
    tripId: trip.id,
    tripName: trip.name,
    destination: trip.destination ?? '',
    startDate: trip.startDate,
    endDate: trip.endDate,
    coverEmoji: trip.coverEmoji ?? null,
    invitedBy: invitedBy.slice(0, 100),
    createdBy: uid,
    createdAt: serverTimestamp(),
    expiresAt: opts.expiresInDays ? Timestamp.fromMillis(Date.now() + opts.expiresInDays * 86_400_000) : null,
    maxUses: opts.maxUses,
    uses: 0,
    revoked: false,
  } as never)
  return code
}

export async function revokeInvite(code: string) {
  await updateDoc(refs.invite(code), { revoked: true })
}

export class InviteError extends Error {}

export function inviteProblem(i: Pick<Invite, 'revoked' | 'expiresAt' | 'maxUses' | 'uses'>, now = Date.now()): string | null {
  if (i.revoked) return 'This invite link has been revoked. Ask for a new one.'
  if (i.expiresAt && i.expiresAt.toMillis() < now) return 'This invite link has expired. Ask for a new one.'
  if (i.maxUses !== null && i.uses >= i.maxUses) return 'This invite link has been used up.'
  return null
}

async function loadInvite(code: string): Promise<Invite> {
  const snap = await getDoc(refs.invite(code)).catch(() => null)
  if (!snap?.exists()) throw new InviteError('This invite link is not valid.')
  return snap.data()
}

/** Already on the trip? (Only members can read a trip, so a refusal means no.) */
async function isMemberOf(tripId: string, uid: string): Promise<boolean> {
  const t = await getDoc(refs.trip(tripId)).catch(() => null)
  return !!t?.exists() && t.data().memberIds.includes(uid)
}

/** What someone sees on /join/:code before they are a member. */
export async function getInvitePreview(code: string, uid: string): Promise<InvitePreview> {
  const i = await loadInvite(code)
  const alreadyMember = await isMemberOf(i.tripId, uid)
  const problem = inviteProblem(i)
  if (problem && !alreadyMember) throw new InviteError(problem)
  return {
    tripId: i.tripId,
    tripName: i.tripName,
    destination: i.destination,
    startDate: i.startDate,
    endDate: i.endDate,
    coverEmoji: i.coverEmoji,
    coverPhotoURL: null,
    invitedBy: i.invitedBy,
    alreadyMember,
  }
}

/**
 * Join with an invite code: add myself to the trip, create my member doc and
 * use up one of the invite's uses, all in one batch. The security rules check
 * the invite is valid for this trip.
 */
export async function joinTrip(code: string, user: User, profile: UserProfile | null): Promise<{ tripId: string; alreadyMember: boolean }> {
  const i = await loadInvite(code)
  if (await isMemberOf(i.tripId, user.uid)) return { tripId: i.tripId, alreadyMember: true }
  const problem = inviteProblem(i)
  if (problem) throw new InviteError(problem)
  const displayName = profile?.displayName || user.displayName || 'Traveller'
  const batch = writeBatch(db)
  batch.update(doc(db, 'trips', i.tripId), { memberIds: arrayUnion(user.uid), updatedAt: serverTimestamp() })
  batch.set(doc(db, 'trips', i.tripId, 'members', user.uid), {
    role: 'member',
    displayName,
    photoURL: profile?.photoURL ?? user.photoURL ?? null,
    joinedAt: serverTimestamp(),
    // How they like to be paid back, copied from their profile.
    payTo: profile?.payTo ?? null,
    inviteCode: code,
  })
  batch.update(doc(db, 'invites', code), { uses: increment(1) })
  try {
    await batch.commit()
  } catch (err) {
    console.error(err)
    throw new InviteError('Couldn’t join. The link may have just expired or been used up, or the trip is full.')
  }
  void notifyJoined(i.tripId, i.tripName, user.uid, displayName)
  return { tripId: i.tripId, alreadyMember: false }
}

async function notifyJoined(tripId: string, tripName: string, uid: string, displayName: string) {
  const t = await getDoc(refs.trip(tripId)).catch(() => null)
  const others = t?.exists() ? t.data().memberIds : []
  await notify(uid, others, {
    type: 'memberJoined',
    tripId,
    refPath: `trips/${tripId}`,
    title: `${displayName} joined ${tripName}`,
    body: 'Say hi and start planning together.',
    url: `/trips/${tripId}/members`,
  })
}

export function inviteUrl(code: string): string {
  return `${location.origin}/join/${code}`
}

export function isInviteActive(i: Invite, now = Date.now()): boolean {
  if (i.revoked) return false
  if (i.expiresAt && i.expiresAt.toMillis() < now) return false
  if (i.maxUses !== null && i.uses >= i.maxUses) return false
  return true
}

export function useInvites(tripId: string) {
  return useLiveQuery<Invite>(query(refs.invites(), where('tripId', '==', tripId), where('revoked', '==', false)), `invites:${tripId}`)
}

/** Web Share API with copy-to-clipboard fallback. Returns what happened. */
export async function shareLink(url: string, title: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text: `Join “${title}” on happs`, url })
      return 'shared'
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled'
    }
  }
  await navigator.clipboard.writeText(url)
  return 'copied'
}
