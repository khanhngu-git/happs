/// <reference lib="webworker" />
/**
 * Service worker: Workbox precache for the offline app shell, plus Firebase
 * Cloud Messaging background messages on the same registration.
 *
 * Push messages are data-only so we control the notification, including the
 * "Confirm" / "Not received" action buttons on payment notifications.
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { initializeApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
// SPA: serve the cached index.html for every navigation, except Firebase's reserved paths.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/__\//] }))

// Photos and tickets from Firebase Storage: kept on the device once seen, so
// boarding passes and confirmations open with no signal. Download URLs carry
// a token and a unique filename, so a cached copy never goes stale.
registerRoute(
  ({ url, request }) => request.method === 'GET' && url.hostname === 'firebasestorage.googleapis.com',
  new CacheFirst({
    cacheName: 'trip-files',
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] }), new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 90 * 24 * 60 * 60, purgeOnQuotaError: true })],
  }),
)

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

const env = import.meta.env
if (env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_MESSAGING_SENDER_ID) {
  try {
    const app = initializeApp({
      apiKey: env.VITE_FIREBASE_API_KEY,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    })
    onBackgroundMessage(getMessaging(app), (payload) => {
      const d = payload.data ?? {}
      const actions: { action: string; title: string }[] = []
      if (d.type === 'shareSent' || d.type === 'confirmReminder') {
        actions.push({ action: 'confirm', title: 'Confirm' }, { action: 'dispute', title: 'Not received' })
      }
      void self.registration.showNotification(d.title || 'happs', {
        body: d.body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-64x64.png',
        tag: d.notificationId || d.refPath,
        data: d,
        // `actions` is supported by Chromium; other browsers ignore it.
        ...({ actions } as object),
      })
    })
  } catch (err) {
    console.warn('FCM init failed in service worker', err)
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = (event.notification.data ?? {}) as Record<string, string>
  let url = data.url || '/notifications'
  // Action buttons deep link into the app, which shows a one-tap confirm sheet.
  if ((event.action === 'confirm' || event.action === 'dispute') && data.refPath) {
    const u = new URL(url, self.location.origin)
    u.searchParams.set('share', data.refPath)
    u.searchParams.set('action', event.action)
    url = u.pathname + u.search
  }
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = all.find((c) => new URL(c.url).origin === self.location.origin) as WindowClient | undefined
      if (existing) {
        await existing.focus()
        existing.postMessage({ type: 'NAVIGATE', url })
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
