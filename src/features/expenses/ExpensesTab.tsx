import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { query, where } from 'firebase/firestore'
import { ArrowRight, BellRing, Check, ChevronRight, Receipt, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/EmptyState'
import { Fab } from '@/components/Fab'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { AvatarStack, UserAvatar } from '@/components/UserAvatar'
import { useTrip } from '@/features/trips/TripContext'
import { useItems } from '@/features/itinerary/itineraryApi'
import { refs, useLiveQuery, type Expense, type SettlementBatch, type Share } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/shared/money'
import { formatShortDate } from '@/shared/dates'
import { mySummary, pairwiseDebts, type PairDebt } from '@/shared/balances'
import { requestPushAfterAction } from '@/features/notifications/push'
import { ExpenseFormDialog } from './ExpenseFormDialog'
import { ExpenseSheet } from './ExpenseSheet'
import { DisputeDialog, MarkPaidDialog } from './PaymentDialogs'
import { ShareRow } from './ShareRow'
import { ShareStatusChip } from './ShareStatusChip'
import { categoryLabel } from './categories'
import { useExpenses, useTripShares } from './expenseApi'
import { resolveBatch, settleAll } from './shareApi'

function Section({ title, id, children, action }: { title: string; id: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <div className="flex items-end justify-between px-1">
        <h2 id={id} className="text-xl font-bold tracking-tight">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function SummaryCard({ shares }: { shares: Share[] }) {
  const { trip, me } = useTrip()
  const s = mySummary(shares, me)
  const fmt = (n: number) => formatMoney(n, trip.baseCurrency)
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="My summary">
      <div className="rounded-[1.25rem] bg-card p-3 ring-1 ring-border/70">
        <p className="text-[0.8125rem] font-medium text-muted-foreground">You owe</p>
        <p className="text-lg font-bold tabular-nums">{fmt(s.youOweMinor)}</p>
        {s.awaitingTheirConfirmationMinor > 0 && <p className="text-xs text-muted-foreground">{fmt(s.awaitingTheirConfirmationMinor)} awaiting confirmation</p>}
      </div>
      <div className="rounded-[1.25rem] bg-card p-3 ring-1 ring-border/70">
        <p className="text-[0.8125rem] font-medium text-muted-foreground">You’re owed</p>
        <p className="text-lg font-bold tabular-nums">{fmt(s.youAreOwedMinor)}</p>
        {s.awaitingYourConfirmationMinor > 0 && <p className="text-xs text-muted-foreground">{fmt(s.awaitingYourConfirmationMinor)} to confirm</p>}
      </div>
      <div className={cn('col-span-2 flex items-baseline justify-between gap-2 rounded-[1.25rem] p-3 ring-1 sm:col-span-1 sm:block', s.netMinor >= 0 ? 'bg-success/10 ring-success/25' : 'bg-destructive/8 ring-destructive/20')}>
        <p className="text-[0.8125rem] font-medium text-muted-foreground">Net</p>
        <p className="text-lg font-bold tabular-nums">
          {s.netMinor > 0 ? '+' : s.netMinor < 0 ? '−' : ''}
          {fmt(Math.abs(s.netMinor))}
        </p>
        <p className="text-xs text-muted-foreground">{s.netMinor > 0 ? 'in your favour' : s.netMinor < 0 ? 'you owe overall' : 'all square'}</p>
      </div>
    </div>
  )
}

function NeedsConfirmation({ shares, batches, onOpenBatch }: { shares: Share[]; batches: SettlementBatch[]; onOpenBatch(b: SettlementBatch): void }) {
  const { me, nameOf, trip } = useTrip()
  const batchIds = new Set(batches.map((b) => b.id))
  const single = shares.filter((s) => s.payerUid === me && s.status === 'sent' && !(s.batchId && batchIds.has(s.batchId)))
  if (single.length === 0 && batches.length === 0) return null
  return (
    <Section title="Needs your confirmation" id="needs-h">
      <div className="overflow-hidden rounded-[1.25rem] bg-warning/12 ring-1 ring-warning/30">
        <p className="flex items-center gap-2 px-4 pt-3 text-sm font-medium">
          <BellRing className="size-4" aria-hidden /> Check your account, then confirm.
        </p>
        <ul className="divide-y divide-border/60">
          {batches.map((b) => (
            <li key={b.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {nameOf(b.fromUid)} settled up {formatMoney(b.totalBaseMinor, trip.baseCurrency)}
                </p>
                <p className="text-sm text-muted-foreground">{b.shareRefs.length} expenses in one payment</p>
              </div>
              <Button size="sm" onClick={() => onOpenBatch(b)}>
                Review
              </Button>
            </li>
          ))}
          {single.map((s) => (
            <ShareRow key={s.id} share={s} />
          ))}
        </ul>
      </div>
    </Section>
  )
}

function PairRow({ pair, onOpen }: { pair: PairDebt; onOpen(): void }) {
  const { me, nameOf, trip, membersById } = useTrip()
  const from = membersById.get(pair.fromUid)
  const to = membersById.get(pair.toUid)
  const text = pair.fromUid === me ? `You owe ${nameOf(pair.toUid)}` : pair.toUid === me ? `${nameOf(pair.fromUid)} owes you` : `${nameOf(pair.fromUid)} owes ${nameOf(pair.toUid)}`
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left outline-none focus-visible:bg-foreground/5 hover:bg-foreground/[0.03]">
        <div className="flex items-center">
          <UserAvatar name={from?.displayName} photoURL={from?.photoURL} className="size-8" />
          <ArrowRight className="mx-0.5 size-4 text-muted-foreground" aria-hidden />
          <UserAvatar name={to?.displayName} photoURL={to?.photoURL} className="size-8" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn('line-clamp-2', (pair.fromUid === me || pair.toUid === me) && 'font-semibold')}>{text}</p>
          {pair.awaitingMinor > 0 && <p className="text-sm text-muted-foreground">{formatMoney(pair.awaitingMinor, trip.baseCurrency)} awaiting confirmation</p>}
        </div>
        <span className="font-bold tabular-nums">{formatMoney(pair.totalMinor, trip.baseCurrency)}</span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </button>
    </li>
  )
}

function PairSheet({ pair, expensesById, onOpenChange }: { pair: PairDebt | null; expensesById: Map<string, Expense>; onOpenChange(o: boolean): void }) {
  const { me, nameOf, trip } = useTrip()
  const [settling, setSettling] = useState(false)
  if (!pair) return null
  const iOwe = pair.fromUid === me
  const settleable = pair.shares.filter((s) => s.status === 'unpaid' || s.status === 'disputed')
  const settleTotal = settleable.reduce((s, x) => s + x.amountBaseMinor, 0)
  const full = pair.shares as unknown as Share[]
  return (
    <>
      <Dialog open={!!pair} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{iOwe ? `You owe ${nameOf(pair.toUid)}` : `${nameOf(pair.fromUid)} owes ${pair.toUid === me ? 'you' : nameOf(pair.toUid)}`}</DialogTitle>
            <DialogDescription className="text-foreground/80">{formatMoney(pair.totalMinor, trip.baseCurrency)} across {pair.shares.length} expenses</DialogDescription>
          </DialogHeader>
          <ul className="divide-y divide-border/70 overflow-hidden rounded-[1.25rem] bg-card ring-1 ring-border/70">
            {full.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{expensesById.get(s.expenseId)?.title ?? s.expenseTitle}</p>
                  <p className="text-sm text-muted-foreground">{expensesById.get(s.expenseId) && formatShortDate(expensesById.get(s.expenseId)!.date)}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-semibold tabular-nums">{formatMoney(s.amountBaseMinor, trip.baseCurrency)}</span>
                  <ShareStatusChip status={s.status} />
                </div>
              </li>
            ))}
          </ul>
          {iOwe && settleable.length > 0 && (
            <Button size="lg" onClick={() => setSettling(true)}>
              <Send /> Settle all with {nameOf(pair.toUid)} · {formatMoney(settleTotal, trip.baseCurrency)}
            </Button>
          )}
          {iOwe && settleable.length === 0 && <p className="text-center text-sm text-muted-foreground">Everything here is waiting for {nameOf(pair.toUid)} to confirm.</p>}
        </DialogContent>
      </Dialog>
      <MarkPaidDialog
        open={settling}
        onOpenChange={setSettling}
        title={`Settle up with ${nameOf(pair.toUid)}`}
        description={`One payment of ${formatMoney(settleTotal, trip.baseCurrency)} covering ${settleable.length} expense${settleable.length === 1 ? '' : 's'}.`}
        onSubmit={async (d) => {
          try {
            await settleAll(trip.id, me, pair.toUid, full, d)
            toast.success(`We’ll ask ${nameOf(pair.toUid)} to confirm`)
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
              <div key={s.id}>
                <p className="px-4 pt-3 text-sm font-semibold">{expensesById.get(s.expenseId)?.title ?? s.expenseTitle}</p>
                <ShareRow share={s} secondary />
              </div>
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
  const { trip, me, members, nameOf } = useTrip()
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
  const sharesByExpense = useMemo(() => {
    const m = new Map<string, Share[]>()
    for (const s of shares) m.set(s.expenseId, [...(m.get(s.expenseId) ?? []), s])
    return m
  }, [shares])
  const pairs = useMemo(() => pairwiseDebts(shares), [shares])
  const pair = pairs.find((p) => `${p.fromUid}>${p.toUid}` === openPair) ?? null

  // Deep links from notifications: ?share=<path>[&action=confirm|dispute] or ?batch=<id>
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

  const total = expenses.reduce((s, e) => s + e.amountBaseMinor, 0)

  return (
    <main className="mx-auto max-w-2xl space-y-7 px-4 pt-4">
      <NeedsConfirmation shares={shares} batches={batches} onOpenBatch={(b) => openParam('batch', b.id)} />
      <Section title="My summary" id="summary-h">
        <SummaryCard shares={shares} />
      </Section>

      <Section title="Who owes who" id="pairs-h">
        {pairs.length === 0 ? (
          <p className="rounded-[1.25rem] bg-card px-4 py-4 text-[0.9375rem] ring-1 ring-border/70">{expenses.length ? 'Everyone’s square. Nice.' : 'Nobody owes anything yet.'}</p>
        ) : (
          <ul className="divide-y divide-border/70 overflow-hidden rounded-[1.25rem] bg-card ring-1 ring-border/70">
            {pairs.map((p) => (
              <PairRow key={`${p.fromUid}>${p.toUid}`} pair={p} onOpen={() => setOpenPair(`${p.fromUid}>${p.toUid}`)} />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="All expenses"
        id="all-h"
        action={expenses.length > 0 && <span className="text-sm text-muted-foreground tabular-nums">Total {formatMoney(total, trip.baseCurrency)}</span>}
      >
        {loading ? (
          <div className="space-y-2" aria-busy>
            <Skeleton className="h-20 rounded-[1.25rem]" />
            <Skeleton className="h-20 rounded-[1.25rem]" />
          </div>
        ) : expenses.length === 0 ? (
          <EmptyState
            icon={<Receipt />}
            title="No expenses yet"
            description="Add a cost to a plan in the itinerary, or add groceries, taxis and anything else here."
            action={<Button onClick={() => { setEditing(null); setFormKey((k) => k + 1); setFormOpen(true) }}>Add an expense</Button>}
          />
        ) : (
          <ul className="space-y-2">
            {expenses.map((e) => {
              const es = sharesByExpense.get(e.id) ?? []
              const others = es.filter((s) => s.debtorUid !== s.payerUid)
              const mineShare = es.find((s) => s.debtorUid === me && s.payerUid !== me)
              return (
                <li key={e.id}>
                  <button type="button" onClick={() => openParam('expense', e.id)} className="block w-full rounded-[1.25rem] bg-card p-4 text-left ring-1 ring-border/70 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{e.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatShortDate(e.date)} · {categoryLabel(e.category)} · paid by {nameOf(e.paidBy)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold tabular-nums">{formatMoney(e.amountMinor, e.currency)}</p>
                        {e.currency !== trip.baseCurrency && <p className="text-xs text-muted-foreground tabular-nums">≈ {formatMoney(e.amountBaseMinor, trip.baseCurrency)}</p>}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <AvatarStack people={e.participantIds.map((id) => ({ id, displayName: members.find((m) => m.id === id)?.displayName ?? '?', photoURL: members.find((m) => m.id === id)?.photoURL ?? null }))} max={5} />
                      {mineShare ? (
                        <ShareStatusChip status={mineShare.status} label={`You ${formatMoney(mineShare.amountMinor, e.currency)}`} />
                      ) : (
                        others.map((s) => <ShareStatusChip key={s.id} status={s.status} label={nameOf(s.debtorUid)} />)
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Fab label="Add expense" withTabBar onClick={() => { setEditing(null); setFormKey((k) => k + 1); setFormOpen(true) }} />
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
      <PairSheet pair={pair} expensesById={expensesById} onOpenChange={(o) => !o && setOpenPair(null)} />
      <BatchSheet batch={openBatch} shares={shares} expensesById={expensesById} onOpenChange={(o) => !o && clear('batch')} />
    </main>
  )
}
