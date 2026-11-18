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
export const EMULATOR_PROJECT_ID = 'demo-happs'
export const FUNCTIONS_REGION = env.VITE_FUNCTIONS_REGION || 'australia-southeast1'

/**
 * Same-origin auth domain: on Firebase Hosting every domain serves
 * /__/auth/handler, so using the current host avoids the third-party storage
 * problems iOS Safari has with signInWithRedirect.
 */
function resolveAuthDomain(): string {
  const configured = env.VITE_FIREBASE_AUTH_DOMAIN as string
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
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)
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

if (USE_EMULATORS) {
  const host = env.VITE_EMULATOR_HOST || '127.0.0.1'
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, host, 8080)
  connectFunctionsEmulator(functions, host, 5001)
}
