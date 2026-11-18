import { useEffect, useMemo, useState } from 'react'
import { AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps'
import { BedDouble, LocateFixed } from 'lucide-react'
import { toast } from 'sonner'
import { MAP_ID } from '@/lib/maps'
import { ITEM_TYPE_META } from '@/features/itinerary/itemTypes'
import type { MapStop } from './mapData'

/** Fit the viewport to the visible markers whenever they change. */
function FitBounds({ stops }: { stops: MapStop[] }) {
  const map = useMap()
  const key = stops.map((s) => s.item.id).join()
  useEffect(() => {
    if (!map || stops.length === 0) return
    if (stops.length === 1) {
      map.panTo({ lat: stops[0]!.lat, lng: stops[0]!.lng })
      map.setZoom(15)
      return
    }
    const b = new google.maps.LatLngBounds()
    stops.forEach((s) => b.extend({ lat: s.lat, lng: s.lng }))
    map.fitBounds(b, { top: 140, bottom: 200, left: 40, right: 40 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key])
  return null
}

/** Straight line through a day's numbered stops (no routing API in v1). */
function DayLine({ stops }: { stops: MapStop[] }) {
  const map = useMap()
  useEffect(() => {
    const path = stops.filter((s) => s.number !== null).map((s) => ({ lat: s.lat, lng: s.lng }))
    if (!map || path.length < 2) return
    const line = new google.maps.Polyline({
      map,
      path,
      strokeOpacity: 0,
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: '#0f766e', scale: 3 }, offset: '0', repeat: '14px' }],
    })
    return () => line.setMap(null)
  }, [map, stops])
  return null
}

function LocateMe({ onLocated }: { onLocated(p: google.maps.LatLngLiteral): void }) {
  const map = useMap()
  return (
    <button
      type="button"
      aria-label="Show my location"
      className="glass pointer-events-auto inline-flex size-12 items-center justify-center rounded-full"
      onClick={() =>
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
            onLocated(p)
            map?.panTo(p)
            map?.setZoom(15)
          },
          () => toast.error('Couldn’t get your location. Check location permissions.'),
          { enableHighAccuracy: true, timeout: 10_000 },
        )
      }
    >
      <LocateFixed className="size-5" />
    </button>
  )
}

export function TripMap({ stops, selectedId, onSelect }: { stops: MapStop[]; selectedId: string | null; onSelect(id: string | null): void }) {
  const [me, setMe] = useState<google.maps.LatLngLiteral | null>(null)
  const center = useMemo(() => (stops[0] ? { lat: stops[0].lat, lng: stops[0].lng } : { lat: 0, lng: 0 }), [stops])
  return (
    <div className="relative size-full">
      <Map mapId={MAP_ID} defaultCenter={center} defaultZoom={stops.length ? 12 : 2} disableDefaultUI gestureHandling="greedy" clickableIcons={false} onClick={() => onSelect(null)} colorScheme="FOLLOW_SYSTEM">
        {stops.map((s) => {
          const meta = ITEM_TYPE_META[s.item.type]
          const Icon = meta.icon
          const selected = s.item.id === selectedId
          return (
            <AdvancedMarker key={s.item.id} position={{ lat: s.lat, lng: s.lng }} title={s.item.title} onClick={() => onSelect(s.item.id)} zIndex={selected ? 1000 : s.item.type === 'stay' ? 10 : 100}>
              <div
                className="flex items-center justify-center rounded-full border-2 border-white text-white shadow-lg transition-transform"
                style={{ background: meta.hex, width: selected ? 44 : 36, height: selected ? 44 : 36 }}
                aria-hidden
              >
                {s.item.type === 'stay' ? <BedDouble className="size-5" /> : s.number !== null ? <span className="text-sm font-bold">{s.number}</span> : <Icon className="size-4.5" />}
              </div>
            </AdvancedMarker>
          )
        })}
        {me && (
          <AdvancedMarker position={me} title="You are here">
            <span className="block size-4 rounded-full border-2 border-white bg-sky-500 shadow-[0_0_0_6px_rgb(14_165_233/0.25)]" />
          </AdvancedMarker>
        )}
        <FitBounds stops={stops} />
        <DayLine stops={stops} />
      </Map>
      <div className="pointer-events-none absolute right-3 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] md:bottom-4">
        <LocateMe onLocated={setMe} />
      </div>
    </div>
  )
}
