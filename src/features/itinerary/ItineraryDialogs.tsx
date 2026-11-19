import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useTrip } from '@/features/trips/TripContext'
import { useExpenses } from '@/features/expenses/expenseApi'
import type { Item } from '@/lib/firestore'
import { ItemFormDialog } from './ItemFormDialog'
import { ItemSheet } from './ItemSheet'
import type { ItemPrefill } from './prefill'

/**
 * Item detail sheet (?item=id) and the add/edit form, shared by the day view
 * and the all-activities page.
 */
export function useItineraryDialogs(items: Item[]) {
  const { trip } = useTrip()
  const [params, setParams] = useSearchParams()
  const { data: expenses } = useExpenses(trip.id)
  const [formOpen, setFormOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [formDate, setFormDate] = useState(trip.startDate)
  const [editing, setEditing] = useState<Item | null>(null)
  const [prefill, setPrefill] = useState<ItemPrefill | null>(null)
  const expensesById = useMemo(() => new Map(expenses.map((e) => [e.id, e])), [expenses])
  const openItem = items.find((i) => i.id === params.get('item')) ?? null
  const nextOrder = Math.max(0, ...items.map((i) => i.order)) + 1000

  const setItemParam = (id: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (id) n.set('item', id)
        else n.delete('item')
        return n
      },
      { replace: true },
    )

  const openForm = (item: Item | null, date: string, pre: ItemPrefill | null = null) => {
    setEditing(item)
    setPrefill(pre)
    setFormDate(date)
    setFormKey((k) => k + 1)
    setFormOpen(true)
  }

  const dialogs = (
    <>
      <ItemFormDialog
        key={formKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        item={editing}
        linkedExpense={editing?.linkedExpenseId ? (expensesById.get(editing.linkedExpenseId) ?? null) : null}
        prefill={prefill}
        defaultDate={formDate}
        nextOrder={nextOrder}
        items={items}
      />
      <ItemSheet
        item={openItem}
        onOpenChange={(o) => !o && setItemParam(null)}
        onEdit={() => {
          const it = openItem
          setItemParam(null)
          if (it) openForm(it, it.date)
        }}
      />
    </>
  )

  return {
    dialogs,
    openItem: (i: Item) => setItemParam(i.id),
    addItem: (date: string) => openForm(null, date),
    addPrefilled: (p: ItemPrefill) => openForm(null, p.date, p),
    editItem: (i: Item) => openForm(i, i.date),
  }
}
