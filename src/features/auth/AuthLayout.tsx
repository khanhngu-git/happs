import type { ReactNode } from 'react'

/** Shared frame for sign-in screens: brand in the content layer, form below. */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-grouped pt-safe pb-safe">
      <div className="relative overflow-hidden bg-gradient-to-b from-primary/18 via-primary/6 to-transparent">
        <div className="mx-auto max-w-sm px-6 pt-14 pb-8">
          <img src="/pwa-192x192.png" alt="" className="mb-5 size-16 rounded-[1.1rem] shadow-md" />
          <h1 className="large-title">{title}</h1>
          {subtitle && <p className="mt-2 text-[1.0625rem] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <main className="mx-auto w-full max-w-sm flex-1 px-6 pb-10">{children}</main>
      {footer && <footer className="mx-auto w-full max-w-sm px-6 pb-8 text-center text-sm text-muted-foreground">{footer}</footer>}
    </div>
  )
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

export function Divider({ label }: { label: string }) {
  return (
    <div className="my-6 flex items-center gap-3 text-sm text-muted-foreground" role="separator">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="text-sm text-destructive" role="alert">
      {message}
    </p>
  )
}
