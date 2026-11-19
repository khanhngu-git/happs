/**
 * Firebase initialisation. In dev (`VITE_USE_EMULATORS=true`) the app talks
 * to the local Emulator Suite under the `demo-happs` project id, so no real
 * project resources are touched.
 */
import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

const env = import.meta.env

export const USE_EMULATORS = env.DEV && env.VITE_USE_EMULATORS === 'true'
/**
 * VITE_AUTH_EMULATOR=false keeps data local but signs in with real Google
 * (real Firebase Auth for the configured project). The other emulators then
 * run under the real project id (`npm run emulators:real-auth`) so the ID
 * tokens' project matches.
 */
export const USE_AUTH_EMULATOR = USE_EMULATORS && env.VITE_AUTH_EMULATOR !== 'false'
export const EMULATOR_PROJECT_ID = USE_AUTH_EMULATOR ? 'demo-happs' : (env.VITE_FIREBASE_PROJECT_ID as string)
export const FUNCTIONS_REGION = env.VITE_FUNCTIONS_REGION || 'australia-southeast1'

/**
 * Same-origin auth domain: on Firebase Hosting every domain serves
 * /__/auth/handler, so using the current host avoids the third-party storage
 * problems iOS Safari has with signInWithRedirect.
 */
function resolveAuthDomain(): string {
  const configured = env.VITE_FIREBASE_AUTH_DOMAIN as string
  // Dev with real Auth: Vite proxies /__/auth to the configured domain.
  if (env.DEV && !USE_AUTH_EMULATOR && env.VITE_AUTH_SAME_ORIGIN === 'true' && typeof location !== 'undefined') return location.host
  if (env.PROD && env.VITE_AUTH_SAME_ORIGIN !== 'false' && typeof location !== 'undefined') {
    const host = location.host
    if (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com') || env.VITE_AUTH_SAME_ORIGIN === 'true') return host
  }
  return configured
}

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: resolveAuthDomain(),
  projectId: USE_EMULATORS ? EMULATOR_PROJECT_ID : env.VITE_FIREBASE_PROJECT_ID,
  // The emulator's default bucket follows the demo project id.
  storageBucket: USE_EMULATORS ? `${EMULATOR_PROJECT_ID}.appspot.com` : env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)

/**
 * App Check proves calls come from this app, so scripts can't call the paid
 * functions directly. Off until VITE_APPCHECK_SITE_KEY (reCAPTCHA Enterprise)
 * is set; enforce it server-side with ENFORCE_APP_CHECK=true afterwards.
 */
if (env.VITE_APPCHECK_SITE_KEY && !USE_EMULATORS && typeof window !== 'undefined') {
  // Loaded only when configured, so it costs nothing otherwise.
  void import('firebase/app-check')
    .then(({ initializeAppCheck, ReCaptchaEnterpriseProvider }) =>
      initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(env.VITE_APPCHECK_SITE_KEY as string), isTokenAutoRefreshEnabled: true }),
    )
    .catch((err) => console.warn('App Check init failed', err))
}
export const auth = getAuth(app)

// Persistent cache keeps the itinerary viewable offline; edits sync on reconnect.
// Falls back to memory in environments without IndexedDB (tests, private mode).
export const db = initializeFirestore(app, {
  localCache:
    typeof indexedDB !== 'undefined' && env.MODE !== 'test'
      ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      : memoryLocalCache(),
  ignoreUndefinedProperties: true,
})

export const functions = getFunctions(app, FUNCTIONS_REGION)

/** Storage is only needed for photo uploads, so it loads on first use. */
let storagePromise: Promise<import('firebase/storage').FirebaseStorage> | null = null
export function getAppStorage() {
  storagePromise ??= import('firebase/storage').then(({ getStorage, connectStorageEmulator }) => {
    const storage = getStorage(app)
    if (USE_EMULATORS) connectStorageEmulator(storage, env.VITE_EMULATOR_HOST || '127.0.0.1', Number(env.VITE_EMU_STORAGE_PORT) || 9199)
    return storage
  })
  return storagePromise
}

if (USE_EMULATORS) {
  const host = env.VITE_EMULATOR_HOST || '127.0.0.1'
  // Auth goes through `localhost` so its redirect iframe is same-site with the
  // dev server (localhost:5173). With 127.0.0.1 it is cross-site, and browsers
  // that partition third-party storage (Safari, embedded webviews) silently
  // drop the Google redirect result.
  const authHost = env.VITE_EMULATOR_HOST || (location.hostname === 'localhost' ? 'localhost' : host)
  // Ports are overridable so the e2e suite can run its own emulators alongside dev ones.
  const port = (v: string | undefined, d: number) => Number(v) || d
  if (USE_AUTH_EMULATOR) connectAuthEmulator(auth, `http://${authHost}:${port(env.VITE_EMU_AUTH_PORT, 9099)}`, { disableWarnings: true })
  connectFirestoreEmulator(db, host, port(env.VITE_EMU_FIRESTORE_PORT, 8080))
  connectFunctionsEmulator(functions, host, port(env.VITE_EMU_FUNCTIONS_PORT, 5001))
}
