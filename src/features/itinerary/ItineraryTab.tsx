import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarPlus, ChevronLeft, ChevronRight, GripVertical, List } from 'lucide-react'
import { toast } from 'sonner'
import { Fab } from '@/components/Fab'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useTrip } from '@/features/trips/TripContext'
import type { Item } from '@/lib/firestore'
import { formatLongDate } from '@/shared/dates'
import { itemsForDay, staysForDay } from '@/shared/itinerary'
import { ActivityRow } from './ActivityRow'
import { DayPicker } from './DayPicker'
import { StayBanner } from './StayBanner'
import { useItineraryDialogs } from './ItineraryDialogs'
import { reorderItems, useItems } from './itineraryApi'
import { useTripDay } from './useTripDay'
import { AddMenu } from './AddMenu'
import { HotelFinderSheet } from '@/features/hotelFinder/HotelFinderSheet'

function SortableRow({ item, onOpen }: { item: Item; onOpen(): void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  return (
    <ActivityRow
      ref={setNodeRef}
      item={item}
      onOpen={onOpen}
      className={isDragging ? 'relative z-10 shadow-lg' : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      trailing={
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="flex h-14 w-12 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing"
          aria-label={`Reorder ${item.title}`}
        >
          <GripVertical className="size-5" />
        </button>
      }
    />
  )
}

/** Swipe left/right to move between days (ignores mostly-vertical drags). */
function useSwipe(onLeft: () => void, onRight: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0]!
      start.current = { x: t.clientX, y: t.clientY }
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!start.current) return
      const t = e.changedTouches[0]!
      const dx = t.clientX - start.current.x
      const dy = t.clientY - start.current.y
      start.current = null
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? onLeft : onRight)()
    },
  }
}

export function ItineraryTab() {
  const { trip } = useTrip()
  const { data: items, loading } = useItems(trip.id)
  const { days, day, index, today, setDay, step } = useTripDay(trip)
  const { dialogs, openItem, addItem, addPrefilled } = useItineraryDialogs(items)
  const [reordering, setReordering] = useState(false)
  const [menu, setMenu] = useState(false)
  const [finding, setFinding] = useState(false)
  const swipe = useSwipe(() => step(1), () => step(-1))
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const dayItems = itemsForDay(items, day)
  const stays = staysForDay(items, day)
  const stayIds = new Set(stays.map((s) => s.stay.id))
  const activities = dayItems.filter((i) => !stayIds.has(i.id))
  const anytime = activities.filter((i) => !i.startTime)
  const timed = activities.filter((i) => i.startTime)

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return
    const from = anytime.findIndex((i) => i.id === e.active.id)
    const to = anytime.findIndex((i) => i.id === e.over!.id)
    reorderItems(trip.id, anytime, from, to).catch(() => toast.error('Couldn’t save the new order'))
  }

  return (
    <main className="mx-auto max-w-2xl pt-2">
      <DayPicker days={days} selected={day} today={today} onSelect={setDay} />

      <div className="flex items-center gap-1 px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <h1 className="large-title">{day === today ? 'Today' : `Day ${index + 1}`}</h1>
          <p className="text-[0.9375rem] text-muted-foreground">
            {formatLongDate(day)}
            {day === today && ` · Day ${index + 1}`}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => step(-1)} disabled={index === 0} aria-label="Previous day" className="hidden sm:inline-flex">
          <ChevronLeft className="size-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => step(1)} disabled={index === days.length - 1} aria-label="Next day" className="hidden sm:inline-flex">
          <ChevronRight className="size-5" />
        </Button>
        {days.includes(today) && day !== today && (
          <Button variant="secondary" size="sm" className="text-primary" onClick={() => setDay(today)}>
            Today
          </Button>
        )}
        <Button asChild variant="ghost" size="sm" className="text-primary">
          <Link to="all" aria-label="All activities">
            <List /> All
          </Link>
        </Button>
      </div>

      <div className="min-h-[50dvh] space-y-3 px-4" {...swipe}>
        {loading ? (
          <div className="space-y-2" aria-busy>
            <Skeleton className="h-14 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        ) : (
          <>
            {stays.map((s) => (
              <StayBanner key={s.stay.id} info={s} onOpen={() => openItem(s.stay)} />
            ))}

            {activities.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-14 text-center">
                <CalendarPlus className="size-10 text-muted-foreground/60" aria-hidden />
                <p className="text-[1.0625rem] font-semibold">Nothing planned for Day {index + 1}</p>
                <Button variant="secondary" onClick={() => addItem(day)}>
                  Add an activity
                </Button>
              </div>
            ) : (
              <>
                {anytime.length > 0 && (
                  <section aria-label="Anytime">
                    <div className="flex items-end justify-between px-4 pb-1.5">
                      <h2 className="text-[0.8125rem] font-medium text-muted-foreground uppercase">Anytime</h2>
                      {anytime.length > 1 && (
                        <button type="button" onClick={() => setReordering((r) => !r)} className="min-h-8 text-[0.9375rem] font-medium text-primary">
                          {reordering ? 'Done' : 'Edit'}
                        </button>
                      )}
                    </div>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                      <SortableContext items={anytime.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                        <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl ring-1 ring-border/70 [&>li]:pl-0">
                          {anytime.map((i) =>
                            reordering ? <SortableRow key={i.id} item={i} onOpen={() => openItem(i)} /> : <ActivityRow key={i.id} item={i} showTime={false} onOpen={() => openItem(i)} />,
                          )}
                        </ul>
                      </SortableContext>
                    </DndContext>
                  </section>
                )}
                {timed.length > 0 && (
                  <section aria-label="Schedule">
                    {anytime.length > 0 && <h2 className="px-4 pb-1.5 pt-2 text-[0.8125rem] font-medium text-muted-foreground uppercase">Schedule</h2>}
                    <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl ring-1 ring-border/70">
                      {timed.map((i) => (
                        <ActivityRow key={i.id} item={i} onOpen={() => openItem(i)} />
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>

      <Fab label="Add to the plan" withTabBar onClick={() => setMenu(true)} />
      <AddMenu open={menu} onOpenChange={setMenu} onPick={(k) => (k === 'own' ? addItem(day) : setFinding(true))} />
      <HotelFinderSheet
        key={finding ? 'open' : 'closed'}
        open={finding}
        onOpenChange={setFinding}
        day={day}
        onPick={(p) => {
          setFinding(false)
          addPrefilled(p)
        }}
      />
      {dialogs}
    </main>
  )
}
