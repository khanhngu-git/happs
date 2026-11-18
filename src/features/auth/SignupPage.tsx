import { Link, useSearchParams } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authErrorMessage, signInWithGoogle, signUpWithEmail } from './authApi'
import { AuthLayout, Divider, FieldError, GoogleIcon } from './AuthLayout'
import { rememberNext } from './redirects'

const schema = z.object({
  name: z.string().trim().min(1, 'What should friends call you?').max(60),
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters'),
})
type Values = z.infer<typeof schema>

export function SignupPage() {
  const [params] = useSearchParams()
  const next = params.get('next')
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', password: '' } })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ name, email, password }) => {
    try {
      await signUpWithEmail(name, email, password)
      toast.success('Account created. Check your inbox to verify your email.')
    } catch (err) {
      toast.error(authErrorMessage(err))
    }
  })

  async function google() {
    if (next) rememberNext(next)
    try {
      await signInWithGoogle()
    } catch (err) {
      toast.error(authErrorMessage(err))
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="It takes about 20 seconds."
      footer={
        <>
          Already have an account?{' '}
          <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <Button size="lg" variant="outline" className="h-14 w-full text-base shadow-sm" onClick={google}>
        <GoogleIcon />
        Sign up with Google
      </Button>
      <Divider label="or use email" />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" autoComplete="name" aria-invalid={!!errors.name} aria-describedby="name-error" {...form.register('name')} />
          <FieldError id="name-error" message={errors.name?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.email} aria-describedby="email-error" {...form.register('email')} />
          <FieldError id="email-error" message={errors.email?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby="password-error" {...form.register('password')} />
          <FieldError id="password-error" message={errors.password?.message} />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  )
}
