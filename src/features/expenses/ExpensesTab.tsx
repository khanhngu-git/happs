import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { query, where } from 'firebase/firestore'
import { Check, ChevronRight, Receipt, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { Fab } from '@/components/Fab'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar } from '@/components/UserAvatar'
import { useTrip } from '@/features/trips/TripContext'
import { useItems } from '@/features/itinerary/itineraryApi'
import { refs, useLiveQuery, type Expense, type SettlementBatch, type Share } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/shared/money'
import { formatShortDate } from '@/shared/dates'
import { pairwiseDebts, type PairDebt } from '@/shared/balances'
import { SHARE_STATUS_LABEL } from '@/shared/shareState'
import { requestPushAfterAction } from '@/features/notifications/push'
import { ExpenseFormDialog } from './ExpenseFormDialog'
import { ExpenseSheet } from './ExpenseSheet'
import { DisputeDialog, MarkPaidDialog } from './PaymentDialogs'
import { ShareRow } from './ShareRow'
import { useExpenses, useTripShares } from './expenseApi'
import { resolveBatch, settleAll } from './shareApi'

/** iOS inset-grouped section: small caps header above a rounded list. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="px-4 pb-1.5 text-[0.8125rem] font-medium text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  )
}

const listCls = 'divide-y divide-border/70 overflow-hidden rounded-2xl bg-card ring-1 ring-border/70'

function NeedsConfirmation({ shares, batches, onOpenBatch }: { shares: Share[]; batches: SettlementBatch[]; onOpenBatch(b: SettlementBatch): void }) {
  const { me, nameOf, trip } = useTrip()
  const batchIds = new Set(batches.map((b) => b.id))
  const single = shares.filter((s) => s.payerUid === me && s.status === 'sent' && !(s.batchId && batchIds.has(s.batchId)))
  if (single.length === 0 && batches.length === 0) return null
  return (
    <Group title="Needs your confirmation">
      <ul className={cn(listCls, 'ring-warning/40')}>
        {batches.map((b) => (
          <li key={b.id}>
            <button type="button" onClick={() => onOpenBatch(b)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-foreground/[0.06]">
              <span className="min-w-0 flex-1 text-[1.0625rem]">
                {nameOf(b.fromUid)} paid you <strong className="font-semibold">{formatMoney(b.totalBaseMinor, trip.baseCurrency)}</strong>
              </span>
              <span className="text-[0.9375rem] font-medium text-primary">Review</span>
            </button>
          </li>
        ))}
        {single.map((s) => (
          <ShareRow key={`${s.expenseId}/${s.id}`} share={s} />
        ))}
      </ul>
    </Group>
  )
}

/** One person in "You owe" / "Owes you". */
function PersonRow({ uid, pair, onOpen }: { uid: string; pair: PairDebt; onOpen(): void }) {
  const { nameOf, membersById, trip, me } = useTrip()
  const m = membersById.get(uid)
  const waiting = pair.awaitingMinor === pair.totalMinor
  const disputed = pair.shares.filter((s) => s.status === 'disputed').length
  const sub = disputed
    ? pair.fromUid === me
      ? `${nameOf(uid)} hasn’t received ${disputed === 1 ? 'a payment' : `${disputed} payments`}. Check and send again`
      : `You marked ${disputed === 1 ? 'a payment' : `${disputed} payments`} as not received`
    : waiting
      ? pair.fromUid === me
        ? `Waiting for ${nameOf(uid)} to confirm`
        : 'Says they’ve paid'
      : pair.awaitingMinor > 0
        ? 'Partly paid'
        : null
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-foreground/[0.06]">
        <UserAvatar name={m?.displayName} photoURL={m?.photoURL} className="size-9" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[1.0625rem]">{nameOf(uid)}</span>
          {sub && <span className={cn('block text-[0.875rem]', disputed ? 'font-medium text-destructive' : 'text-muted-foreground')}>{sub}</span>}
        </span>
        <span className="text-[1.0625rem] font-semibold tabular-nums">{formatMoney(pair.totalMinor, trip.baseCurrency)}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/70" aria-hidden />
      </button>
    </li>
  )
}

/** Everything between me and one person, with the one action that matters. */
function PersonSheet({ pair, shares, expensesById, onOpenChange }: { pair: PairDebt | null; shares: Share[]; expensesById: Map<string, Expense>; onOpenChange(o: boolean): void }) {
  const { me, nameOf, trip, membersById } = useTrip()
  const [settling, setSettling] = useState(false)
  if (!pair) return null
  const iOwe = pair.fromUid === me
  const other = iOwe ? pair.toUid : pair.fromUid
  const full = shares.filter((s) => pair.shares.some((p) => p.id === s.id && s.expenseId === p.expenseId))
  const settleable = full.filter((s) => s.status === 'unpaid' || s.status === 'disputed')
  const settleTotal = settleable.reduce((s, x) => s + x.amountBaseMinor, 0)
  return (
    <>
      <Dialog open={!!pair} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{iOwe ? `You owe ${nameOf(other)}` : `${nameOf(other)} owes you`}</DialogTitle>
            <DialogDescription className="text-foreground/80">{formatMoney(pair.totalMinor, trip.baseCurrency)}</DialogDescription>
          </DialogHeader>
          {iOwe ? (
            <ul className={listCls}>
              {full.map((s) => (
                <li key={`${s.expenseId}/${s.id}`} className="flex min-h-12 items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{expensesById.get(s.expenseId)?.title ?? s.expenseTitle}</span>
                    {s.status !== 'unpaid' && <span className="block text-[0.875rem] text-muted-foreground">{SHARE_STATUS_LABEL[s.status]}</span>}
                  </span>
                  <span className="tabular-nums">{formatMoney(s.amountBaseMinor, trip.baseCurrency)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className={listCls}>
              {full.map((s) => (
                <li key={`${s.expenseId}/${s.id}`}>
                  <p className="px-4 pt-3 font-medium">{expensesById.get(s.expenseId)?.title ?? s.expenseTitle}</p>
                  <ShareRow share={s} secondary />
                </li>
              ))}
            </ul>
          )}
          {iOwe && settleable.length > 0 && (
            <Button size="lg" onClick={() => setSettling(true)}>
              <Send /> Settle up {formatMoney(settleTotal, trip.baseCurrency)}
            </Button>
          )}
          {iOwe && settleable.length === 0 && <p className="text-center text-[0.9375rem] text-muted-foreground">Waiting for {nameOf(other)} to confirm.</p>}
        </DialogContent>
      </Dialog>
      <MarkPaidDialog
        open={settling}
        onOpenChange={setSettling}
        title={`Pay ${nameOf(other)}`}
        description={`${formatMoney(settleTotal, trip.baseCurrency)} in one payment.`}
        payTo={membersById.get(other)?.payTo}
        amountMinor={settleTotal}
        currency={trip.baseCurrency}
        onSubmit={async (d) => {
          try {
            await settleAll(trip.id, me, other, full, d)
            toast.success(`We’ll ask ${nameOf(other)} to confirm`)
            onOpenChange(false)
            void requestPushAfterAction()
          } catch (err) {
            console.error(err)
            toast.error('Couldn’t settle up. Try again.')
          }
        }}
      />
    </>
  )
}

function BatchSheet({ batch, shares, expensesById, onOpenChange }: { batch: SettlementBatch | null; shares: Share[]; expensesById: Map<string, Expense>; onOpenChange(o: boolean): void }) {
  const { me, nameOf, trip } = useTrip()
  const [disputing, setDisputing] = useState(false)
  if (!batch) return null
  const inBatch = shares.filter((s) => s.batchId === batch.id)
  return (
    <>
      <Dialog open={!!batch} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {nameOf(batch.fromUid)} sent you {formatMoney(batch.totalBaseMinor, trip.baseCurrency)}
            </DialogTitle>
            <DialogDescription className="text-foreground/80">To settle {inBatch.length} expenses. Confirm all at once, or one by one below.</DialogDescription>
          </DialogHeader>
          <ul className="divide-y divide-border/70 overflow-hidden rounded-[1.25rem] bg-card ring-1 ring-border/70">
            {inBatch.map((s) => (
              <li key={`${s.expenseId}/${s.id}`}>
                <p className="px-4 pt-3 text-sm font-semibold">{expensesById.get(s.expenseId)?.title ?? s.expenseTitle}</p>
                <ShareRow share={s} secondary />
              </li>
            ))}
          </ul>
          {batch.status === 'sent' && batch.toUid === me && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setDisputing(true)}>
                <X /> Not received
              </Button>
              <Button
                onClick={() =>
                  resolveBatch(batch, shares, me, 'confirmed').then(
                    () => {
                      toast.success('All confirmed. Thanks!')
                      onOpenChange(false)
                    },
                    () => toast.error('Couldn’t confirm. Try again.'),
                  )
                }
              >
                <Check /> Confirm all
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <DisputeDialog
        open={disputing}
        onOpenChange={setDisputing}
        onSubmit={(r) =>
          resolveBatch(batch, shares, me, 'disputed', r).then(() => {
            toast.success('Marked as not received')
            onOpenChange(false)
          })
        }
      />
    </>
  )
}

export function ExpensesTab() {
  const { trip, me, nameOf } = useTrip()
  const [params, setParams] = useSearchParams()
  const { data: expenses, loading } = useExpenses(trip.id)
  const { data: shares } = useTripShares(trip.id)
  const { data: items } = useItems(trip.id)
  const { data: batches } = useLiveQuery<SettlementBatch>(
    query(refs.batches(trip.id), where('toUid', '==', me), where('status', '==', 'sent')),
    `batches:${trip.id}:${me}`,
  )
  const [formOpen, setFormOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [openPair, setOpenPair] = useState<string | null>(null)

  const expensesById = useMemo(() => new Map(expenses.map((e) => [e.id, e])), [expenses])
  const pairs = useMemo(() => pairwiseDebts(shares), [shares])
  const iOwe = pairs.filter((p) => p.fromUid === me)
  const owedToMe = pairs.filter((p) => p.toUid === me)
  const pair = pairs.find((p) => `${p.fromUid}>${p.toUid}` === openPair) ?? null

  // Deep links from notifications: ?share=<path> or ?batch=<id>
  const sharePath = params.get('share')
  const linkedShare = sharePath ? shares.find((s) => s.path === sharePath) : undefined
  const openExpenseId = params.get('expense') ?? linkedShare?.expenseId ?? null
  const openExpense = openExpenseId ? (expensesById.get(openExpenseId) ?? null) : null
  const openBatch = batches.find((b) => b.id === params.get('batch')) ?? null
  const clear = (...keys: string[]) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        keys.forEach((k) => n.delete(k))
        return n
      },
      { replace: true },
    )
  const openParam = (k: string, v: string) => setParams((p) => new URLSearchParams({ ...Object.fromEntries(p), [k]: v }), { replace: true })
  const newExpense = () => {
    setEditing(null)
    setFormKey((k) => k + 1)
    setFormOpen(true)
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4">
      <h1 className="large-title pt-1">Expenses</h1>

      <NeedsConfirmation shares={shares} batches={batches} onOpenBatch={(b) => openParam('batch', b.id)} />

      {iOwe.length === 0 && owedToMe.length === 0 ? (
        expenses.length > 0 && (
          <p className="flex items-center gap-2 rounded-2xl bg-card px-4 py-3.5 text-[1.0625rem] ring-1 ring-border/70">
            <Check className="size-5 text-success" aria-hidden /> You’re all settled up
          </p>
        )
      ) : (
        <>
          {iOwe.length > 0 && (
            <Group title="You owe">
              <ul className={listCls}>
                {iOwe.map((p) => (
                  <PersonRow key={p.toUid} uid={p.toUid} pair={p} onOpen={() => setOpenPair(`${p.fromUid}>${p.toUid}`)} />
                ))}
              </ul>
            </Group>
          )}
          {owedToMe.length > 0 && (
            <Group title="Owes you">
              <ul className={listCls}>
                {owedToMe.map((p) => (
                  <PersonRow key={p.fromUid} uid={p.fromUid} pair={p} onOpen={() => setOpenPair(`${p.fromUid}>${p.toUid}`)} />
                ))}
              </ul>
            </Group>
          )}
        </>
      )}

      {loading ? (
        <Skeleton className="h-40 rounded-2xl" aria-busy />
      ) : expenses.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <Receipt className="size-10 text-muted-foreground/60" aria-hidden />
          <p className="text-[1.0625rem] font-semibold">No expenses yet</p>
          <p className="max-w-xs text-[0.9375rem] text-muted-foreground">Add groceries, taxis, dinners. Costs added to activities show up here too.</p>
          <Button variant="secondary" onClick={newExpense}>
            Add an expense
          </Button>
        </div>
      ) : (
        <Group title="All expenses">
          <ul className={listCls}>
            {expenses.map((e) => {
              const mine = shares.find((s) => s.expenseId === e.id && s.debtorUid === me && s.payerUid !== me)
              return (
                <li key={e.id}>
                  <button type="button" onClick={() => openParam('expense', e.id)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-foreground/[0.06]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[1.0625rem]">{e.title}</span>
                      <span className="block truncate text-[0.875rem] text-muted-foreground">
                        {e.paidBy === me ? 'You paid' : `${nameOf(e.paidBy)} paid`} · {formatShortDate(e.date)}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[1.0625rem] tabular-nums">{formatMoney(e.amountMinor, e.currency)}</span>
                      {mine && (
                        <span className={cn('block text-[0.8125rem]', mine.status === 'confirmed' ? 'text-success' : 'text-muted-foreground')}>
                          {mine.status === 'confirmed' ? 'Paid' : mine.status === 'sent' ? 'Awaiting confirmation' : `You owe ${formatMoney(mine.amountMinor, e.currency)}`}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Group>
      )}

      <Fab label="Add expense" withTabBar onClick={newExpense} />
      <ExpenseFormDialog key={formKey} open={formOpen} onOpenChange={setFormOpen} expense={editing} items={items} />
      <ExpenseSheet
        expense={openExpense}
        shares={shares}
        onOpenChange={(o) => !o && clear('expense', 'share', 'action')}
        onEdit={() => {
          setEditing(openExpense)
          clear('expense', 'share', 'action')
          setFormKey((k) => k + 1)
          setFormOpen(true)
        }}
      />
      <PersonSheet pair={pair} shares={shares} expensesById={expensesById} onOpenChange={(o) => !o && setOpenPair(null)} />
      <BatchSheet batch={openBatch} shares={shares} expensesById={expensesById} onOpenChange={(o) => !o && clear('batch')} />
    </main>
  )
}
