import type { Location } from '@/shared/schemas'

/**
 * Trip.com listings have no coordinates, so find the hotel with Google
 * Places (the app's Maps key) to put the stay on the map. Falls back to a
 * name-only location when Maps isn't configured or nothing matches.
 */
export async function locateHotel(name: string, destination: string, area: string | null): Promise<Location> {
  const fallback: Location = { placeId: null, name, address: area ?? '', lat: null, lng: null }
  const Place = (window as unknown as { google?: typeof google }).google?.maps?.places?.Place
  if (!Place) return fallback
  try {
    const { places } = await Place.searchByText({ textQuery: `${name}, ${destination}`, fields: ['id', 'displayName', 'formattedAddress', 'location'], maxResultCount: 1 })
    const p = places[0]
    if (!p?.location) return fallback
    return { placeId: p.id, name, address: p.formattedAddress ?? area ?? '', lat: p.location.lat(), lng: p.location.lng() }
  } catch (err) {
    console.warn('Hotel lookup failed', err)
    return fallback
  }
}
