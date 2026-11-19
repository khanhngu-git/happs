import { useEffect, useMemo, useState } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import type { Item } from '@/lib/firestore'
import { hasMaps } from '@/lib/maps'
import type { LatLng } from './PlacePicker'

/** One lookup per destination per session. */
const destinationCache = new Map<string, Promise<LatLng | null>>()

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/**
 * Where place search should look first: the middle of the trip's pinned
 * plans, or, before anything is pinned, the trip's destination.
 */
export function usePlaceBias(items: Item[], destination: string): LatLng | null {
  const places = useMapsLibrary('places')
  // A rounded key keeps the same object across live updates, so search doesn't refetch on every snapshot.
  const centreKey = useMemo(() => {
    const pinned = items.flatMap((i) => (i.location?.lat != null && i.location.lng != null ? [{ lat: i.location.lat, lng: i.location.lng }] : []))
    return pinned.length ? `${median(pinned.map((p) => p.lat)).toFixed(3)},${median(pinned.map((p) => p.lng)).toFixed(3)}` : ''
  }, [items])
  const fromItems = useMemo<LatLng | null>(() => {
    if (!centreKey) return null
    const [lat, lng] = centreKey.split(',').map(Number)
    return { lat: lat!, lng: lng! }
  }, [centreKey])
  const [fromDestination, setFromDestination] = useState<LatLng | null>(null)

  const query = destination.trim()
  useEffect(() => {
    if (!hasMaps || !places || fromItems || !query) return
    let cancelled = false
    let lookup = destinationCache.get(query)
    if (!lookup) {
      lookup = places.Place.searchByText({ textQuery: query, fields: ['location'], maxResultCount: 1 })
        .then(({ places: found }) => {
          const loc = found[0]?.location
          return loc ? { lat: loc.lat(), lng: loc.lng() } : null
        })
        .catch((err) => {
          console.warn('Destination lookup failed', err)
          destinationCache.delete(query)
          return null
        })
      destinationCache.set(query, lookup)
    }
    void lookup.then((c) => !cancelled && setFromDestination(c))
    return () => {
      cancelled = true
    }
  }, [places, fromItems, query])

  return fromItems ?? (query ? fromDestination : null)
}
