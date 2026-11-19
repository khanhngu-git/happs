import { describe, expect, it } from 'vitest'
import { actorInput, hotelSearchInput, normalizeHotels, priceToMinor } from './hotelFinder'

// Shape from the Actor's published dataset schema (hotels-scrapers/trip-hotel-scraper).
const item = {
  name: 'Grand Hyatt Paris',
  hotel_id: '748291',
  star_rating: 5,
  rating: 4.7,
  rating_description: 'Excellent',
  reviews: 3842,
  location: '0.8 km from Eiffel Tower',
  room_type: 'Deluxe King Room',
  room_features: ['Free cancellation', 'Breakfast included'],
  current_price: 91,
  total_price: 182,
  images: ['https://ak-d.tripcdn.com/images/hotel/sample.jpg', 'http://insecure.example/x.jpg'],
}

describe('hotel finder', () => {
  it('converts prices to integer minor units', () => {
    expect(priceToMinor(91, 'AUD')).toBe(9100)
    expect(priceToMinor('A$1,234.50', 'AUD')).toBe(123450)
    expect(priceToMinor(12000, 'JPY')).toBe(12000)
    expect(priceToMinor(0, 'AUD')).toBeNull()
    expect(priceToMinor(null, 'AUD')).toBeNull()
  })

  it('normalises a listing', () => {
    const [h] = normalizeHotels([item], 'AUD', 2)
    expect(h).toMatchObject({
      id: '748291',
      name: 'Grand Hyatt Paris',
      stars: 5,
      rating: 4.7,
      ratingScale: 5,
      ratingText: 'Excellent',
      reviews: 3842,
      area: '0.8 km from Eiffel Tower',
      roomType: 'Deluxe King Room',
      nightlyMinor: 9100,
      totalMinor: 18200,
      totalEstimated: false,
      currency: 'AUD',
    })
    expect(h!.images).toEqual(['https://ak-d.tripcdn.com/images/hotel/sample.jpg'])
  })

  it('estimates the total from the nightly price when no total is shown', () => {
    const [h] = normalizeHotels([{ ...item, total_price: null, rating: 8.6 }], 'AUD', 3)
    expect(h).toMatchObject({ totalMinor: 27300, totalEstimated: true, ratingScale: 10 })
  })

  it('skips nameless or unpriced rows and duplicates', () => {
    const out = normalizeHotels([item, { ...item }, { name: '', current_price: 10 }, { name: 'No price' }], 'AUD', 2)
    expect(out).toHaveLength(1)
    expect(normalizeHotels('nope', 'AUD', 2)).toEqual([])
  })

  it('validates searches', () => {
    const ok = { tripId: 't', destination: 'Tokyo', checkIn: '2026-12-10', checkOut: '2026-12-12', adults: 2, rooms: 1 }
    expect(hotelSearchInput.safeParse(ok).success).toBe(true)
    expect(hotelSearchInput.safeParse({ ...ok, checkOut: '2026-12-10' }).success).toBe(false)
    expect(hotelSearchInput.safeParse({ ...ok, checkOut: '2027-02-10' }).success).toBe(false)
    expect(hotelSearchInput.safeParse({ ...ok, destination: 'T' }).success).toBe(false)
  })

  it('builds a small, single-page Actor input in the trip currency', () => {
    const input = actorInput(hotelSearchInput.parse({ tripId: 't', destination: 'Tokyo', checkIn: '2026-12-10', checkOut: '2026-12-12', adults: 2, rooms: 1 }), 'AUD')
    expect(input).toMatchObject({ searchWord: 'Tokyo', checkIn: '2026-12-10', checkOut: '2026-12-12', adults: 2, rooms: 1, currency: 'AUD', totalLimit: 20, limitPerPage: 20 })
    expect(input).not.toHaveProperty('filterArgs')
  })
})
