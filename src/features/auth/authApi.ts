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

const REDIRECT_PENDING = 'happs.googleRedirectPending'

/**
 * Popup everywhere it works (desktop and mobile browsers, from a tap).
 * Redirect only in an installed PWA, where iOS opens popups in a separate
 * Safari window, or when the popup is blocked. Redirect relies on
 * same-origin auth (Firebase Hosting); see lib/firebase.ts.
 */
export async function signInWithGoogle(): Promise<void> {
  const useRedirect = isStandalone()
  try {
    if (useRedirect) return await startRedirect()
    await signInWithPopup(auth, googleProvider())
  } catch (err) {
    const code = (err as AuthError)?.code
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') return startRedirect()
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled') return
    handleLinkingError(err)
  }
}

async function startRedirect() {
  sessionStorage.setItem(REDIRECT_PENDING, String(Date.now()))
  await signInWithRedirect(auth, googleProvider())
}

export class RedirectIncompleteError extends Error {
  constructor() {
    super('Google sign-in didn’t finish. Please try again.')
    this.name = 'RedirectIncompleteError'
  }
}

/** Call once on app load to finish a redirect sign-in. */
export async function completeRedirectSignIn(): Promise<void> {
  const pending = sessionStorage.getItem(REDIRECT_PENDING)
  sessionStorage.removeItem(REDIRECT_PENDING)
  try {
    const result = await getRedirectResult(auth)
    // We started a redirect but came back with nothing: storage was lost on the way.
    if (pending && !result && !auth.currentUser) throw new RedirectIncompleteError()
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
  if (err instanceof NeedsLinkingError || err instanceof RedirectIncompleteError) return err.message
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
    'auth/unauthorized-domain': `This address (${location.hostname}) isn’t allowed to sign in. Add it under Firebase → Authentication → Settings → Authorized domains.`,
    'auth/operation-not-allowed': 'Google sign-in is turned off for this project. Enable it in Firebase → Authentication → Sign-in method.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
    'auth/internal-error': 'Google sign-in failed. Check your connection and try again.',
  }
  return map[code] ?? (err instanceof Error ? err.message : 'Something went wrong.')
}
