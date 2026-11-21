import { useEffect, useState } from 'react'
import { updateProfile } from 'firebase/auth'
import { doc, updateDoc, writeBatch } from 'firebase/firestore'
import { KeyRound, Loader2, LogOut, MessageSquare, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { UserAvatar } from '@/components/UserAvatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useAuth, useUser } from '@/features/auth/AuthProvider'
import { addPasswordToAccount, authErrorMessage, linkGoogle, signOut } from '@/features/auth/authApi'
import { useMyTrips } from '@/features/trips/tripApi'
import { disablePush, enablePush, pushState, type PushState } from '@/features/notifications/push'
import { db } from '@/lib/firebase'
import { api, callableMessage } from '@/lib/functions'
import { COMMON_CURRENCIES } from '@/shared/money'
import { DEFAULT_NOTIFICATION_PREFS, type NotificationType, type PayTo } from '@/shared/schemas'
import { FeedbackDialog } from './FeedbackDialog'
import { PhotoPicker } from '@/components/PhotoPicker'
import { removeByUrl, uploadAvatar } from '@/lib/uploads'
import { FullScreenLoader } from '@/components/FullScreenLoader'

/**
 * A few simple switches. Each one covers a group of notification types the
 * server sends (see NotificationType); a group is "on" if any of its types is.
 */
const PREF_GROUPS: { key: string; title: string; hint: string; types: NotificationType[] }[] = [
  { key: 'itinerary', title: 'Itinerary changes', hint: 'Plans added or edited', types: ['itemChanged'] },
  { key: 'expenses', title: 'New costs', hint: 'Someone adds a cost you share', types: ['expenseAdded'] },
  { key: 'payments', title: 'Payments', hint: 'Paid, confirmed or not received', types: ['shareSent', 'shareConfirmed', 'shareDisputed', 'confirmReminder'] },
  { key: 'tomorrow', title: 'Day-before summary', hint: 'Tomorrow’s first plans, the evening before', types: ['tripTomorrow'] },
  { key: 'members', title: 'Trip members', hint: 'Someone joins, or a trip is deleted', types: ['memberJoined', 'tripDeleted'] },
]

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[0.8125rem] font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      <div className="divide-y divide-border/70 overflow-hidden rounded-[1.25rem] bg-card ring-1 ring-border/70">{children}</div>
    </section>
  )
}

/** Waits for the profile doc so the form starts with real values. */
export function ProfilePage() {
  const { profile } = useAuth()
  return profile ? <ProfileForm /> : <FullScreenLoader />
}

function ProfileForm() {
  const user = useUser()
  const { profile } = useAuth()
  const { data: trips } = useMyTrips(user.uid)
  const [name, setName] = useState(profile?.displayName ?? '')
  const [payTo, setPayTo] = useState<PayTo>({ payId: profile?.payTo?.payId ?? '', paypalMe: profile?.payTo?.paypalMe ?? '', bank: profile?.payTo?.bank ?? '' })
  const payToSaved = JSON.stringify({ payId: profile?.payTo?.payId ?? '', paypalMe: profile?.payTo?.paypalMe ?? '', bank: profile?.payTo?.bank ?? '' })
  const [push, setPush] = useState<PushState>('off')
  const [password, setPassword] = useState('')
  const [feedback, setFeedback] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const providers = user.providerData.map((p) => p.providerId)
  const googlePhoto = user.providerData.find((p) => p.providerId === 'google.com')?.photoURL
  const prefs = { ...DEFAULT_NOTIFICATION_PREFS, ...(profile?.notificationPrefs ?? {}) }

  useEffect(() => {
    pushState().then(setPush, () => setPush('unsupported'))
  }, [])

  /** Name and photo live on the profile and, denormalised, in each trip's member doc. */
  async function writeIdentity(patch: { displayName?: string; photoURL?: string | null; payTo?: PayTo | null }) {
    const b = writeBatch(db)
    b.update(doc(db, 'users', user.uid), patch)
    trips.forEach((t) => b.update(doc(db, 'trips', t.id, 'members', user.uid), patch))
    await b.commit()
    // Auth wants strings: an empty photoURL clears it (null is rejected).
    const authPatch: { displayName?: string; photoURL?: string } = {}
    if (patch.displayName !== undefined) authPatch.displayName = patch.displayName
    if (patch.photoURL !== undefined) authPatch.photoURL = patch.photoURL ?? ''
    if (Object.keys(authPatch).length) await updateProfile(user, authPatch)
  }

  async function saveName() {
    const displayName = name.trim()
    if (!displayName) return toast.error('Your name can’t be empty')
    try {
      await writeIdentity({ displayName })
      toast.success('Name saved')
    } catch (err) {
      console.error(err)
      toast.error('Couldn’t save your name')
    }
  }

  async function setPhoto(file: File | null) {
    const previous = profile?.photoURL
    if (file) {
      const url = await uploadAvatar(user.uid, file, previous)
      await writeIdentity({ photoURL: url })
      toast.success('Photo updated')
    } else {
      await writeIdentity({ photoURL: null })
      if (previous) await removeByUrl(previous)
    }
  }

  const setGroup = (types: NotificationType[], on: boolean) =>
    updateDoc(doc(db, 'users', user.uid), { notificationPrefs: { ...prefs, ...Object.fromEntries(types.map((t) => [t, on])) } }).catch(() => toast.error('Couldn’t save'))

  return (
    <>
      <PageHeader backTo="/" backLabel="Trips" title={<h1 className="large-title">Profile</h1>} />
      <main className="mx-auto max-w-lg space-y-7 px-4 pt-3 pb-20">

        <Group title="You">
          <div className="space-y-4 p-4">
            <PhotoPicker label="Choose a profile photo" onPick={(f) => setPhoto(f)}>
              {(busy, open) => (
                <div className="flex items-center gap-4">
                  <button type="button" onClick={open} disabled={busy} className="relative rounded-full active:opacity-70" aria-label="Change profile photo">
                    <UserAvatar name={name} photoURL={profile?.photoURL ?? null} className="size-20 text-xl" />
                    {busy && <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40"><Loader2 className="size-6 animate-spin text-white" /></span>}
                  </button>
                  <div className="flex flex-col items-start gap-1">
                    <button type="button" onClick={open} disabled={busy} className="min-h-9 text-[1.0625rem] font-medium text-primary">
                      {busy ? 'Uploading…' : profile?.photoURL ? 'Change photo' : 'Add photo'}
                    </button>
                    {profile?.photoURL && !busy && (
                      <button type="button" onClick={() => setPhoto(null).catch(() => toast.error('Couldn’t remove the photo'))} className="min-h-9 text-[0.9375rem] text-destructive">
                        Remove photo
                      </button>
                    )}
                    {googlePhoto && profile?.photoURL !== googlePhoto && !busy && (
                      <button type="button" onClick={() => writeIdentity({ photoURL: googlePhoto })} className="min-h-9 text-[0.9375rem] text-primary">
                        Use Google photo
                      </button>
                    )}
                  </div>
                </div>
              )}
            </PhotoPicker>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <div className="space-y-2">
              <Label htmlFor="p-name">Display name</Label>
              <div className="flex gap-2">
                <Input id="p-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
                <Button variant="secondary" onClick={saveName} disabled={name.trim() === (profile?.displayName ?? '')}>
                  Save
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-cur">Default currency for new trips</Label>
              <NativeSelect
                id="p-cur"
                value={profile?.defaultCurrency ?? 'AUD'}
                onChange={(e) => updateDoc(doc(db, 'users', user.uid), { defaultCurrency: e.target.value }).then(() => toast.success('Saved'))}
              >
                {[...new Set([profile?.defaultCurrency ?? 'AUD', ...COMMON_CURRENCIES])].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </NativeSelect>
            </div>
          </div>
        </Group>

        <Group title="Getting paid back">
          <form
            className="space-y-4 p-4"
            onSubmit={async (e) => {
              e.preventDefault()
              const clean = { payId: payTo.payId.trim(), paypalMe: payTo.paypalMe.trim(), bank: payTo.bank.trim() }
              try {
                await writeIdentity({ payTo: clean.payId || clean.paypalMe || clean.bank ? clean : null })
                toast.success('Saved. Friends will see this when they pay you.')
              } catch (err) {
                console.error(err)
                toast.error('Couldn’t save')
              }
            }}
          >
            <p className="text-sm text-muted-foreground">Shown to people who owe you, so paying you is one tap. Only trip members see it.</p>
            <div className="space-y-2">
              <Label htmlFor="p-payid">PayID (phone or email)</Label>
              <Input id="p-payid" maxLength={100} value={payTo.payId} onChange={(e) => setPayTo({ ...payTo, payId: e.target.value })} placeholder="0412 345 678" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-paypal">PayPal.me username</Label>
              <Input id="p-paypal" maxLength={100} value={payTo.paypalMe} onChange={(e) => setPayTo({ ...payTo, paypalMe: e.target.value })} placeholder="paypal.me/yourname" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-bank">Bank details</Label>
              <Input id="p-bank" maxLength={200} value={payTo.bank} onChange={(e) => setPayTo({ ...payTo, bank: e.target.value })} placeholder="BSB 062-000, account 1234 5678" />
            </div>
            <Button type="submit" variant="secondary" disabled={JSON.stringify(payTo) === payToSaved}>
              Save payment details
            </Button>
          </form>
        </Group>

        <Group title="Notifications">
          <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="font-medium">Push notifications on this device</p>
              <p className="text-sm text-muted-foreground">
                {push === 'enabled' && 'On'}
                {push === 'off' && 'Off'}
                {push === 'denied' && 'Blocked in your browser settings'}
                {push === 'unsupported' && 'Not supported here. On iPhone, add happs to your home screen first.'}
                {push === 'unconfigured' && 'Not configured for this build'}
              </p>
            </div>
            <Switch
              checked={push === 'enabled'}
              disabled={push !== 'enabled' && push !== 'off'}
              aria-label="Push notifications"
              onCheckedChange={async (on) => {
                if (on) {
                  const s = await enablePush()
                  setPush(s)
                  if (s !== 'enabled') toast.error(s === 'denied' ? 'Notifications are blocked in your browser settings.' : 'Couldn’t turn on notifications.')
                } else {
                  await disablePush()
                  setPush('off')
                }
              }}
            />
          </div>
          {PREF_GROUPS.map((g) => (
            <label key={g.key} className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-2.5">
              <span>
                <span className="block text-[1.0625rem]">{g.title}</span>
                <span className="block text-sm text-muted-foreground">{g.hint}</span>
              </span>
              <Switch checked={g.types.some((t) => prefs[t])} onCheckedChange={(on) => setGroup(g.types, on)} aria-label={g.title} />
            </label>
          ))}
        </Group>

        <Group title="Sign-in methods">
          <div className="space-y-3 p-4">
            <p className="text-[0.9375rem]">
              {providers.includes('google.com') && 'Google'}
              {providers.includes('google.com') && providers.includes('password') && ' and '}
              {providers.includes('password') && 'email & password'}
            </p>
            {!providers.includes('google.com') && (
              <Button variant="secondary" className="w-full" onClick={() => linkGoogle().then(() => toast.success('Google linked'), (e) => toast.error(authErrorMessage(e)))}>
                Link Google account
              </Button>
            )}
            {!providers.includes('password') && user.email && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  addPasswordToAccount(password).then(
                    () => {
                      toast.success('Password added. You can now sign in with email too.')
                      setPassword('')
                    },
                    (err) => toast.error(authErrorMessage(err)),
                  )
                }}
              >
                <Input type="password" autoComplete="new-password" aria-label="New password" placeholder="Add a password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <Button type="submit" variant="secondary" disabled={password.length < 8}>
                  <KeyRound /> Add
                </Button>
              </form>
            )}
          </div>
        </Group>

        <div className="space-y-2">
          <Button variant="secondary" className="w-full" onClick={() => setFeedback(true)}>
            <MessageSquare /> Send feedback
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => signOut()}>
            <LogOut /> Sign out
          </Button>
          <Button variant="destructive" className="w-full" onClick={() => setDeleting(true)}>
            <Trash2 /> Delete account
          </Button>
          <p className="pt-2 text-center text-xs text-muted-foreground">happs v{__APP_VERSION__}</p>
        </div>
      </main>
      <FeedbackDialog open={feedback} onOpenChange={setFeedback} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete your account?"
        description="You’ll be removed from all your trips and your profile is deleted. This only works once every payment involving you is confirmed. It can’t be undone."
        confirmLabel="Delete my account"
        destructive
        onConfirm={async () => {
          try {
            await api.deleteAccount({})
            await signOut()
            toast.success('Your account was deleted')
          } catch (err) {
            toast.error(callableMessage(err), { duration: 8000 })
          }
        }}
      />
    </>
  )
}
