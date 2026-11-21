import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import { useTrip } from '@/features/trips/TripContext'
import type { Expense, Item } from '@/lib/firestore'
import { isDateString, todayInZone } from '@/shared/dates'
import { CostFields, useCostLocked } from './CostFields'
import { draftFromCost, emptyDraft, validateDraft, type CostDraft } from './costDraft'
import { createExpense, SharesLockedError, updateExpense } from './expenseApi'
import { EXPENSE_CATEGORIES } from './categories'

/** Add or edit an expense that isn't (necessarily) on the itinerary: groceries, a taxi… */
export function ExpenseFormDialog({ open, onOpenChange, expense, items }: { open: boolean; onOpenChange(o: boolean): void; expense: Expense | null; items: Item[] }) {
  const { trip, me, members } = useTrip()
  const today = todayInZone(trip.timeZone)
  const defaultDate = today >= trip.startDate && today <= trip.endDate ? today : trip.startDate
  // The parent remounts this dialog (via `key`) each time it opens, so state starts fresh.
  const [title, setTitle] = useState(expense?.title ?? '')
  const [date, setDate] = useState(expense?.date ?? defaultDate)
  const [category, setCategory] = useState(expense?.category ?? 'food')
  const [linkedItemId, setLinkedItemId] = useState(expense?.linkedItemId ?? '')
  const [draft, setDraft] = useState<CostDraft>(() =>
    expense ? draftFromCost(expense) : emptyDraft({ currency: trip.baseCurrency, paidBy: me, memberIds: members.map((m) => m.id) }),
  )
  const [error, setError] = useState<string | null>(null)
  const costLocked = useCostLocked(trip.id, expense?.id)
  const [busy, setBusy] = useState(false)


  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError('Give the expense a name')
    if (!isDateString(date)) return setError('Pick a date')
    const r = validateDraft(draft, trip.baseCurrency)
    if (!r.ok) return setError(r.error)
    setBusy(true)
    try {
      const input = { ...r.cost, title: title.trim(), date, category, linkedItemId: linkedItemId || null }
      if (expense) await updateExpense(trip, expense, input, me)
      else await createExpense(trip, me, input)
      toast.success(expense ? 'Expense updated' : 'Expense added')
      onOpenChange(false)
    } catch (err) {
      if (err instanceof SharesLockedError) setError('Some people have already paid or confirmed their share, so the amount and split are locked. You can still change the name, date and category.')
      else {
        console.error(err)
        setError('Couldn’t save. Check your connection and try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{expense ? 'Edit expense' : 'Add expense'}</DialogTitle>
          <DialogDescription className="text-foreground/80">Everyone in the split will see what they owe.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="exp-title">What was it?</Label>
            <Input id="exp-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Groceries, taxi, dinner…" maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="exp-date">Date</Label>
              <Input id="exp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-cat">Category</Label>
              <NativeSelect id="exp-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <CostFields draft={draft} onChange={(d) => { setDraft(d); setError(null) }} idPrefix="exp" locked={costLocked} />
          {items.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="exp-item">Linked plan (optional)</Label>
              <NativeSelect id="exp-item" value={linkedItemId} onChange={(e) => setLinkedItemId(e.target.value)}>
                <option value="">None</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.title}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Saving…' : expense ? 'Save changes' : 'Add expense'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
