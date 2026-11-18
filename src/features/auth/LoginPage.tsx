import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authErrorMessage, hasPendingLink, NeedsLinkingError, signInWithEmail, signInWithGoogle } from './authApi'
import { AuthLayout, Divider, FieldError, GoogleIcon } from './AuthLayout'
import { useAuth } from './AuthProvider'
import { rememberNext } from './redirects'

const schema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
})
type Values = z.infer<typeof schema>

export function LoginPage() {
  const [params] = useSearchParams()
  const next = params.get('next')
  const { linkingEmail, clearLinking } = useAuth()
  const [googleBusy, setGoogleBusy] = useState(false)
  const [linkEmail, setLinkEmail] = useState<string | null>(linkingEmail)
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: linkingEmail ?? '', password: '' } })
  const { errors, isSubmitting } = form.formState
  const linking = linkEmail !== null || hasPendingLink()

  async function google() {
    setGoogleBusy(true)
    if (next) rememberNext(next)
    try {
      await signInWithGoogle()
    } catch (err) {
      if (err instanceof NeedsLinkingError) {
        setLinkEmail(err.email ?? '')
        if (err.email) form.setValue('email', err.email)
      }
      toast.error(authErrorMessage(err))
    } finally {
      setGoogleBusy(false)
    }
  }

  const onSubmit = form.handleSubmit(async ({ email, password }) => {
    try {
      await signInWithEmail(email, password)
      if (linking) toast.success('Google is now linked to your account')
      clearLinking()
    } catch (err) {
      toast.error(authErrorMessage(err))
    }
  })

  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : ''

  return (
    <AuthLayout
      title="Welcome to happs"
      subtitle={next?.startsWith('/join/') ? 'Sign in to join the trip you were invited to.' : 'Plan trips with friends. Split costs without the awkwardness.'}
      footer={
        <>
          New here?{' '}
          <Link to={`/signup${nextQuery}`} className="font-semibold text-primary underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <Button size="lg" variant="outline" className="h-14 w-full text-base shadow-sm" onClick={google} disabled={googleBusy}>
        <GoogleIcon />
        {googleBusy ? 'Opening Google…' : 'Continue with Google'}
      </Button>

      <Divider label="or use email" />

      {linking && (
        <div className="mb-4 rounded-2xl bg-primary/10 p-4 text-sm" role="status">
          This email already has a happs account. Sign in with your password once and we’ll link Google to it.
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.email} aria-describedby="email-error" {...form.register('email')} />
          <FieldError id="email-error" message={errors.email?.message} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/reset" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} aria-describedby="password-error" {...form.register('password')} />
          <FieldError id="password-error" message={errors.password?.message} />
        </div>
        <Button type="submit" variant="secondary" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : linking ? 'Sign in and link Google' : 'Sign in with email'}
        </Button>
      </form>
    </AuthLayout>
  )
}
