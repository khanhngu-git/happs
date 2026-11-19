import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { toast } from 'sonner'
import './index.css'
import { App } from '@/app/App'
import { installErrorReporting } from '@/lib/errorReporting'

installErrorReporting()

// Service worker (production builds): offline shell + FCM. New versions are
// offered with a toast instead of reloading under the user.
const updateSW = registerSW({
  onNeedRefresh() {
    toast('A new version of happs is ready', { duration: Infinity, action: { label: 'Reload', onClick: () => void updateSW(true) } })
  },
  onOfflineReady() {
    toast.success('happs is ready to work offline', { duration: 3000 })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
