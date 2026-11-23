import { LiveAlerts } from '@/features/notifications/LiveAlerts'
import { Outlet } from 'react-router'

/** Frame for signed-in screens: the grouped background behind content cards. */
export function AppLayout() {
  return (
    <div className="min-h-dvh bg-grouped">
      <Outlet />
      <LiveAlerts />
    </div>
  )
}
