import { describe, expect, it } from 'vitest'
import { amapUrl, driverText, googleDirectionsUrl, isMainlandChina } from './routes'

const bund = { placeId: 'p1', name: 'The Bund', address: 'Zhongshan East 1st Rd, Shanghai, China', lat: 31.24, lng: 121.49, localName: '外滩', localAddress: '中国上海市中山东一路' }
const hotel = { placeId: 'p2', name: 'Peace Hotel', address: 'Shanghai, China', lat: 31.241, lng: 121.488 }

describe('isMainlandChina', () => {
  it('uses the trip time zone or the address', () => {
    expect(isMainlandChina('Asia/Shanghai')).toBe(true)
    expect(isMainlandChina('Asia/Tokyo', bund)).toBe(true)
    expect(isMainlandChina('Asia/Hong_Kong', { ...hotel, address: 'Central, Hong Kong' })).toBe(false)
    expect(isMainlandChina('Asia/Tokyo', { ...hotel, address: 'Ginza, Tokyo, Japan' })).toBe(false)
  })
})

describe('route links', () => {
  it('Google directions carry both ends and default to public transport', () => {
    const u = new URL(googleDirectionsUrl(bund, hotel))
    expect(u.searchParams.get('destination')).toBe('31.24,121.49')
    expect(u.searchParams.get('origin')).toBe('31.241,121.488')
    expect(u.searchParams.get('destination_place_id')).toBe('p1')
    expect(u.searchParams.get('travelmode')).toBe('transit')
  })

  it('Amap navigation uses lng,lat,name with GCJ-02 coordinates and opens the app', () => {
    const u = new URL(amapUrl(bund, hotel))
    expect(u.origin + u.pathname).toBe('https://uri.amap.com/navigation')
    expect(u.searchParams.get('to')).toBe('121.49,31.24,外滩')
    expect(u.searchParams.get('from')).toBe('121.488,31.241,Peace Hotel')
    expect(u.searchParams.get('coordinate')).toBe('gaode')
    expect(u.searchParams.get('callnative')).toBe('1')
  })

  it('Amap falls back to a search without coordinates, and starts from your position without an origin', () => {
    expect(amapUrl({ ...hotel, lat: null, lng: null })).toMatch(/^https:\/\/uri\.amap\.com\/search\?keyword=Peace\+Hotel/)
    expect(new URL(amapUrl(bund)).searchParams.has('from')).toBe(false)
  })

  it('shows the driver the Chinese name and address when we have them', () => {
    expect(driverText(bund)).toEqual({ name: '外滩', address: '中国上海市中山东一路' })
    expect(driverText(hotel)).toEqual({ name: 'Peace Hotel', address: 'Shanghai, China' })
    expect(driverText({ ...bund, localAddress: '中国上海市黄浦区四牌楼 邮政编码: 200000' }).address).toBe('中国上海市黄浦区四牌楼')
  })
})
