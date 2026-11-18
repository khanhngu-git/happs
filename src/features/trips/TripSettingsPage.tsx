import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { limit, query } from 'firebase/firestore'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { refs, useLiveQuery } from '@/lib/firestore'
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
