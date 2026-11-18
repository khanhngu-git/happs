/**
 * Auth actions. Google is primary: popup on desktop, redirect on mobile and
 * in standalone PWA mode (popups are unreliable there).
 */
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getRedirectResult,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  OAuthCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  updateProfile,
  type AuthError,
  type User,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'

const PENDING_KEY = 'happs.pendingGoogleCredential'

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform))
}

function googleProvider() {
  const p = new GoogleAuthProvider()
  p.setCustomParameters({ prompt: 'select_account' })
  return p
}

export class NeedsLinkingError extends Error {
  constructor(public email: string | null) {
    super('An account already exists with this email. Sign in with your password to link Google.')
    this.name = 'NeedsLinkingError'
  }
}

/**
 * Google sign-in fails with account-exists-with-different-credential when the
 * email belongs to a password account. Stash the Google credential, ask for
 * the password, then link it (see `completePendingLink`).
 */
function handleLinkingError(err: unknown): never {
  const e = err as AuthError
  if (e?.code === 'auth/account-exists-with-different-credential') {
    const cred = GoogleAuthProvider.credentialFromError(e)
    if (cred) sessionStorage.setItem(PENDING_KEY, JSON.stringify(cred.toJSON()))
    throw new NeedsLinkingError((e.customData?.email as string | undefined) ?? null)
  }
  throw err
}

export async function signInWithGoogle(): Promise<void> {
  const usePopup = !isMobile() && !isStandalone()
  try {
    if (usePopup) await signInWithPopup(auth, googleProvider())
    else await signInWithRedirect(auth, googleProvider())
  } catch (err) {
    const code = (err as AuthError)?.code
    // Popup blocked → fall back to redirect.
    if (usePopup && (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment')) {
      await signInWithRedirect(auth, googleProvider())
      return
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return
    handleLinkingError(err)
  }
}

/** Call once on app load to finish a redirect sign-in. */
export async function completeRedirectSignIn(): Promise<void> {
  try {
    await getRedirectResult(auth)
  } catch (err) {
    handleLinkingError(err)
  }
}

export function hasPendingLink(): boolean {
  return !!sessionStorage.getItem(PENDING_KEY)
}

export async function completePendingLink(user: User): Promise<boolean> {
  const raw = sessionStorage.getItem(PENDING_KEY)
  if (!raw) return false
  sessionStorage.removeItem(PENDING_KEY)
  const cred = OAuthCredential.fromJSON(raw)
  if (!cred) return false
  try {
    await linkWithCredential(user, cred)
    return true
  } catch (err) {
    if ((err as AuthError).code === 'auth/provider-already-linked') return true
    throw err
  }
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { user } = await signInWithEmailAndPassword(auth, email, password)
  await completePendingLink(user)
}

export async function signUpWithEmail(name: string, email: string, password: string): Promise<User> {
  const { user } = await createUserWithEmailAndPassword(auth, email, password)
  await updateProfile(user, { displayName: name })
  await sendEmailVerification(user).catch(() => undefined)
  return user
}

export async function resendVerification(): Promise<void> {
  if (auth.currentUser) await sendEmailVerification(auth.currentUser)
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email)
}

/** For Google-only users who want to add a password sign-in. */
export async function addPasswordToAccount(password: string): Promise<void> {
  const user = auth.currentUser
  if (!user?.email) throw new Error('No email on this account')
  await linkWithCredential(user, EmailAuthProvider.credential(user.email, password))
}

export async function linkGoogle(): Promise<void> {
  if (!auth.currentUser) return
  await linkWithPopup(auth.currentUser, googleProvider())
}

export async function signOut(): Promise<void> {
  await fbSignOut(auth)
}

/** Turn Firebase auth error codes into friendly messages. */
export function authErrorMessage(err: unknown): string {
  if (err instanceof NeedsLinkingError) return err.message
  const code = (err as AuthError)?.code ?? ''
  const map: Record<string, string> = {
    'auth/invalid-credential': 'That email and password don’t match.',
    'auth/wrong-password': 'That email and password don’t match.',
    'auth/user-not-found': 'No account with that email. Sign up instead?',
    'auth/email-already-in-use':
      'This email already has an account. Sign in with Google or your password (you can add a password later in Profile).',
    'auth/weak-password': 'Use at least 6 characters for your password.',
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/network-request-failed': 'Network problem. Check your connection.',
    'auth/requires-recent-login': 'Please sign out and in again, then retry.',
    'auth/credential-already-in-use': 'That Google account is already linked to another happs account.',
  }
  return map[code] ?? (err instanceof Error ? err.message : 'Something went wrong.')
}
