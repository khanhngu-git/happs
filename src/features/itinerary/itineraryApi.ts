import { collection, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { refs, useLiveQuery, type Expense, type Item, type Trip } from '@/lib/firestore'
import { reorder } from '@/shared/itinerary'
import type { ItemType } from '@/shared/itinerary'
import type { Location } from '@/shared/schemas'
import { baseAmount, costToExpense, moneyChanged, sharesLocked, SharesLockedError, type ItemCost } from '@/features/expenses/expenseApi'

export function useItems(tripId: string) {
  return useLiveQuery<Item>(refs.items(tripId), `items:${tripId}`)
}

export interface ItemValues {
  type: ItemType
  title: string
  date: string
  startTime: string | null
  endTime: string | null
  checkIn: { date: string; time: string | null } | null
  checkOut: { date: string; time: string | null } | null
  location: Location | null
  notes: string
  bookingUrl: string
  bookingRef: string
}

/**
 * Save an item and keep its linked expense in step, in one atomic batch:
 * - cost added → create a linked expense
 * - cost edited → update it, unless money has already moved (SharesLockedError)
 * - cost removed → delete it, with the same guard
 */
export async function saveItem(opts: { trip: Trip; uid: string; existing: Item | null; values: ItemValues; cost: ItemCost | null; nextOrder: number }) {
  const { trip, uid, existing, values, cost } = opts
  const itemRef = existing ? doc(db, 'trips', trip.id, 'items', existing.id) : doc(collection(db, 'trips', trip.id, 'items'))
  const batch = writeBatch(db)
  let linkedExpenseId = existing?.linkedExpenseId ?? null

  let linked: Expense | null = null
  if (linkedExpenseId) {
    const snap = await getDoc(refs.expense(trip.id, linkedExpenseId))
    linked = snap.exists() ? snap.data() : null
    if (!linked) linkedExpenseId = null
  }

  if (cost) {
    const exp = costToExpense(cost, values, itemRef.id)
    const expDoc = { ...exp, fxRateToBase: exp.currency === trip.baseCurrency ? 1 : exp.fxRateToBase, amountBaseMinor: baseAmount(trip, exp), splitValues: exp.splitMethod === 'equal' ? null : exp.splitValues, updatedAt: serverTimestamp() }
    if (linked) {
      if (moneyChanged(linked, exp) && (await sharesLocked(trip.id, linked.id))) throw new SharesLockedError()
      batch.update(doc(db, 'trips', trip.id, 'expenses', linked.id), expDoc)
    } else {
      const expRef = doc(collection(db, 'trips', trip.id, 'expenses'))
      batch.set(expRef, { ...expDoc, createdBy: uid, createdAt: serverTimestamp() })
      linkedExpenseId = expRef.id
    }
  } else if (linked) {
    if (await sharesLocked(trip.id, linked.id)) throw new SharesLockedError()
    batch.delete(doc(db, 'trips', trip.id, 'expenses', linked.id))
    linkedExpenseId = null
  }

  const data = { ...values, linkedExpenseId, updatedAt: serverTimestamp() }
  if (existing) batch.update(itemRef, data)
  else batch.set(itemRef, { ...data, order: opts.nextOrder, createdBy: uid, createdAt: serverTimestamp() })
  await batch.commit()
  return itemRef.id
}

export async function deleteItem(trip: Trip, item: Item) {
  const batch = writeBatch(db)
  if (item.linkedExpenseId) {
    if (await sharesLocked(trip.id, item.linkedExpenseId)) throw new SharesLockedError()
    batch.delete(doc(db, 'trips', trip.id, 'expenses', item.linkedExpenseId))
  }
  batch.delete(doc(db, 'trips', trip.id, 'items', item.id))
  await batch.commit()
}

/** Persist a drag-reorder of untimed ("Anytime") items. */
export async function reorderItems(tripId: string, list: Item[], from: number, to: number) {
  const batch = writeBatch(db)
  for (const { id, order } of reorder(list, from, to)) batch.update(doc(db, 'trips', tripId, 'items', id), { order })
  await batch.commit()
}
