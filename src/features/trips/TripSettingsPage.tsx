import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { doc, limit, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { Copy, Link2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { refs, useLiveQuery } from '@/lib/firestore'
import { db } from '@/lib/firebase'
import { TripForm } from './TripForm'
import { useTrip } from './TripContext'
import { deleteTrip, updateTrip } from './tripApi'
import { removeByUrl, uploadTripCover } from '@/lib/uploads'

export function TripSettingsPage() {
  const { trip, isOwner } = useTrip()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const hasExpenses = useLiveQuery(query(refs.expenses(trip.id), limit(1)), `anyExpense:${trip.id}`).data.length > 0
  if (!isOwner) return <Navigate to={`/trips/${trip.id}/itinerary`} replace />

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-grouped">
      <PageHeader backTo={`/trips/${trip.id}/itinerary`} backLabel={trip.name} title={<h1 className="large-title">Trip settings</h1>} />
      <main className="mx-auto max-w-lg space-y-8 pt-3 pb-16">
        <div className="px-4">
          <TripForm
            initial={trip}
            defaultCurrency={trip.baseCurrency}
            currencyLocked={hasExpenses}
            submitLabel="Save changes"
            onSubmit={async (input, photo) => {
              try {
                let coverPhotoURL = trip.coverPhotoURL
                if (photo) coverPhotoURL = await uploadTripCover(trip.id, photo, trip.coverPhotoURL)
                else if (photo === null && trip.coverPhotoURL) {
                  await removeByUrl(trip.coverPhotoURL)
                  coverPhotoURL = null
                }
                await updateTrip(trip.id, { ...input, coverPhotoURL })
                toast.success('Trip updated')
                navigate(`/trips/${trip.id}/itinerary`)
              } catch {
                toast.error('Couldn’t save. Only the owner can edit trip details.')
              }
            }}
          />
        </div>
        <ShareLinkSection />
        <div className="px-4">
          <Button variant="destructive" className="w-full" onClick={() => setConfirmDelete(true)}>
            <Trash2 /> Delete trip
          </Button>
        </div>
      </main>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${trip.name}?`}
        description="This permanently deletes the itinerary, expenses and payment history for everyone. It can’t be undone."
        confirmLabel="Delete for everyone"
        destructive
        onConfirm={async () => {
          await deleteTrip(trip.id)
          toast.success('Trip deleted')
          navigate('/', { replace: true })
        }}
      />
    </div>
  )
}

/** 32 random letters and digits (about 190 bits): unguessable. */
function newShareToken(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

/** Read-only link for people who aren't on the trip: the plan only, no costs or notes. */
function ShareLinkSection() {
  const { trip } = useTrip()
  const [busy, setBusy] = useState(false)
  const url = trip.shareToken ? `${location.origin}/share/${trip.shareToken}` : null
  const set = async (shareToken: string | null) => {
    setBusy(true)
    try {
      await updateDoc(doc(db, 'trips', trip.id), { shareToken, updatedAt: serverTimestamp() })
      toast.success(shareToken ? 'Read-only link is on' : 'Read-only link turned off')
    } catch {
      toast.error('Couldn’t change the link')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-2 px-4" aria-labelledby="share-link">
      <h2 id="share-link" className="px-1 text-[0.8125rem] font-semibold tracking-wide text-muted-foreground uppercase">
        Read-only link
      </h2>
      <div className="space-y-3 rounded-[1.25rem] bg-card p-4 ring-1 ring-border/70">
        <p className="text-sm text-muted-foreground">For family or friends who aren’t coming: they can see the plan and the map without signing in. Costs, notes, bookings and who’s going stay private.</p>
        {url ? (
          <>
            <p className="font-mono text-sm break-all select-all">{url}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => navigator.clipboard.writeText(url).then(() => toast.success('Link copied'), () => toast.error('Couldn’t copy'))}>
                <Copy /> Copy link
              </Button>
              <Button variant="ghost" className="text-destructive" disabled={busy} onClick={() => set(null)}>
                Turn off
              </Button>
            </div>
          </>
        ) : (
          <Button variant="secondary" className="w-full" disabled={busy} onClick={() => set(newShareToken())}>
            <Link2 /> Create read-only link
          </Button>
        )}
      </div>
    </section>
  )
}
