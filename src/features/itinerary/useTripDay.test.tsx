import { act, renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Trip } from '@/lib/firestore'
import { useTripDay } from './useTripDay'

const trip = { id: 't', startDate: '2026-12-05', endDate: '2026-12-08', timeZone: 'Asia/Shanghai' } as Trip
const wrap = (url: string) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  }

afterEach(() => vi.useRealTimers())

describe('useTripDay', () => {
  it('opens on today during the trip and moves to the next day at local midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-06T15:58:00Z')) // 23:58 in Shanghai
    const { result } = renderHook(() => useTripDay(trip), { wrapper: wrap('/') })
    expect(result.current.day).toBe('2026-12-06')
    act(() => {
      vi.setSystemTime(new Date('2026-12-06T16:01:00Z')) // 00:01 next day
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current.day).toBe('2026-12-07')
    expect(result.current.index).toBe(2)
  })
  it('shows Day 1 before the trip, and respects an explicit choice', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'))
    expect(renderHook(() => useTripDay(trip), { wrapper: wrap('/') }).result.current.day).toBe('2026-12-05')
    expect(renderHook(() => useTripDay(trip), { wrapper: wrap('/?day=2026-12-08') }).result.current.day).toBe('2026-12-08')
  })
})
