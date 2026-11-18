import { query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore'
import { refs, useLiveQuery, type Invite } from '@/lib/firestore'

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

export async function createInvite(tripId: string, uid: string, opts: { expiresInDays: number | null; maxUses: number | null }) {
  const code = generateInviteCode()
  await setDoc(refs.invite(tripId, code), {
    code,
    createdBy: uid,
    createdAt: serverTimestamp(),
    expiresAt: opts.expiresInDays ? Timestamp.fromMillis(Date.now() + opts.expiresInDays * 86_400_000) : null,
    maxUses: opts.maxUses,
    uses: 0,
    revoked: false,
  } as never)
  return code
}

export async function revokeInvite(tripId: string, code: string) {
  await updateDoc(refs.invite(tripId, code), { revoked: true })
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
  return useLiveQuery<Invite>(query(refs.invites(tripId), where('revoked', '==', false)), `invites:${tripId}`)
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
