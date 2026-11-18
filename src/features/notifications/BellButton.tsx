import { Bell } from 'lucide-react'
import { Link } from 'react-router'
import { useUser } from '@/features/auth/AuthProvider'
import { useUnreadCount } from './useUnread'

/** Bell with an unread badge. The badge is a fill, not glass (no glass on glass). */
export function BellButton() {
  const user = useUser()
  const unread = useUnreadCount(user.uid)
  return (
    <Link
      to="/notifications"
      className="relative inline-flex size-11 items-center justify-center rounded-full hover:bg-foreground/6"
      aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <Bell className="size-[1.375rem]" aria-hidden />
      {unread > 0 && (
        <span className="absolute top-1.5 right-1 min-w-[1.125rem] rounded-full bg-destructive px-1 text-center text-[0.6875rem] leading-[1.125rem] font-bold text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  )
}
