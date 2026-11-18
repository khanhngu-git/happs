import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { PAYMENT_METHODS, type PaymentMethod } from '@/shared/shareState'
import type { PaymentDetails } from './shareApi'

/** Debtor: "I've paid" (one share or a settle-all batch). */
export function MarkPaidDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
}: {
  open: boolean
  onOpenChange(o: boolean): void
  title: string
  description: string
  onSubmit(d: PaymentDetails): Promise<void>
}) {
  const [method, setMethod] = useState<PaymentMethod>('bank')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-foreground/80">{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            try {
              await onSubmit({ method, reference: reference.trim(), note: note.trim() })
              onOpenChange(false)
              setReference('')
              setNote('')
            } finally {
              setBusy(false)
            }
          }}
        >
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">How did you pay?</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Payment method">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={method === m.value}
                  aria-label={m.label}
                  onClick={() => setMethod(m.value)}
                  className={cn('min-h-11 rounded-full px-4 text-[0.9375rem] font-medium transition-colors', method === m.value ? 'bg-primary text-primary-foreground' : 'bg-foreground/[0.07]')}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="pay-ref">Reference (optional)</Label>
            <Input id="pay-ref" maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. transfer receipt number" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-note">Note (optional)</Label>
            <Textarea id="pay-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Mark as paid'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">They’ll be asked to confirm they received it.</p>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Payer: "Not received", with a reason that goes back to the debtor. */
export function DisputeDialog({ open, onOpenChange, onSubmit }: { open: boolean; onOpenChange(o: boolean): void; onSubmit(reason: string): Promise<void> }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Not received yet?</DialogTitle>
          <DialogDescription className="text-foreground/80">We’ll let them know so they can check and send again.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="dispute-reason">What’s wrong?</Label>
          <Textarea id="dispute-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Nothing has arrived in my account" />
        </div>
        <Button
          size="lg"
          variant="destructive"
          disabled={busy || !reason.trim()}
          onClick={async () => {
            setBusy(true)
            try {
              await onSubmit(reason.trim())
              onOpenChange(false)
              setReason('')
            } finally {
              setBusy(false)
            }
          }}
        >
          Mark as not received
        </Button>
      </DialogContent>
    </Dialog>
  )
}
