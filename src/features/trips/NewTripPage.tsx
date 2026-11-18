import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { useAuth, useUser } from '@/features/auth/AuthProvider'
import { TripForm } from './TripForm'
import { createTrip, updateTrip } from './tripApi'
import { uploadTripCover } from '@/lib/uploads'

export function NewTripPage() {
  const user = useUser()
  const { profile } = useAuth()
  const navigate = useNavigate()
  return (
    <>
      <PageHeader backTo="/" backLabel="Trips" title={<h1 className="large-title">New trip</h1>} />
      <main className="mx-auto max-w-lg pb-10">
        <p className="px-4 pb-4 text-[0.9375rem] text-muted-foreground">You can invite friends right after.</p>
        <div className="px-4">
          <TripForm
            defaultCurrency={profile?.defaultCurrency ?? 'AUD'}
            submitLabel="Create trip"
            onSubmit={async (input, photo) => {
              try {
                const id = await createTrip(user, profile, input)
                // The cover can only be uploaded once the trip exists (storage rules check ownership).
                if (photo) await uploadTripCover(id, photo).then((url) => updateTrip(id, { coverPhotoURL: url })).catch(() => toast.error('Trip created, but the cover photo didn’t upload.'))
                toast.success('Trip created')
                navigate(`/trips/${id}/members?invite=1`, { replace: true })
              } catch (err) {
                console.error(err)
                toast.error('Couldn’t create the trip. Try again.')
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
