import { useEffect, useState } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { CalendarPlus, Copy, MapPin, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/UserAvatar'
import { RouteActions } from '@/features/itinerary/RouteActions'
import type { Person } from '@/features/location/LiveLocationProvider'
import { ageLabel } from '@/features/location/liveLocation'
import type { Location } from '@/shared/schemas'

function CloseButton({ onClose }: { onClose(): void }) {
  return (
    <button type="button" onClick={onClose} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground/8" aria-label="Close">
      <X className="size-4" />
    </button>
  )
}

/** Tapped a member's live pin: who, how fresh, and directions to them. */
export function PersonCard({ person, now, onClose }: { person: Person; now: number; onClose(): void }) {
  const to: Location = { placeId: null, name: person.name, address: '', lat: person.lat, lng: person.lng }
  return (
    <div className="glass-strong pointer-events-auto rounded-[1.75rem] p-4" role="dialog" aria-label={person.name}>
      <div className="flex items-start gap-3">
        <UserAvatar name={person.name} photoURL={person.photoURL} className="size-11" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{person.name}</p>
          <p className="text-sm">
            {person.freshness === 'live' ? 'Sharing live' : 'Last seen'} · {ageLabel(person.updatedAt, now)}
            {person.accuracy > 100 && ` · within ${person.accuracy >= 1000 ? `${(person.accuracy / 1000).toFixed(1)} km` : `${Math.round(person.accuracy / 10) * 10} m`}`}
          </p>
        </div>
        <CloseButton onClose={onClose} />
      </div>
      <RouteActions to={to} className="mt-3" />
    </div>
  )
}

const coords = (p: google.maps.LatLngLiteral) => `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`

/** Look up the street address of a dropped pin. Falls back to coordinates if the Geocoding API isn't available. */
function useAddress(pin: google.maps.LatLngLiteral) {
  const geocoding = useMapsLibrary('geocoding')
  const key = coords(pin)
  const [found, setFound] = useState<{ key: string; name: string; address: string; placeId: string | null } | null>(null)
  useEffect(() => {
    if (!geocoding) return
    let live = true
    new geocoding.Geocoder()
      .geocode({ location: pin })
      .then(({ results }) => {
        const r = results.find((x) => !x.types.includes('plus_code')) ?? results[0]
        if (!live || !r) return
        // "12 Smith St, Sydney NSW 2000, Australia" → name "12 Smith St", address the rest.
        const [first, ...rest] = r.formatted_address.split(', ')
        setFound({ key, name: first ?? r.formatted_address, address: rest.join(', '), placeId: r.place_id ?? null })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geocoding, key])
  return found?.key === key ? found : null
}

/** A pin dropped with a long press: directions there, or add it to the plan. */
export function DroppedPinCard({ pin, onClose, onAdd }: { pin: google.maps.LatLngLiteral; onClose(): void; onAdd(location: Location): void }) {
  const found = useAddress(pin)
  const location: Location = {
    placeId: found?.placeId ?? null,
    name: found?.name ?? 'Dropped pin',
    address: found?.address ?? coords(pin),
    lat: pin.lat,
    lng: pin.lng,
  }
  return (
    <div className="glass-strong pointer-events-auto rounded-[1.75rem] p-4" role="dialog" aria-label="Dropped pin">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
          <MapPin className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{found ? found.name : 'Dropped pin'}</p>
          <p className="truncate text-sm">{found?.address || coords(pin)}</p>
        </div>
        <CloseButton onClose={onClose} />
      </div>
      <RouteActions to={location} className="mt-3" />
      <div className="mt-1 flex gap-1">
        <Button variant="ghost" className="flex-1 text-primary" onClick={() => onAdd(location)}>
          <CalendarPlus /> Add to itinerary
        </Button>
        <Button
          variant="ghost"
          className="text-primary"
          aria-label="Copy coordinates"
          onClick={() =>
            navigator.clipboard.writeText(coords(pin)).then(
              () => toast.success('Coordinates copied'),
              () => toast.error('Couldn’t copy'),
            )
          }
        >
          <Copy />
        </Button>
      </div>
    </div>
  )
}
