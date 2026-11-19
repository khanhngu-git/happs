/**
 * Minimal crash reporting: uncaught errors and unhandled promise rejections
 * are written to `clientErrors` (write-only for clients), so problems on
 * people's phones show up in the Firebase console. Throttled, deduplicated,
 * and never reports anything while signed out or in tests.
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase'

const MAX_PER_SESSION = 10
const seen = new Set<string>()
let sent = 0

/** Errors that aren't ours to fix (extensions, network blips, cancelled loads). */
const IGNORE = /ResizeObserver loop|Failed to fetch|NetworkError|Load failed|chrome-extension:|moz-extension:|AbortError/i

export function reportError(error: unknown): void {
  const uid = auth.currentUser?.uid
  if (!uid || sent >= MAX_PER_SESSION || import.meta.env.MODE === 'test') return
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error ?? 'Unknown error'))
  const message = (err.message || err.name || 'Error').slice(0, 1000)
  if (IGNORE.test(message) || IGNORE.test(err.stack ?? '')) return
  const key = `${message}|${(err.stack ?? '').split('\n')[1] ?? ''}`
  if (seen.has(key)) return
  seen.add(key)
  sent++
  void addDoc(collection(db, 'clientErrors'), {
    uid,
    message,
    stack: (err.stack ?? '').slice(0, 4000),
    url: location.pathname.slice(0, 500),
    appVersion: __APP_VERSION__,
    userAgent: navigator.userAgent.slice(0, 500),
    createdAt: serverTimestamp(),
  }).catch(() => {})
}

export function installErrorReporting(): void {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason))
}
