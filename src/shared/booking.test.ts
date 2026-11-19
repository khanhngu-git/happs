import { describe, expect, it } from 'vitest'
import { checkoutUrl, normalizeActivities, normalizeActivityOptions, normalizeFlights, normalizeHotels, normalizePlaces, normalizeRooms, priceToMinor } from './booking'

// Trimmed from RouteStack's documented examples (mcp.routestack.ai/openapi.yaml).
const flightRes = {
  success: true,
  currency: 'USD',
  alphaSessionId: 'sess1',
  correlationId: 'c1',
  searchFilterObj: { type: 'OneWay' },
  result: [
    {
      stops: 0,
      fareSourceCode: 'FSC123',
      ourprice: 263.65,
      totalFare: 247.31,
      flights: [
        {
          triptime: 181,
          airline: 'American',
          cabin: 'Economy',
          departure: 'MIA',
          departairport: 'Miami Intl. Arpt.',
          arrival: 'JFK',
          arrivalairport: 'John F Kennedy Intl',
          departureTime: '2026-10-16T06:42:00',
          arrivalTime: '2026-10-16T09:43:00',
          flightCode: 'AA',
          flightNumber: '525',
          legindicator: 0,
          remainingSeats: 7,
          checkInBaggage: [{ type: 'Adult', value: '0PC' }],
        },
      ],
    },
    { stops: 0, flights: [], ourprice: 10 }, // no legs: dropped
  ],
}

describe('booking normalisers', () => {
  it('converts decimal prices to integer minor units', () => {
    expect(priceToMinor(263.65, 'USD')).toBe(26365)
    expect(priceToMinor('87.97', 'AUD')).toBe(8797)
    expect(priceToMinor(1500.4, 'JPY')).toBe(1500)
    expect(priceToMinor(0.1 + 0.2, 'USD')).toBe(30)
    expect(priceToMinor(null, 'USD')).toBeNull()
    expect(priceToMinor(-1, 'USD')).toBeNull()
  })

  it('flights: legs, price and an opaque checkout ref', () => {
    const [f, ...rest] = normalizeFlights(flightRes, { origin: 'MIA', destination: 'JFK', departureDate: '2026-10-16', adults: 1 })
    expect(rest).toHaveLength(0)
    expect(f).toMatchObject({ stops: 0, cabin: 'Economy', priceMinor: 26365, currency: 'USD', seatsLeft: 7, baggage: '0PC' })
    expect(f!.legs[0]).toMatchObject({ flightNumber: 'AA525', from: 'MIA', to: 'JFK', depart: '2026-10-16T06:42', arrive: '2026-10-16T09:43', durationMin: 181, direction: 0 })
    expect(f!.ref).toMatchObject({ offer: { fareSourceCode: 'FSC123' }, search: { origin: 'MIA', sessionId: 'sess1', correlationId: 'c1' } })
  })

  it('places for each vertical', () => {
    expect(normalizePlaces('flight', { result: [{ name: 'London Heathrow', code: 'LHR', city: 'London', country: 'United Kingdom' }] })[0]).toMatchObject({ id: 'LHR', label: 'London (LHR)' })
    expect(normalizePlaces('hotel', { result: [{ id: '31055408', fullName: 'Tokyo House, Tokyo, JP', type: 'Hotel', coordinates: { lat: 35.578205, long: 139.72916 } }] })[0]).toMatchObject({ id: '31055408', lat: 35.578205, lng: 139.72916, type: 'Hotel', sub: 'Hotel' })
    // Live: points of interest are Google place ids without coordinates
    expect(normalizePlaces('hotel', { result: [{ id: 'ChIJCewJkL2LGGAR3Qmk0vCTGkg', fullName: 'Tokyo Tower, Minato City, Tokyo, Japan', type: 'PointOfInterest', coordinates: null }] })[0]).toMatchObject({ lat: null, lng: null, type: 'PointOfInterest', sub: 'Area' })
    expect(normalizePlaces('activity', { result: [{ type: 'destination', name: 'Dubai', destinationId: 828, destinationName: 'United Arab Emirates' }] })[0]).toMatchObject({ id: '828', label: 'Dubai' })
  })

  it('hotels and rooms carry the session through to checkout', () => {
    const hotels = normalizeHotels(
      { result: { token: 'tok', correlationId: 'cor', currency: 'USD', result: [{ id: '39765840', name: 'Sun and Sands Plaza', starRating: 3, ourprice: 87.97, heroImage: 'https://i/x.jpg', reviews: { rating: 8.2, count: 120 } }] } },
      { checkIn: '2026-11-28', checkOut: '2026-11-29', destinationId: '70475484', rooms: [{ adults: 1, children: 0, childAges: [] }] },
    )
    expect(hotels[0]).toMatchObject({ id: '39765840', stars: 3, rating: 8.2, priceMinor: 8797 })
    expect(hotels[0]!.ref).toMatchObject({ hotelId: '39765840', token: 'tok', correlationId: 'cor', destinationId: '70475484' })
    const rooms = normalizeRooms(
      { result: { token: 'tok2', correlationId: 'cor', groups: [{ name: 'Standard', rooms: [{ id: 'r1', name: 'Standard, Twin Beds', recommendationId: 'rec1', ourprice: 82.84, publishedRate: 88.01, refundable: true, boardBasis: { displayText: 'Room Only' } }] }] } },
      hotels[0]!.ref as Record<string, unknown>,
    )
    expect(rooms[0]).toMatchObject({ name: 'Standard, Twin Beds', board: 'Room Only', refundable: true, priceMinor: 8284 })
    expect(rooms[0]!.ref).toMatchObject({ roomId: 'r1', recommendationId: 'rec1', publishedRate: 88.01, token: 'tok2' })
  })

  it('activities and their bookable options', () => {
    // Live search-v2 shape (title, hi-res thumbnail, currency on the envelope)
    expect(
      normalizeActivities({ result: { currency: 'USD', activities: [{ activityCode: '28575P41', title: 'Mt Fuji and Hakone 1-Day Bus Tour', thumbnailURL: '', thumbnailHiResURL: 'https://t/hi.jpg', duration: '11 Hours', rating: 5, reviewCount: 33660, freeCancellation: true, showOurPrice: 152.63 }] } })[0],
    ).toMatchObject({ code: '28575P41', name: 'Mt Fuji and Hakone 1-Day Bus Tour', image: 'https://t/hi.jpg', duration: '11 Hours', rating: 5, freeCancellation: true, priceMinor: 15263, currency: 'USD' })
    // Documented example shape still works
    expect(normalizeActivities({ result: { activities: [{ activityCode: '119405P17', name: 'Deep Sea Fishing Trip', thumbnailURL: 'https://t/x.jpg', destinationName: 'UAE', showOurPrice: 814.34 }] } })[0]).toMatchObject({ code: '119405P17', priceMinor: 81434 })
    const opts = normalizeActivityOptions({
      result: {
        currency: 'USD',
        bookableItems: [
          { gradeCode: 'TG2', availabilityDetails: [{ startTime: '06:00', available: true, totalPrice: { price: { showOurPrice: 876.53 } } }, { startTime: '11:00', available: false, totalPrice: { price: { showOurPrice: 900 } } }] },
          { gradeCode: 'TG3', availabilityDetails: [{ startTime: '09:00', available: false }] },
        ],
      },
    })
    expect(opts).toEqual([{ gradeCode: 'TG2', title: null, description: null, startTimes: ['06:00'], priceMinor: 87653, currency: 'USD' }])
    const named = normalizeActivityOptions(
      { result: { currency: 'USD', bookableItems: [{ gradeCode: 'TG7', title: null, availabilityDetails: [{ startTime: '07:20', totalPrice: { price: { showOurPrice: 317.97 } } }] }] } },
      { result: { bookableItems: [{ gradeCode: 'TG7', title: 'From Matsuya Ginza (Lunch)', description: '★: With Lunch and return ticket by Bullet train\nStarting point: …' }] } },
    )
    expect(named[0]).toMatchObject({ title: 'From Matsuya Ginza (Lunch)', description: 'With Lunch and return ticket by Bullet train', priceMinor: 31797 })
  })

  it('only accepts https checkout URLs', () => {
    expect(checkoutUrl({ checkoutMode: 'deeplink', url: 'https://portal.example/checkout/1' })).toBe('https://portal.example/checkout/1')
    expect(checkoutUrl({ checkoutMode: 'acp', session: { id: 'cs_1' } })).toBeNull()
    expect(checkoutUrl({ url: 'javascript:alert(1)' })).toBeNull()
  })
})
