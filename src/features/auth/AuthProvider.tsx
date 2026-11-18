import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth } from '@/lib/firebase'
import { refs, useLiveDoc, type UserProfile } from '@/lib/firestore'
import { DEFAULT_NOTIFICATION_PREFS } from '@/shared/schemas'
import { guessCurrency } from '@/shared/money'
import { toast } from 'sonner'
import { authErrorMessage, completeRedirectSignIn, NeedsLinkingError } from './authApi'

interface AuthState {
  user: User | null
  profile: UserProfile | null
  /** True until Firebase has told us whether someone is signed in. */
  initializing: boolean
  /** Set when a Google redirect sign-in needs the password account linked. */
  linkingEmail: string | null
  clearLinking(): void
  /** Re-read the auth user (e.g. after verifying email in another tab). */
  refreshUser(): Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/** Create users/{uid} the first time someone signs in. */
async function ensureUserDoc(user: User) {
  const ref = refs.user(user.uid)
  try {
    const snap = await getDoc(ref)
    if (snap.exists()) return
    await setDoc(ref, {
      displayName: user.displayName || user.email?.split('@')[0] || 'Traveller',
      email: user.email,
      photoURL: user.photoURL,
      defaultCurrency: guessCurrency(navigator.language),
      notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      createdAt: serverTimestamp(),
    } as never)
  } catch (err) {
    // Offline on first launch: we'll retry on the next sign-in.
    console.warn('Could not create user profile yet', err)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.currentUser)
  const [initializing, setInitializing] = useState(true)
  const [linkingEmail, setLinkingEmail] = useState<string | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    completeRedirectSignIn().catch((err) => {
      if (err instanceof NeedsLinkingError) setLinkingEmail(err.email ?? '')
      else {
        console.error('Redirect sign-in failed', err)
        toast.error(authErrorMessage(err))
      }
    })
    return onAuthStateChanged(auth, async (u) => {
      if (u) await ensureUserDoc(u)
      setUser(u)
      setInitializing(false)
    })
  }, [])

  const { data: profile } = useLiveDoc(user ? refs.user(user.uid) : null)

  const value: AuthState = {
    user,
    profile,
    initializing,
    linkingEmail,
    clearLinking: () => setLinkingEmail(null),
    refreshUser: async () => {
      await auth.currentUser?.reload()
      setUser(auth.currentUser)
      setTick((t) => t + 1)
    },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** The signed-in user; only call inside routes wrapped by <RequireAuth>. */
// eslint-disable-next-line react-refresh/only-export-components
export function useUser(): User {
  const { user } = useAuth()
  if (!user) throw new Error('useUser called without a signed-in user')
  return user
}
