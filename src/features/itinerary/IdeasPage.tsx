import { useState } from 'react'
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { CalendarPlus, Heart, Lightbulb, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { useTrip } from '@/features/trips/TripContext'
import { db } from '@/lib/firebase'
import { refs, useLiveQuery, type Idea } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import type { Location } from '@/shared/schemas'
import { useItineraryDialogs } from './ItineraryDialogs'
import { useItems } from './itineraryApi'
import { PlacePicker } from './PlacePicker'
import { usePlaceBias } from './placeBias'
import { isMainlandChina } from './routes'
import { useTripDay } from './useTripDay'

/**
 * Ideas: things someone wants to do that aren't on a day yet. Everyone votes,
 * the most wanted rise to the top, and "Plan it" opens the normal form.
 */
export function IdeasPage() {
  const { trip, me, canManage, nameOf } = useTrip()
  const { data: items } = useItems(trip.id)
  const { data: ideas, loading } = useLiveQuery<Idea>(query(refs.ideas(trip.id), orderBy('createdAt', 'desc')), `ideas:${trip.id}`)
  const { dialogs, addPrefilled } = useItineraryDialogs(items)
  const { day } = useTripDay(trip)
  const bias = usePlaceBias(items, trip.destination)
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState<Location | null>(null)
  const [busy, setBusy] = useState(false)
  const sorted = [...ideas].sort((a, b) => b.votes.length - a.votes.length)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try {
      await addDoc(collection(db, 'trips', trip.id, 'ideas'), { title: title.trim(), type: 'activity', location, note: '', votes: [me], createdBy: me, createdAt: serverTimestamp() })
      setTitle('')
      setLocation(null)
    } catch (err) {
      console.error(err)
      toast.error('Couldn’t add the idea')
    } finally {
      setBusy(false)
    }
  }

  const toggleVote = (i: Idea) =>
    updateDoc(doc(db, 'trips', trip.id, 'ideas', i.id), { votes: i.votes.includes(me) ? arrayRemove(me) : arrayUnion(me) }).catch(() => toast.error('Couldn’t save your vote'))

  return (
    <main className="mx-auto max-w-2xl px-4 pb-28">
      <h1 className="large-title pb-1">Ideas</h1>
      <p className="pb-4 text-[0.9375rem] text-muted-foreground">Things you might do. Vote for the ones you want, then plan them onto a day.</p>

      <form onSubmit={add} className="space-y-3 rounded-[1.25rem] bg-card p-4 ring-1 ring-border/70">
        <Input aria-label="New idea" placeholder="e.g. Sunset at the Bund, hot pot night" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        {title.trim() && <PlacePicker id="idea-place" value={location} onChange={setLocation} bias={bias} localLanguage={isMainlandChina(trip.timeZone) ? 'zh-CN' : null} />}
        <Button type="submit" className="w-full" disabled={busy || !title.trim()}>
          <Lightbulb /> Add idea
        </Button>
      </form>

      <div className="mt-5">
        {loading ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : sorted.length === 0 ? (
          <EmptyState icon={<Lightbulb />} title="No ideas yet" description="Add places and things people mention, then vote on them together." />
        ) : (
          <ul className="divide-y divide-border/70 overflow-hidden rounded-[1.25rem] bg-card ring-1 ring-border/70">
            {sorted.map((i) => {
              const voted = i.votes.includes(me)
              return (
                <li key={i.id} className="flex items-center gap-3 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggleVote(i)}
                    aria-pressed={voted}
                    aria-label={`${voted ? 'Remove your vote for' : 'Vote for'} ${i.title}, ${i.votes.length} vote${i.votes.length === 1 ? '' : 's'}`}
                    className={cn('flex size-12 shrink-0 flex-col items-center justify-center rounded-2xl text-xs font-semibold', voted ? 'bg-rose-500/12 text-rose-600 dark:text-rose-400' : 'bg-foreground/[0.05] text-muted-foreground')}
                  >
                    <Heart className={cn('size-4', voted && 'fill-current')} aria-hidden />
                    {i.votes.length}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[1.0625rem]">{i.title}</span>
                    <span className="block truncate text-[0.875rem] text-muted-foreground">
                      {[i.location?.name !== i.title ? i.location?.name : null, `added by ${nameOf(i.createdBy)}`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-primary"
                    onClick={() => addPrefilled({ type: i.type, title: i.title, date: day, startTime: null, location: i.location, photoURL: null, notes: i.note, cost: null })}
                  >
                    <CalendarPlus /> Plan it
                  </Button>
                  {(i.createdBy === me || canManage) && (
                    <button
                      type="button"
                      onClick={() => deleteDoc(doc(db, 'trips', trip.id, 'ideas', i.id)).catch(() => toast.error('Couldn’t remove it'))}
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground"
                      aria-label={`Remove ${i.title}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {dialogs}
    </main>
  )
}
