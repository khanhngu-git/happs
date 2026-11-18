import { useState } from 'react'
import { MailWarning } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuth } from './AuthProvider'
import { resendVerification } from './authApi'

/** Non-blocking reminder for email/password users who haven't verified yet. */
export function VerifyEmailBanner() {
  const { user, refreshUser } = useAuth()
  const [dismissed, setDismissed] = useState(false)
  const isPasswordUser = user?.providerData.some((p) => p.providerId === 'password')
  if (!user || user.emailVerified || !isPasswordUser || dismissed) return null

  return (
    <div className="mx-4 mt-3 flex items-start gap-3 rounded-2xl bg-warning/15 p-3 text-sm sm:mx-auto sm:max-w-2xl" role="status">
      <MailWarning className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="flex-1">
        <p className="font-medium">Verify your email</p>
        <p>We sent a link to {user.email}. You can keep using happs in the meantime.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => resendVerification().then(() => toast.success('Sent again')).catch(() => toast.error('Couldn’t send. Try later.'))}>
            Resend
          </Button>
          <Button size="sm" variant="secondary" onClick={() => refreshUser()}>
            I’ve verified
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            Later
          </Button>
        </div>
      </div>
    </div>
  )
}
