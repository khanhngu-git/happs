import { useEffect, useState } from 'react'
import { CalendarDays, ExternalLink, FileText, MapPin, Pencil, Ticket, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useTrip } from '@/features/trips/TripContext'
import { SharesLockedError } from '@/features/expenses/expenseApi'
import type { Item } from '@/lib/firestore'
import { preloadAttachments } from '@/lib/uploads'
import { FileViewer } from './FileViewer'
import { ItemMetaSection } from './ItemMetaSection'
import type { Attachment } from '@/shared/schemas'
import { formatLongDate } from '@/shared/dates'
import { ItemTypeIcon } from './ItemTypeIcon'
import { googleMapsUrl, timeLabel } from './format'
import { RouteActions } from './RouteActions'
import { deleteItem } from './itineraryApi'

/** Activity details: when, where, notes and booking. Costs live in Expenses. */
export function ItemSheet({ item, onOpenChange, onEdit }: { item: Item | null; onOpenChange(o: boolean): void; onEdit(): void }) {
  const { trip, me, isOwner } = useTrip()
  const [confirm, setConfirm] = useState(false)
  const [viewing, setViewing] = useState<Attachment | null>(null)
  // Opening a plan loads its documents into Firestore's offline cache, so tickets open with no signal.
  const filesKey = (item?.attachments ?? []).map((a) => a.fileId ?? '').join('|')
  useEffect(() => {
    if (item && filesKey) preloadAttachments(trip.id, item.attachments ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey, trip.id])
  if (!item) return null
  const canDelete = item.createdBy === me || isOwner
  const when = item.type === 'stay' && item.checkOut ? `${formatLongDate(item.date)} → ${formatLongDate(item.checkOut.date)}` : formatLongDate(item.date)

  return (
    <>
      <Dialog open={!!item} onOpenChange={onOpenChange}>
        <DialogContent>
          {item.photoURL && <img src={item.photoURL} alt="" className="aspect-[16/9] w-full rounded-2xl object-cover" />}
          <DialogHeader className="flex-row items-center gap-3">
            <ItemTypeIcon type={item.type} className="size-12" />
            <div className="min-w-0">
              <DialogTitle>{item.title}</DialogTitle>
              <DialogDescription className="text-foreground/80">{timeLabel(item)}</DialogDescription>
            </div>
          </DialogHeader>
          <ItemMetaSection tripId={trip.id} item={item} />
          <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl bg-foreground/[0.04] text-[0.9375rem]">
            <li className="flex gap-3 px-4 py-3">
              <CalendarDays className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              {when}
            </li>
            {item.location && (
              <li>
                <a href={googleMapsUrl(item.location)} target="_blank" rel="noreferrer" className="flex gap-3 px-4 py-3 active:bg-foreground/[0.06]">
                  <MapPin className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block">{item.location.name}</span>
                    {item.location.address && <span className="block text-muted-foreground">{item.location.address}</span>}
                    {item.location.localName && item.location.localName !== item.location.name && (
                      <span className="block text-muted-foreground" lang="zh-CN">
                        {item.location.localName}
                      </span>
                    )}
                  </span>
                  <ExternalLink className="size-4 shrink-0 text-primary" aria-label="Open in Google Maps" />
                </a>
              </li>
            )}
            {(item.bookingRef || item.bookingUrl) && (
              <li className="flex gap-3 px-4 py-3">
                <Ticket className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  {item.bookingRef && <span className="block font-mono select-all">{item.bookingRef}</span>}
                  {item.bookingUrl && (
                    <a href={item.bookingUrl} target="_blank" rel="noreferrer" className="block truncate text-primary">
                      View booking
                    </a>
                  )}
                </span>
              </li>
            )}
          </ul>
          {(item.attachments ?? []).length > 0 && (
            <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl bg-foreground/[0.04] text-[0.9375rem]" aria-label="Tickets and documents">
              {(item.attachments ?? []).map((a) => (
                <li key={a.fileId ?? a.url ?? a.name}>
                  <button type="button" onClick={() => setViewing(a)} className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-foreground/[0.06]">
                    <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <ExternalLink className="size-4 shrink-0 text-primary" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {item.notes && <p className="text-[0.9375rem] whitespace-pre-wrap">{item.notes}</p>}
          {item.location && <RouteActions to={item.location} />}
          <Button variant={item.location ? 'secondary' : 'default'} onClick={onEdit}>
            <Pencil /> Edit
          </Button>
          {canDelete && (
            <Button variant="ghost" className="text-destructive" onClick={() => setConfirm(true)}>
              <Trash2 /> Delete
            </Button>
          )}
        </DialogContent>
      </Dialog>
      <FileViewer tripId={trip.id} file={viewing} onClose={() => setViewing(null)} />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete “${item.title}”?`}
        description={item.linkedExpenseId ? 'Its shared cost will be removed from Expenses too.' : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          try {
            await deleteItem(trip, item)
            toast.success('Deleted')
            onOpenChange(false)
          } catch (err) {
            if (err instanceof SharesLockedError) toast.warning('People have already paid towards this cost. Delete it from Expenses first.')
            else toast.error('Couldn’t delete')
          }
        }}
      />
    </>
  )
}

