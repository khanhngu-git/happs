import { limit, query, where } from 'firebase/firestore'
import { useAuth } from '@/features/auth/AuthProvider'
import { refs, useLiveQuery, type AppNotification } from '@/lib/firestore'
import { DEFAULT_NOTIFICATION_PREFS } from '@/shared/schemas'

/** Whether a notification type is switched on in my profile. Hidden types don't show or count. */
export function useWantsNotification(): (n: Pick<AppNotification, 'type'>) => boolean {
  const { profile } = useAuth()
  const prefs = { ...DEFAULT_NOTIFICATION_PREFS, ...(profile?.notificationPrefs ?? {}) }
  return (n) => prefs[n.type] !== false
}

export function useUnreadCount(uid: string): number {
  const wants = useWantsNotification()
  const q = query(refs.notifications(uid), where('read', '==', false), limit(99))
  return useLiveQuery<AppNotification>(q, `unread:${uid}`).data.filter(wants).length
}
