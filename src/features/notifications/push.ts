/**
 * Web push via Firebase Cloud Messaging.
 *
 * Permission is only ever requested after a meaningful user action (joining
 * a trip, marking something as paid, adding an expense), never on load.
 * Tokens are stored at users/{uid}/fcmTokens/{token}; the server deletes
 * tokens that stop working.
 */
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { toast } from 'sonner'
import { auth, app, db } from '@/lib/firebase'

const VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY
const ASKED_KEY = 'happs.pushAsked'
const TOKEN_KEY = 'happs.fcmToken'

function safeGet(k: string) {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function safeSet(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* storage unavailable */
  }
}

export type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'enabled' | 'off'

export async function pushState(): Promise<PushState> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported'
  const { isSupported } = await import('firebase/messaging')
  if (!(await isSupported())) return 'unsupported'
  if (!VAPID_KEY) return 'unconfigured'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.permission === 'granted' && safeGet(TOKEN_KEY) ? 'enabled' : 'off'
}

async function registerToken(): Promise<boolean> {
  const user = auth.currentUser
  if (!user) return false
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) {
    // In `npm run dev` the service worker is off; push works in build/preview and production.
    console.info('No service worker registration: push needs a production build.')
    return false
  }
  const { getMessaging, getToken } = await import('firebase/messaging')
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg })
  if (!token) return false
  await setDoc(doc(db, 'users', user.uid, 'fcmTokens', token), { createdAt: serverTimestamp(), userAgent: navigator.userAgent.slice(0, 300) })
  safeSet(TOKEN_KEY, token)
  return true
}

/** Must be called from a user gesture (Safari requires it). */
export async function enablePush(): Promise<PushState> {
  const state = await pushState()
  if (state === 'unsupported' || state === 'unconfigured' || state === 'denied') return state
  const permission = await Notification.requestPermission()
  safeSet(ASKED_KEY, '1')
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  return (await registerToken()) ? 'enabled' : 'off'
}

export async function disablePush(): Promise<void> {
  const token = safeGet(TOKEN_KEY)
  const user = auth.currentUser
  if (token && user) {
    await deleteDoc(doc(db, 'users', user.uid, 'fcmTokens', token)).catch(() => undefined)
    const { deleteToken, getMessaging } = await import('firebase/messaging')
    await deleteToken(getMessaging(app)).catch(() => undefined)
  }
  safeSet(TOKEN_KEY, null)
}

/**
 * After a meaningful action, offer push once with an in-app prompt whose
 * button provides the user gesture the permission request needs.
 */
export async function requestPushAfterAction(): Promise<void> {
  const state = await pushState().catch(() => 'unsupported' as const)
  if (state === 'enabled') {
    await registerToken().catch(() => undefined) // refresh token
    return
  }
  if (state !== 'off' || safeGet(ASKED_KEY)) return
  if (Notification.permission === 'granted') {
    await registerToken().catch(() => undefined)
    return
  }
  safeSet(ASKED_KEY, '1')
  toast('Get notified when friends pay you?', {
    description: 'We’ll only send payment updates and anything you turn on in Profile.',
    duration: 12_000,
    action: { label: 'Turn on', onClick: () => void enablePush() },
  })
}

/** Foreground messages: show a toast instead of a system notification. */
export async function listenForeground(onNavigate: (url: string) => void): Promise<() => void> {
  if ((await pushState()) !== 'enabled') return () => undefined
  const { getMessaging, onMessage } = await import('firebase/messaging')
  return onMessage(getMessaging(app), (payload) => {
    const d = payload.data ?? {}
    toast(d.title ?? 'happs', { description: d.body, action: d.url ? { label: 'Open', onClick: () => onNavigate(d.url!) } : undefined })
  })
}
