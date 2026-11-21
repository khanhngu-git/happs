import { useId, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { CalendarDays, CircleCheck, FileUp, Loader2, MapPinOff } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth, useUser } from '@/features/auth/AuthProvider'
import { useMyTrips } from '@/features/trips/tripApi'
import { formatDateRange } from '@/shared/dates'
import { importItinerary, type ImportResult } from './importApi'
import { parseSeed, SeedError, type ImportPlan } from './seed'

/** /import: bring in a whole itinerary from a trip file (JSON). */
export function ImportPage() {
  const user = useUser()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const places = useMapsLibrary('places')
  const { data: trips } = useMyTrips(user.uid)
  const fileId = useId()
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pasting, setPasting] = useState(false)
  const [text, setText] = useState('')
  const [target, setTarget] = useState('new')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  function read(json: string) {
    try {
      setPlan(parseSeed(json))
      setError(null)
    } catch (err) {
      setPlan(null)
      setError(err instanceof SeedError ? err.message : 'Couldn’t read that file.')
    }
  }

  async function run() {
    if (!plan) return
    setProgress({ done: 0, total: 0 })
    try {
      const r = await importItinerary({
        plan,
        user,
        profile,
        tripId: target === 'new' ? null : target,
        places,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      setResult(r)
    } catch (err) {
      console.error(err)
      toast.error('Couldn’t import. Check your connection, and that you’re a member of that trip.')
    } finally {
      setProgress(null)
    }
  }

  const lookups = plan?.items.filter((i) => i.lookup).length ?? 0
  const missing = plan?.items.filter((i) => i.values.meta.todo.length > 0).length ?? 0

  return (
    <>
      <PageHeader backTo="/" backLabel="Trips" title={<h1 className="large-title">Import itinerary</h1>} />
      <main className="mx-auto max-w-lg space-y-6 px-4 pt-3 pb-20">
        {result ? (
          <section className="space-y-4" aria-live="polite">
            <div className="space-y-1 rounded-[1.25rem] bg-card p-4 ring-1 ring-border/70">
              <p className="flex items-center gap-2 text-[1.0625rem] font-semibold">
                <CircleCheck className="size-5 text-primary" aria-hidden /> Imported
              </p>
              <p className="text-[0.9375rem] text-muted-foreground">
                {result.created} plans added{result.updated ? `, ${result.updated} updated` : ''}. {result.pinned} places pinned on the map.
              </p>
            </div>
            {result.review.length > 0 && (
              <section aria-labelledby="review-h" className="space-y-2">
                <h2 id="review-h" className="px-1 text-[0.8125rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  Places to check ({result.review.length})
                </h2>
                <p className="px-1 text-sm text-muted-foreground">These weren’t pinned because the search wasn’t sure. Open one and pick its place.</p>
                <ul className="divide-y divide-border/70 overflow-hidden rounded-[1.25rem] bg-card ring-1 ring-border/70">
                  {result.review.map((r) => {
                    const date = plan?.items.find((i) => i.id === r.id)?.values.date
                    return (
                      <li key={r.id}>
                        <Link to={`/trips/${result.tripId}/itinerary?day=${date}&item=${r.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 active:bg-foreground/[0.06]">
                          <MapPinOff className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{r.title}</span>
                            <span className="block truncate text-sm text-muted-foreground">{r.reason}</span>
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
            <Button className="w-full" onClick={() => navigate(`/trips/${result.tripId}/itinerary`)}>
              Open trip
            </Button>
          </section>
        ) : (
          <>
            <p className="text-[0.9375rem] text-muted-foreground">
              Add a whole itinerary from a trip file (.json). Importing the same file again updates those plans instead of adding them twice. No costs are created.
            </p>
            <div className="space-y-2">
              <input
                id={fileId}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) read(await f.text())
                }}
              />
              <Button variant="secondary" className="w-full" onClick={() => document.getElementById(fileId)?.click()}>
                <FileUp /> Choose a trip file
              </Button>
              {pasting ? (
                <div className="space-y-2">
                  <Label htmlFor="import-json">Or paste it here</Label>
                  <Textarea id="import-json" rows={6} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" spellCheck={false} />
                  <Button variant="secondary" className="w-full" disabled={!text.trim()} onClick={() => read(text)}>
                    Read pasted text
                  </Button>
                </div>
              ) : (
                <button type="button" className="min-h-11 w-full text-[0.9375rem] text-primary" onClick={() => setPasting(true)}>
                  Paste the file’s text instead
                </button>
              )}
            </div>
            {error && (
              <p className="rounded-xl bg-destructive/10 p-3 text-[0.9375rem] text-destructive" role="alert">
                {error}
              </p>
            )}
            {plan && (
              <section className="space-y-4" aria-label="Preview">
                <div className="space-y-1 rounded-[1.25rem] bg-card p-4 ring-1 ring-border/70">
                  <p className="text-[1.0625rem] font-semibold">{plan.trip.name}</p>
                  <p className="flex items-center gap-1.5 text-[0.9375rem] text-muted-foreground">
                    <CalendarDays className="size-4" aria-hidden /> {formatDateRange(plan.trip.startDate, plan.trip.endDate)}
                  </p>
                  <p className="text-[0.9375rem] text-muted-foreground">
                    {plan.items.length} plans · {lookups} places to find on the map{missing ? ` · ${missing} with missing info` : ''}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="import-target">Add to</Label>
                  <NativeSelect id="import-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="new">A new trip: {plan.trip.name}</option>
                    {trips.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <Button className="w-full" size="lg" disabled={!!progress} onClick={run}>
                  {progress ? (
                    <>
                      <Loader2 className="animate-spin" />
                      {progress.total ? `Finding places ${progress.done} of ${progress.total}…` : 'Importing…'}
                    </>
                  ) : (
                    'Import'
                  )}
                </Button>
              </section>
            )}
          </>
        )}
      </main>
    </>
  )
}
