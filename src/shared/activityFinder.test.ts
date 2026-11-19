import { describe, expect, it } from 'vitest'
import {
  activityCancellation,
  activityLocation,
  activityPhotos,
  activitySummary,
  finderInput,
  normalizeActivities,
  normalizeActivityOptions,
  normalizePlaces,
  priceToMinor,
  withDisplayPrice,
} from './activityFinder'

// Shapes captured from the live RouteStack API (trimmed).
const details = {
  result: {
    description: 'Escape from the city of Tokyo and discover Mt. Fuji and Hakone in 1 day!',
    cancellationPolicy: { description: 'For a full refund, cancel at least 24 hours before the scheduled departure time.' },
    productPhotos: [{ photoURL: 'https://media-cdn.tripadvisor.com/a.jpg' }, { photoURL: 'http://insecure/b.jpg' }],
    bookableItems: [{ gradeCode: 'TG7', title: 'From Matsuya Ginza (Lunch)', description: '★: With Lunch and return ticket by Bullet train\nStarting point: …' }],
    logistics: {
      start: [
        {
          description: 'Meeting point: Matsuya Ginza',
          location: { name: 'Matsuya Ginza', address: '3-chōme-6-1 Ginza, Chuo City, Tokyo', provider: 'GOOGLE', providerReference: 'ChIJ5UsboeaLGGARV2ODxt0ic1I', center: { lat: 35.6722621, lng: 139.7666526 } },
        },
      ],
    },
  },
}

describe('activity finder', () => {
  it('validates search input: a name or a place is needed', () => {
    expect(finderInput.safeParse({ action: 'search', tripId: 't', query: 'teamLab', destinationId: null, date: '2026-12-11' }).success).toBe(true)
    expect(finderInput.safeParse({ action: 'search', tripId: 't', query: '', destinationId: '334', date: '2026-12-11' }).success).toBe(true)
    expect(finderInput.safeParse({ action: 'search', tripId: 't', query: '', destinationId: null, date: '2026-12-11' }).success).toBe(false)
  })

  it('prices become integer minor units', () => {
    expect(priceToMinor(227.09, 'AUD')).toBe(22709)
    expect(priceToMinor(0.1 + 0.2, 'USD')).toBe(30)
    expect(priceToMinor(1500.4, 'JPY')).toBe(1500)
    expect(priceToMinor(-1, 'USD')).toBeNull()
  })

  it('places: only destinations', () => {
    const p = normalizePlaces({ result: [{ type: 'destination', name: 'Tokyo', destinationId: 334, destinationName: 'Kanto' }, { type: 'product', activityCode: 'X', name: 'Tour' }] })
    expect(p).toEqual([{ id: '334', label: 'Tokyo', sub: 'Kanto' }])
  })

  it('search results use live field names and skip nameless products', () => {
    const list = normalizeActivities({
      result: {
        currency: 'AUD',
        activities: [
          { activityCode: '28575P41', title: 'Mt Fuji and Hakone 1-Day Bus Tour', thumbnailHiResURL: 'https://t/hi.jpg', duration: '11 Hours', rating: 5, reviewCount: 33660, freeCancellation: true, showOurPrice: 227.09 },
          { activityCode: 'NONAME', title: '', showOurPrice: 10 },
        ],
      },
    })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ code: '28575P41', image: 'https://t/hi.jpg', priceMinor: 22709, currency: 'AUD', duration: '11 Hours', freeCancellation: true })
  })

  it('options are named from details', () => {
    const opts = normalizeActivityOptions({ result: { currency: 'AUD', bookableItems: [{ gradeCode: 'TG7', availabilityDetails: [{ startTime: '07:20', totalPrice: { price: { showOurPrice: 476.38 } } }, { startTime: '09:00', available: false }] }] } }, details)
    expect(opts).toEqual([{ gradeCode: 'TG7', title: 'From Matsuya Ginza (Lunch)', description: 'With Lunch and return ticket by Bullet train', startTimes: ['07:20'], priceMinor: 47638, currency: 'AUD' }])
  })

  it('meeting point becomes a mappable location', () => {
    expect(activityLocation(details)).toEqual({ placeId: 'ChIJ5UsboeaLGGARV2ODxt0ic1I', name: 'Matsuya Ginza', address: '3-chōme-6-1 Ginza, Chuo City, Tokyo', lat: 35.6722621, lng: 139.7666526 })
    expect(activityLocation({ result: { logistics: {} } })).toBeNull()
  })

  it('photos (https only), summary and cancellation', () => {
    expect(activityPhotos(details, null)).toEqual(['https://media-cdn.tripadvisor.com/a.jpg'])
    expect(activityPhotos({ result: {} }, 'https://t/fallback.jpg')).toEqual(['https://t/fallback.jpg'])
    expect(activitySummary(details)).toMatch(/^Escape from the city/)
    expect(activityCancellation(details)).toMatch(/full refund/)
  })

  it('display prices in the trip currency', () => {
    const out = withDisplayPrice([{ priceMinor: 15263, currency: 'USD' }, { priceMinor: 22709, currency: 'AUD' }], 'AUD', (c) => (c === 'USD' ? 1.4878 : null))
    expect(out[0]!.display).toEqual({ priceMinor: 22708, currency: 'AUD', approximate: true })
    expect(out[1]!.display).toEqual({ priceMinor: 22709, currency: 'AUD', approximate: false })
  })
})
