import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Item } from '@/lib/firestore'
import type { BookingKind } from '@/shared/booking'
import { ActivityPanel } from './ActivityPanel'
import { FlightPanel } from './FlightPanel'
import { HotelPanel } from './HotelPanel'

/** Find & book flights, hotels and activities (RouteStack). Trains aren't offered by the provider yet. */
export function BookingSheet({
  kind,
  onKind,
  onOpenChange,
  items,
  day,
}: {
  kind: BookingKind | null
  onKind(k: BookingKind): void
  onOpenChange(o: boolean): void
  items: Item[]
  day: string
}) {
  const done = () => onOpenChange(false)
  return (
    <Dialog open={!!kind} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Find & book</DialogTitle>
          <DialogDescription className="text-foreground/80">Live prices. You pay on the provider’s secure checkout.</DialogDescription>
        </DialogHeader>
        <ToggleGroup type="single" value={kind ?? undefined} onValueChange={(v) => v && onKind(v as BookingKind)} className="w-full" aria-label="What to book">
          <ToggleGroupItem value="flight">Flights</ToggleGroupItem>
          <ToggleGroupItem value="hotel">Hotels</ToggleGroupItem>
          <ToggleGroupItem value="activity">Activities</ToggleGroupItem>
        </ToggleGroup>
        {kind === 'flight' && <FlightPanel key="f" items={items} onDone={done} />}
        {kind === 'hotel' && <HotelPanel key="h" items={items} onDone={done} />}
        {kind === 'activity' && <ActivityPanel key="a" items={items} day={day} onDone={done} />}
      </DialogContent>
    </Dialog>
  )
}
