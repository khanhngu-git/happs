import { useEffect } from 'react'
import { Outlet, ScrollRestoration, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/AuthProvider'
import { listenForeground } from '@/features/notifications/push'

export function RootLayout() {
  const navigate = useNavigate()
  const { user } = useAuth()

  // Notification clicks from the service worker ask the open tab to navigate.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'NAVIGATE' && typeof e.data.url === 'string' && e.data.url.startsWith('/')) navigate(e.data.url)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])

  // Foreground pushes become toasts.
  useEffect(() => {
    if (!user) return
    let off = () => {}
    listenForeground((url) => navigate(url)).then((fn) => (off = fn))
    return () => off()
  }, [user, navigate])

  // Show connectivity changes; Firestore keeps working from its offline cache.
  useEffect(() => {
    const offline = () => toast.warning('You’re offline. Changes will sync when you reconnect.', { id: 'net' })
    const online = () => toast.success('Back online', { id: 'net', duration: 2000 })
    window.addEventListener('offline', offline)
    window.addEventListener('online', online)
    return () => {
      window.removeEventListener('offline', offline)
      window.removeEventListener('online', online)
    }
  }, [])

  return (
    <>
      <Outlet />
      <ScrollRestoration />
    </>
  )
}
