/**
 * One-tap links for getting from one plan to the next.
 *
 * Google Maps doesn't work well in mainland China, so trips there also get
 * Amap (高德地图), which opens the Amap app when installed (`callnative=1`)
 * and falls back to its mobile web page. Inside mainland China, Google Places
 * returns GCJ-02 coordinates (the same datum as Google's own China map), which
 * is what Amap calls `gaode`, so no conversion is needed.
 *
 * On iOS the uri.amap.com page can't open the app (Safari blocks its
 * redirect), so iPhones go straight to Amap's `iosamap://` scheme and only
 * fall back to that page when Amap isn't installed.
 *
 * DiDi has no public link that pre-fills a destination, so the taxi option
 * shows the address in Chinese to copy or show the driver, then opens DiDi.
 */
import type { Location } from '@/shared/schemas'

type Loc = Pick<Location, 'placeId' | 'name' | 'address' | 'lat' | 'lng'> & { localName?: string; localAddress?: string }

const MAINLAND_CHINA_ZONES = new Set(['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Chungking', 'Asia/Harbin', 'Asia/Urumqi', 'Asia/Kashgar', 'PRC'])

const hasCoords = (l: Loc | null | undefined): l is Loc & { lat: number; lng: number } => !!l && l.lat !== null && l.lng !== null

/** Mainland China trip or place (Hong Kong and Macau use Google Maps happily). */
export function isMainlandChina(timeZone: string, loc?: Loc | null): boolean {
  if (MAINLAND_CHINA_ZONES.has(timeZone)) return true
  const addr = `${loc?.address ?? ''} ${loc?.localAddress ?? ''}`
  return /(^|[\s,])China\s*$|中国/.test(addr) && !/Hong Kong|Macau|Macao|香港|澳门|澳門/.test(addr)
}

/** Google Maps directions; with no origin, it starts from the traveller's current position. Public transport by default. */
export function googleDirectionsUrl(to: Loc, from?: Loc | null): string {
  const point = (l: Loc) => (hasCoords(l) ? `${l.lat},${l.lng}` : [l.name, l.address].filter(Boolean).join(' '))
  const p = new URLSearchParams({ api: '1', destination: point(to), travelmode: 'transit' })
  if (to.placeId) p.set('destination_place_id', to.placeId)
  if (from) {
    p.set('origin', point(from))
    if (from.placeId) p.set('origin_place_id', from.placeId)
  }
  return `https://www.google.com/maps/dir/?${p}`
}

/** Amap route planning (driving), or a place search when we don't have coordinates. */
export function amapUrl(to: Loc, from?: Loc | null): string {
  const name = (l: Loc) => (l.localName || l.name).replace(/[,|]/g, ' ')
  if (!hasCoords(to)) {
    const p = new URLSearchParams({ keyword: to.localName || to.localAddress || to.name, src: 'happs', callnative: '1' })
    return `https://uri.amap.com/search?${p}`
  }
  const p = new URLSearchParams({ to: `${to.lng},${to.lat},${name(to)}`, mode: 'car', policy: '1', coordinate: 'gaode', src: 'happs', callnative: '1' })
  if (hasCoords(from)) p.set('from', `${from.lng},${from.lat},${name(from)}`)
  return `https://uri.amap.com/navigation?${p}`
}

/**
 * Amap's own iOS scheme: route planning (driving) from `from`, or the current
 * position, to `to`; a place search without coordinates. `dev=0` says the
 * coordinates are already GCJ-02.
 */
export function amapIosUrl(to: Loc, from?: Loc | null): string {
  const name = (l: Loc) => l.localName || l.name
  if (!hasCoords(to)) {
    const p = new URLSearchParams({ sourceApplication: 'happs', name: to.localName || to.localAddress || to.name, dev: '0' })
    return `iosamap://poi?${p}`
  }
  const p = new URLSearchParams({ sourceApplication: 'happs' })
  if (hasCoords(from)) {
    p.set('slat', String(from.lat))
    p.set('slon', String(from.lng))
    p.set('sname', name(from))
  }
  p.set('dlat', String(to.lat))
  p.set('dlon', String(to.lng))
  p.set('dname', name(to))
  p.set('dev', '0')
  p.set('t', '0')
  return `iosamap://path?${p}`
}

/**
 * Opens the DiDi (滴滴出行) app. This is a universal link DiDi's app claims
 * (page.udache.com's apple-app-site-association lists /dpub-template/download-app/*),
 * so iOS opens the app when it's installed and DiDi's download page when it
 * isn't. The bare `diditaxi://` scheme isn't registered by current versions,
 * and Safari shows "the address is invalid". It can't pre-fill the destination.
 */
export const DIDI_APP_URL = 'https://page.udache.com/dpub-template/download-app/index.html'

/** What to show a driver: the local-language name and address when we have them. */
export function driverText(loc: Loc): { name: string; address: string } {
  // Postcodes ("邮政编码: 200000") only clutter what the driver reads.
  const address = (loc.localAddress || loc.address).replace(/\s*(邮政编码|郵遞區號)[:：]?\s*\d+/g, '').trim()
  return { name: loc.localName || loc.name, address }
}
