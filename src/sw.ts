/// <reference lib="webworker" />
/**
 * Service worker: Workbox precache for the offline app shell. Trip data,
 * photos and tickets live in Firestore, whose own offline cache keeps them
 * on the device.
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
// SPA: serve the cached index.html for every navigation, except Firebase's reserved paths.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/__\//] }))

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

// Tapping an alert opens the page it's about, in the app if it's already open.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = (event.notification.data ?? {}) as { url?: string }
  const url = data.url && data.url.startsWith('/') ? data.url : '/notifications'
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
