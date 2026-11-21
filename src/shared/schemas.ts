/**
 * Zod schemas for every Firestore document. The client converters parse
 * snapshots with these and Cloud Functions validate callable input with them,
 * so both sides agree on shape.
 */
import { z } from 'zod'
import { isDateString, isTimeString } from './dates'

/** Firestore Timestamp (client or admin SDK) — both expose toMillis(). */
export interface TimestampLike {
  toMillis(): number
  toDate(): Date
}
const timestamp = z.custom<TimestampLike>((v) => v === null || v === undefined || typeof (v as TimestampLike)?.toMillis === 'function')

export const dateStr = z.string().refine(isDateString, 'Use YYYY-MM-DD')
export const timeStr = z.string().refine(isTimeString, 'Use HH:mm')
export const currencyCode = z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code')
const minor = z.number().int()

export const itemTypeSchema = z.enum(['activity', 'food', 'transport', 'stay', 'other'])
export const splitMethodSchema = z.enum(['equal', 'exact', 'percent'])
export const shareStatusSchema = z.enum(['unpaid', 'sent', 'confirmed', 'disputed'])
export const paymentMethodSchema = z.enum(['bank', 'payid', 'cash', 'paypal', 'other'])
export const roleSchema = z.enum(['owner', 'member'])

export const notificationTypeSchema = z.enum([
  'memberJoined',
  'itemChanged',
  'shareSent',
  'shareConfirmed',
  'shareDisputed',
  'confirmReminder',
  'expenseAdded',
  'tripDeleted',
  'tripTomorrow',
])
export type NotificationType = z.infer<typeof notificationTypeSchema>

export const DEFAULT_NOTIFICATION_PREFS: Record<NotificationType, boolean> = {
  memberJoined: true,
  itemChanged: false,
  shareSent: true,
  shareConfirmed: true,
  shareDisputed: true,
  confirmReminder: true,
  expenseAdded: true,
  tripDeleted: true,
  tripTomorrow: true,
}

/** How someone likes to be paid back. Shown to the people who owe them. */
export const payToSchema = z.object({
  payId: z.string().max(100).default(''),
  paypalMe: z.string().max(100).default(''),
  bank: z.string().max(200).default(''),
})
export type PayTo = z.infer<typeof payToSchema>

export const userSchema = z.object({
  displayName: z.string().default(''),
  email: z.string().nullable().default(null),
  photoURL: z.string().nullable().default(null),
  defaultCurrency: currencyCode.default('AUD'),
  createdAt: timestamp.optional(),
  notificationPrefs: z.record(z.string(), z.boolean()).default({}),
  payTo: payToSchema.nullable().default(null),
})
export type UserDoc = z.infer<typeof userSchema>

export const tripSchema = z.object({
  name: z.string(),
  destination: z.string().default(''),
  startDate: dateStr,
  endDate: dateStr,
  timeZone: z.string(),
  baseCurrency: currencyCode,
  ownerId: z.string(),
  memberIds: z.array(z.string()),
  coverEmoji: z.string().nullable().default(null),
  coverColor: z.string().nullable().default(null),
  coverPhotoURL: z.string().nullable().default(null),
  /** Read-only link for people who aren't on the trip (owner turns it on/off). */
  shareToken: z.string().nullable().default(null),
  notes: z.string().default(''),
  createdAt: timestamp.optional(),
  updatedAt: timestamp.optional(),
})
export type TripDoc = z.infer<typeof tripSchema>

export const memberSchema = z.object({
  role: roleSchema,
  displayName: z.string().default(''),
  photoURL: z.string().nullable().default(null),
  joinedAt: timestamp.optional(),
  payTo: payToSchema.nullable().default(null),
})
export type MemberDoc = z.infer<typeof memberSchema>

/** invites/{code}: readable by anyone signed in who has the code, so it carries a preview of the trip. */
export const inviteSchema = z.object({
  /** Same as the doc id. */
  code: z.string(),
  tripId: z.string(),
  tripName: z.string(),
  destination: z.string().default(''),
  startDate: dateStr,
  endDate: dateStr,
  coverEmoji: z.string().nullable().default(null),
  invitedBy: z.string().default('Someone'),
  createdBy: z.string(),
  createdAt: timestamp.optional(),
  expiresAt: timestamp.nullable().default(null),
  maxUses: z.number().int().positive().nullable().default(null),
  uses: z.number().int().default(0),
  revoked: z.boolean().default(false),
})
export type InviteDoc = z.infer<typeof inviteSchema>

export const locationSchema = z.object({
  placeId: z.string().nullable().default(null),
  name: z.string(),
  address: z.string().default(''),
  lat: z.number().nullable().default(null),
  lng: z.number().nullable().default(null),
  /** Name and address in the local language (e.g. Chinese), to show a taxi driver or paste into a local ride app. */
  localName: z.string().optional(),
  localAddress: z.string().optional(),
})
export type Location = z.infer<typeof locationSchema>

const dateTime = z.object({ date: dateStr, time: timeStr.nullable() })

/** A ticket, booking confirmation or other document attached to a plan. */
export const attachmentSchema = z.object({
  name: z.string(),
  /** The file's document in trips/{tripId}/files. */
  fileId: z.string().optional(),
  /** Older attachments that were uploaded to Cloud Storage. */
  url: z.string().optional(),
  contentType: z.string(),
  size: z.number().int().nonnegative().default(0),
})
export type Attachment = z.infer<typeof attachmentSchema>
export const MAX_ATTACHMENTS = 10

/** Where a plan stands. 'cancel' means it still needs cancelling. */
export const itemStatusSchema = z.enum(['booked', 'planned', 'suggested', 'cancel'])
export type ItemStatus = z.infer<typeof itemStatusSchema>

/** Extra planning details, e.g. from an imported itinerary. */
export const itemMetaSchema = z.object({
  status: itemStatusSchema.nullable().default(null),
  bookingRequired: z.boolean().default(false),
  /** Details nobody knows yet ("booking reference", "train number"…), shown as Missing info. */
  todo: z.array(z.string()).default([]),
  /** When the plan happens somewhere other than the trip's time zone (e.g. the flight out). */
  timeZone: z.string().nullable().default(null),
  alternatives: z
    .array(z.object({ name: z.string(), nameZh: z.string().nullable().default(null), address: z.string().nullable().default(null), url: z.string().nullable().default(null) }))
    .default([]),
  /** The place lookup was unsure, so the location isn't pinned yet. */
  needsLocationReview: z.boolean().default(false),
})
export type ItemMeta = z.infer<typeof itemMetaSchema>

export const itemSchema = z.object({
  type: itemTypeSchema,
  title: z.string(),
  date: dateStr,
  startTime: timeStr.nullable().default(null),
  endTime: timeStr.nullable().default(null),
  checkIn: dateTime.nullable().default(null),
  checkOut: dateTime.nullable().default(null),
  location: locationSchema.nullable().default(null),
  notes: z.string().default(''),
  bookingUrl: z.string().default(''),
  bookingRef: z.string().default(''),
  order: z.number().default(0),
  linkedExpenseId: z.string().nullable().default(null),
  photoURL: z.string().nullable().default(null),
  attachments: z.array(attachmentSchema).default([]),
  meta: itemMetaSchema.nullable().default(null),
  createdBy: z.string(),
  createdAt: timestamp.optional(),
  updatedAt: timestamp.optional(),
})
export type ItemDoc = z.infer<typeof itemSchema>

export const expenseSchema = z.object({
  title: z.string(),
  amountMinor: minor,
  currency: currencyCode,
  fxRateToBase: z.number().positive(),
  amountBaseMinor: minor,
  paidBy: z.string(),
  splitMethod: splitMethodSchema,
  participantIds: z.array(z.string()),
  /** exact: minor units per uid; percent: basis points per uid; equal: null. */
  splitValues: z.record(z.string(), z.number().int()).nullable().default(null),
  category: z.string().default('other'),
  date: dateStr,
  linkedItemId: z.string().nullable().default(null),
  createdBy: z.string(),
  createdAt: timestamp.optional(),
  updatedAt: timestamp.optional(),
})
export type ExpenseDoc = z.infer<typeof expenseSchema>

export const historyEntrySchema = z.object({
  status: shareStatusSchema,
  byUid: z.string(),
  at: timestamp,
  note: z.string().default(''),
})
export type HistoryEntry = z.infer<typeof historyEntrySchema>

export const shareSchema = z.object({
  tripId: z.string(),
  expenseId: z.string(),
  expenseTitle: z.string().default(''),
  currency: currencyCode,
  debtorUid: z.string(),
  payerUid: z.string(),
  amountMinor: minor,
  amountBaseMinor: minor,
  status: shareStatusSchema,
  method: paymentMethodSchema.nullable().default(null),
  reference: z.string().default(''),
  note: z.string().default(''),
  batchId: z.string().nullable().default(null),
  history: z.array(historyEntrySchema).default([]),
  updatedAt: timestamp.optional(),
})
export type ShareDoc = z.infer<typeof shareSchema>

export const settlementBatchSchema = z.object({
  tripId: z.string(),
  fromUid: z.string(),
  toUid: z.string(),
  shareRefs: z.array(z.string()),
  totalBaseMinor: minor,
  status: z.enum(['sent', 'confirmed', 'disputed']),
  createdAt: timestamp.optional(),
})
export type SettlementBatchDoc = z.infer<typeof settlementBatchSchema>

export const notificationSchema = z.object({
  type: notificationTypeSchema,
  tripId: z.string().nullable().default(null),
  refPath: z.string().nullable().default(null),
  title: z.string(),
  body: z.string().default(''),
  url: z.string().nullable().default(null),
  read: z.boolean().default(false),
  createdAt: timestamp.optional(),
})
export type NotificationDoc = z.infer<typeof notificationSchema>

export const feedbackSchema = z.object({
  uid: z.string(),
  message: z.string().min(1).max(4000),
  appVersion: z.string(),
  userAgent: z.string(),
  url: z.string(),
  createdAt: timestamp.optional(),
})

/* ---------- Callable function payloads ---------- */

export const joinTripInput = z.object({ code: z.string().min(10).max(64) })
export const invitePreviewInput = joinTripInput
export const removeMemberInput = z.object({ tripId: z.string().min(1), uid: z.string().min(1) })

export interface InvitePreview {
  tripId: string
  tripName: string
  destination: string
  startDate: string
  endDate: string
  coverEmoji: string | null
  coverPhotoURL: string | null
  invitedBy: string
  alreadyMember: boolean
}

export const sharedTripInput = z.object({ token: z.string().regex(/^[A-Za-z0-9]{24,64}$/, 'This link isn’t valid.') })

/** What a read-only link shows: the plan, without costs, notes or booking details. */
export interface SharedTrip {
  name: string
  destination: string
  startDate: string
  endDate: string
  timeZone: string
  coverEmoji: string | null
  coverPhotoURL: string | null
  items: Array<Pick<ItemDoc, 'type' | 'title' | 'date' | 'startTime' | 'endTime' | 'checkIn' | 'checkOut' | 'location' | 'photoURL' | 'order'> & { id: string }>
}

/** Something someone wants to do, not yet on a day. Members vote; anyone can put it in the plan. */
export const ideaSchema = z.object({
  title: z.string(),
  type: itemTypeSchema.default('activity'),
  location: locationSchema.nullable().default(null),
  note: z.string().default(''),
  votes: z.array(z.string()).default([]),
  createdBy: z.string(),
  createdAt: timestamp.optional(),
})
export type IdeaDoc = z.infer<typeof ideaSchema>
