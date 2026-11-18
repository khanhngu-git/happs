/**
 * Expense writes. Shares are generated server-side by onExpenseWrite; the
 * client only writes the expense. amountBaseMinor is computed here for
 * immediate display and re-checked authoritatively by the function.
 */
import { collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where, writeBatch, collectionGroup } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { converters, refs, useLiveQuery, type Expense, type Share, type Trip } from '@/lib/firestore'
import { convertMinor } from '@/shared/money'
import type { SplitMethod } from '@/shared/split'
import type { ItemType } from '@/shared/itinerary'

export interface ExpenseInput {
  title: string
  amountMinor: number
  currency: string
  fxRateToBase: number
  paidBy: string
  splitMethod: SplitMethod
  participantIds: string[]
  splitValues: Record<string, number> | null
  category: string
  date: string
  linkedItemId: string | null
}

export class SharesLockedError extends Error {
  constructor() {
    super('Some people have already paid their share of this cost. Edit the expense directly from the Expenses tab.')
    this.name = 'SharesLockedError'
  }
}

export function baseAmount(trip: Trip, input: Pick<ExpenseInput, 'amountMinor' | 'currency' | 'fxRateToBase'>): number {
  return input.currency === trip.baseCurrency ? input.amountMinor : convertMinor(input.amountMinor, input.currency, trip.baseCurrency, input.fxRateToBase)
}

function expenseDoc(trip: Trip, input: ExpenseInput) {
  return {
    ...input,
    fxRateToBase: input.currency === trip.baseCurrency ? 1 : input.fxRateToBase,
    amountBaseMinor: baseAmount(trip, input),
    splitValues: input.splitMethod === 'equal' ? null : input.splitValues,
    updatedAt: serverTimestamp(),
  }
}

export async function createExpense(trip: Trip, uid: string, input: ExpenseInput): Promise<string> {
  const ref = doc(collection(db, 'trips', trip.id, 'expenses'))
  const batch = writeBatch(db)
  batch.set(ref, { ...expenseDoc(trip, input), createdBy: uid, createdAt: serverTimestamp() })
  await batch.commit()
  return ref.id
}

/** True once any non-payer share has moved past `unpaid` (money has changed hands). */
export async function sharesLocked(tripId: string, expenseId: string): Promise<boolean> {
  const snap = await getDocs(refs.shares(tripId, expenseId))
  return snap.docs.some((d) => {
    const s = d.data()
    return s.debtorUid !== s.payerUid && s.status !== 'unpaid'
  })
}

/** Fields that change who owes what. Editing them is blocked once shares are locked. */
export function moneyChanged(before: Expense, after: ExpenseInput): boolean {
  return (
    before.amountMinor !== after.amountMinor ||
    before.currency !== after.currency ||
    before.fxRateToBase !== after.fxRateToBase ||
    before.paidBy !== after.paidBy ||
    before.splitMethod !== after.splitMethod ||
    [...before.participantIds].sort().join() !== [...after.participantIds].sort().join() ||
    JSON.stringify(before.splitValues ?? null) !== JSON.stringify(after.splitMethod === 'equal' ? null : after.splitValues)
  )
}

export async function updateExpense(trip: Trip, before: Expense, input: ExpenseInput): Promise<void> {
  if (moneyChanged(before, input) && (await sharesLocked(trip.id, before.id))) throw new SharesLockedError()
  await updateDoc(doc(db, 'trips', trip.id, 'expenses', before.id), expenseDoc(trip, input))
}

export async function deleteExpense(trip: Trip, expense: Expense): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'trips', trip.id, 'expenses', expense.id))
  if (expense.linkedItemId) batch.update(doc(db, 'trips', trip.id, 'items', expense.linkedItemId), { linkedExpenseId: null, updatedAt: serverTimestamp() })
  await batch.commit()
}


/* ---------- Item cost ⇄ linked expense ---------- */

export interface ItemCost {
  amountMinor: number
  currency: string
  fxRateToBase: number
  paidBy: string
  splitMethod: SplitMethod
  participantIds: string[]
  splitValues: Record<string, number> | null
}

export function costToExpense(cost: ItemCost, item: { title: string; type: ItemType; date: string }, itemId: string): ExpenseInput {
  return { ...cost, title: item.title, category: item.type, date: item.date, linkedItemId: itemId }
}

/* ---------- Hooks ---------- */

export function useExpenses(tripId: string) {
  return useLiveQuery<Expense>(query(refs.expenses(tripId), orderBy('date', 'desc')), `expenses:${tripId}`)
}

/** Every share in the trip via a collection-group query scoped by tripId. */
export function useTripShares(tripId: string) {
  const q = query(collectionGroup(db, 'shares').withConverter(converters.share), where('tripId', '==', tripId))
  return useLiveQuery<Share>(q, `shares:${tripId}`)
}
