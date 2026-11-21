import { collection, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { refs, useLiveQuery, type Expense, type Item, type Trip } from '@/lib/firestore'
import { reorder } from '@/shared/itinerary'
import { deleteAttachment } from '@/lib/uploads'
import { refreshSharedTrip } from '@/features/share/shareApi'
import { memberNames, notify } from '@/features/notifications/notify'
import { formatShortDate } from '@/shared/dates'
import type { ItemType } from '@/shared/itinerary'
import type { Attachment, Location } from '@/shared/schemas'
import { costToExpense, expenseFields, notifyNewExpense, sharesLocked, SharesLockedError, stageExpenseDelete, stageShares, type ItemCost } from '@/features/expenses/expenseApi'

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
  photoURL: string | null
  attachments?: Attachment[]
}

/**
 * Save an item and keep its linked expense in step, in one atomic batch:
 * - cost added → create a linked expense
 * - cost edited → update it, unless money has already moved (SharesLockedError)
 * - cost removed → delete it, with the same guard
 */
export async function saveItem(opts: { trip: Trip; uid: string; existing: Item | null; values: ItemValues; cost: ItemCost | null; nextOrder: number; id?: string }) {
  const { trip, uid, existing, values, cost } = opts
  const itemRef = existing ? doc(db, 'trips', trip.id, 'items', existing.id) : opts.id ? doc(db, 'trips', trip.id, 'items', opts.id) : doc(collection(db, 'trips', trip.id, 'items'))
  const batch = writeBatch(db)
  let linkedExpenseId = existing?.linkedExpenseId ?? null

  let linked: Expense | null = null
  if (linkedExpenseId) {
    const snap = await getDoc(refs.expense(trip.id, linkedExpenseId))
    linked = snap.exists() ? snap.data() : null
    if (!linked) linkedExpenseId = null
  }

  let owed: { expenseId: string; exp: ReturnType<typeof expenseFields>; amounts: Record<string, number> } | null = null
  if (cost) {
    const exp = expenseFields(trip, costToExpense(cost, values, itemRef.id))
    if (linked) {
      const expRef = doc(db, 'trips', trip.id, 'expenses', linked.id)
      batch.update(expRef, exp)
      await stageShares(batch, trip, expRef, exp, uid, false)
    } else {
      const expRef = doc(collection(db, 'trips', trip.id, 'expenses'))
      batch.set(expRef, { ...exp, createdBy: uid, createdAt: serverTimestamp() })
      const amounts = await stageShares(batch, trip, expRef, exp, uid, true)
      if (amounts) owed = { expenseId: expRef.id, exp, amounts }
      linkedExpenseId = expRef.id
    }
  } else if (linked) {
    if (await sharesLocked(trip.id, linked.id)) throw new SharesLockedError()
    await stageExpenseDelete(batch, trip.id, linked.id)
    linkedExpenseId = null
  }

  const data = { ...values, linkedExpenseId, updatedAt: serverTimestamp() }
  if (existing) batch.update(itemRef, data)
  else batch.set(itemRef, { ...data, order: opts.nextOrder, createdBy: uid, createdAt: serverTimestamp() })
  await batch.commit()
  if (owed) void notifyNewExpense(trip, uid, owed.expenseId, owed.exp, owed.amounts)
  if (!existing || MEANINGFUL.some((k) => JSON.stringify(existing[k] ?? null) !== JSON.stringify(values[k] ?? null))) {
    void notifyItemChanged(trip, uid, itemRef.id, values, !!existing)
  }
  void refreshSharedTrip(trip.id)
  return itemRef.id
}

/** Fields whose change is worth telling others about (not reordering, notes etc). */
const MEANINGFUL = ['title', 'date', 'startTime', 'endTime', 'location', 'checkIn', 'checkOut', 'type'] as const

/** "Alex added Yu Garden" for the other members (off by default in their settings). */
async function notifyItemChanged(trip: Trip, uid: string, itemId: string, v: ItemValues, edited: boolean) {
  const name = await memberNames(trip.id)
  await notify(uid, trip.memberIds, {
    type: 'itemChanged',
    tripId: trip.id,
    refPath: `trips/${trip.id}/items/${itemId}`,
    title: `${name(uid)} ${edited ? 'updated' : 'added'} ${v.title}`,
    body: `${trip.name} · ${formatShortDate(v.date)}`,
    url: `/trips/${trip.id}/itinerary?day=${v.date}&item=${itemId}`,
  })
}

export async function deleteItem(trip: Trip, item: Item) {
  const batch = writeBatch(db)
  if (item.linkedExpenseId) {
    if (await sharesLocked(trip.id, item.linkedExpenseId)) throw new SharesLockedError()
    await stageExpenseDelete(batch, trip.id, item.linkedExpenseId)
  }
  batch.delete(doc(db, 'trips', trip.id, 'items', item.id))
  await batch.commit()
  void refreshSharedTrip(trip.id)
  await Promise.all((item.attachments ?? []).map((a) => deleteAttachment(trip.id, a)))
}

/** A fresh item id, so a photo can be uploaded before the item is first saved. */
export function newItemId(tripId: string): string {
  return doc(collection(db, 'trips', tripId, 'items')).id
}

/** Persist a drag-reorder of untimed ("Anytime") items. */
export async function reorderItems(tripId: string, list: Item[], from: number, to: number) {
  const batch = writeBatch(db)
  for (const { id, order } of reorder(list, from, to)) batch.update(doc(db, 'trips', tripId, 'items', id), { order })
  await batch.commit()
  void refreshSharedTrip(tripId)
}
