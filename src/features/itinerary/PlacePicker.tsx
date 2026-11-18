import { useEffect, useRef, useState } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { MapPin, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { hasMaps } from '@/lib/maps'
import type { Location } from '@/shared/schemas'

interface Props {
  id: string
  value: Location | null
  onChange(loc: Location | null): void
}

/** Places Autocomplete (New) when a Maps key is configured; plain text fields otherwise. */
export function PlacePicker(props: Props) {
  return hasMaps ? <PlacesAutocomplete {...props} /> : <ManualPlace {...props} />
}

function ManualPlace({ id, value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Location</Label>
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

function PlacesAutocomplete({ id, value, onChange }: Props) {
  const places = useMapsLibrary('places')
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [active, setActive] = useState(-1)
  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null)

  useEffect(() => {
    if (!places || text.trim().length < 2) return
    token.current ??= new places.AutocompleteSessionToken()
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const { suggestions: s } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: text, sessionToken: token.current! })
        if (cancelled) return
        setSuggestions(
          s.flatMap((x) =>
            x.placePrediction
              ? [{ placeId: x.placePrediction.placeId, main: x.placePrediction.mainText?.text ?? x.placePrediction.text.text, secondary: x.placePrediction.secondaryText?.text ?? '', prediction: x.placePrediction }]
              : [],
          ),
        )
        setActive(-1)
      } catch (err) {
        console.warn('Places autocomplete failed', err)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [text, places])

  async function pick(s: Suggestion) {
    setOpen(false)
    setText('')
    const place = s.prediction.toPlace()
    await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location'] })
    token.current = null // a session ends after a selection
    onChange({ placeId: place.id, name: place.displayName ?? s.main, address: place.formattedAddress ?? s.secondary, lat: place.location?.lat() ?? null, lng: place.location?.lng() ?? null })
  }

  // Short queries show nothing rather than stale results.
  const shown = text.trim().length < 2 ? [] : suggestions

  if (value) {
    return (
      <div className="space-y-2">
        <Label>Location</Label>
        <div className="flex items-center gap-3 rounded-xl bg-card px-3 py-2 ring-1 ring-input">
          <MapPin className="size-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{value.name}</p>
            {value.address && <p className="truncate text-sm text-muted-foreground">{value.address}</p>}
          </div>
          <button type="button" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-foreground/6" aria-label="Remove location" onClick={() => onChange(null)}>
            <X className="size-4" />
          </button>
        </div>
      </div>
    )
  }

  const listId = `${id}-list`
  return (
    <div className="relative space-y-2">
      <Label htmlFor={id}>Location</Label>
      <Input
        id={id}
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        placeholder="Search for a place"
        value={text}
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, shown.length - 1))
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
          else if (e.key === 'Enter' && active >= 0 && shown[active]) {
            e.preventDefault()
            void pick(shown[active])
          }
        }}
      />
      {open && shown.length > 0 && (
        <ul id={listId} role="listbox" className="glass-strong absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-2xl p-1">
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
        </ul>
      )}
    </div>
  )
}
