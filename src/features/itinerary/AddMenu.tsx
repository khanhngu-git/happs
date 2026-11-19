import { BedDouble, PencilLine } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const ROWS = [
  { key: 'own', label: 'Add your own', sub: 'Anything you’ve planned or booked', icon: PencilLine, color: 'text-primary' },
  { key: 'hotel', label: 'Find a hotel', sub: 'Live prices from Trip.com for your dates', icon: BedDouble, color: 'text-indigo-600 dark:text-indigo-400' },
] as const

/** iOS-style action sheet behind the itinerary's + button. */
export function AddMenu({ open, onOpenChange, onPick }: { open: boolean; onOpenChange(o: boolean): void; onPick(k: 'own' | 'hotel'): void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to the plan</DialogTitle>
          <DialogDescription className="sr-only">Add your own plan, or find a hotel</DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl bg-foreground/[0.04]">
          {ROWS.map(({ key, label, sub, icon: Icon, color }) => (
            <li key={key}>
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false)
                  onPick(key)
                }}
                className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-foreground/[0.06]"
              >
                <Icon className={`size-6 shrink-0 ${color}`} aria-hidden />
                <span>
                  <span className="block text-[1.0625rem]">{label}</span>
                  <span className="block text-[0.875rem] text-muted-foreground">{sub}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
