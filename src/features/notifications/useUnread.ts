import { limit, query, where } from 'firebase/firestore'
import { refs, useLiveQuery } from '@/lib/firestore'

export function useUnreadCount(uid: string): number {
  const q = query(refs.notifications(uid), where('read', '==', false), limit(99))
  return useLiveQuery(q, `unread:${uid}`).data.length
}
