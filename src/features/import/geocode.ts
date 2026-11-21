/**
 * Pin imported places with Google Places (New) Text Search. Coordinates are
 * only ever taken from a search result, never made up. A result is used
 * when it is clearly the place that was named; anything unclear is left
 * unpinned and flagged for review.
 */
import type { Location } from '@/shared/schemas'
import type { ImportedItem } from './seed'

type PlacesLibrary = google.maps.PlacesLibrary

const STOP = new Set(['the', 'and', 'of', 'at', 'in', 'on', 'to', 'by', 'a', 'an', 'no', 'road', 'street', 'st', 'district', 'city', 'china', 'park', 'area', 'scenic', 'station', 'national'])

function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  )
}

/** Does a search result's name clearly match what was asked for? */
export function sameName(asked: string, askedZh: string | undefined, found: string): boolean {
  if (askedZh && found.includes(askedZh.replace(/[（(].*$/, ''))) return true
  const a = words(asked)
  const f = words(found)
  return [...a].some((w) => f.has(w))
}

function distanceKm(a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral): number {
  const r = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

export type Lookup = { status: 'pinned'; location: Location } | { status: 'review'; reason: string }

async function search(places: PlacesLibrary, textQuery: string) {
  const { places: found } = await places.Place.searchByText({ textQuery, fields: ['id', 'displayName', 'formattedAddress', 'location'], maxResultCount: 3, language: 'en' })
  return found.filter((p) => p.location)
}

/** Look up one imported place. */
export async function lookUp(places: PlacesLibrary, item: ImportedItem): Promise<Lookup> {
  const loc = item.values.location!
  const q = item.lookup!
  // With no address there's nothing to check a result against (a name alone can match anywhere).
  if (!q.country) return { status: 'review', reason: 'No address to confirm the place' }
  let found = await search(places, q.query)
  if (found.length === 0 && q.fallback) found = await search(places, q.fallback)
  if (found.length === 0) return { status: 'review', reason: 'No match found' }
  const inCountry = found.filter((p) => !q.country || (p.formattedAddress ?? '').includes(q.country))
  const matching = inCountry.filter((p) => sameName(loc.name, loc.localName, p.displayName ?? ''))
  const best = matching[0]
  if (!best) return { status: 'review', reason: `Closest match was “${found[0]!.displayName}”` }
  const here = best.location!.toJSON()
  // Two different places with the right name, far apart: don't pick one.
  const rival = matching.slice(1).find((p) => distanceKm(here, p.location!.toJSON()) > 5)
  if (rival) return { status: 'review', reason: `More than one “${loc.name}” found` }
  return {
    status: 'pinned',
    location: { ...loc, placeId: best.id, lat: here.lat, lng: here.lng, address: loc.address || best.formattedAddress || '' },
  }
}
