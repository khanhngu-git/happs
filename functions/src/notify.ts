/**
 * Server-side notifications: write users/{uid}/notifications/{id} and send a
 * web push to every registered FCM token, respecting per-type preferences.
 * Invalid tokens are deleted when a send fails.
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { db, messaging, APP_URL } from './admin'
import { DEFAULT_NOTIFICATION_PREFS, type NotificationType } from '@shared/schemas'

export interface NotifyInput {
  type: NotificationType
  tripId: string | null
  refPath: string | null
  title: string
  body: string
  /** In-app path the notification opens. */
  url: string
}

/** How long notifications are kept. */
const NOTIFICATION_TTL_DAYS = 90

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
])

export async function wantsNotification(uid: string, type: NotificationType): Promise<boolean> {
  const user = await db.doc(`users/${uid}`).get()
  const prefs = (user.get('notificationPrefs') as Record<string, boolean> | undefined) ?? {}
  return prefs[type] ?? DEFAULT_NOTIFICATION_PREFS[type]
}

export async function notify(uid: string, input: NotifyInput): Promise<void> {
  if (!(await wantsNotification(uid, input.type))) return
  const ref = db.collection(`users/${uid}/notifications`).doc()
  await ref.set({
    type: input.type,
    tripId: input.tripId,
    refPath: input.refPath,
    title: input.title,
    body: input.body,
    url: input.url,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
    // Firestore's TTL policy on `expireAt` deletes old notifications (see README).
    expireAt: Timestamp.fromMillis(Date.now() + NOTIFICATION_TTL_DAYS * 86_400_000),
  })
  await push(uid, { ...input, notificationId: ref.id })
}

async function push(uid: string, input: NotifyInput & { notificationId: string }) {
  const tokensSnap = await db.collection(`users/${uid}/fcmTokens`).get()
  const tokens = tokensSnap.docs.map((d) => d.id)
  if (tokens.length === 0) return
  try {
    const res = await messaging.sendEachForMulticast({
      tokens,
      // Data-only so the service worker can add Confirm / Not received actions.
      data: {
        type: input.type,
        title: input.title,
        body: input.body,
        url: input.url,
        refPath: input.refPath ?? '',
        tripId: input.tripId ?? '',
        notificationId: input.notificationId,
      },
      webpush: { headers: { Urgency: 'high', TTL: String(60 * 60 * 24 * 3) }, fcmOptions: { link: `${APP_URL}${input.url}` } },
    })
    const stale = res.responses
      .map((r, i) => (!r.success && r.error && INVALID_TOKEN_CODES.has(r.error.code) ? tokens[i] : null))
      .filter((t): t is string => !!t)
    await Promise.all(stale.map((t) => db.doc(`users/${uid}/fcmTokens/${t}`).delete()))
    if (stale.length) logger.info(`Removed ${stale.length} stale FCM tokens for ${uid}`)
  } catch (err) {
    // The emulator has no FCM; never let push failures break the trigger.
    logger.warn('Push send failed', err)
  }
}
