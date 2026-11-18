import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getMessaging } from 'firebase-admin/messaging'
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
