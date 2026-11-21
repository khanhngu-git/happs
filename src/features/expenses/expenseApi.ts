/**
 * Expense writes. Each cost and its shares (who owes what) are written in one
 * atomic batch by the app; security rules check the shares match the cost.
 * Shares are only regenerated while nobody has paid yet; once money has
 * moved, editing who owes what is blocked (SharesLockedError).
 */
import { collection, doc, getDocs, orderBy, query, serverTimestamp, Timestamp, where, writeBatch, collectionGroup, type DocumentReference, type WriteBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { converters, refs, useLiveQuery, type Expense, type Share, type Trip } from '@/lib/firestore'
import { convertMinor, formatMoney } from '@/shared/money'
import { computeShareAmounts, type SplitMethod } from '@/shared/split'
import type { ItemType } from '@/shared/itinerary'
import { memberNames, notify } from '@/features/notifications/notify'

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

/** The stored expense fields (without createdBy/createdAt). */
export function expenseFields(trip: Trip, input: ExpenseInput) {
  return {
    ...input,
    fxRateToBase: input.currency === trip.baseCurrency ? 1 : input.fxRateToBase,
    amountBaseMinor: baseAmount(trip, input),
    splitValues: input.splitMethod === 'equal' ? null : input.splitValues,
    updatedAt: serverTimestamp(),
  }
}

const isLocked = (s: Pick<Share, 'debtorUid' | 'payerUid' | 'status'>) => s.debtorUid !== s.payerUid && s.status !== 'unpaid'

/** True once any non-payer share has moved past `unpaid` (money has changed hands). */
export async function sharesLocked(tripId: string, expenseId: string): Promise<boolean> {
  const snap = await getDocs(refs.shares(tripId, expenseId))
  return snap.docs.some((d) => isLocked(d.data()))
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

/**
 * Add the share writes for a created or edited expense to `batch`.
 * Returns the new shares (uid → base amount) when they were (re)generated.
 */
export async function stageShares(
  batch: WriteBatch,
  trip: Trip,
  expenseRef: DocumentReference,
  exp: ReturnType<typeof expenseFields>,
  uid: string,
  isNew: boolean,
): Promise<Record<string, number> | null> {
  const sharesCol = collection(db, expenseRef.path, 'shares')
  const existing = isNew ? [] : (await getDocs(sharesCol.withConverter(converters.share))).docs.map((d) => d.data())
  const amounts = computeShareAmounts(exp)
  const byId = new Map(existing.map((s) => [s.id, s]))
  const same =
    existing.length === Object.keys(amounts).length &&
    Object.entries(amounts).every(([id, a]) => {
      const s = byId.get(id)
      return s && s.payerUid === exp.paidBy && s.amountMinor === a.amountMinor && s.amountBaseMinor === a.amountBaseMinor && s.currency === exp.currency
    })
  if (same) {
    // Only details like the title changed: keep the copy on each share in step.
    for (const s of existing) if (s.expenseTitle !== exp.title) batch.update(doc(db, s.path), { expenseTitle: exp.title, updatedAt: serverTimestamp() })
    return null
  }
  if (existing.some(isLocked)) throw new SharesLockedError()

  const now = Timestamp.now()
  for (const s of existing) if (!(s.id in amounts)) batch.delete(doc(db, s.path))
  const out: Record<string, number> = {}
  for (const [debtor, a] of Object.entries(amounts)) {
    const isPayer = debtor === exp.paidBy
    const status = isPayer ? 'confirmed' : 'unpaid'
    batch.set(doc(sharesCol, debtor), {
      tripId: trip.id,
      expenseId: expenseRef.id,
      expenseTitle: exp.title,
      currency: exp.currency,
      debtorUid: debtor,
      payerUid: exp.paidBy,
      amountMinor: a.amountMinor,
      amountBaseMinor: a.amountBaseMinor,
      // The payer doesn't owe themselves.
      status,
      method: null,
      reference: '',
      note: '',
      batchId: null,
      history: [{ status, byUid: uid, at: now, note: isPayer ? 'Paid the bill' : '' }],
      updatedAt: serverTimestamp(),
    })
    out[debtor] = a.amountBaseMinor
  }
  return out
}

/** Add deleting an expense and all of its shares to `batch`. */
export async function stageExpenseDelete(batch: WriteBatch, tripId: string, expenseId: string) {
  const shares = await getDocs(collection(db, 'trips', tripId, 'expenses', expenseId, 'shares'))
  shares.docs.forEach((d) => batch.delete(d.ref))
  batch.delete(doc(db, 'trips', tripId, 'expenses', expenseId))
}

/** Tell everyone who now owes something about a brand-new cost (not whoever added it). */
export async function notifyNewExpense(trip: Trip, uid: string, expenseId: string, exp: { title: string; paidBy: string }, owed: Record<string, number>) {
  const name = await memberNames(trip.id)
  const payer = name(exp.paidBy)
  await Promise.all(
    Object.entries(owed)
      .filter(([debtor]) => debtor !== exp.paidBy && debtor !== uid)
      .map(([debtor, amount]) =>
        notify(uid, [debtor], {
          type: 'expenseAdded',
          tripId: trip.id,
          refPath: `trips/${trip.id}/expenses/${expenseId}/shares/${debtor}`,
          title: `${name(uid)} added ${exp.title}`,
          body: `You owe ${payer} ${formatMoney(amount, trip.baseCurrency)} · ${trip.name}`,
          url: `/trips/${trip.id}/expenses?expense=${expenseId}`,
        }),
      ),
  )
}

export async function createExpense(trip: Trip, uid: string, input: ExpenseInput): Promise<string> {
  const ref = doc(collection(db, 'trips', trip.id, 'expenses'))
  const batch = writeBatch(db)
  const exp = expenseFields(trip, input)
  batch.set(ref, { ...exp, createdBy: uid, createdAt: serverTimestamp() })
  const owed = await stageShares(batch, trip, ref, exp, uid, true)
  await batch.commit()
  if (owed) void notifyNewExpense(trip, uid, ref.id, exp, owed)
  return ref.id
}

export async function updateExpense(trip: Trip, before: Expense, input: ExpenseInput, uid: string): Promise<void> {
  const ref = doc(db, 'trips', trip.id, 'expenses', before.id)
  const batch = writeBatch(db)
  const exp = expenseFields(trip, input)
  batch.update(ref, exp)
  await stageShares(batch, trip, ref, exp, uid, false)
  await batch.commit()
}

export async function deleteExpense(trip: Trip, expense: Expense): Promise<void> {
  const batch = writeBatch(db)
  await stageExpenseDelete(batch, trip.id, expense.id)
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
