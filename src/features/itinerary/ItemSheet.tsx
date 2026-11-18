import { useState } from 'react'
import { useNavigate } from 'react-router'
import { CalendarDays, ExternalLink, MapPin, Pencil, Receipt, Ticket, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useTrip } from '@/features/trips/TripContext'
import { SharesLockedError } from '@/features/expenses/expenseApi'
import type { Expense, Item } from '@/lib/firestore'
import { formatMoney } from '@/shared/money'
import { formatLongDate } from '@/shared/dates'
import { ItemTypeIcon } from './ItemTypeIcon'
import { googleMapsUrl, timeLabel } from './format'
import { deleteItem } from './itineraryApi'


export function ItemSheet({ item, expense, onOpenChange, onEdit }: { item: Item | null; expense?: Expense; onOpenChange(o: boolean): void; onEdit(): void }) {
  const { trip, me, isOwner, nameOf } = useTrip()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(false)
  if (!item) return null
  const canDelete = item.createdBy === me || isOwner

  return (
    <>
      <Dialog open={!!item} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader className="flex-row items-center gap-3">
            <ItemTypeIcon type={item.type} className="size-12" />
            <div className="min-w-0">
              <DialogTitle>{item.title}</DialogTitle>
              <DialogDescription className="text-foreground/80">{timeLabel(item)}</DialogDescription>
            </div>
          </DialogHeader>
          <dl className="space-y-3 text-[0.9375rem]">
            <div className="flex gap-3">
              <CalendarDays className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <dd>
                {item.type === 'stay' && item.checkOut ? `${formatLongDate(item.date)} → ${formatLongDate(item.checkOut.date)}` : formatLongDate(item.date)}
              </dd>
            </div>
            {item.location && (
              <div className="flex gap-3">
                <MapPin className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <dd>
                  <span className="font-medium">{item.location.name}</span>
                  {item.location.address && <span className="block text-muted-foreground">{item.location.address}</span>}
                </dd>
              </div>
            )}
            {expense && (
              <div className="flex gap-3">
                <Receipt className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <dd>
                  <span className="font-semibold">{formatMoney(expense.amountMinor, expense.currency)}</span>
                  {expense.currency !== trip.baseCurrency && <span className="text-muted-foreground"> ≈ {formatMoney(expense.amountBaseMinor, trip.baseCurrency)}</span>}
                  <span className="block text-muted-foreground">
                    Booked by {nameOf(expense.paidBy)} · split {expense.participantIds.length} ways
                  </span>
                </dd>
              </div>
            )}
            {item.bookingRef && (
              <div className="flex gap-3">
                <Ticket className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <dd className="font-mono select-all">{item.bookingRef}</dd>
              </div>
            )}
            {item.notes && <p className="rounded-2xl bg-foreground/[0.05] p-3 whitespace-pre-wrap">{item.notes}</p>}
          </dl>
          <div className="grid gap-2">
            <Button onClick={onEdit}>
              <Pencil /> Edit
            </Button>
            <div className="grid grid-cols-2 gap-2">
              {item.location && (
                <Button asChild variant="secondary">
                  <a href={googleMapsUrl(item.location)} target="_blank" rel="noreferrer">
                    <MapPin /> Google Maps
                  </a>
                </Button>
              )}
              {item.location?.lat != null && (
                <Button variant="secondary" onClick={() => navigate(`/trips/${trip.id}/map?item=${item.id}&day=${item.date}`)}>
                  <MapPin /> On the map
                </Button>
              )}
              {item.bookingUrl && (
                <Button asChild variant="secondary">
                  <a href={item.bookingUrl} target="_blank" rel="noreferrer">
                    <ExternalLink /> Booking
                  </a>
                </Button>
              )}
            </div>
            {canDelete && (
              <Button variant="destructive" onClick={() => setConfirm(true)}>
                <Trash2 /> Delete
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete “${item.title}”?`}
        description={expense ? 'Its linked expense will be deleted too.' : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          try {
            await deleteItem(trip, item)
            toast.success('Deleted')
            onOpenChange(false)
          } catch (err) {
            if (err instanceof SharesLockedError) toast.warning('People have already paid towards this cost. Delete the expense from the Expenses tab first.')
            else toast.error('Couldn’t delete')
          }
        }}
      />
    </>
  )
}
