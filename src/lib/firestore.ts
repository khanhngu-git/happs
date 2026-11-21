/**
 * Typed Firestore access: zod-backed converters plus tiny realtime hooks
 * around onSnapshot so every member sees changes live.
 */
import { useEffect, useState } from 'react'
import {
  collection,
  doc,
  onSnapshot,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type FirestoreDataConverter,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import type { z } from 'zod'
import { db } from './firebase'
import {
  expenseSchema,
  inviteSchema,
  itemSchema,
  memberSchema,
  notificationSchema,
  ideaSchema,
  settlementBatchSchema,
  shareSchema,
  tripSchema,
  userSchema,
} from '@/shared/schemas'

export type WithId<T> = T & { id: string; path: string }

function converter<S extends z.ZodType>(schema: S): FirestoreDataConverter<WithId<z.output<S>>> {
  return {
    toFirestore(value) {
      const { id: _id, path: _path, ...rest } = value as WithId<Record<string, unknown>>
      return rest as DocumentData
    },
    fromFirestore(snap: QueryDocumentSnapshot) {
      const raw = snap.data({ serverTimestamps: 'estimate' })
      const parsed = schema.safeParse(raw)
      if (!parsed.success) {
        // Don't crash the UI on a malformed doc; surface it in the console.
        console.warn(`Invalid document at ${snap.ref.path}`, parsed.error.issues)
        return { ...(raw as object), id: snap.id, path: snap.ref.path } as WithId<z.output<S>>
      }
      return { ...(parsed.data as object), id: snap.id, path: snap.ref.path } as WithId<z.output<S>>
    },
  }
}

export const converters = {
  user: converter(userSchema),
  trip: converter(tripSchema),
  member: converter(memberSchema),
  invite: converter(inviteSchema),
  item: converter(itemSchema),
  expense: converter(expenseSchema),
  share: converter(shareSchema),
  batch: converter(settlementBatchSchema),
  notification: converter(notificationSchema),
  idea: converter(ideaSchema),
}

export type UserProfile = WithId<z.output<typeof userSchema>>
export type Trip = WithId<z.output<typeof tripSchema>>
export type Member = WithId<z.output<typeof memberSchema>>
export type Invite = WithId<z.output<typeof inviteSchema>>
export type Item = WithId<z.output<typeof itemSchema>>
export type Expense = WithId<z.output<typeof expenseSchema>>
export type Share = WithId<z.output<typeof shareSchema>>
export type SettlementBatch = WithId<z.output<typeof settlementBatchSchema>>
export type AppNotification = WithId<z.output<typeof notificationSchema>>
export type Idea = WithId<z.output<typeof ideaSchema>>

/* ---------- References ---------- */

export const refs = {
  user: (uid: string) => doc(db, 'users', uid).withConverter(converters.user),
  notifications: (uid: string) => collection(db, 'users', uid, 'notifications').withConverter(converters.notification),
  trips: () => collection(db, 'trips').withConverter(converters.trip),
  trip: (tripId: string) => doc(db, 'trips', tripId).withConverter(converters.trip),
  members: (tripId: string) => collection(db, 'trips', tripId, 'members').withConverter(converters.member),
  member: (tripId: string, uid: string) => doc(db, 'trips', tripId, 'members', uid).withConverter(converters.member),
  invites: () => collection(db, 'invites').withConverter(converters.invite),
  invite: (code: string) => doc(db, 'invites', code).withConverter(converters.invite),
  items: (tripId: string) => collection(db, 'trips', tripId, 'items').withConverter(converters.item),
  item: (tripId: string, id: string) => doc(db, 'trips', tripId, 'items', id).withConverter(converters.item),
  expenses: (tripId: string) => collection(db, 'trips', tripId, 'expenses').withConverter(converters.expense),
  expense: (tripId: string, id: string) => doc(db, 'trips', tripId, 'expenses', id).withConverter(converters.expense),
  shares: (tripId: string, expenseId: string) =>
    collection(db, 'trips', tripId, 'expenses', expenseId, 'shares').withConverter(converters.share),
  batches: (tripId: string) => collection(db, 'trips', tripId, 'settlementBatches').withConverter(converters.batch),
  ideas: (tripId: string) => collection(db, 'trips', tripId, 'ideas').withConverter(converters.idea),
}

/* ---------- Realtime hooks ---------- */

export interface LiveState<T> {
  data: T
  loading: boolean
  error: Error | null
}

/**
 * Subscribe to a document. Pass null to unsubscribe. `key` must change
 * whenever the reference changes (we key on the path).
 */
export function useLiveDoc<T>(ref: DocumentReference<T> | null): LiveState<T | null> {
  const key = ref?.path ?? null
  const [state, setState] = useState<LiveState<T | null> & { key: string | null }>({
    data: null,
    loading: !!ref,
    error: null,
    key,
  })
  useEffect(() => {
    if (!ref) return
    return onSnapshot(
      ref,
      (snap) => setState({ data: snap.exists() ? snap.data() : null, loading: false, error: null, key: ref.path }),
      (error) => setState({ data: null, loading: false, error, key: ref.path }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (state.key !== key) return { data: null, loading: !!ref, error: null }
  return state
}

/** Subscribe to a query. `key` must uniquely describe the query's constraints. */
export function useLiveQuery<T>(q: Query<T> | CollectionReference<T> | null, key: string | null): LiveState<T[]> {
  const [state, setState] = useState<LiveState<T[]> & { key: string | null }>({
    data: [],
    loading: !!q,
    error: null,
    key,
  })
  useEffect(() => {
    if (!q) return
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => d.data()), loading: false, error: null, key }),
      (error) => {
        console.error(`Query ${key} failed`, error)
        setState({ data: [], loading: false, error, key })
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (state.key !== key) return { data: [], loading: !!q, error: null }
  return state
}
