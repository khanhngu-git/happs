import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { toast } from 'sonner'
import { useUser } from '@/features/auth/AuthProvider'
import { refs, type AppNotification } from '@/lib/firestore'
import { useWantsNotification } from './useUnread'
import { showSystemAlert } from './alerts'

/** Show at most this many alerts at once (e.g. after coming back online); the rest are summed up. */
const MAX_AT_ONCE = 3

/** In the app: a banner. In the background: a system alert (if allowed), else the banner waits. */
async function showAlert(n: AppNotification, open: (url: string) => void) {
  const url = n.url && n.url.startsWith('/') ? n.url : '/notifications'
  if (document.visibilityState === 'hidden' && (await showSystemAlert({ id: n.id, title: n.title, body: n.body, url }))) return
  toast(n.title, { description: n.body, duration: 6000, action: { label: 'Open', onClick: () => open(url) } })
}

/**
 * Watches for new notifications while happs is running. In the app: a banner
 * with an Open button. In the background: a system alert, if allowed on this
 * device (Profile → Alerts on this device).
 */
export function LiveAlerts() {
  const user = useUser()
  const navigate = useNavigate()
  const wants = useWantsNotification()
  const latest = useRef({ wants, navigate })
  useEffect(() => {
    latest.current = { wants, navigate }
  })

  useEffect(() => {
    const q = query(refs.notifications(user.uid), orderBy('createdAt', 'desc'), limit(20))
    let first = true
    return onSnapshot(q, (snap) => {
      // The first snapshot is what was already there; only later additions are new.
      if (first) {
        first = false
        return
      }
      const fresh = snap
        .docChanges()
        .filter((c) => c.type === 'added')
        .map((c) => c.doc.data() as AppNotification)
        .filter((n) => !n.read && latest.current.wants(n))
      fresh.slice(0, MAX_AT_ONCE).forEach((n) => void showAlert(n, (url) => latest.current.navigate(url)))
      if (fresh.length > MAX_AT_ONCE) {
        toast(`${fresh.length - MAX_AT_ONCE} more notifications`, { action: { label: 'View', onClick: () => latest.current.navigate('/notifications') } })
      }
    })
  }, [user.uid])

  return null
}
