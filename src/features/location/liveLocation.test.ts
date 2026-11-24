import { describe, expect, it } from 'vitest'
import { ageLabel, distanceM, freshness, HEARTBEAT_MS, HIDE_MS, MIN_INTERVAL_MS, shouldSend, STALE_MS, type Fix } from './liveLocation'

const at = (lat: number, lng: number, t: number, accuracy = 10): Fix => ({ lat, lng, accuracy, at: t })

describe('distanceM', () => {
  it('measures about 111 km per degree of latitude', () => {
    expect(distanceM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -2)
  })
  it('is zero for the same point', () => {
    expect(distanceM({ lat: -33.86, lng: 151.21 }, { lat: -33.86, lng: 151.21 })).toBe(0)
  })
})

describe('shouldSend', () => {
  const start = at(-33.86, 151.21, 0)
  it('always sends the first fix', () => {
    expect(shouldSend(null, start)).toBe(true)
  })
  it('never sends twice within the minimum interval, even after a big move', () => {
    expect(shouldSend(start, at(-33.9, 151.21, MIN_INTERVAL_MS - 1))).toBe(false)
  })
  it('sends after moving more than the noise', () => {
    expect(shouldSend(start, at(-33.8605, 151.21, MIN_INTERVAL_MS))).toBe(true) // ~55 m
  })
  it('ignores jitter smaller than the GPS error', () => {
    expect(shouldSend(start, at(-33.86005, 151.21, MIN_INTERVAL_MS))).toBe(false) // ~5 m
    expect(shouldSend(at(-33.86, 151.21, 0, 200), at(-33.8605, 151.21, MIN_INTERVAL_MS, 200))).toBe(false) // 55 m inside 200 m error
  })
  it('sends a heartbeat while standing still', () => {
    expect(shouldSend(start, at(-33.86, 151.21, HEARTBEAT_MS))).toBe(true)
  })
  it('sends a much more accurate fix', () => {
    expect(shouldSend(at(-33.86, 151.21, 0, 100), at(-33.86, 151.21, MIN_INTERVAL_MS, 10))).toBe(true)
  })
})

describe('freshness and ageLabel', () => {
  it('goes live → stale → hidden', () => {
    expect(freshness(0, STALE_MS)).toBe('live')
    expect(freshness(0, STALE_MS + 1)).toBe('stale')
    expect(freshness(0, HIDE_MS + 1)).toBe('hidden')
  })
  it('labels the age', () => {
    expect(ageLabel(0, 30_000)).toBe('Just now')
    expect(ageLabel(0, 4 * 60_000)).toBe('4 min ago')
    expect(ageLabel(0, 125 * 60_000)).toBe('2 hr ago')
    expect(ageLabel(1000, 0)).toBe('Just now')
  })
})
