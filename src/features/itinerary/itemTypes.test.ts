import { describe, expect, it } from 'vitest'
import { Bus, CarFront, Plane, Ship, TrainFront, Camera } from 'lucide-react'
import { iconFor } from './itemTypes'

describe('iconFor', () => {
  it('shows how a transport plan travels', () => {
    expect(iconFor({ type: 'transport', title: 'Flight HU484 Melbourne to Haikou' })).toBe(Plane)
    expect(iconFor({ type: 'transport', title: 'Train G219 Hangzhou East to Zhangjiajie West' })).toBe(TrainFront)
    expect(iconFor({ type: 'transport', title: 'Maglev from Pudong' })).toBe(TrainFront)
    expect(iconFor({ type: 'transport', title: 'Night bullet train Shanghai to Suzhou' })).toBe(TrainFront)
    expect(iconFor({ type: 'transport', title: 'DiDi XL to Melbourne Airport' })).toBe(CarFront)
    expect(iconFor({ type: 'transport', title: 'DiDi to the hotel' })).toBe(CarFront)
    expect(iconFor({ type: 'transport', title: 'Ferry to the Bund' })).toBe(Ship)
    expect(iconFor({ type: 'transport', title: 'Transfer Wulingyuan to Zhangjiajie city' })).toBe(Bus)
  })
  it('other types keep their icon', () => {
    expect(iconFor({ type: 'activity', title: 'Flight simulator' })).toBe(Camera)
  })
})
