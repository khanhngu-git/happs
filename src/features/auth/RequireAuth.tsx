import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './AuthProvider'
import { FullScreenLoader } from '@/components/FullScreenLoader'
import { useEffect } from 'react'
import { clearNext, peekNext } from './redirects'

/** Guards every route except /login, /signup and /reset. */
export function RequireAuth() {
  const { user, initializing } = useAuth()
  const location = useLocation()
  useEffect(() => {
    if (user) clearNext()
  }, [user])
  if (initializing) return <FullScreenLoader />
  if (!user) {
    const next = location.pathname + location.search
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  return <Outlet />
}

/** Sends signed-in users away from the auth screens. */
export function RedirectIfSignedIn() {
  const { user, initializing } = useAuth()
  const location = useLocation()
  if (initializing) return <FullScreenLoader />
  if (user) {
    return <Navigate to={peekNext(new URLSearchParams(location.search).get('next'))} replace />
  }
  return <Outlet />
}
