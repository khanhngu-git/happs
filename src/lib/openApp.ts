/** iPhone, iPod or iPad (iPadOS reports itself as a Mac, but with touch). */
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/**
 * Open a native app by its URL scheme, falling back to `fallbackUrl` if the
 * app didn't take over (not installed, or the scheme was refused).
 *
 * iOS ignores the "open the app" tricks web pages use (uri.amap.com's
 * `callnative`, hidden iframes) and a bare scheme link to an app that isn't
 * installed just fails silently in a Home Screen app, so we navigate to the
 * scheme from the tap itself and watch whether the page gets hidden.
 */
export function openApp(schemeUrl: string, fallbackUrl: string, wait = 1500): void {
  let left = false
  const onHide = () => {
    if (document.visibilityState === 'hidden') left = true
  }
  const onLeave = () => {
    left = true
  }
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', onLeave)
  window.addEventListener('blur', onLeave)
  const cleanup = () => {
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('pagehide', onLeave)
    window.removeEventListener('blur', onLeave)
  }
  window.setTimeout(() => {
    cleanup()
    if (!left && document.visibilityState === 'visible') window.location.href = fallbackUrl
  }, wait)
  window.location.href = schemeUrl
}
