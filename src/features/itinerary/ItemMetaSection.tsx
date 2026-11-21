import { arrayRemove, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { Circle, Globe2, MapPinOff, Shuffle } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/lib/firebase'
import type { Item } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import type { ItemStatus } from '@/shared/schemas'

const STATUS: Record<ItemStatus, { label: string; className: string }> = {
  booked: { label: 'Booked', className: 'bg-primary/15 text-primary' },
  planned: { label: 'Planned', className: 'bg-foreground/[0.08] text-foreground' },
  suggested: { label: 'Suggested', className: 'bg-foreground/[0.08] text-muted-foreground' },
  cancel: { label: 'Needs cancelling', className: 'bg-destructive/15 text-destructive' },
}

/** Status, what's still unknown, and alternatives, in a plan's details. */
export function ItemMetaSection({ tripId, item }: { tripId: string; item: Item }) {
  const m = item.meta
  if (!m) return null
  const needsBooking = m.bookingRequired && m.status !== 'booked'
  const tick = (entry: string) =>
    updateDoc(doc(db, 'trips', tripId, 'items', item.id), { 'meta.todo': arrayRemove(entry), updatedAt: serverTimestamp() }).catch(() => toast.error('Couldn’t update'))
  return (
    <div className="space-y-3">
      {(m.status || needsBooking) && (
        <div className="flex flex-wrap gap-2">
          {m.status && <span className={cn('rounded-full px-3 py-1 text-[0.8125rem] font-medium', STATUS[m.status].className)}>{STATUS[m.status].label}</span>}
          {needsBooking && <span className="rounded-full bg-warning/20 px-3 py-1 text-[0.8125rem] font-medium">Book ahead</span>}
        </div>
      )}
      {m.todo.length > 0 && (
        <section aria-labelledby={`missing-${item.id}`} className="overflow-hidden rounded-2xl bg-warning/10">
          <h3 id={`missing-${item.id}`} className="px-4 pt-3 text-[0.8125rem] font-semibold tracking-wide uppercase">
            Missing info
          </h3>
          <p className="px-4 text-sm text-muted-foreground">Tap one once you’ve added it with Edit.</p>
          <ul className="py-1">
            {m.todo.map((t) => (
              <li key={t}>
                <button type="button" onClick={() => tick(t)} className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-[0.9375rem] active:bg-foreground/[0.06]">
                  <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">{t}</span>
                  <span className="sr-only">Mark as added</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {m.needsLocationReview && item.location?.lat == null && (
        <p className="flex gap-3 rounded-2xl bg-foreground/[0.04] px-4 py-3 text-[0.9375rem]">
          <MapPinOff className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          Not on the map yet: the place search wasn’t sure which one this is. Use Edit to pick it.
        </p>
      )}
      {m.timeZone && (
        <p className="flex gap-3 rounded-2xl bg-foreground/[0.04] px-4 py-3 text-[0.9375rem]">
          <Globe2 className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          Times are in {m.timeZone.replaceAll('_', ' ')}.
        </p>
      )}
      {m.alternatives.length > 0 && (
        <div className="rounded-2xl bg-foreground/[0.04] px-4 py-3 text-[0.9375rem]">
          <p className="mb-1 flex items-center gap-2 font-medium">
            <Shuffle className="size-4 text-muted-foreground" aria-hidden /> Or instead
          </p>
          <ul className="space-y-1">
            {m.alternatives.map((a) => (
              <li key={a.name}>
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer" className="text-primary">
                    {a.name}
                  </a>
                ) : (
                  a.name
                )}
                {a.nameZh && (
                  <span className="text-muted-foreground" lang="zh-CN">
                    {' '}
                    · {a.nameZh}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
