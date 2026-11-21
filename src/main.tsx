import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { toast } from 'sonner'
import './index.css'
import { App } from '@/app/App'
import { installErrorReporting } from '@/lib/errorReporting'

installErrorReporting()

// Service worker (production builds): the offline app shell. The installed
// app checks for a new version whenever it's opened or brought back, and
// hourly. A version found right after opening is applied straight away
// (nothing is in progress yet); later ones are offered with a toast instead
// of reloading under the user.
const OPENED_AT = Date.now()
const APPLY_SILENTLY_MS = 10_000
const updateSW = registerSW({
  onNeedRefresh() {
    if (Date.now() - OPENED_AT < APPLY_SILENTLY_MS) {
      void updateSW(true)
      return
    }
    toast('A new version of happs is ready', { duration: Infinity, action: { label: 'Reload', onClick: () => void updateSW(true) } })
  },
  onOfflineReady() {
    toast.success('happs is ready to work offline', { duration: 3000 })
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => {
      if (navigator.onLine) void registration.update().catch(() => undefined)
    }
    check()
    setInterval(check, 60 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
