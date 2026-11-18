const NEXT_KEY = 'happs.nextPath'

/** Only allow same-app relative paths to avoid open redirects. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/login')) return '/'
  return next
}

export function rememberNext(next: string) {
  sessionStorage.setItem(NEXT_KEY, safeNext(next))
}

export function consumeNext(fallback: string | null): string {
  const stored = sessionStorage.getItem(NEXT_KEY)
  sessionStorage.removeItem(NEXT_KEY)
  return safeNext(fallback ?? stored)
}

/** Where to go after sign-in: the ?next param, else what we stashed before a redirect sign-in. */
export function peekNext(param: string | null): string {
  return safeNext(param ?? sessionStorage.getItem(NEXT_KEY))
}

export function clearNext() {
  sessionStorage.removeItem(NEXT_KEY)
}
