import { useState } from 'react'
import { Link } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resetPassword } from './authApi'
import { AuthLayout, FieldError } from './AuthLayout'

const schema = z.object({ email: z.email('Enter a valid email') })

export function ResetPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const form = useForm<{ email: string }>({ resolver: zodResolver(schema), defaultValues: { email: '' } })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ email }) => {
    // Always show the same message so the form can't be used to discover accounts.
    await resetPassword(email).catch(() => undefined)
    setSentTo(email)
  })

  return (
    <AuthLayout
      title="Reset password"
      subtitle="We’ll email you a link to choose a new one."
      footer={
        <Link to="/login" className="font-semibold text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sentTo ? (
        <div className="flex gap-3 rounded-2xl bg-card p-4 ring-1 ring-border/70" role="status">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <p className="text-[0.9375rem]">If an account exists for <strong>{sentTo}</strong>, a reset link is on its way. Check your spam folder too.</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.email} aria-describedby="email-error" {...form.register('email')} />
            <FieldError id="email-error" message={errors.email?.message} />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
