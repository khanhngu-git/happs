import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, Timestamp, type Firestore } from 'firebase/firestore'

export const TRIP = 'trip1'
export const OWNER = 'alice'
export const MEMBER = 'bob'
export const MEMBER2 = 'carol'
export const OUTSIDER = 'mallory'

export async function makeEnv(projectId: string): Promise<RulesTestEnvironment> {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
  return initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
  })
}

export const db = (env: RulesTestEnvironment, uid: string | null) =>
  (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore() as unknown as Firestore

export const tripData = (over: Record<string, unknown> = {}) => ({
  name: 'Shanghai',
  destination: 'Shanghai, China',
  startDate: '2026-12-05',
  endDate: '2026-12-12',
  timeZone: 'Asia/Shanghai',
  baseCurrency: 'AUD',
  ownerId: OWNER,
  memberIds: [OWNER, MEMBER, MEMBER2],
  coverEmoji: null,
  coverColor: null,
  ...over,
})

export const shareData = (over: Record<string, unknown> = {}) => ({
  tripId: TRIP,
  expenseId: 'e1',
  expenseTitle: 'Dinner',
  currency: 'AUD',
  debtorUid: MEMBER,
  payerUid: OWNER,
  amountMinor: 3333,
  amountBaseMinor: 3333,
  status: 'unpaid',
  method: null,
  reference: '',
  note: '',
  batchId: null,
  history: [{ status: 'unpaid', byUid: 'system', at: Timestamp.now(), note: '' }],
  ...over,
})

export const expenseData = (over: Record<string, unknown> = {}) => ({
  title: 'Dinner',
  amountMinor: 10000,
  currency: 'AUD',
  fxRateToBase: 1,
  amountBaseMinor: 10000,
  paidBy: OWNER,
  splitMethod: 'equal',
  participantIds: [OWNER, MEMBER, MEMBER2],
  splitValues: null,
  category: 'food',
  date: '2026-12-06',
  linkedItemId: null,
  createdBy: OWNER,
  ...over,
})

/** Seed a trip with three members, one expense and its shares, bypassing rules. */
export async function seed(env: RulesTestEnvironment, extra?: (db: Firestore) => Promise<void>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore() as unknown as Firestore
    await setDoc(doc(d, 'trips', TRIP), tripData())
    for (const [uid, role] of [[OWNER, 'owner'], [MEMBER, 'member'], [MEMBER2, 'member']] as const) {
      await setDoc(doc(d, 'trips', TRIP, 'members', uid), { role, displayName: uid, photoURL: null })
    }
    await setDoc(doc(d, 'trips', TRIP, 'expenses', 'e1'), expenseData())
    await setDoc(doc(d, 'trips', TRIP, 'expenses', 'e1', 'shares', OWNER), shareData({ debtorUid: OWNER, status: 'confirmed', amountMinor: 3334, amountBaseMinor: 3334 }))
    await setDoc(doc(d, 'trips', TRIP, 'expenses', 'e1', 'shares', MEMBER), shareData())
    await setDoc(doc(d, 'trips', TRIP, 'expenses', 'e1', 'shares', MEMBER2), shareData({ debtorUid: MEMBER2 }))
    await extra?.(d)
  })
}
