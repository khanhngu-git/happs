/**
 * Client side of the payment-confirmation state machine. Every write appends
 * exactly one history entry authored by the caller, which is what the
 * security rules require (see firestore.rules → shares).
 */
import { arrayUnion, collection, doc, serverTimestamp, Timestamp, updateDoc, writeBatch, type WriteBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { SettlementBatch, Share } from '@/lib/firestore'
import { nextStatus, type PaymentMethod, type ShareAction } from '@/shared/shareState'

export interface PaymentDetails {
  method: PaymentMethod | null
  reference: string
  note: string
}

function entry(status: string, uid: string, note = '') {
  return { status, byUid: uid, at: Timestamp.now(), note }
}

function assertAllowed(share: Share, uid: string, action: ShareAction) {
  const to = nextStatus(share, uid, action)
  if (!to) throw new Error(`You can’t ${action} this payment`)
  return to
}

function shareRef(share: Share) {
  return doc(db, share.path)
}

function applySent(b: WriteBatch | null, share: Share, uid: string, d: PaymentDetails, batchId: string | null) {
  const to = assertAllowed(share, uid, 'markSent')
  const data = {
    status: to,
    method: d.method,
    reference: d.reference,
    note: d.note,
    batchId,
    history: arrayUnion(entry(to, uid, d.note)),
    updatedAt: serverTimestamp(),
  }
  return b ? b.update(shareRef(share), data) : updateDoc(shareRef(share), data)
}

/** Debtor: "I've paid". */
export async function markSent(share: Share, uid: string, d: PaymentDetails) {
  await applySent(null, share, uid, d, null)
}

/** Payer: "Confirm received". */
export async function confirmShare(share: Share, uid: string) {
  const to = assertAllowed(share, uid, 'confirm')
  await updateDoc(shareRef(share), { status: to, history: arrayUnion(entry(to, uid)), updatedAt: serverTimestamp() })
}

/** Payer: "Not received", with a reason. */
export async function disputeShare(share: Share, uid: string, reason: string) {
  const to = assertAllowed(share, uid, 'dispute')
  await updateDoc(shareRef(share), { status: to, history: arrayUnion(entry(to, uid, reason)), updatedAt: serverTimestamp() })
}

/** Payer: "Mark as received" for cash handed over in person. */
export async function markReceived(share: Share, uid: string, method: PaymentMethod = 'cash') {
  const to = assertAllowed(share, uid, 'markReceived')
  await updateDoc(shareRef(share), { status: to, method, history: arrayUnion(entry(to, uid, 'Marked as received')), updatedAt: serverTimestamp() })
}

/**
 * "Settle all with Alex": every outstanding share I owe Alex moves to `sent`
 * under one settlement batch, so Alex can confirm them with one tap.
 */
export async function settleAll(tripId: string, uid: string, toUid: string, shares: Share[], d: PaymentDetails): Promise<string | null> {
  const eligible = shares.filter((s) => s.debtorUid === uid && s.payerUid === toUid && nextStatus(s, uid, 'markSent'))
  if (eligible.length === 0) return null
  const batchRef = doc(collection(db, 'trips', tripId, 'settlementBatches'))
  // Firestore batches cap at 500 writes; one is the batch doc itself.
  for (let i = 0; i < eligible.length; i += 499) {
    const chunk = eligible.slice(i, i + 499)
    const b = writeBatch(db)
    if (i === 0) {
      b.set(batchRef, {
        tripId,
        fromUid: uid,
        toUid,
        shareRefs: eligible.map((s) => s.path),
        totalBaseMinor: eligible.reduce((sum, s) => sum + s.amountBaseMinor, 0),
        status: 'sent',
        createdAt: serverTimestamp(),
      })
    }
    for (const s of chunk) applySent(b, s, uid, d, batchRef.id)
    await b.commit()
  }
  return batchRef.id
}

/** Payer resolves a whole settlement batch in one go. */
export async function resolveBatch(batch: SettlementBatch, shares: Share[], uid: string, outcome: 'confirmed' | 'disputed', reason = '') {
  const members = shares.filter((s) => s.batchId === batch.id && s.status === 'sent' && s.payerUid === uid)
  const b = writeBatch(db)
  for (const s of members) {
    const to = assertAllowed(s, uid, outcome === 'confirmed' ? 'confirm' : 'dispute')
    b.update(shareRef(s), { status: to, history: arrayUnion(entry(to, uid, reason)), updatedAt: serverTimestamp() })
  }
  b.update(doc(db, batch.path), { status: outcome })
  await b.commit()
}
