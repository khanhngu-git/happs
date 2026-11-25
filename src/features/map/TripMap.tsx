import { useEffect, useMemo, useRef, useState } from 'react'
import { AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps'
import { BedDouble, Flag, LocateFixed, MapPin, Scan } from 'lucide-react'
import { toast } from 'sonner'
import { MAP_ID } from '@/lib/maps'
import { ITEM_TYPE_META, iconFor } from '@/features/itinerary/itemTypes'
import { UserAvatar } from '@/components/UserAvatar'
import { LiveLocationButton } from '@/features/location/LiveLocationControls'
import { useLiveLocation, type Person } from '@/features/location/LiveLocationProvider'
import { ageLabel, statusLabel } from '@/features/location/liveLocation'
import { arcPath, type MapStop } from './mapData'

/** Fit the viewport to the visible markers whenever they change. */
/** Every point that should be in view: each stop, and where each journey ends. */
function points(stops: MapStop[]) {
  return stops.flatMap((s) => [{ lat: s.lat, lng: s.lng }, ...(s.to ? [{ lat: s.to.lat, lng: s.to.lng }] : [])])
}

function fitTo(map: google.maps.Map, stops: MapStop[]) {
  const pts = points(stops)
  if (pts.length === 0) return
  if (pts.length === 1) {
    map.panTo(pts[0]!)
    map.setZoom(15)
    return
  }
  const b = new google.maps.LatLngBounds()
  pts.forEach((p) => b.extend(p))
  map.fitBounds(b, { top: 130, bottom: 230, left: 48, right: 48 })
}

function FitBounds({ stops, skip }: { stops: MapStop[]; skip: boolean }) {
  const map = useMap()
  const key = stops.map((s) => `${s.item.id}${s.to ? '>' : ''}`).join()
  useEffect(() => {
    // A selected stop frames itself (PanToSelected); don't zoom out over it.
    if (!map || stops.length === 0 || skip) return
    const fit = () => fitTo(map, stops)
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
    if (!map) return
    // Join each stop to the next. A journey is drawn by Journeys, so the leg
    // after it starts where it arrives, not where it left.
    const timed = stops.filter((s) => s.number !== null)
    const legs: google.maps.LatLngLiteral[][] = []
    for (let i = 1; i < timed.length; i++) {
      const prev = timed[i - 1]!
      const from = prev.to ? { lat: prev.to.lat, lng: prev.to.lng } : { lat: prev.lat, lng: prev.lng }
      const to = { lat: timed[i]!.lat, lng: timed[i]!.lng }
      if (from.lat !== to.lat || from.lng !== to.lng) legs.push([from, to])
    }
    const lines = legs.flatMap((path) => [
      new google.maps.Polyline({ map, path, strokeColor: '#ffffff', strokeOpacity: 0.9, strokeWeight: 6, zIndex: 1, clickable: false }),
      new google.maps.Polyline({ map, path, strokeColor: ROUTE, strokeOpacity: 0.9, strokeWeight: 3, zIndex: 2, clickable: false }),
    ])
    return () => lines.forEach((l) => l.setMap(null))
  }, [map, stops])
  return null
}

const TRANSPORT = ITEM_TYPE_META.transport.hex

/**
 * Journeys, drawn the way maps usually draw them: flights as a curved arc,
 * trains as a dashed line, cars, buses and boats as a dotted line. Each has
 * a white casing so it reads on any map style.
 */
function Journeys({ stops, selectedId }: { stops: MapStop[]; selectedId: string | null }) {
  const map = useMap()
  useEffect(() => {
    if (!map) return
    const lines: google.maps.Polyline[] = []
    for (const s of stops) {
      if (!s.to) continue
      const from = { lat: s.lat, lng: s.lng }
      const to = { lat: s.to.lat, lng: s.to.lng }
      const path = s.mode === 'flight' ? arcPath(from, to) : [from, to]
      const dim = !!selectedId && selectedId !== s.item.id
      const opacity = dim ? 0.35 : 0.95
      const dash = s.mode === 'train' ? { path: 'M 0,-1 0,1', scale: 3, len: '14px' } : s.mode === 'flight' ? null : { path: google.maps.SymbolPath.CIRCLE, scale: 2, len: '9px' }
      lines.push(new google.maps.Polyline({ map, path, strokeColor: '#ffffff', strokeOpacity: dash ? 0 : 0.9, strokeWeight: 7, zIndex: 3, clickable: false, geodesic: false }))
      lines.push(
        new google.maps.Polyline({
          map,
          path,
          zIndex: 4,
          clickable: false,
          strokeColor: TRANSPORT,
          strokeWeight: 3,
          strokeOpacity: dash ? 0 : opacity,
          icons: dash
            ? [{ icon: { path: dash.path, strokeColor: TRANSPORT, strokeOpacity: opacity, fillColor: TRANSPORT, fillOpacity: opacity, scale: dash.scale, strokeWeight: 3 }, offset: '0', repeat: dash.len }]
            : undefined,
        }),
      )
    }
    return () => lines.forEach((l) => l.setMap(null))
  }, [map, stops, selectedId])
  return null
}

/** Zoom back out to everything on the map after panning around. */
function ShowAll({ stops }: { stops: MapStop[] }) {
  const map = useMap()
  return (
    <button type="button" aria-label="Show everything on the map" className="glass pointer-events-auto inline-flex size-12 items-center justify-center rounded-full" onClick={() => map && fitTo(map, stops)}>
      <Scan className="size-5" />
    </button>
  )
}

/** Keep the selected stop in view. */
function PanToSelected({ stop }: { stop: MapStop | null }) {
  const map = useMap()
  useEffect(() => {
    if (!map || !stop) return
    const frame = () => {
      // A journey: show both ends, leaving room for the card at the bottom.
      if (stop.to) {
        const b = new google.maps.LatLngBounds()
        b.extend({ lat: stop.lat, lng: stop.lng })
        b.extend({ lat: stop.to.lat, lng: stop.to.lng })
        map.fitBounds(b, { top: 150, bottom: 340, left: 56, right: 56 })
        return
      }
      map.panTo({ lat: stop.lat, lng: stop.lng })
      // Close stops overlap when zoomed out; zoom in so the chosen one is clear.
      if ((map.getZoom() ?? 0) < 15) map.setZoom(15)
    }
    frame()
    // On a fresh load the map may not have its final size yet; frame again once it settles.
    const once = google.maps.event.addListenerOnce(map, 'idle', frame)
    return () => once.remove()
  }, [map, stop])
  return null
}

/** Centre on a member who's sharing their location (from "Sharing live location" in Members). */
function PanToPerson({ person }: { person: Person | null }) {
  const map = useMap()
  const uid = person?.uid
  useEffect(() => {
    if (!map || !person) return
    const frame = () => {
      map.panTo({ lat: person.lat, lng: person.lng })
      if ((map.getZoom() ?? 0) < 15) map.setZoom(15)
    }
    frame()
    const once = google.maps.event.addListenerOnce(map, 'idle', frame)
    return () => once.remove()
    // Only when the person changes, not on each of their updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, uid])
  return null
}

/** A member sharing their location: their photo, ringed, with their first name underneath. Tap for directions to them. */
function PersonPin({ person, now, selected, dimmed, onSelect }: { person: Person; now: number; selected: boolean; dimmed: boolean; onSelect(): void }) {
  // Paused (happs closed) or gone quiet: greyed, as the latest known location.
  const stale = person.freshness === 'stale' || person.paused
  return (
    <AdvancedMarker position={{ lat: person.lat, lng: person.lng }} title={`${person.name} · ${statusLabel(person, now)}`} zIndex={selected ? 2002 : 2000} onClick={onSelect}>
      <div className="flex flex-col items-center transition-all" style={{ opacity: dimmed ? 0.45 : stale ? 0.55 : 1 }} aria-hidden>
        <UserAvatar
          name={person.name}
          photoURL={person.photoURL}
          className={`border-[3px] shadow-[0_2px_8px_rgb(0_0_0/0.35)] transition-all ${selected ? 'size-13' : 'size-10'} ${stale ? 'border-zinc-300' : 'border-sky-500'}`}
        />
        <span className="mt-0.5 max-w-24 truncate rounded-full bg-white px-1.5 text-[0.6875rem] font-semibold text-zinc-900 shadow-[0_1px_3px_rgb(0_0_0/0.3)]">
          {person.name.split(' ')[0]}
          {person.paused ? ' · paused' : stale && ` · ${ageLabel(person.updatedAt, now)}`}
        </span>
      </div>
    </AdvancedMarker>
  )
}

const LONG_PRESS_MS = 500
/** Finger movement that still counts as holding still (px). */
const LONG_PRESS_SLOP = 10

/**
 * Press and hold anywhere on the map to drop a pin (right-click on a computer).
 * Google Maps has no long-press event, so this watches the pointer on the map's
 * container and turns the screen point into a position through an overlay's
 * projection. Panning, pinching or lifting early cancels it.
 */
function LongPress({ onPress }: { onPress(p: google.maps.LatLngLiteral): void }) {
  const map = useMap()
  const cb = useRef(onPress)
  useEffect(() => {
    cb.current = onPress
  })
  useEffect(() => {
    if (!map) return
    const overlay = new google.maps.OverlayView()
    overlay.onAdd = () => {}
    overlay.draw = () => {}
    overlay.onRemove = () => {}
    overlay.setMap(map)
    const div = map.getDiv()
    const down = new Set<number>()
    let timer: ReturnType<typeof setTimeout> | null = null
    let start: { x: number; y: number } | null = null
    /** The tap that ends a long press shouldn't also count as a tap on the map. */
    let swallowClickUntil = 0
    const cancel = () => {
      if (timer) clearTimeout(timer)
      timer = null
      start = null
    }
    const drop = (clientX: number, clientY: number) => {
      const proj = overlay.getProjection()
      if (!proj) return
      const r = div.getBoundingClientRect()
      const ll = proj.fromContainerPixelToLatLng(new google.maps.Point(clientX - r.left, clientY - r.top))
      if (!ll) return
      swallowClickUntil = Date.now() + 600
      navigator.vibrate?.(15)
      cb.current({ lat: ll.lat(), lng: ll.lng() })
    }
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      down.add(e.pointerId)
      // Two fingers: a pinch, not a press.
      if (down.size > 1) return cancel()
      // Only on the map itself, not on a pin or a control.
      if ((e.target as Element).closest('gmp-advanced-marker, [role="button"], button')) return
      start = { x: e.clientX, y: e.clientY }
      const { clientX, clientY } = e
      timer = setTimeout(() => {
        timer = null
        start = null
        drop(clientX, clientY)
      }, LONG_PRESS_MS)
    }
    const onMove = (e: PointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > LONG_PRESS_SLOP) cancel()
    }
    const onUp = (e: PointerEvent) => {
      down.delete(e.pointerId)
      cancel()
    }
    const onClick = (e: MouseEvent) => {
      if (Date.now() < swallowClickUntil) {
        e.stopPropagation()
        e.preventDefault()
      }
    }
    const onContext = (e: MouseEvent) => {
      // Right-click on a computer; also stops the phone's own menu after a hold.
      e.preventDefault()
      if (e.button === 2 || (e as PointerEvent).pointerType === 'mouse') drop(e.clientX, e.clientY)
    }
    const opts = { capture: true }
    div.addEventListener('pointerdown', onDown, opts)
    div.addEventListener('pointermove', onMove, opts)
    div.addEventListener('pointerup', onUp, opts)
    div.addEventListener('pointercancel', onUp, opts)
    div.addEventListener('click', onClick, opts)
    div.addEventListener('contextmenu', onContext, opts)
    const dragging = map.addListener('dragstart', cancel)
    const zooming = map.addListener('zoom_changed', cancel)
    return () => {
      cancel()
      div.removeEventListener('pointerdown', onDown, opts)
      div.removeEventListener('pointermove', onMove, opts)
      div.removeEventListener('pointerup', onUp, opts)
      div.removeEventListener('pointercancel', onUp, opts)
      div.removeEventListener('click', onClick, opts)
      div.removeEventListener('contextmenu', onContext, opts)
      dragging.remove()
      zooming.remove()
      overlay.setMap(null)
    }
  }, [map])
  return null
}

/** Keep a dropped pin in view (it may be under the card). */
function PanToPin({ pin }: { pin: google.maps.LatLngLiteral | null }) {
  const map = useMap()
  const key = pin ? `${pin.lat},${pin.lng}` : null
  useEffect(() => {
    if (map && pin) map.panTo(pin)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key])
  return null
}

function LocateMe({ onLocated, live }: { onLocated(p: google.maps.LatLngLiteral): void; live: google.maps.LatLngLiteral | null }) {
  const map = useMap()
  return (
    <button
      type="button"
      aria-label="Show my location"
      className="glass pointer-events-auto inline-flex size-12 items-center justify-center rounded-full"
      onClick={() => {
        // Already following the device while sharing: no need to ask again.
        if (live) {
          map?.panTo(live)
          if ((map?.getZoom() ?? 0) < 15) map?.setZoom(15)
          return
        }
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
      }}
    >
      <LocateFixed className="size-5" />
    </button>
  )
}

export interface TripMapProps {
  stops: MapStop[]
  selectedId: string | null
  onSelect(id: string | null): void
  /** The member whose pin is selected. */
  personId?: string | null
  onSelectPerson(uid: string): void
  /** A pin dropped with a long press. */
  pin?: google.maps.LatLngLiteral | null
  onDropPin(p: google.maps.LatLngLiteral): void
  /** A tap on empty map: close whatever is open. */
  onClear(): void
}

export function TripMap({ stops, selectedId, onSelect, personId, onSelectPerson, pin = null, onDropPin, onClear }: TripMapProps) {
  // Lifting the finger after a long press can arrive as a map tap; don't let it close the new pin.
  const droppedAt = useRef(0)
  const drop = (p: google.maps.LatLngLiteral) => {
    droppedAt.current = Date.now()
    onDropPin(p)
  }
  const clear = () => {
    if (Date.now() - droppedAt.current > 600) onClear()
  }
  const [located, setLocated] = useState<google.maps.LatLngLiteral | null>(null)
  const live = useLiveLocation()
  const liveMe = useMemo(() => (live.myFix ? { lat: live.myFix.lat, lng: live.myFix.lng } : null), [live.myFix])
  const me = liveMe ?? located
  const focus = live.people.find((p) => p.uid === personId) ?? null
  const first = stops[0] ?? live.people[0]
  const center = useMemo(() => (first ? { lat: first.lat, lng: first.lng } : { lat: 0, lng: 0 }), [first])
  return (
    <div className="relative size-full">
      <Map mapId={MAP_ID} defaultCenter={center} defaultZoom={stops.length ? 12 : 2} disableDefaultUI gestureHandling="greedy" clickableIcons={false} onClick={clear} colorScheme="FOLLOW_SYSTEM">
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
        {stops.map((s) =>
          s.to ? (
            <AdvancedMarker
              key={`${s.item.id}-to`}
              position={{ lat: s.to.lat, lng: s.to.lng }}
              title={`${s.item.title}: arrives at ${s.to.name}`}
              onClick={() => onSelect(s.item.id)}
              zIndex={s.item.id === selectedId ? 999 : 9}
            >
              <div
                className="flex size-7 items-center justify-center rounded-full border-[3px] bg-white shadow-[0_2px_6px_rgb(0_0_0/0.3)] transition-opacity"
                style={{ borderColor: TRANSPORT, color: TRANSPORT, opacity: selectedId && selectedId !== s.item.id ? 0.45 : 1 }}
                aria-hidden
              >
                <Flag className="size-3.5" />
              </div>
            </AdvancedMarker>
          ) : null,
        )}
        <Journeys stops={stops} selectedId={selectedId} />
        {live.people.map((p) => (
          <PersonPin key={p.uid} person={p} now={live.now} selected={p.uid === personId} dimmed={!!personId && p.uid !== personId} onSelect={() => onSelectPerson(p.uid)} />
        ))}
        {pin && (
          <AdvancedMarker position={pin} title="Dropped pin" zIndex={2003} anchorPoint={['50%', '100%']}>
            <MapPin className="size-10 fill-red-500 stroke-white drop-shadow-[0_2px_4px_rgb(0_0_0/0.4)]" strokeWidth={1.5} aria-hidden />
          </AdvancedMarker>
        )}
        <LongPress onPress={drop} />
        <PanToPin pin={pin} />
        {me && (
          <AdvancedMarker position={me} title={live.sharing ? 'You (sharing live)' : 'You are here'} zIndex={2001}>
            <span className="block size-4 rounded-full border-2 border-white bg-sky-500 shadow-[0_0_0_6px_rgb(14_165_233/0.25)]" />
          </AdvancedMarker>
        )}
        <FitBounds stops={stops} skip={!!selectedId || !!focus || !!pin} />
        <PanToPerson person={selectedId ? null : focus} />
        <DayLine stops={stops} />
        <PanToSelected stop={stops.find((s) => s.item.id === selectedId) ?? null} />
      </Map>
      <div className="pointer-events-none absolute right-3 bottom-[calc(13rem+env(safe-area-inset-bottom))] flex flex-col gap-2 md:bottom-4">
        {stops.length > 0 && <ShowAll stops={stops} />}
        <LiveLocationButton />
        <LocateMe onLocated={setLocated} live={liveMe} />
      </div>
    </div>
  )
}
