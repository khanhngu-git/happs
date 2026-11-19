import { useEffect, useState } from 'react'
import { Loader2, MapPin, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, callableMessage } from '@/lib/functions'
import type { BookingKind, PlaceOption } from '@/shared/booking'

/**
 * Airport / destination autocomplete backed by RouteStack. Debounced and
 * 3+ characters only, because every lookup spends a provider search token.
 */
export function PlaceField({
  id,
  label,
  kind,
  tripId,
  value,
  onChange,
  initialQuery = '',
  placeholder,
}: {
  id: string
  label: string
  kind: BookingKind
  tripId: string
  value: PlaceOption | null
  onChange(p: PlaceOption | null): void
  initialQuery?: string
  placeholder?: string
}) {
  const [text, setText] = useState(initialQuery)
  const [results, setResults] = useState<PlaceOption[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(!!initialQuery)

  useEffect(() => {
    if (value || text.trim().length < 3) return
    let cancelled = false
    const t = setTimeout(async () => {
      setBusy(true)
      try {
        const res = await api.booking({ action: 'places', tripId, kind, term: text.trim() })
        if (!cancelled) {
          setResults(res.places ?? [])
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(callableMessage(err))
      } finally {
        if (!cancelled) setBusy(false)
      }
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [text, value, kind, tripId])

  if (value) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="flex min-h-11 items-center gap-3 rounded-xl bg-card px-3 ring-1 ring-input">
          <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{value.label}</span>
            {value.sub && <span className="block truncate text-sm text-muted-foreground">{value.sub}</span>}
          </span>
          <button type="button" onClick={() => onChange(null)} className="inline-flex size-11 items-center justify-center rounded-full" aria-label={`Change ${label.toLowerCase()}`}>
            <X className="size-4" />
          </button>
        </div>
      </div>
    )
  }

  const shown = text.trim().length < 3 ? [] : results
  return (
    <div className="relative space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          value={text}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && shown.length > 0}
          aria-controls={`${id}-list`}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {busy && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Searching" />}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {open && shown.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="glass-strong absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-2xl p-1">
          {shown.map((p) => (
            <li
              key={`${p.id}-${p.label}`}
              role="option"
              aria-selected={false}
              className="flex min-h-11 cursor-pointer flex-col justify-center rounded-xl px-3 py-1.5 active:bg-foreground/8"
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(p)
              }}
            >
              <span className="font-medium">{p.label}</span>
              {p.sub && <span className="text-sm">{p.sub}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
