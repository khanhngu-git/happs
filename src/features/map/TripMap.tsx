import { useEffect, useMemo, useState } from 'react'
import { AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps'
import { BedDouble, LocateFixed } from 'lucide-react'
import { toast } from 'sonner'
import { MAP_ID } from '@/lib/maps'
import { ITEM_TYPE_META, iconFor } from '@/features/itinerary/itemTypes'
import type { MapStop } from './mapData'

/** Fit the viewport to the visible markers whenever they change. */
function FitBounds({ stops }: { stops: MapStop[] }) {
  const map = useMap()
  const key = stops.map((s) => s.item.id).join()
  useEffect(() => {
    if (!map || stops.length === 0) return
    const fit = () => {
      if (stops.length === 1) {
        map.panTo({ lat: stops[0]!.lat, lng: stops[0]!.lng })
        map.setZoom(15)
        return
      }
      const b = new google.maps.LatLngBounds()
      stops.forEach((s) => b.extend({ lat: s.lat, lng: s.lng }))
      map.fitBounds(b, { top: 130, bottom: 230, left: 48, right: 48 })
    }
    fit()
    // The first fit can run before the map has its final size; fit again once it settles.
    const once = google.maps.event.addListenerOnce(map, 'idle', fit)
    return () => once.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key])
  return null
}

const ROUTE = '#0f766e'

/**
 * The day's timed stops joined in order by a thin solid line with a white
 * casing (readable on any map style). The numbers carry the order, so no
 * arrows. Straight segments: no routing API in v1.
 */
function DayLine({ stops }: { stops: MapStop[] }) {
  const map = useMap()
  useEffect(() => {
    const path = stops.filter((s) => s.number !== null).map((s) => ({ lat: s.lat, lng: s.lng }))
    if (!map || path.length < 2) return
    const casing = new google.maps.Polyline({ map, path, strokeColor: '#ffffff', strokeOpacity: 0.9, strokeWeight: 6, zIndex: 1, clickable: false })
    const line = new google.maps.Polyline({
      map,
      path,
      strokeColor: ROUTE,
      strokeOpacity: 0.9,
      strokeWeight: 3,
      zIndex: 2,
      clickable: false,
    })
    return () => {
      casing.setMap(null)
      line.setMap(null)
    }
  }, [map, stops])
  return null
}

/** Keep the selected stop in view. */
function PanToSelected({ stop }: { stop: MapStop | null }) {
  const map = useMap()
  useEffect(() => {
    if (!map || !stop) return
    map.panTo({ lat: stop.lat, lng: stop.lng })
    // Close stops overlap when zoomed out; zoom in so the chosen one is clear.
    if ((map.getZoom() ?? 0) < 15) map.setZoom(15)
  }, [map, stop])
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
          const Icon = iconFor(s.item)
          const selected = s.item.id === selectedId
          const dimmed = !!selectedId && !selected
          const size = selected ? 46 : s.number !== null ? 36 : 32
          return (
            <AdvancedMarker
              key={s.item.id}
              position={{ lat: s.lat, lng: s.lng }}
              title={s.number !== null ? `${s.number}. ${s.item.title}` : s.item.title}
              onClick={() => onSelect(s.item.id)}
              zIndex={selected ? 1000 : s.number !== null ? 500 - s.number : 10}
            >
              {s.item.photoURL && s.item.type !== 'stay' ? (
                // Photo pin: the picture itself, ringed in the type colour, with the stop number on a badge.
                <div className="relative transition-all" style={{ opacity: dimmed ? 0.45 : 1 }} aria-hidden>
                  <img
                    src={s.item.photoURL}
                    alt=""
                    className="rounded-full border-[3px] object-cover shadow-[0_2px_8px_rgb(0_0_0/0.35)]"
                    style={{ width: size + 8, height: size + 8, borderColor: meta.hex }}
                  />
                  {s.number !== null && (
                    <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-white text-[0.6875rem] font-extrabold text-white" style={{ background: meta.hex }}>
                      {s.number}
                    </span>
                  )}
                </div>
              ) : (
              <div
                className="flex items-center justify-center rounded-full border-[3px] border-white text-white shadow-[0_2px_8px_rgb(0_0_0/0.35)] transition-all"
                style={{ background: meta.hex, width: size, height: size, opacity: dimmed ? 0.45 : 1 }}
                aria-hidden
              >
                {s.item.type === 'stay' ? (
                  <BedDouble className="size-4.5" />
                ) : s.number !== null ? (
                  <span className={selected ? 'text-lg font-extrabold' : 'text-[0.9375rem] font-extrabold'}>{s.number}</span>
                ) : (
                  <Icon className="size-4" />
                )}
              </div>
              )}
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
        <PanToSelected stop={stops.find((s) => s.item.id === selectedId) ?? null} />
      </Map>
      <div className="pointer-events-none absolute right-3 bottom-[calc(13rem+env(safe-area-inset-bottom))] md:bottom-4">
        <LocateMe onLocated={setMe} />
      </div>
    </div>
  )
}
