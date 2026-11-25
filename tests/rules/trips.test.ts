import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db, makeEnv, MEMBER, MEMBER2, OUTSIDER, OWNER, seed, TRIP, tripData } from './setup'

let env: RulesTestEnvironment
beforeAll(async () => {
  env = await makeEnv('demo-happs-rules-trips')
})
afterAll(() => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await seed(env)
})

describe('users', () => {
  it('a user can create and read only their own profile', async () => {
    const profile = { displayName: 'Bob', email: 'b@x.test', photoURL: null, defaultCurrency: 'AUD', notificationPrefs: {} }
    await assertSucceeds(setDoc(doc(db(env, MEMBER), 'users', MEMBER), profile))
    await assertSucceeds(getDoc(doc(db(env, MEMBER), 'users', MEMBER)))
    await assertFails(getDoc(doc(db(env, OWNER), 'users', MEMBER)))
    await assertFails(setDoc(doc(db(env, OWNER), 'users', MEMBER), profile))
    await assertFails(getDoc(doc(db(env, null), 'users', MEMBER)))
  })
  it('rejects unknown fields and bad currencies', async () => {
    await assertFails(setDoc(doc(db(env, MEMBER), 'users', MEMBER), { displayName: 'B', isAdmin: true }))
    await assertFails(setDoc(doc(db(env, MEMBER), 'users', MEMBER), { displayName: 'B', defaultCurrency: 'dollars' }))
  })
  it('payment details: short known fields only, on the profile and my own member doc', async () => {
    const payTo = { payId: '0412 345 678', paypalMe: 'bob', bank: 'BSB 062-000 1234 5678' }
    await assertSucceeds(setDoc(doc(db(env, MEMBER), 'users', MEMBER), { displayName: 'Bob', payTo }))
    await assertFails(setDoc(doc(db(env, MEMBER), 'users', MEMBER), { displayName: 'Bob', payTo: { ...payTo, iban: 'x' } }))
    await assertFails(setDoc(doc(db(env, MEMBER), 'users', MEMBER), { displayName: 'Bob', payTo: { bank: 'x'.repeat(201) } }))
    await assertSucceeds(updateDoc(doc(db(env, MEMBER), 'trips', TRIP, 'members', MEMBER), { payTo }))
    await assertFails(updateDoc(doc(db(env, MEMBER), 'trips', TRIP, 'members', MEMBER2), { payTo }))
  })
  it('error reports are write-only', async () => {
    const report = { uid: MEMBER, message: 'Boom', stack: '', url: '/', appVersion: '0.1.0', userAgent: 'test' }
    await assertSucceeds(setDoc(doc(db(env, MEMBER), 'clientErrors', 'e1'), report))
    await assertFails(setDoc(doc(db(env, MEMBER), 'clientErrors', 'e2'), { ...report, uid: OWNER }))
    await assertFails(getDoc(doc(db(env, MEMBER), 'clientErrors', 'e1')))
  })
  it('notifications: a trip-mate sends one; the recipient reads, flips read and clears it', async () => {
    const note = (from: string, over: Record<string, unknown> = {}) => ({
      type: 'shareSent',
      tripId: TRIP,
      refPath: null,
      title: 'Alice says she sent you A$10',
      body: 'For Dinner',
      url: `/trips/${TRIP}/expenses`,
      read: false,
      fromUid: from,
      createdAt: serverTimestamp(),
      expireAt: Timestamp.fromMillis(Date.now() + 90 * 86_400_000),
      ...over,
    })
    const n = doc(db(env, OWNER), 'users', MEMBER, 'notifications', 'n1')
    await assertSucceeds(setDoc(n, note(OWNER)))
    const mine = doc(db(env, MEMBER), 'users', MEMBER, 'notifications', 'n1')
    await assertSucceeds(getDoc(mine))
    await assertSucceeds(updateDoc(mine, { read: true }))
    await assertFails(updateDoc(mine, { title: 'hacked' }))
    await assertFails(getDoc(doc(db(env, OWNER), 'users', MEMBER, 'notifications', 'n1')))
    await assertSucceeds(deleteDoc(mine))
    // Not from outsiders, not to myself, not as someone else, not for a trip the recipient isn't on.
    await assertFails(setDoc(doc(db(env, OUTSIDER), 'users', MEMBER, 'notifications', 'n2'), note(OUTSIDER)))
    await assertFails(setDoc(doc(db(env, MEMBER), 'users', MEMBER, 'notifications', 'n3'), note(MEMBER)))
    await assertFails(setDoc(doc(db(env, OWNER), 'users', MEMBER, 'notifications', 'n4'), note(MEMBER2)))
    await assertFails(setDoc(doc(db(env, OWNER), 'users', OUTSIDER, 'notifications', 'n5'), note(OWNER)))
    await assertFails(setDoc(doc(db(env, OWNER), 'users', MEMBER, 'notifications', 'n6'), note(OWNER, { read: true })))
    await assertFails(setDoc(doc(db(env, OWNER), 'users', MEMBER, 'notifications', 'n7'), note(OWNER, { type: 'confirmReminder' })))
    await assertFails(setDoc(doc(db(env, OWNER), 'users', MEMBER, 'notifications', 'n8'), note(OWNER, { extra: 1 })))
  })
  it('photos are small JPEG data URLs or https links', async () => {
    const jpeg = (chars: number) => 'data:image/jpeg;base64,' + 'A'.repeat(chars)
    await assertSucceeds(setDoc(doc(db(env, MEMBER), 'users', MEMBER), { displayName: 'Bob', photoURL: jpeg(40_000) }))
    await assertSucceeds(setDoc(doc(db(env, MEMBER), 'users', MEMBER), { displayName: 'Bob', photoURL: 'https://lh3.googleusercontent.com/a/x' }))
    await assertFails(setDoc(doc(db(env, MEMBER), 'users', MEMBER), { displayName: 'Bob', photoURL: jpeg(70_000) }))
    await assertFails(setDoc(doc(db(env, MEMBER), 'users', MEMBER), { displayName: 'Bob', photoURL: 'javascript:alert(1)' }))
    await assertSucceeds(updateDoc(doc(db(env, OWNER), 'trips', TRIP), { coverPhotoURL: jpeg(200_000) }))
    await assertFails(updateDoc(doc(db(env, OWNER), 'trips', TRIP), { coverPhotoURL: jpeg(300_000) }))
  })
  it('a user can delete their own profile only', async () => {
    await assertSucceeds(setDoc(doc(db(env, MEMBER), 'users', MEMBER), { displayName: 'Bob' }))
    await assertFails(deleteDoc(doc(db(env, OWNER), 'users', MEMBER)))
    await assertSucceeds(deleteDoc(doc(db(env, MEMBER), 'users', MEMBER)))
  })
})

describe('trips', () => {
  it('members can read; a non-member cannot', async () => {
    await assertSucceeds(getDoc(doc(db(env, MEMBER), 'trips', TRIP)))
    await assertFails(getDoc(doc(db(env, OUTSIDER), 'trips', TRIP)))
    await assertFails(getDoc(doc(db(env, null), 'trips', TRIP)))
  })
  it('non-members cannot read any subcollection', async () => {
    for (const sub of ['members', 'items', 'expenses', 'invites', 'settlementBatches']) {
      await assertFails(getDocs(collection(db(env, OUTSIDER), 'trips', TRIP, sub)))
    }
    await assertFails(getDocs(collection(db(env, OUTSIDER), 'trips', TRIP, 'expenses', 'e1', 'shares')))
  })
  it('trip list query must be scoped to my membership', async () => {
    await assertSucceeds(getDocs(query(collection(db(env, MEMBER), 'trips'), where('memberIds', 'array-contains', MEMBER))))
    await assertFails(getDocs(collection(db(env, MEMBER), 'trips')))
  })
  it('create: creator must be sole member and owner, with their owner member doc', async () => {
    const d = db(env, OUTSIDER)
    const batch = writeBatch(d)
    batch.set(doc(d, 'trips', 'new1'), tripData({ ownerId: OUTSIDER, memberIds: [OUTSIDER] }))
    batch.set(doc(d, 'trips', 'new1', 'members', OUTSIDER), { role: 'owner', displayName: 'M', photoURL: null, joinedAt: serverTimestamp() })
    await assertSucceeds(batch.commit())
    await assertFails(setDoc(doc(d, 'trips', 'new2'), tripData({ ownerId: OUTSIDER, memberIds: [OUTSIDER, MEMBER] })))
    await assertFails(setDoc(doc(d, 'trips', 'new3'), tripData({ ownerId: MEMBER, memberIds: [OUTSIDER] })))
    await assertFails(setDoc(doc(d, 'trips', 'new4'), tripData({ ownerId: OUTSIDER, memberIds: [OUTSIDER], endDate: '2026-01-01' })))
  })
  it('only the owner edits details', async () => {
    await assertSucceeds(updateDoc(doc(db(env, OWNER), 'trips', TRIP), { name: 'Shanghai 2026' }))
    await assertSucceeds(updateDoc(doc(db(env, OWNER), 'trips', TRIP), { baseCurrency: 'CNY', startDate: '2026-12-04' }))
    await assertFails(updateDoc(doc(db(env, MEMBER), 'trips', TRIP), { name: 'Mine now' }))
    await assertFails(updateDoc(doc(db(env, MEMBER), 'trips', TRIP), { startDate: '2026-12-01' }))
    await assertFails(updateDoc(doc(db(env, MEMBER), 'trips', TRIP), { ownerId: MEMBER }))
  })
  it('memberIds: nobody adds people directly, not even the owner', async () => {
    await assertFails(updateDoc(doc(db(env, OWNER), 'trips', TRIP), { memberIds: arrayUnion(OUTSIDER) }))
    await assertFails(updateDoc(doc(db(env, OUTSIDER), 'trips', TRIP), { memberIds: arrayUnion(OUTSIDER) }))
    await assertFails(updateDoc(doc(db(env, OWNER), 'trips', TRIP), { memberIds: [OWNER] }))
  })
  it('a member leaves: off memberIds and their member doc, together', async () => {
    const d = db(env, MEMBER)
    const b = writeBatch(d)
    b.update(doc(d, 'trips', TRIP), { memberIds: arrayRemove(MEMBER) })
    b.delete(doc(d, 'trips', TRIP, 'members', MEMBER))
    await assertSucceeds(b.commit())
  })
  it('leaving: only yourself, and the owner must hand over first', async () => {
    await assertFails(updateDoc(doc(db(env, MEMBER), 'trips', TRIP), { memberIds: arrayRemove(MEMBER2) }))
    await assertFails(updateDoc(doc(db(env, OWNER), 'trips', TRIP), { memberIds: arrayRemove(OWNER) }))
    await assertFails(deleteDoc(doc(db(env, MEMBER), 'trips', TRIP, 'members', MEMBER)))
  })
  it('the owner removes one member at a time', async () => {
    await assertFails(updateDoc(doc(db(env, OWNER), 'trips', TRIP), { memberIds: [OWNER] }))
    const d = db(env, OWNER)
    const b = writeBatch(d)
    b.update(doc(d, 'trips', TRIP), { memberIds: arrayRemove(MEMBER2) })
    b.delete(doc(d, 'trips', TRIP, 'members', MEMBER2))
    await assertSucceeds(b.commit())
  })
  it('owner can hand ownership only to an existing member', async () => {
    await assertFails(updateDoc(doc(db(env, OWNER), 'trips', TRIP), { ownerId: OUTSIDER }))
    await assertSucceeds(updateDoc(doc(db(env, OWNER), 'trips', TRIP), { ownerId: MEMBER }))
  })
  it('only the owner deletes the trip', async () => {
    await assertFails(deleteDoc(doc(db(env, MEMBER), 'trips', TRIP)))
    await assertSucceeds(deleteDoc(doc(db(env, OWNER), 'trips', TRIP)))
  })
})

describe('members', () => {
  it('members cannot add themselves or others to a trip', async () => {
    await assertFails(setDoc(doc(db(env, OUTSIDER), 'trips', TRIP, 'members', OUTSIDER), { role: 'member', displayName: 'M', photoURL: null }))
    await assertFails(setDoc(doc(db(env, OWNER), 'trips', TRIP, 'members', OUTSIDER), { role: 'member', displayName: 'M', photoURL: null }))
  })
  it('members update their own name; owner changes roles; members never delete others', async () => {
    await assertSucceeds(updateDoc(doc(db(env, MEMBER), 'trips', TRIP, 'members', MEMBER), { displayName: 'Bobby' }))
    await assertFails(updateDoc(doc(db(env, MEMBER), 'trips', TRIP, 'members', MEMBER), { role: 'owner' }))
    await assertFails(updateDoc(doc(db(env, MEMBER), 'trips', TRIP, 'members', MEMBER2), { displayName: 'x' }))
    await assertSucceeds(updateDoc(doc(db(env, OWNER), 'trips', TRIP, 'members', MEMBER), { role: 'owner' }))
    await assertFails(deleteDoc(doc(db(env, MEMBER2), 'trips', TRIP, 'members', OWNER)))
  })
})

describe('invites and joining', () => {
  const CODE = 'ABCDEFGHJK12'
  const invite = (uid: string, over: Record<string, unknown> = {}) => ({
    code: CODE,
    tripId: TRIP,
    tripName: 'Shanghai',
    destination: 'Shanghai, China',
    startDate: '2026-12-05',
    endDate: '2026-12-12',
    coverEmoji: null,
    invitedBy: 'Bob',
    createdBy: uid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86_400_000),
    maxUses: null,
    uses: 0,
    revoked: false,
    ...over,
  })
  const seedInvite = (over: Record<string, unknown> = {}) =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'invites', CODE), { ...invite(MEMBER), createdAt: Timestamp.now(), ...over })
    })
  /** The three writes the app makes to join (src/features/invites/inviteApi.ts). */
  const join = (uid: string, code = CODE, over: Record<string, unknown> = {}) => {
    const d = db(env, uid)
    const b = writeBatch(d)
    b.update(doc(d, 'trips', TRIP), { memberIds: arrayUnion(uid), updatedAt: serverTimestamp() })
    b.set(doc(d, 'trips', TRIP, 'members', uid), { role: 'member', displayName: 'Mallory', photoURL: null, joinedAt: serverTimestamp(), payTo: null, inviteCode: code, ...over })
    b.update(doc(d, 'invites', code), { uses: increment(1) })
    return b.commit()
  }

  it('any member can create an invite with a long code', async () => {
    await assertSucceeds(setDoc(doc(db(env, MEMBER), 'invites', CODE), invite(MEMBER)))
    await assertFails(setDoc(doc(db(env, MEMBER), 'invites', 'short'), invite(MEMBER, { code: 'short' })))
    await assertFails(setDoc(doc(db(env, OUTSIDER), 'invites', 'XYZDEFGHJK12'), invite(OUTSIDER, { code: 'XYZDEFGHJK12' })))
    await assertFails(setDoc(doc(db(env, MEMBER), 'invites', 'BBCDEFGHJK12'), invite(MEMBER, { code: 'BBCDEFGHJK12', uses: 5 })))
    await assertFails(setDoc(doc(db(env, MEMBER), 'invites', 'CBCDEFGHJK12'), invite(OWNER, { code: 'CBCDEFGHJK12' })))
    await assertFails(setDoc(doc(db(env, MEMBER), 'invites', 'DBCDEFGHJK12'), invite(MEMBER, { code: 'OTHERCODE123' })))
  })
  it('anyone signed in can read an invite by its code, but not list them', async () => {
    await seedInvite()
    await assertSucceeds(getDoc(doc(db(env, OUTSIDER), 'invites', CODE)))
    await assertFails(getDoc(doc(db(env, null), 'invites', CODE)))
    await assertFails(getDocs(collection(db(env, OUTSIDER), 'invites')))
    await assertSucceeds(getDocs(query(collection(db(env, MEMBER), 'invites'), where('tripId', '==', TRIP))))
  })
  it('owner or creator can revoke; nobody resets uses', async () => {
    await seedInvite()
    await assertFails(updateDoc(doc(db(env, MEMBER2), 'invites', CODE), { revoked: true }))
    await assertFails(updateDoc(doc(db(env, MEMBER), 'invites', CODE), { uses: 0, maxUses: 99 }))
    await assertSucceeds(updateDoc(doc(db(env, OWNER), 'invites', CODE), { revoked: true }))
    await assertFails(updateDoc(doc(db(env, OWNER), 'invites', CODE), { revoked: false }))
  })
  it('joins with a live invite: memberIds, member doc and uses in one batch', async () => {
    await seedInvite({ maxUses: 2 })
    await assertSucceeds(join(OUTSIDER))
    await assertSucceeds(getDoc(doc(db(env, OUTSIDER), 'trips', TRIP)))
  })
  it('no joining with a revoked, expired, used-up or other trip’s invite', async () => {
    for (const over of [{ revoked: true }, { expiresAt: Timestamp.fromMillis(Date.now() - 1000) }, { maxUses: 1, uses: 1 }, { tripId: 'other' }]) {
      await seedInvite(over)
      await assertFails(join(OUTSIDER))
    }
  })
  it('no joining without using up the invite, or as an owner', async () => {
    await seedInvite()
    const d = db(env, OUTSIDER)
    const b = writeBatch(d)
    b.update(doc(d, 'trips', TRIP), { memberIds: arrayUnion(OUTSIDER) })
    b.set(doc(d, 'trips', TRIP, 'members', OUTSIDER), { role: 'member', displayName: 'M', photoURL: null, inviteCode: CODE })
    await assertFails(b.commit())
    await assertFails(join(OUTSIDER, CODE, { role: 'owner' }))
    await assertFails(join(OUTSIDER, 'NOSUCHCODE12'))
  })
})

describe('files', () => {
  const file = (uid: string, over: Record<string, unknown> = {}) => ({
    itemId: 'i1', name: 'ticket.pdf', contentType: 'application/pdf', size: 3, data: 'JVBERi0=', createdBy: uid, createdAt: serverTimestamp(), ...over,
  })
  it('members attach files up to ~900 KB of base64; outsiders can’t read them', async () => {
    await assertSucceeds(setDoc(doc(db(env, MEMBER), 'trips', TRIP, 'files', 'f1'), file(MEMBER)))
    await assertSucceeds(getDoc(doc(db(env, MEMBER2), 'trips', TRIP, 'files', 'f1')))
    await assertFails(getDoc(doc(db(env, OUTSIDER), 'trips', TRIP, 'files', 'f1')))
    await assertFails(setDoc(doc(db(env, MEMBER), 'trips', TRIP, 'files', 'f2'), file(MEMBER, { data: 'A'.repeat(900_001) })))
    await assertFails(setDoc(doc(db(env, MEMBER), 'trips', TRIP, 'files', 'f3'), file(MEMBER, { contentType: 'text/html' })))
    await assertFails(setDoc(doc(db(env, OUTSIDER), 'trips', TRIP, 'files', 'f4'), file(OUTSIDER)))
    await assertFails(updateDoc(doc(db(env, MEMBER), 'trips', TRIP, 'files', 'f1'), { name: 'x.pdf' }))
    await assertSucceeds(deleteDoc(doc(db(env, MEMBER2), 'trips', TRIP, 'files', 'f1')))
  })
})

describe('admins', () => {
  const trip = (uid: string) => doc(db(env, uid), 'trips', TRIP)
  const makeAdmin = (uid: string) => env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'trips', TRIP), { adminIds: [uid] }))
  /** Remove `who` the way the app does: memberIds, adminIds and the member doc in one batch. */
  const remove = (as: string, who: string) => {
    const d = db(env, as)
    const b = writeBatch(d)
    b.update(doc(d, 'trips', TRIP), { memberIds: arrayRemove(who), adminIds: arrayRemove(who), updatedAt: serverTimestamp() })
    b.delete(doc(d, 'trips', TRIP, 'members', who))
    return b.commit()
  }

  it('only the owner chooses admins, and only from members other than the owner', async () => {
    await assertFails(updateDoc(trip(MEMBER), { adminIds: [MEMBER] }))
    await assertFails(updateDoc(trip(OWNER), { adminIds: [OUTSIDER] }))
    await assertFails(updateDoc(trip(OWNER), { adminIds: [OWNER] }))
    await assertSucceeds(updateDoc(trip(OWNER), { adminIds: arrayUnion(MEMBER) }))
    // An admin can't make someone else an admin, or take it away.
    await assertFails(updateDoc(trip(MEMBER), { adminIds: arrayUnion(MEMBER2) }))
    await assertFails(updateDoc(trip(MEMBER), { adminIds: [] }))
    await assertSucceeds(updateDoc(trip(OWNER), { adminIds: arrayRemove(MEMBER) }))
  })

  it('admins edit trip details but not ownership or who is on the trip', async () => {
    await assertFails(updateDoc(trip(MEMBER), { name: 'Not mine' }))
    await makeAdmin(MEMBER)
    await assertSucceeds(updateDoc(trip(MEMBER), { name: 'Renamed by admin', notes: 'x', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(trip(MEMBER), { ownerId: MEMBER }))
    await assertFails(updateDoc(trip(MEMBER), { memberIds: arrayUnion(OUTSIDER) }))
    await assertFails(deleteDoc(trip(MEMBER)))
  })

  it('admins remove regular members, but not the owner or another admin', async () => {
    await assertFails(remove(MEMBER, MEMBER2))
    await makeAdmin(MEMBER)
    await assertFails(remove(MEMBER, OWNER))
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'trips', TRIP), { adminIds: [MEMBER, MEMBER2] }))
    await assertFails(remove(MEMBER, MEMBER2))
    await makeAdmin(MEMBER)
    await assertSucceeds(remove(MEMBER, MEMBER2))
  })

  it('the owner removing an admin takes admin away too; an admin can leave', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'trips', TRIP), { adminIds: [MEMBER, MEMBER2] }))
    await assertSucceeds(remove(OWNER, MEMBER2))
    await assertSucceeds(remove(MEMBER, MEMBER))
    const t = await getDoc(trip(OWNER))
    if (JSON.stringify(t.data()?.adminIds) !== '[]') throw new Error(`adminIds left: ${JSON.stringify(t.data()?.adminIds)}`)
  })

  it('handing over ownership to an admin drops them from admins', async () => {
    await makeAdmin(MEMBER)
    await assertFails(updateDoc(trip(OWNER), { ownerId: MEMBER }))
    await assertSucceeds(updateDoc(trip(OWNER), { ownerId: MEMBER, adminIds: arrayRemove(MEMBER) }))
  })

  it('admins delete anyone’s plans, costs and ideas; members only their own', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const d = ctx.firestore()
      await setDoc(doc(d, 'trips', TRIP, 'items', 'i1'), { type: 'activity', title: 'Bund', date: '2026-12-06', createdBy: MEMBER2 })
      await setDoc(doc(d, 'trips', TRIP, 'ideas', 'd1'), { title: 'Zoo', createdBy: MEMBER2, votes: [] })
    })
    await assertFails(deleteDoc(doc(db(env, MEMBER), 'trips', TRIP, 'items', 'i1')))
    await assertFails(deleteDoc(doc(db(env, MEMBER), 'trips', TRIP, 'ideas', 'd1')))
    await assertFails(updateDoc(doc(db(env, MEMBER), 'trips', TRIP, 'ideas', 'd1'), { title: 'Aquarium' }))
    await makeAdmin(MEMBER)
    await assertSucceeds(updateDoc(doc(db(env, MEMBER), 'trips', TRIP, 'ideas', 'd1'), { title: 'Aquarium' }))
    await assertSucceeds(deleteDoc(doc(db(env, MEMBER), 'trips', TRIP, 'items', 'i1')))
    await assertSucceeds(deleteDoc(doc(db(env, MEMBER), 'trips', TRIP, 'ideas', 'd1')))
  })

  it('admins revoke anyone’s invite link', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'invites', 'ABCDEFGHJK99'), { code: 'ABCDEFGHJK99', tripId: TRIP, createdBy: MEMBER2, uses: 0, revoked: false }),
    )
    await assertFails(updateDoc(doc(db(env, MEMBER), 'invites', 'ABCDEFGHJK99'), { revoked: true }))
    await makeAdmin(MEMBER)
    await assertSucceeds(updateDoc(doc(db(env, MEMBER), 'invites', 'ABCDEFGHJK99'), { revoked: true }))
  })
})

describe('live locations', () => {
  const loc = (over: Record<string, unknown> = {}) => ({ lat: -33.86, lng: 151.21, accuracy: 12, updatedAt: serverTimestamp(), ...over })
  const ref = (as: string, uid: string) => doc(db(env, as), 'trips', TRIP, 'locations', uid)
  it('members share their own location; only members can see it', async () => {
    await assertSucceeds(setDoc(ref(MEMBER, MEMBER), loc()))
    await assertSucceeds(setDoc(ref(MEMBER, MEMBER), loc({ lat: -33.87 })))
    await assertSucceeds(getDoc(ref(MEMBER2, MEMBER)))
    await assertFails(getDoc(ref(OUTSIDER, MEMBER)))
  })
  it('nobody writes someone else’s location, and outsiders write none', async () => {
    await assertFails(setDoc(ref(MEMBER2, MEMBER), loc()))
    await assertFails(setDoc(ref(OUTSIDER, OUTSIDER), loc()))
  })
  it('needs a server time and a sane position', async () => {
    await assertFails(setDoc(ref(MEMBER, MEMBER), loc({ updatedAt: Timestamp.fromMillis(Date.now() - 3_600_000) })))
    await assertFails(setDoc(ref(MEMBER, MEMBER), loc({ lat: 91 })))
    await assertFails(setDoc(ref(MEMBER, MEMBER), loc({ lng: 'here' })))
    await assertFails(setDoc(ref(MEMBER, MEMBER), loc({ name: 'extra' })))
  })
  it('you or the owner can delete it, nobody else', async () => {
    await assertSucceeds(setDoc(ref(MEMBER, MEMBER), loc()))
    await assertFails(deleteDoc(ref(MEMBER2, MEMBER)))
    await assertSucceeds(deleteDoc(ref(OWNER, MEMBER)))
    await assertSucceeds(setDoc(ref(MEMBER, MEMBER), loc()))
    await assertSucceeds(deleteDoc(ref(MEMBER, MEMBER)))
  })
  it('pausing marks the latest location without moving it', async () => {
    await assertSucceeds(setDoc(ref(MEMBER, MEMBER), loc()))
    await assertSucceeds(updateDoc(ref(MEMBER, MEMBER), { paused: true, pausedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref(MEMBER, MEMBER), { paused: true, pausedAt: serverTimestamp(), lat: 0 }))
    await assertFails(updateDoc(ref(MEMBER, MEMBER), { paused: true, pausedAt: Timestamp.fromMillis(0) }))
    await assertFails(updateDoc(ref(MEMBER2, MEMBER), { paused: true, pausedAt: serverTimestamp() }))
    // The next live fix replaces the document, clearing the pause.
    await assertSucceeds(setDoc(ref(MEMBER, MEMBER), loc({ lat: -33.87 })))
  })
  it('leaving the trip removes your location in the same batch', async () => {
    await assertSucceeds(setDoc(ref(MEMBER, MEMBER), loc()))
    const m = db(env, MEMBER)
    const b = writeBatch(m)
    b.update(doc(m, 'trips', TRIP), { memberIds: arrayRemove(MEMBER), updatedAt: serverTimestamp() })
    b.delete(doc(m, 'trips', TRIP, 'members', MEMBER))
    b.delete(doc(m, 'trips', TRIP, 'locations', MEMBER))
    await assertSucceeds(b.commit())
  })
})

describe('read-only links (publicTrips)', () => {
  const TOKEN = 'abcdefghijklmnopqrstuvwxyz123456'
  const copy = (over: Record<string, unknown> = {}) => ({
    tripId: TRIP, name: 'Shanghai', destination: 'Shanghai, China', startDate: '2026-12-05', endDate: '2026-12-12',
    timeZone: 'Asia/Shanghai', coverEmoji: null, coverPhotoURL: null, items: [], updatedAt: serverTimestamp(), ...over,
  })
  it('the owner turns a link on with its public copy; anyone can read it by token', async () => {
    const d = db(env, OWNER)
    const b = writeBatch(d)
    b.update(doc(d, 'trips', TRIP), { shareToken: TOKEN })
    b.set(doc(d, 'publicTrips', TOKEN), copy())
    await assertSucceeds(b.commit())
    await assertSucceeds(getDoc(doc(db(env, null), 'publicTrips', TOKEN)))
    await assertFails(getDocs(collection(db(env, null), 'publicTrips')))
    // Members keep it up to date; outsiders can't touch it.
    await assertSucceeds(setDoc(doc(db(env, MEMBER), 'publicTrips', TOKEN), copy({ name: 'Shanghai!' })))
    await assertFails(setDoc(doc(db(env, OUTSIDER), 'publicTrips', TOKEN), copy({ name: 'Hacked' })))
    await assertFails(deleteDoc(doc(db(env, MEMBER), 'publicTrips', TOKEN)))
    await assertSucceeds(deleteDoc(doc(db(env, OWNER), 'publicTrips', TOKEN)))
    // Turning off a link that never had a public copy.
    await assertSucceeds(deleteDoc(doc(db(env, OWNER), 'publicTrips', 'neverexisted1234567890abcdef')))
  })
  it('no public copy under a token the trip doesn’t use, or with private fields', async () => {
    await assertFails(setDoc(doc(db(env, MEMBER), 'publicTrips', TOKEN), copy()))
    const d = db(env, OWNER)
    const b = writeBatch(d)
    b.update(doc(d, 'trips', TRIP), { shareToken: TOKEN })
    b.set(doc(d, 'publicTrips', TOKEN), copy({ memberIds: [OWNER] }))
    await assertFails(b.commit())
  })
})
