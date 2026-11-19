import { useState } from 'react'
import { History, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useTrip } from '@/features/trips/TripContext'
import type { Expense, Share } from '@/lib/firestore'
import { formatMoney } from '@/shared/money'
import { formatLongDate, formatInstant } from '@/shared/dates'
import { SHARE_STATUS_LABEL } from '@/shared/shareState'
import { categoryLabel } from './categories'
import { deleteExpense } from './expenseApi'
import { ShareRow } from './ShareRow'

const SPLIT_LABEL = { equal: 'split equally', exact: 'split by amounts', percent: 'split by percent' } as const

export function ExpenseSheet({ expense, shares, onOpenChange, onEdit }: { expense: Expense | null; shares: Share[]; onOpenChange(o: boolean): void; onEdit(): void }) {
  const { trip, me, isOwner, nameOf } = useTrip()
  const [confirm, setConfirm] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  if (!expense) return null
  const mine = shares.filter((s) => s.expenseId === expense.id).sort((a, b) => (a.debtorUid === expense.paidBy ? -1 : b.debtorUid === expense.paidBy ? 1 : a.debtorUid.localeCompare(b.debtorUid)))
  const moneyMoved = mine.some((s) => s.debtorUid !== s.payerUid && s.status !== 'unpaid')
  const canDelete = expense.createdBy === me || isOwner
  const history = mine
    .flatMap((s) => s.history.filter((h) => h.byUid !== 'system').map((h) => ({ ...h, debtor: s.debtorUid })))
    .sort((a, b) => b.at.toMillis() - a.at.toMillis())

  return (
    <>
      <Dialog open={!!expense} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{expense.title}</DialogTitle>
            <DialogDescription className="text-foreground/80">
              {formatLongDate(expense.date)} · {categoryLabel(expense.category)}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-[1.25rem] bg-foreground/[0.05] p-4">
            <p className="text-3xl font-bold tabular-nums">{formatMoney(expense.amountMinor, expense.currency)}</p>
            {expense.currency !== trip.baseCurrency && (
              <p className="text-sm text-muted-foreground">
                ≈ {formatMoney(expense.amountBaseMinor, trip.baseCurrency)} at 1 {expense.currency} = {expense.fxRateToBase} {trip.baseCurrency}
              </p>
            )}
            <p className="mt-1 text-[0.9375rem]">
              Paid by <strong>{nameOf(expense.paidBy)}</strong>, {SPLIT_LABEL[expense.splitMethod]} between {expense.participantIds.length}
            </p>
          </div>
          {mine.length === 0 ? (
            <p className="text-sm text-muted-foreground" role="status">Working out who owes what…</p>
          ) : (
            <ul className="divide-y divide-border/70 overflow-hidden rounded-[1.25rem] bg-card ring-1 ring-border/70">
              {mine.map((s) => (
                <ShareRow key={s.id} share={s} showAmountIn={trip.baseCurrency} />
              ))}
            </ul>
          )}
          {history.length > 0 && (
            <div>
              <Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
                <History /> {showHistory ? 'Hide' : 'Show'} payment history
              </Button>
              {showHistory && (
                <ol className="mt-2 space-y-2 border-l-2 border-border pl-4 text-sm">
                  {history.map((h, i) => (
                    <li key={i}>
                      <span className="font-medium">{nameOf(h.byUid)}</span> → {SHARE_STATUS_LABEL[h.status].toLowerCase()}
                      {h.byUid !== h.debtor && ` (${nameOf(h.debtor)}’s share)`}
                      <span className="block text-muted-foreground">
                        {formatInstant(h.at.toDate())}
                        {h.note && ` · “${h.note}”`}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onEdit}>
              <Pencil /> Edit
            </Button>
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
        title={`Delete “${expense.title}”?`}
        description={moneyMoved ? 'Some people have already paid or confirmed their share. Deleting removes that history for everyone.' : 'Everyone’s share of this expense will be removed.'}
        confirmLabel="Delete expense"
        destructive
        onConfirm={async () => {
          try {
            await deleteExpense(trip, expense)
            toast.success('Expense deleted')
            onOpenChange(false)
          } catch {
            toast.error('Only the person who added it or the trip owner can delete it.')
          }
        }}
      />
    </>
  )
}
