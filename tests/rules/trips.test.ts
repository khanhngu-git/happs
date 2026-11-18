import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
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
  it('notifications: owner reads and flips read only; nobody creates', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', MEMBER, 'notifications', 'n1'), { type: 'shareSent', title: 'x', body: '', read: false })
    })
    const n = doc(db(env, MEMBER), 'users', MEMBER, 'notifications', 'n1')
    await assertSucceeds(getDoc(n))
    await assertSucceeds(updateDoc(n, { read: true }))
    await assertFails(updateDoc(n, { title: 'hacked' }))
    await assertFails(getDoc(doc(db(env, OWNER), 'users', MEMBER, 'notifications', 'n1')))
    await assertFails(setDoc(doc(db(env, OWNER), 'users', MEMBER, 'notifications', 'n2'), { type: 'shareSent', title: 'spam', read: false }))
    await assertFails(setDoc(doc(db(env, MEMBER), 'users', MEMBER, 'notifications', 'n3'), { type: 'shareSent', title: 'self', read: false }))
  })
  it('fcm tokens are private to the user', async () => {
    await assertSucceeds(setDoc(doc(db(env, MEMBER), 'users', MEMBER, 'fcmTokens', 'tok'), { createdAt: serverTimestamp() }))
    await assertFails(getDoc(doc(db(env, OWNER), 'users', MEMBER, 'fcmTokens', 'tok')))
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
  it('nobody edits memberIds from the client, not even the owner', async () => {
    await assertFails(updateDoc(doc(db(env, OWNER), 'trips', TRIP), { memberIds: arrayUnion(OUTSIDER) }))
    await assertFails(updateDoc(doc(db(env, OUTSIDER), 'trips', TRIP), { memberIds: arrayUnion(OUTSIDER) }))
    await assertFails(updateDoc(doc(db(env, OWNER), 'trips', TRIP), { memberIds: [OWNER] }))
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
  it('members update their own name; owner changes roles; no client deletes', async () => {
    await assertSucceeds(updateDoc(doc(db(env, MEMBER), 'trips', TRIP, 'members', MEMBER), { displayName: 'Bobby' }))
    await assertFails(updateDoc(doc(db(env, MEMBER), 'trips', TRIP, 'members', MEMBER), { role: 'owner' }))
    await assertFails(updateDoc(doc(db(env, MEMBER), 'trips', TRIP, 'members', MEMBER2), { displayName: 'x' }))
    await assertSucceeds(updateDoc(doc(db(env, OWNER), 'trips', TRIP, 'members', MEMBER), { role: 'owner' }))
    await assertFails(deleteDoc(doc(db(env, OWNER), 'trips', TRIP, 'members', MEMBER)))
  })
})

describe('invites', () => {
  const invite = (uid: string, over: Record<string, unknown> = {}) => ({
    code: 'ABCDEFGHJK12',
    createdBy: uid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86_400_000),
    maxUses: null,
    uses: 0,
    revoked: false,
    ...over,
  })
  it('any member can create an invite with a long code', async () => {
    await assertSucceeds(setDoc(doc(db(env, MEMBER), 'trips', TRIP, 'invites', 'ABCDEFGHJK12'), invite(MEMBER)))
    await assertFails(setDoc(doc(db(env, MEMBER), 'trips', TRIP, 'invites', 'short'), invite(MEMBER, { code: 'short' })))
    await assertFails(setDoc(doc(db(env, OUTSIDER), 'trips', TRIP, 'invites', 'ABCDEFGHJK12'), invite(OUTSIDER)))
    await assertFails(setDoc(doc(db(env, MEMBER), 'trips', TRIP, 'invites', 'ABCDEFGHJK12'), invite(MEMBER, { uses: 5 })))
    await assertFails(setDoc(doc(db(env, MEMBER), 'trips', TRIP, 'invites', 'ABCDEFGHJK12'), invite(OWNER)))
    await assertFails(setDoc(doc(db(env, MEMBER), 'trips', TRIP, 'invites', 'ABCDEFGHJK12'), invite(MEMBER, { code: 'OTHERCODE123' })))
  })
  it('owner or creator can revoke; nobody edits uses', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'trips', TRIP, 'invites', 'ABCDEFGHJK12'), invite(MEMBER))
    })
    await assertFails(updateDoc(doc(db(env, MEMBER2), 'trips', TRIP, 'invites', 'ABCDEFGHJK12'), { revoked: true }))
    await assertFails(updateDoc(doc(db(env, MEMBER), 'trips', TRIP, 'invites', 'ABCDEFGHJK12'), { uses: 0, maxUses: 99 }))
    await assertSucceeds(updateDoc(doc(db(env, OWNER), 'trips', TRIP, 'invites', 'ABCDEFGHJK12'), { revoked: true }))
    await assertFails(updateDoc(doc(db(env, OWNER), 'trips', TRIP, 'invites', 'ABCDEFGHJK12'), { revoked: false }))
  })
})
