import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarPlus, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/EmptyState'
import { Fab } from '@/components/Fab'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useTrip } from '@/features/trips/TripContext'
import { useExpenses } from '@/features/expenses/expenseApi'
import type { Expense, Item } from '@/lib/firestore'
import { formatMoney } from '@/shared/money'
import { formatLongDate, todayInZone, tripDays } from '@/shared/dates'
import { itemsForDay, staysForDay } from '@/shared/itinerary'
import { DayPicker } from './DayPicker'
import { ItemCard } from './ItemCard'
import { ItemFormDialog } from './ItemFormDialog'
import { ItemSheet } from './ItemSheet'
import { StayBanner } from './StayBanner'
import { reorderItems, useItems } from './itineraryApi'

function SortableItem({ item, expense, onOpen }: { item: Item; expense?: Expense; onOpen(): void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  return (
    <ItemCard
      ref={setNodeRef}
      item={item}
      expense={expense}
      onOpen={onOpen}
      className={isDragging ? 'z-10 shadow-lg' : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      handle={
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="flex w-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-r-[1.25rem] text-muted-foreground active:cursor-grabbing"
          aria-label={`Reorder ${item.title}`}
        >
          <GripVertical className="size-5" />
        </button>
      }
    />
  )
}

function DaySection({
  date,
  index,
  items,
  expensesById,
  sortable,
  onOpen,
  onAdd,
}: {
  date: string
  index: number
  items: Item[]
  expensesById: Map<string, Expense>
  sortable: boolean
  onOpen(i: Item): void
  onAdd(date: string): void
}) {
  const { trip } = useTrip()
  const day = itemsForDay(items, date)
  const stays = staysForDay(items, date)
  const anytime = day.filter((i) => !i.startTime && i.type !== 'stay')
  const timed = day.filter((i) => i.startTime || i.type === 'stay')
  const subtotal = day.reduce((s, i) => s + (i.linkedExpenseId ? (expensesById.get(i.linkedExpenseId)?.amountBaseMinor ?? 0) : 0), 0)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return
    const from = anytime.findIndex((i) => i.id === e.active.id)
    const to = anytime.findIndex((i) => i.id === e.over!.id)
    reorderItems(trip.id, anytime, from, to).catch(() => toast.error('Couldn’t save the new order'))
  }

  return (
    <section aria-labelledby={`day-${date}`} className="space-y-3">
      <h2 id={`day-${date}`} className="px-1 text-xl font-bold tracking-tight">
        Day {index + 1} <span className="font-semibold text-muted-foreground">· {formatLongDate(date)}</span>
      </h2>
      {stays.map((s) => (
        <StayBanner key={s.stay.id} info={s} onOpen={() => onOpen(s.stay)} />
      ))}
      {day.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus />}
          title={`No plans for Day ${index + 1} yet`}
          description="Add your first activity, a meal, or how you’re getting around."
          action={<Button onClick={() => onAdd(date)}>Add a plan</Button>}
        />
      ) : (
        <>
          {anytime.length > 0 && (
            <div className="space-y-2">
              <h3 className="px-1 text-[0.8125rem] font-semibold tracking-wide text-muted-foreground uppercase">Anytime</h3>
              {sortable ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={anytime.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {anytime.map((i) => (
                        <SortableItem key={i.id} item={i} expense={i.linkedExpenseId ? expensesById.get(i.linkedExpenseId) : undefined} onOpen={() => onOpen(i)} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                anytime.map((i) => <ItemCard key={i.id} item={i} expense={i.linkedExpenseId ? expensesById.get(i.linkedExpenseId) : undefined} onOpen={() => onOpen(i)} />)
              )}
            </div>
          )}
          {timed.length > 0 && (
            <ol className="relative space-y-2 border-l-2 border-border pl-4 ml-3">
              {timed.map((i) => (
                <li key={i.id} className="relative">
                  <span className="absolute top-6 -left-[1.4rem] size-3 rounded-full bg-primary ring-4 ring-grouped" aria-hidden />
                  <ItemCard item={i} expense={i.linkedExpenseId ? expensesById.get(i.linkedExpenseId) : undefined} onOpen={() => onOpen(i)} />
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      {subtotal > 0 && (
        <p className="flex justify-between px-1 text-[0.9375rem]">
          <span className="text-muted-foreground">Day {index + 1} costs</span>
          <span className="font-semibold tabular-nums">{formatMoney(subtotal, trip.baseCurrency)}</span>
        </p>
      )}
    </section>
  )
}

export function ItineraryTab() {
  const { trip } = useTrip()
  const [params, setParams] = useSearchParams()
  const { data: items, loading } = useItems(trip.id)
  const { data: expenses } = useExpenses(trip.id)
  const days = useMemo(() => tripDays(trip.startDate, trip.endDate), [trip.startDate, trip.endDate])
  const today = todayInZone(trip.timeZone)
  const defaultDay = days.includes(today) ? today : days[0]!
  const selected = days.includes(params.get('day') ?? '') ? params.get('day')! : defaultDay
  const view = params.get('view') === 'all' ? 'all' : 'day'

  const [formOpen, setFormOpen] = useState(false)
  const [formDate, setFormDate] = useState(selected)
  const [editing, setEditing] = useState<Item | null>(null)
  const openItemId = params.get('item')
  const openItem = items.find((i) => i.id === openItemId) ?? null

  const expensesById = useMemo(() => new Map(expenses.map((e) => [e.id, e])), [expenses])
  const tripTotal = items.reduce((s, i) => s + (i.linkedExpenseId ? (expensesById.get(i.linkedExpenseId)?.amountBaseMinor ?? 0) : 0), 0)
  const nextOrder = Math.max(0, ...items.map((i) => i.order)) + 1000

  const setParam = (k: string, v: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (v === null) n.delete(k)
        else n.set(k, v)
        return n
      },
      { replace: true },
    )

  const add = (date: string) => {
    setEditing(null)
    setFormDate(date)
    setFormOpen(true)
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 pt-4">
      <div className="flex items-center justify-between gap-3 px-4">
        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setParam('view', v === 'all' ? 'all' : null)} aria-label="Itinerary view">
          <ToggleGroupItem value="day">By day</ToggleGroupItem>
          <ToggleGroupItem value="all">All days</ToggleGroupItem>
        </ToggleGroup>
        <div className="text-right">
          <p className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">Planned costs</p>
          <p className="font-bold tabular-nums">{formatMoney(tripTotal, trip.baseCurrency)}</p>
        </div>
      </div>
      {view === 'day' && <DayPicker days={days} selected={selected} today={today} onSelect={(d) => setParam('day', d)} />}
      <div className="space-y-8 px-4">
        {loading ? (
          <div className="space-y-3" aria-busy>
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-20 rounded-[1.25rem]" />
            <Skeleton className="h-20 rounded-[1.25rem]" />
          </div>
        ) : view === 'day' ? (
          <DaySection date={selected} index={days.indexOf(selected)} items={items} expensesById={expensesById} sortable onOpen={(i) => setParam('item', i.id)} onAdd={add} />
        ) : (
          days.map((d, idx) => <DaySection key={d} date={d} index={idx} items={items} expensesById={expensesById} sortable={false} onOpen={(i) => setParam('item', i.id)} onAdd={add} />)
        )}
      </div>

      <Fab label="Add plan" withTabBar onClick={() => add(view === 'day' ? selected : defaultDay)} />
      <ItemFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        item={editing}
        linkedExpense={editing?.linkedExpenseId ? (expensesById.get(editing.linkedExpenseId) ?? null) : null}
        defaultDate={formDate}
        nextOrder={nextOrder}
      />
      <ItemSheet
        item={openItem}
        expense={openItem?.linkedExpenseId ? expensesById.get(openItem.linkedExpenseId) : undefined}
        onOpenChange={(o) => !o && setParam('item', null)}
        onEdit={() => {
          setEditing(openItem)
          setParam('item', null)
          setFormOpen(true)
        }}
      />
    </main>
  )
}
