/**
 * Every allowed and denied share transition (spec §4.5 / §6).
 */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  arrayUnion,
  collection,
  collectionGroup,
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
  type Firestore,
} from 'firebase/firestore'
import { db, expenseData, makeEnv, MEMBER, MEMBER2, OUTSIDER, OWNER, seed, shareData, TRIP } from './setup'

let env: RulesTestEnvironment
beforeAll(async () => {
  env = await makeEnv('demo-happs-rules-shares')
})
afterAll(() => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await seed(env)
})

const sharePath = (uid: string) => `trips/${TRIP}/expenses/e1/shares/${uid}`
const ref = (d: Firestore, uid = MEMBER) => doc(d, sharePath(uid))
const entry = (status: string, byUid: string, note = '', at = Timestamp.now()) => ({ status, byUid, at, note })

async function setStatus(status: string, extra: Record<string, unknown> = {}, uid = MEMBER) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), sharePath(uid)), shareData({ debtorUid: uid, status, ...extra }))
  })
}

const send = (d: Firestore, by = MEMBER, extra: Record<string, unknown> = {}) =>
  updateDoc(ref(d), {
    status: 'sent',
    method: 'bank',
    reference: 'REF123',
    note: 'Sent via app',
    history: arrayUnion(entry('sent', by, 'Sent via app')),
    updatedAt: serverTimestamp(),
    ...extra,
  })

const payerMove = (d: Firestore, status: string, by = OWNER, extra: Record<string, unknown> = {}) =>
  updateDoc(ref(d), { status, history: arrayUnion(entry(status, by)), updatedAt: serverTimestamp(), ...extra })

describe('debtor: unpaid/disputed → sent', () => {
  it('debtor marks an unpaid share as sent', async () => {
    await assertSucceeds(send(db(env, MEMBER)))
  })
  it('debtor re-sends a disputed share', async () => {
    await setStatus('disputed')
    await assertSucceeds(send(db(env, MEMBER)))
  })
  it('debtor cannot send twice, or send a confirmed share', async () => {
    await setStatus('sent')
    await assertFails(send(db(env, MEMBER)))
    await setStatus('confirmed')
    await assertFails(send(db(env, MEMBER)))
  })
  it('debtor cannot confirm, dispute or mark their own share received', async () => {
    await setStatus('sent')
    await assertFails(payerMove(db(env, MEMBER), 'confirmed', MEMBER))
    await assertFails(payerMove(db(env, MEMBER), 'disputed', MEMBER))
    await setStatus('unpaid')
    await assertFails(payerMove(db(env, MEMBER), 'confirmed', MEMBER))
  })
  it('only the debtor can mark sent (not the payer, another member or an outsider)', async () => {
    await assertFails(send(db(env, OWNER), OWNER))
    await assertFails(send(db(env, MEMBER2), MEMBER2))
    await assertFails(send(db(env, OUTSIDER), OUTSIDER))
  })
  it('debtor may only touch status, method, reference, note, batchId', async () => {
    await assertFails(send(db(env, MEMBER), MEMBER, { amountMinor: 1 }))
    await assertFails(send(db(env, MEMBER), MEMBER, { amountBaseMinor: 1 }))
    await assertFails(send(db(env, MEMBER), MEMBER, { payerUid: MEMBER }))
    await assertFails(send(db(env, MEMBER), MEMBER, { debtorUid: MEMBER2 }))
    await assertFails(send(db(env, MEMBER), MEMBER, { expenseTitle: 'Free' }))
    await assertFails(send(db(env, MEMBER), MEMBER, { method: 'crypto' }))
    await assertSucceeds(send(db(env, MEMBER), MEMBER, { batchId: 'b1' }))
  })
})

describe('payer: sent → confirmed/disputed, unpaid → confirmed', () => {
  it('payer confirms a sent share', async () => {
    await setStatus('sent')
    await assertSucceeds(payerMove(db(env, OWNER), 'confirmed'))
  })
  it('payer disputes a sent share with a reason', async () => {
    await setStatus('sent')
    await assertSucceeds(updateDoc(ref(db(env, OWNER)), { status: 'disputed', history: arrayUnion(entry('disputed', OWNER, 'Nothing in my account')), updatedAt: serverTimestamp() }))
  })
  it('payer marks an unpaid share as received (cash)', async () => {
    await assertSucceeds(payerMove(db(env, OWNER), 'confirmed', OWNER, { method: 'cash' }))
  })
  it('payer cannot dispute an unpaid share, or move a confirmed/disputed one', async () => {
    await assertFails(payerMove(db(env, OWNER), 'disputed'))
    await setStatus('confirmed')
    await assertFails(payerMove(db(env, OWNER), 'disputed'))
    await assertFails(payerMove(db(env, OWNER), 'unpaid'))
    await setStatus('disputed')
    await assertFails(payerMove(db(env, OWNER), 'confirmed'))
  })
  it('payer cannot mark sent on the debtor’s behalf or reset to unpaid', async () => {
    await assertFails(payerMove(db(env, OWNER), 'sent'))
    await setStatus('sent')
    await assertFails(payerMove(db(env, OWNER), 'unpaid'))
  })
  it('payer cannot change money or identity fields, or the debtor’s note', async () => {
    await setStatus('sent')
    await assertFails(payerMove(db(env, OWNER), 'confirmed', OWNER, { amountMinor: 0 }))
    await assertFails(payerMove(db(env, OWNER), 'confirmed', OWNER, { debtorUid: OWNER }))
    await assertFails(payerMove(db(env, OWNER), 'confirmed', OWNER, { note: 'edited' }))
    await assertFails(payerMove(db(env, OWNER), 'confirmed', OWNER, { method: 'cash' }))
  })
  it('other members and outsiders cannot confirm', async () => {
    await setStatus('sent')
    await assertFails(payerMove(db(env, MEMBER2), 'confirmed', MEMBER2))
    await assertFails(payerMove(db(env, OUTSIDER), 'confirmed', OUTSIDER))
  })
  it('the payer’s own (auto-confirmed) share never transitions', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath(OWNER)), shareData({ debtorUid: OWNER, status: 'unpaid' }))
    })
    await assertFails(updateDoc(ref(db(env, OWNER), OWNER), { status: 'confirmed', history: arrayUnion(entry('confirmed', OWNER)) }))
    await assertFails(updateDoc(ref(db(env, OWNER), OWNER), { status: 'sent', history: arrayUnion(entry('sent', OWNER)) }))
  })
})

describe('history is append-only', () => {
  it('requires exactly one new entry', async () => {
    await assertFails(updateDoc(ref(db(env, MEMBER)), { status: 'sent', method: 'bank' }))
    await assertFails(
      updateDoc(ref(db(env, MEMBER)), { status: 'sent', history: arrayUnion(entry('sent', MEMBER, 'a'), entry('sent', MEMBER, 'b')) }),
    )
  })
  it('the new entry must be authored by the caller and match the new status', async () => {
    await assertFails(updateDoc(ref(db(env, MEMBER)), { status: 'sent', history: arrayUnion(entry('sent', OWNER)) }))
    await assertFails(updateDoc(ref(db(env, MEMBER)), { status: 'sent', history: arrayUnion(entry('confirmed', MEMBER)) }))
  })
  it('the new entry must carry a current timestamp', async () => {
    const old = Timestamp.fromMillis(Date.now() - 60 * 60 * 1000)
    await assertFails(updateDoc(ref(db(env, MEMBER)), { status: 'sent', history: arrayUnion(entry('sent', MEMBER, '', old)) }))
  })
  it('earlier entries cannot be rewritten or removed', async () => {
    const snap = await getDoc(ref(db(env, MEMBER)))
    const history = snap.get('history') as unknown[]
    await assertFails(updateDoc(ref(db(env, MEMBER)), { status: 'sent', history: [entry('unpaid', 'system', 'edited'), entry('sent', MEMBER)] }))
    await assertFails(updateDoc(ref(db(env, MEMBER)), { status: 'sent', history: [entry('sent', MEMBER)] }))
    await assertSucceeds(updateDoc(ref(db(env, MEMBER)), { status: 'sent', history: [...history, entry('sent', MEMBER)] }))
  })
})

describe('shares are written with their expense', () => {
  /** A fresh share as the app writes it (src/features/expenses/expenseApi.ts → stageShares). */
  const fresh = (expenseId: string, debtor: string, by: string, over: Record<string, unknown> = {}) => {
    const status = debtor === OWNER ? 'confirmed' : 'unpaid'
    return shareData({ expenseId, debtorUid: debtor, status, history: [entry(status, by)], updatedAt: serverTimestamp(), ...over })
  }
  const addExpense = (by: string, shares: (d: Firestore, b: ReturnType<typeof writeBatch>) => void, over: Record<string, unknown> = {}) => {
    const d = db(env, by)
    const b = writeBatch(d)
    b.set(doc(d, `trips/${TRIP}/expenses/e2`), expenseData({ createdBy: by, ...over }))
    shares(d, b)
    return b.commit()
  }

  it('a member adds a cost and everyone’s shares in one batch', async () => {
    await assertSucceeds(
      addExpense(MEMBER, (d, b) => {
        for (const u of [OWNER, MEMBER, MEMBER2]) b.set(doc(d, `trips/${TRIP}/expenses/e2/shares/${u}`), fresh('e2', u, MEMBER))
      }),
    )
  })
  it('shares must match the expense: payer, participants, currency, title and a fresh state', async () => {
    const bad: Record<string, unknown>[] = [
      { payerUid: MEMBER },
      { currency: 'USD' },
      { expenseTitle: 'Something else' },
      { status: 'confirmed', history: [entry('confirmed', MEMBER)] },
      { method: 'cash' },
      { amountMinor: 999_999 },
      { history: [entry('unpaid', OWNER)] },
    ]
    for (const over of bad) {
      await env.clearFirestore()
      await seed(env)
      await assertFails(addExpense(MEMBER, (d, b) => b.set(doc(d, `trips/${TRIP}/expenses/e2/shares/${MEMBER2}`), fresh('e2', MEMBER2, MEMBER, over))))
    }
    // Someone who isn't part of the split.
    await assertFails(
      addExpense(MEMBER, (d, b) => b.set(doc(d, `trips/${TRIP}/expenses/e2/shares/${MEMBER2}`), fresh('e2', MEMBER2, MEMBER)), { participantIds: [OWNER, MEMBER] }),
    )
    // Outsiders can't add shares at all.
    await assertFails(setDoc(doc(db(env, OUTSIDER), `trips/${TRIP}/expenses/e1/shares/${OUTSIDER}`), fresh('e1', OUTSIDER, OUTSIDER)))
  })
  it('editing a cost before anyone has paid rewrites its shares', async () => {
    const d = db(env, OWNER)
    const b = writeBatch(d)
    b.update(doc(d, `trips/${TRIP}/expenses/e1`), { amountMinor: 9000, amountBaseMinor: 9000 })
    b.set(ref(d, MEMBER), fresh('e1', MEMBER, OWNER, { amountMinor: 3000, amountBaseMinor: 3000 }))
    await assertSucceeds(b.commit())
  })
  it('once someone has paid, their share can’t be rewritten or deleted on its own', async () => {
    await setStatus('sent', { history: [entry('unpaid', 'system'), entry('sent', MEMBER)] })
    const d = db(env, OWNER)
    const b = writeBatch(d)
    b.update(doc(d, `trips/${TRIP}/expenses/e1`), { amountMinor: 9000, amountBaseMinor: 9000 })
    b.set(ref(d, MEMBER), fresh('e1', MEMBER, OWNER, { amountMinor: 3000, amountBaseMinor: 3000 }))
    await assertFails(b.commit())
    await assertFails(deleteDoc(ref(db(env, OWNER))))
  })
  it('unpaid shares can be removed; any share goes when its expense is deleted', async () => {
    await assertSucceeds(deleteDoc(ref(db(env, MEMBER), MEMBER2)))
    await setStatus('confirmed', { history: [entry('unpaid', 'system'), entry('confirmed', OWNER)] })
    const d = db(env, OWNER)
    const b = writeBatch(d)
    b.delete(ref(d, MEMBER))
    b.delete(ref(d, OWNER))
    b.delete(doc(d, `trips/${TRIP}/expenses/e1`))
    await assertSucceeds(b.commit())
  })
  it('renaming a cost updates the title copied on its shares, and nothing else', async () => {
    await setStatus('confirmed', { history: [entry('unpaid', 'system'), entry('confirmed', OWNER)] })
    const d = db(env, MEMBER)
    const b = writeBatch(d)
    b.update(doc(d, `trips/${TRIP}/expenses/e1`), { title: 'Dinner at Lost Heaven' })
    b.update(ref(d), { expenseTitle: 'Dinner at Lost Heaven', updatedAt: serverTimestamp() })
    await assertSucceeds(b.commit())
    await assertFails(updateDoc(ref(db(env, MEMBER)), { expenseTitle: 'Not the expense title' }))
  })
})

describe('reading shares', () => {
  it('members read a trip’s shares; outsiders cannot', async () => {
    await assertSucceeds(getDocs(collection(db(env, MEMBER2), `trips/${TRIP}/expenses/e1/shares`)))
    await assertFails(getDoc(ref(db(env, OUTSIDER))))
  })
  it('collection group: what I owe / what I’m owed across trips', async () => {
    await assertSucceeds(getDocs(query(collectionGroup(db(env, MEMBER), 'shares'), where('debtorUid', '==', MEMBER))))
    await assertSucceeds(getDocs(query(collectionGroup(db(env, OWNER), 'shares'), where('payerUid', '==', OWNER))))
    await assertFails(getDocs(query(collectionGroup(db(env, OUTSIDER), 'shares'), where('debtorUid', '==', MEMBER))))
    await assertFails(getDocs(collectionGroup(db(env, MEMBER), 'shares')))
  })
  it('collection group by tripId for members only', async () => {
    await assertSucceeds(getDocs(query(collectionGroup(db(env, MEMBER2), 'shares'), where('tripId', '==', TRIP))))
    await assertFails(getDocs(query(collectionGroup(db(env, OUTSIDER), 'shares'), where('tripId', '==', TRIP))))
  })
})

describe('settlement batches', () => {
  const batchDoc = (from = MEMBER, to = OWNER) => ({ tripId: TRIP, fromUid: from, toUid: to, shareRefs: [sharePath(from)], totalBaseMinor: 3333, status: 'sent', createdAt: serverTimestamp() })

  it('debtor creates a batch and moves shares to sent atomically', async () => {
    const d = db(env, MEMBER)
    const b = writeBatch(d)
    b.set(doc(d, `trips/${TRIP}/settlementBatches/b1`), batchDoc())
    b.update(ref(d), { status: 'sent', method: 'payid', reference: '', note: '', batchId: 'b1', history: arrayUnion(entry('sent', MEMBER)), updatedAt: serverTimestamp() })
    await assertSucceeds(b.commit())
  })
  it('cannot create a batch on someone else’s behalf, to yourself, or to a non-member', async () => {
    await assertFails(setDoc(doc(db(env, MEMBER2), `trips/${TRIP}/settlementBatches/b2`), batchDoc(MEMBER)))
    await assertFails(setDoc(doc(db(env, MEMBER), `trips/${TRIP}/settlementBatches/b3`), batchDoc(MEMBER, MEMBER)))
    await assertFails(setDoc(doc(db(env, MEMBER), `trips/${TRIP}/settlementBatches/b4`), batchDoc(MEMBER, OUTSIDER)))
  })
  it('receiver confirms the batch and all its shares in one write', async () => {
    await setStatus('sent', { batchId: 'b1' })
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `trips/${TRIP}/settlementBatches/b1`), { ...batchDoc(), createdAt: Timestamp.now() })
    })
    const d = db(env, OWNER)
    const b = writeBatch(d)
    b.update(ref(d), { status: 'confirmed', history: arrayUnion(entry('confirmed', OWNER)), updatedAt: serverTimestamp() })
    b.update(doc(d, `trips/${TRIP}/settlementBatches/b1`), { status: 'confirmed' })
    await assertSucceeds(b.commit())
  })
  it('only the receiver resolves a batch; sender may only re-send a disputed one', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `trips/${TRIP}/settlementBatches/b1`), { ...batchDoc(), createdAt: Timestamp.now() })
    })
    await assertFails(updateDoc(doc(db(env, MEMBER), `trips/${TRIP}/settlementBatches/b1`), { status: 'confirmed' }))
    await assertFails(updateDoc(doc(db(env, OWNER), `trips/${TRIP}/settlementBatches/b1`), { totalBaseMinor: 1 }))
    await assertSucceeds(updateDoc(doc(db(env, OWNER), `trips/${TRIP}/settlementBatches/b1`), { status: 'disputed' }))
    await assertSucceeds(updateDoc(doc(db(env, MEMBER), `trips/${TRIP}/settlementBatches/b1`), { status: 'sent' }))
  })
})

describe('expenses and items', () => {
  it('any member creates an expense; paidBy and participants must be members', async () => {
    await assertSucceeds(setDoc(doc(db(env, MEMBER), `trips/${TRIP}/expenses/e2`), expenseData({ createdBy: MEMBER })))
    await assertFails(setDoc(doc(db(env, MEMBER), `trips/${TRIP}/expenses/e3`), expenseData({ createdBy: MEMBER, paidBy: OUTSIDER })))
    await assertFails(setDoc(doc(db(env, MEMBER), `trips/${TRIP}/expenses/e4`), expenseData({ createdBy: MEMBER, participantIds: [MEMBER, OUTSIDER] })))
    await assertFails(setDoc(doc(db(env, MEMBER), `trips/${TRIP}/expenses/e5`), expenseData({ createdBy: OWNER })))
    await assertFails(setDoc(doc(db(env, MEMBER), `trips/${TRIP}/expenses/e6`), expenseData({ createdBy: MEMBER, amountMinor: 10.5 })))
    await assertFails(setDoc(doc(db(env, OUTSIDER), `trips/${TRIP}/expenses/e7`), expenseData({ createdBy: OUTSIDER })))
  })
  it('any member updates; only creator or owner deletes', async () => {
    await assertSucceeds(updateDoc(doc(db(env, MEMBER2), `trips/${TRIP}/expenses/e1`), { title: 'Dinner at Lost Heaven' }))
    await assertFails(updateDoc(doc(db(env, MEMBER2), `trips/${TRIP}/expenses/e1`), { createdBy: MEMBER2 }))
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `trips/${TRIP}/expenses/e9`), expenseData({ createdBy: MEMBER }))
    })
    await assertFails(deleteDoc(doc(db(env, MEMBER2), `trips/${TRIP}/expenses/e9`)))
    await assertSucceeds(deleteDoc(doc(db(env, MEMBER), `trips/${TRIP}/expenses/e9`)))
    await assertSucceeds(deleteDoc(doc(db(env, OWNER), `trips/${TRIP}/expenses/e1`)))
  })
  const item = (createdBy: string, over: Record<string, unknown> = {}) => ({
    type: 'food', title: 'Lunch', date: '2026-12-06', startTime: '12:30', endTime: null, checkIn: null, checkOut: null,
    location: { placeId: 'p1', name: 'Jia Jia', address: 'Shanghai', lat: 31.2, lng: 121.4 },
    notes: '', bookingUrl: '', bookingRef: '', order: 1000, linkedExpenseId: null, createdBy, ...over,
  })
  it('items: members create/update, field types are validated', async () => {
    await assertSucceeds(setDoc(doc(db(env, MEMBER), `trips/${TRIP}/items/i1`), item(MEMBER)))
    await assertFails(setDoc(doc(db(env, MEMBER), `trips/${TRIP}/items/i2`), item(MEMBER, { type: 'party' })))
    await assertFails(setDoc(doc(db(env, MEMBER), `trips/${TRIP}/items/i3`), item(MEMBER, { startTime: '25:00' })))
    await assertFails(setDoc(doc(db(env, MEMBER), `trips/${TRIP}/items/i4`), item(MEMBER, { date: '6 Dec' })))
    await assertFails(setDoc(doc(db(env, MEMBER), `trips/${TRIP}/items/i5`), item(MEMBER, { location: { name: 'x', lat: 200, lng: 0, placeId: null, address: '' } })))
    await assertFails(setDoc(doc(db(env, OUTSIDER), `trips/${TRIP}/items/i6`), item(OUTSIDER)))
    await assertSucceeds(updateDoc(doc(db(env, MEMBER2), `trips/${TRIP}/items/i1`), { order: 500 }))
  })
  it('ideas: members add and vote only for themselves; creator or owner deletes', async () => {
    const idea = (createdBy: string, votes: string[]) => ({ title: 'Hot pot', type: 'food', location: null, note: '', votes, createdBy })
    await assertSucceeds(setDoc(doc(db(env, MEMBER), `trips/${TRIP}/ideas/a`), idea(MEMBER, [MEMBER])))
    await assertFails(setDoc(doc(db(env, MEMBER), `trips/${TRIP}/ideas/b`), idea(MEMBER, [MEMBER, MEMBER2])))
    await assertFails(setDoc(doc(db(env, OUTSIDER), `trips/${TRIP}/ideas/c`), idea(OUTSIDER, [])))
    await assertSucceeds(updateDoc(doc(db(env, MEMBER2), `trips/${TRIP}/ideas/a`), { votes: [MEMBER, MEMBER2] }))
    await assertFails(updateDoc(doc(db(env, MEMBER2), `trips/${TRIP}/ideas/a`), { votes: [MEMBER2] }))
    await assertFails(updateDoc(doc(db(env, MEMBER2), `trips/${TRIP}/ideas/a`), { title: 'Mine now' }))
    await assertFails(deleteDoc(doc(db(env, MEMBER2), `trips/${TRIP}/ideas/a`)))
    await assertSucceeds(deleteDoc(doc(db(env, OWNER), `trips/${TRIP}/ideas/a`)))
  })
  it('trip share token: owner sets a long random token or turns it off', async () => {
    await assertSucceeds(updateDoc(doc(db(env, OWNER), `trips/${TRIP}`), { shareToken: 'Abc23'.repeat(6) }))
    await assertFails(updateDoc(doc(db(env, OWNER), `trips/${TRIP}`), { shareToken: 'short' }))
    await assertFails(updateDoc(doc(db(env, MEMBER), `trips/${TRIP}`), { shareToken: 'Xyz23'.repeat(6) }))
    await assertSucceeds(updateDoc(doc(db(env, OWNER), `trips/${TRIP}`), { shareToken: null }))
  })
  it('items: a location may carry its local-language name and address', async () => {
    const loc = { placeId: 'p1', name: 'The Bund', address: 'Shanghai, China', lat: 31.24, lng: 121.49 }
    await assertSucceeds(setDoc(doc(db(env, MEMBER), `trips/${TRIP}/items/i7`), item(MEMBER, { location: { ...loc, localName: '外滩', localAddress: '中国上海市中山东一路' } })))
    await assertFails(setDoc(doc(db(env, MEMBER), `trips/${TRIP}/items/i8`), item(MEMBER, { location: { ...loc, localName: 42 } })))
    await assertFails(setDoc(doc(db(env, MEMBER), `trips/${TRIP}/items/i9`), item(MEMBER, { location: { ...loc, nickname: 'x' } })))
  })
  it('items: only creator or owner deletes', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `trips/${TRIP}/items/i1`), item(MEMBER))
    })
    await assertFails(deleteDoc(doc(db(env, MEMBER2), `trips/${TRIP}/items/i1`)))
    await assertSucceeds(deleteDoc(doc(db(env, OWNER), `trips/${TRIP}/items/i1`)))
  })
})

describe('feedback', () => {
  it('signed-in users can submit feedback but not read it', async () => {
    const fb = { uid: MEMBER, message: 'Love it', appVersion: '0.1.0', userAgent: 'test', url: '/', createdAt: serverTimestamp() }
    await assertSucceeds(setDoc(doc(db(env, MEMBER), 'feedback/f1'), fb))
    await assertFails(setDoc(doc(db(env, MEMBER), 'feedback/f2'), { ...fb, uid: OWNER }))
    await assertFails(getDoc(doc(db(env, MEMBER), 'feedback/f1')))
    await assertFails(setDoc(doc(db(env, null), 'feedback/f3'), fb))
  })
})
