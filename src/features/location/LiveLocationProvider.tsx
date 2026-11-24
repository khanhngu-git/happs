import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { toast } from 'sonner'
import { db } from '@/lib/firebase'
import { refs, useLiveQuery, type LiveLocation } from '@/lib/firestore'
import { useTrip } from '@/features/trips/TripContext'
import { freshness, shouldSend, type Fix, type Freshness } from './liveLocation'

/**
 * Live location for the current trip.
 *
 * Uses the browser's Geolocation API, which on iPhone is iOS's own Location
 * Services: the first "turn on" shows the system "Allow … to use your
 * location?" prompt, and the choice lives in Settings › Privacy & Security ›
 * Location Services. Permission is only ever asked for from that switch,
 * never on load. A web app can't run in the background, so sharing pauses
 * when happs is closed or the phone is locked, and resumes when it's opened.
 */

/** 'prompt' = not asked yet (or the browser can't tell us). */
export type LocationPermission = 'unsupported' | 'prompt' | 'granted' | 'denied'

export interface Person {
  uid: string
  name: string
  photoURL: string | null
  lat: number
  lng: number
  accuracy: number
  updatedAt: number
  freshness: Exclude<Freshness, 'hidden'>
}

interface LiveLocationValue {
  /** Am I sharing on this device? */
  sharing: boolean
  /** Turn sharing on (asks for permission if needed) or off. Resolves to whether it's now on. */
  setSharing(on: boolean): Promise<boolean>
  permission: LocationPermission
  /** My latest position while sharing (straight from the device, not the server). */
  myFix: Fix | null
  /** Other members sharing their location, freshest first. Hidden once very old. */
  people: Person[]
  /** Latest location per member, including me (for the Members list). */
  byUid: Map<string, Person>
  /** Ticks every 30 s, for "4 min ago" labels. */
  now: number
}

const Ctx = createContext<LiveLocationValue | null>(null)

const storageKey = (tripId: string) => `happs.liveLocation.${tripId}`
function readPref(tripId: string): boolean {
  try {
    return localStorage.getItem(storageKey(tripId)) === '1'
  } catch {
    return false
  }
}
function writePref(tripId: string, on: boolean) {
  try {
    if (on) localStorage.setItem(storageKey(tripId), '1')
    else localStorage.removeItem(storageKey(tripId))
  } catch {
    /* storage unavailable: sharing just won't resume after a reload */
  }
}

const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator
const WATCH: PositionOptions = { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 }

function toFix(pos: GeolocationPosition): Fix {
  return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: pos.timestamp || Date.now() }
}

/** One position, which also brings up iOS's permission prompt the first time. */
function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { ...WATCH, timeout: 15_000 }))
}

async function writeFix(tripId: string, uid: string, fix: Fix) {
  await setDoc(doc(db, 'trips', tripId, 'locations', uid), {
    lat: fix.lat,
    lng: fix.lng,
    accuracy: Math.round(fix.accuracy),
    updatedAt: serverTimestamp(),
  })
}

async function clearMyLocation(tripId: string, uid: string) {
  await deleteDoc(doc(db, 'trips', tripId, 'locations', uid))
}

function usePermission(): [LocationPermission, (p: LocationPermission) => void] {
  const [permission, setPermission] = useState<LocationPermission>(supported ? 'prompt' : 'unsupported')
  useEffect(() => {
    if (!supported || !navigator.permissions?.query) return
    let status: PermissionStatus | null = null
    const sync = () => status && setPermission(status.state === 'granted' ? 'granted' : status.state === 'denied' ? 'denied' : 'prompt')
    // Safari 16+ answers this; where it can't, we find out when we ask.
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((s) => {
        status = s
        sync()
        s.addEventListener('change', sync)
      })
      .catch(() => undefined)
    return () => status?.removeEventListener('change', sync)
  }, [])
  return [permission, setPermission]
}

export function LiveLocationProvider({ children }: { children: ReactNode }) {
  const { trip, me, membersById } = useTrip()
  const tripId = trip.id
  // Kept with the trip it belongs to, so switching trips picks up that trip's choice.
  const [state, setState] = useState(() => ({ tripId, sharing: supported && readPref(tripId), myFix: null as Fix | null }))
  if (state.tripId !== tripId) setState({ tripId, sharing: supported && readPref(tripId), myFix: null })
  const { sharing, myFix } = state
  const setSharingState = useCallback((on: boolean) => setState((s) => ({ ...s, sharing: on, myFix: on ? s.myFix : null })), [])
  const setMyFix = useCallback((f: Fix | null) => setState((s) => ({ ...s, myFix: f })), [])
  const [permission, setPermission] = usePermission()
  const lastSent = useRef<Fix | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const stop = useCallback(
    (reason?: string) => {
      writePref(tripId, false)
      setSharingState(false)
      lastSent.current = null
      clearMyLocation(tripId, me).catch((err) => console.error('Couldn’t clear live location', err))
      if (reason) toast.error(reason)
    },
    [tripId, me, setSharingState],
  )

  const send = useCallback(
    (fix: Fix) => {
      setMyFix(fix)
      // Offline writes would queue and land later with a misleading time; wait for the next fix.
      if (!navigator.onLine || !shouldSend(lastSent.current, fix)) return
      lastSent.current = fix
      writeFix(tripId, me, fix).catch((err) => {
        console.error('Couldn’t share live location', err)
        lastSent.current = null
      })
    },
    [tripId, me, setMyFix],
  )

  // While sharing, follow the device's position.
  useEffect(() => {
    if (!sharing || !supported) return
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setPermission('granted')
        send(toFix(pos))
      },
      (err) => {
        // Turned off for happs in iOS Settings while sharing.
        if (err.code === err.PERMISSION_DENIED) {
          setPermission('denied')
          stop('Location access was turned off, so happs stopped sharing your location.')
        }
        // Timeouts and lost signal: keep watching, the next fix will come.
      },
      WATCH,
    )
    // Back from the background: the last write may be old, so send the next fix right away.
    const onVisible = () => {
      if (document.visibilityState === 'visible') lastSent.current = null
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      navigator.geolocation.clearWatch(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [sharing, send, stop, setPermission])

  const setSharing = useCallback(
    async (on: boolean) => {
      if (!on) {
        stop()
        return false
      }
      if (!supported) return false
      try {
        // Ask now, from the tap, so iOS shows its prompt in context.
        const pos = await currentPosition()
        setPermission('granted')
        writePref(tripId, true)
        lastSent.current = null
        setSharingState(true)
        send(toFix(pos))
        return true
      } catch (e) {
        const err = e as GeolocationPositionError
        if (err.code === err.PERMISSION_DENIED) {
          setPermission('denied')
          return false
        }
        // Allowed, but no fix yet (indoors, weak signal): share as soon as one arrives.
        writePref(tripId, true)
        setSharingState(true)
        return true
      }
    },
    [tripId, send, stop, setPermission, setSharingState],
  )

  const { data: docs } = useLiveQuery<LiveLocation>(refs.locations(tripId), `locations:${tripId}`)

  const { people, byUid } = useMemo(() => {
    const byUid = new Map<string, Person>()
    for (const d of docs) {
      const member = membersById.get(d.id)
      const updatedAt = d.updatedAt?.toMillis?.()
      // Former members' leftovers, and documents still waiting for their server time.
      if (!member || !updatedAt) continue
      const f = freshness(updatedAt, now)
      if (f === 'hidden') continue
      byUid.set(d.id, { uid: d.id, name: member.displayName, photoURL: member.photoURL, lat: d.lat, lng: d.lng, accuracy: d.accuracy, updatedAt, freshness: f })
    }
    const people = [...byUid.values()].filter((p) => p.uid !== me).sort((a, b) => b.updatedAt - a.updatedAt)
    return { people, byUid }
  }, [docs, membersById, me, now])

  const value = useMemo<LiveLocationValue>(() => ({ sharing, setSharing, permission, myFix, people, byUid, now }), [sharing, setSharing, permission, myFix, people, byUid, now])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLiveLocation(): LiveLocationValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLiveLocation must be used inside a trip')
  return v
}
