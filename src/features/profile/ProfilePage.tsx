import { useEffect, useState } from 'react'
import { updateProfile } from 'firebase/auth'
import { doc, updateDoc, writeBatch } from 'firebase/firestore'
import { KeyRound, LogOut, MessageSquare, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, LargeTitle } from '@/components/PageHeader'
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
import { DEFAULT_NOTIFICATION_PREFS, type NotificationType } from '@/shared/schemas'
import { FeedbackDialog } from './FeedbackDialog'
import { FullScreenLoader } from '@/components/FullScreenLoader'

const PREF_LABELS: Record<NotificationType, { title: string; hint: string }> = {
  shareSent: { title: 'Someone says they paid you', hint: 'So you can confirm it arrived' },
  shareConfirmed: { title: 'Your payment was confirmed', hint: '' },
  shareDisputed: { title: 'Your payment wasn’t received', hint: '' },
  confirmReminder: { title: 'Reminders to confirm', hint: 'After 48 hours waiting' },
  memberJoined: { title: 'Someone joined a trip', hint: '' },
  itemChanged: { title: 'Plans added or changed', hint: 'Can be chatty in busy trips' },
}

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
  const [photo, setPhoto] = useState(profile?.photoURL ?? '')
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

  async function saveProfile() {
    const displayName = name.trim()
    if (!displayName) return toast.error('Your name can’t be empty')
    const photoURL = photo.trim() || null
    try {
      // Profile + the denormalised copy in every trip's members subcollection.
      const b = writeBatch(db)
      b.update(doc(db, 'users', user.uid), { displayName, photoURL })
      trips.forEach((t) => b.update(doc(db, 'trips', t.id, 'members', user.uid), { displayName, photoURL }))
      await b.commit()
      await updateProfile(user, { displayName, photoURL })
      toast.success('Profile saved')
    } catch (err) {
      console.error(err)
      toast.error('Couldn’t save your profile')
    }
  }

  const setPref = (type: NotificationType, on: boolean) =>
    updateDoc(doc(db, 'users', user.uid), { notificationPrefs: { ...prefs, [type]: on } }).catch(() => toast.error('Couldn’t save'))

  return (
    <>
      <PageHeader backTo="/" backLabel="Trips" />
      <main className="mx-auto max-w-lg space-y-7 px-4 pb-20">
        <LargeTitle className="px-0">Profile</LargeTitle>

        <Group title="You">
          <div className="space-y-4 p-4">
            <div className="flex items-center gap-4">
              <UserAvatar name={name} photoURL={photo || null} className="size-16 text-lg" />
              <div className="text-sm text-muted-foreground">{user.email}</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-name">Display name</Label>
              <Input id="p-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-photo">Photo URL</Label>
              <Input id="p-photo" type="url" value={photo} placeholder="https://…" onChange={(e) => setPhoto(e.target.value)} />
              {googlePhoto && photo !== googlePhoto && (
                <Button type="button" variant="link" className="h-auto p-0" onClick={() => setPhoto(googlePhoto)}>
                  Use my Google photo
                </Button>
              )}
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
            <Button onClick={saveProfile} className="w-full">
              Save profile
            </Button>
          </div>
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
          {(Object.keys(PREF_LABELS) as NotificationType[]).map((t) => (
            <label key={t} className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="block">{PREF_LABELS[t].title}</span>
                {PREF_LABELS[t].hint && <span className="block text-sm text-muted-foreground">{PREF_LABELS[t].hint}</span>}
              </span>
              <Switch checked={prefs[t]} onCheckedChange={(on) => setPref(t, on)} aria-label={PREF_LABELS[t].title} />
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
