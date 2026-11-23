import { useEffect, useRef, useState } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { Loader2, MapPin, PenLine, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { hasMaps } from '@/lib/maps'
import type { Location } from '@/shared/schemas'

export interface LatLng {
  lat: number
  lng: number
}

interface Props {
  id: string
  value: Location | null
  onChange(loc: Location | null): void
  /** Centre to prefer suggestions around (the trip's destination). */
  bias?: LatLng | null
  /** Also fetch the place's name and address in this language (e.g. zh-CN for taxi drivers in China). */
  localLanguage?: string | null
  /** Field label (default "Location"; "From" / "To" for transport). */
  label?: string
}

/** Places Autocomplete (New) when a Maps key is configured; plain text fields otherwise. */
export function PlacePicker(props: Props) {
  return hasMaps ? <PlacesAutocomplete {...props} /> : <ManualPlace {...props} />
}

function ManualPlace({ id, value, onChange, label = 'Location' }: Props) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        placeholder="Place name"
        value={value?.name ?? ''}
        onChange={(e) => onChange(e.target.value ? { placeId: null, address: value?.address ?? '', lat: value?.lat ?? null, lng: value?.lng ?? null, name: e.target.value } : null)}
      />
      <Input
        aria-label="Address"
        placeholder="Address (optional)"
        value={value?.address ?? ''}
        onChange={(e) => value && onChange({ ...value, address: e.target.value })}
        disabled={!value}
      />
      <p className="text-sm text-muted-foreground">Add a Google Maps key to search places and pin them on the map.</p>
    </div>
  )
}

interface Suggestion {
  placeId: string
  main: string
  secondary: string
  prediction: google.maps.places.PlacePrediction
}

/** Suggestions within this distance of the trip's destination rank first (the API's maximum). */
const BIAS_RADIUS_M = 50_000

const typedPlace = (text: string): Location => ({ placeId: null, name: text.trim(), address: '', lat: null, lng: null })

function PlacesAutocomplete({ id, value, onChange, bias, localLanguage, label = 'Location' }: Props) {
  const places = useMapsLibrary('places')
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [active, setActive] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null)

  const query = text.trim()
  useEffect(() => {
    if (!places || query.length < 2) return
    token.current ??= new places.AutocompleteSessionToken()
    let cancelled = false
    const t = setTimeout(async () => {
      setBusy(true)
      try {
        const { suggestions: s } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          sessionToken: token.current!,
          ...(bias ? { locationBias: { center: bias, radius: BIAS_RADIUS_M }, origin: bias } : {}),
        })
        if (cancelled) return
        setSuggestions(
          s.flatMap((x) =>
            x.placePrediction
              ? [{ placeId: x.placePrediction.placeId, main: x.placePrediction.mainText?.text ?? x.placePrediction.text.text, secondary: x.placePrediction.secondaryText?.text ?? '', prediction: x.placePrediction }]
              : [],
          ),
        )
        setActive(-1)
        setError(null)
      } catch (err) {
        console.warn('Places autocomplete failed', err)
        if (!cancelled) {
          setSuggestions([])
          setError('Place search isn’t working right now. You can still use the name as typed.')
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, places, bias])

  async function pick(s: Suggestion) {
    setOpen(false)
    setText('')
    token.current = null // a session ends after a selection
    try {
      const place = s.prediction.toPlace()
      await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location'] })
      const loc: Location = { placeId: place.id, name: place.displayName ?? s.main, address: place.formattedAddress ?? s.secondary, lat: place.location?.lat() ?? null, lng: place.location?.lng() ?? null }
      // The same place in the local language, for drivers and local ride apps.
      if (localLanguage && places) {
        try {
          const local = new places.Place({ id: place.id, requestedLanguage: localLanguage })
          await local.fetchFields({ fields: ['displayName', 'formattedAddress'] })
          if (local.displayName) loc.localName = local.displayName
          if (local.formattedAddress) loc.localAddress = local.formattedAddress
        } catch (err) {
          console.warn('Local-language place details failed', err)
        }
      }
      onChange(loc)
    } catch (err) {
      console.warn('Place details failed', err)
      // Keep what the suggestion showed rather than losing the choice.
      onChange({ placeId: s.placeId, name: s.main, address: s.secondary, lat: null, lng: null })
      setError('Couldn’t load that place’s details, so it won’t show on the map. Try picking it again.')
    }
  }

  // Short queries show nothing rather than stale results.
  const shown = query.length < 2 ? [] : suggestions
  const keepTyped = () => {
    if (!query) return
    setOpen(false)
    setText('')
    onChange(typedPlace(query))
  }
  // Rows: suggestions, then "use as typed".
  const rowCount = shown.length + (query.length >= 2 ? 1 : 0)

  if (value) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="flex items-center gap-3 rounded-xl bg-card px-3 py-2 ring-1 ring-input">
          <MapPin className="size-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{value.name}</p>
            {value.address && <p className="truncate text-sm text-muted-foreground">{value.address}</p>}
            {value.lat === null && <p className="text-sm text-muted-foreground">Not on the map: pick a search result to pin it.</p>}
          </div>
          <button type="button" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-foreground/6" aria-label={`Remove ${label.toLowerCase()}`} onClick={() => onChange(null)}>
            <X className="size-4" />
          </button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    )
  }

  const listId = `${id}-list`
  return (
    <div className="relative space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          role="combobox"
          aria-expanded={open && rowCount > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          placeholder="Search for a place"
          value={text}
          autoComplete="off"
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
            setError(null)
          }}
          onFocus={() => setOpen(true)}
          // Leaving the field with text still in it (e.g. tapping Add) keeps it as typed rather than dropping it.
          // Choosing a suggestion doesn't blur: the options cancel mousedown.
          onBlur={() => (query ? keepTyped() : setOpen(false))}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, rowCount - 1))
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
            else if (e.key === 'Enter' && query) {
              e.preventDefault()
              if (active >= 0 && shown[active]) void pick(shown[active])
              else if (active === shown.length || shown.length === 0) keepTyped()
              else void pick(shown[0]!)
            }
          }}
        />
        {busy && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Searching" />}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {open && rowCount > 0 && (
        <ul id={listId} role="listbox" className="glass-strong absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-2xl p-1">
          {shown.map((s, i) => (
            <li
              key={s.placeId}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`flex min-h-11 cursor-pointer flex-col justify-center rounded-xl px-3 py-1.5 ${i === active ? 'bg-foreground/8' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                void pick(s)
              }}
            >
              <span className="font-medium">{s.main}</span>
              {s.secondary && <span className="text-sm">{s.secondary}</span>}
            </li>
          ))}
          <li
            id={`${listId}-${shown.length}`}
            role="option"
            aria-selected={active === shown.length}
            className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 py-1.5 text-primary ${active === shown.length ? 'bg-foreground/8' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault()
              keepTyped()
            }}
          >
            <PenLine className="size-4 shrink-0" aria-hidden />
            <span className="truncate">
              Use “{query}” as typed{shown.length === 0 && !busy ? ' (no matches found)' : ''}
            </span>
          </li>
        </ul>
      )}
    </div>
  )
}
