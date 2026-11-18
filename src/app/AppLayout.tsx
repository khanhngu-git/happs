import { Outlet } from 'react-router'
import { VerifyEmailBanner } from '@/features/auth/VerifyEmailBanner'

/** Frame for signed-in screens. */
export function AppLayout() {
  return (
    <div className="min-h-dvh bg-grouped">
      <VerifyEmailBanner />
      <Outlet />
    </div>
  )
}
