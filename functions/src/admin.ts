import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getMessaging } from 'firebase-admin/messaging'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import { setGlobalOptions } from 'firebase-functions/v2'

/** Keep in sync with VITE_FUNCTIONS_REGION. Close to the Firestore region. */
export const REGION = 'australia-southeast1'
/** Deep links in push notifications point here. */
export const APP_URL = process.env.APP_URL ?? 'https://happss.web.app'

setGlobalOptions({ region: REGION, maxInstances: 10 })

if (getApps().length === 0) initializeApp()

export const db = getFirestore()
export const adminAuth = getAuth()
export const messaging = getMessaging()

/** Delete every Storage object under a prefix (photos for a trip or user). */
export async function deleteFolder(prefix: string): Promise<void> {
  try {
    await getStorage().bucket().deleteFiles({ prefix })
  } catch (err) {
    logger.warn(`Could not delete storage under ${prefix}`, err)
  }
}
