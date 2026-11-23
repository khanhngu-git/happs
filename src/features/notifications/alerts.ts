/**
 * Phone-style alerts, with no server: while happs is open or still running in
 * the background, new notifications are shown as system notifications
 * (once allowed on this device). Nothing arrives once the app is fully
 * closed, because that needs a push server.
 */
const KEY = 'happs.alerts'

export type AlertsState = 'unsupported' | 'denied' | 'on' | 'off'

function get(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}
function set(v: string | null) {
  try {
    if (v === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, v)
  } catch {
    /* storage unavailable */
  }
}

export function alertsState(): AlertsState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.permission === 'granted' && get() === '1' ? 'on' : 'off'
}

/** Must run from a tap (iPhone requires it). */
export async function enableAlerts(): Promise<AlertsState> {
  if (alertsState() === 'unsupported') return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  set('1')
  return 'on'
}

export function disableAlerts() {
  set(null)
}

/** Show one notification as a system alert. Returns false if it couldn't. */
export async function showSystemAlert(n: { id: string; title: string; body: string; url: string | null }): Promise<boolean> {
  if (alertsState() !== 'on') return false
  const url = n.url && n.url.startsWith('/') ? n.url : '/notifications'
  const options = { body: n.body, icon: '/pwa-192x192.png', badge: '/pwa-64x64.png', tag: n.id, data: { url } }
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (reg) {
      await reg.showNotification(n.title, options)
      return true
    }
    // No service worker (e.g. `npm run dev`): a plain notification that opens the page when tapped.
    const plain = new Notification(n.title, options)
    plain.onclick = () => {
      window.focus()
      location.assign(url)
    }
    return true
  } catch {
    return false
  }
}
