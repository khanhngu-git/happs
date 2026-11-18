#!/usr/bin/env node
/**
 * Dev helper: act as another (emulator) user through the real client SDK, so
 * security rules apply exactly as in the app. Handy for demoing the payment
 * flow from one browser.
 *
 *   node scripts/dev/act-as.mjs <email> <password> markSent <tripId> [payerUid]
 *   node scripts/dev/act-as.mjs <email> <password> settleAll <tripId> <payerUid>
 *   node scripts/dev/act-as.mjs <email> <password> list <tripId>
 */
import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  arrayUnion,
  collection,
  collectionGroup,
  connectFirestoreEmulator,
  doc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore'

const [email, password, action, tripId, payerUid] = process.argv.slice(2)
if (!email || !password || !action || !tripId) {
  console.error('usage: act-as.mjs <email> <password> <markSent|settleAll|list> <tripId> [payerUid]')
  process.exit(1)
}

const app = initializeApp({ apiKey: 'demo-api-key', projectId: 'demo-happs', authDomain: 'localhost' })
const auth = getAuth(app)
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
const db = getFirestore(app)
connectFirestoreEmulator(db, '127.0.0.1', 8080)

const { user } = await signInWithEmailAndPassword(auth, email, password)
const snap = await getDocs(query(collectionGroup(db, 'shares'), where('tripId', '==', tripId), where('debtorUid', '==', user.uid)))
const mine = snap.docs.filter((d) => {
  const s = d.data()
  return s.payerUid !== s.debtorUid && ['unpaid', 'disputed'].includes(s.status) && (!payerUid || s.payerUid === payerUid)
})

if (action === 'list') {
  for (const d of snap.docs) console.log(d.ref.path, d.get('status'), d.get('amountMinor'), d.get('currency'))
  process.exit(0)
}

const entry = { status: 'sent', byUid: user.uid, at: Timestamp.now(), note: 'Sent from the dev script' }
const b = writeBatch(db)
let batchId = null
if (action === 'settleAll') {
  if (!payerUid) throw new Error('settleAll needs payerUid')
  const ref = doc(collection(db, 'trips', tripId, 'settlementBatches'))
  batchId = ref.id
  b.set(ref, {
    tripId,
    fromUid: user.uid,
    toUid: payerUid,
    shareRefs: mine.map((d) => d.ref.path),
    totalBaseMinor: mine.reduce((s, d) => s + d.get('amountBaseMinor'), 0),
    status: 'sent',
    createdAt: serverTimestamp(),
  })
}
for (const d of mine) {
  b.update(d.ref, { status: 'sent', method: 'bank', reference: 'DEV-123', note: entry.note, batchId, history: arrayUnion(entry), updatedAt: serverTimestamp() })
}
await b.commit()
console.log(`${user.email}: moved ${mine.length} share(s) to sent${batchId ? ` in batch ${batchId}` : ''}`)
process.exit(0)
