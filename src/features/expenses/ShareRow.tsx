import { useState } from 'react'
import { Check, HandCoins, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/UserAvatar'
import { useTrip } from '@/features/trips/TripContext'
import type { Share } from '@/lib/firestore'
import { formatMoney } from '@/shared/money'
import { allowedActions, PAYMENT_METHODS } from '@/shared/shareState'
import { confirmShare, disputeShare, markReceived, markSent } from './shareApi'
import { DisputeDialog, MarkPaidDialog } from './PaymentDialogs'
import { ShareStatusChip } from './ShareStatusChip'

const fail = (err: unknown) => {
  console.error(err)
  toast.error('That didn’t go through. Try again.')
}

/** One person's portion, with whatever actions the current user may take on it. */
/** `secondary` renders actions untinted when a stronger primary action sits nearby (e.g. Confirm all). */
export function ShareRow({ share, showAmountIn, secondary }: { share: Share; showAmountIn?: string; secondary?: boolean }) {
  const { me, membersById, nameOf, trip } = useTrip()
  const [paying, setPaying] = useState(false)
  const [disputing, setDisputing] = useState(false)
  const actions = allowedActions(share, me)
  const member = membersById.get(share.debtorUid)
  const isPayerOwn = share.debtorUid === share.payerUid
  const method = PAYMENT_METHODS.find((m) => m.value === share.method)?.label

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <UserAvatar name={member?.displayName} photoURL={member?.photoURL} className="size-9" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{nameOf(share.debtorUid)}</p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {formatMoney(share.amountMinor, share.currency)}
            {showAmountIn && share.currency !== showAmountIn && ` ≈ ${formatMoney(share.amountBaseMinor, trip.baseCurrency)}`}
          </p>
        </div>
        {isPayerOwn ? <span className="text-sm font-medium text-muted-foreground">Paid the bill</span> : <ShareStatusChip status={share.status} />}
      </div>
      {share.status === 'sent' && (method || share.reference || share.note) && (
        <p className="ml-12 rounded-xl bg-foreground/[0.05] px-3 py-2 text-sm">
          {[method, share.reference && `Ref ${share.reference}`].filter(Boolean).join(' · ')}
          {share.note && <span className="block">“{share.note}”</span>}
        </p>
      )}
      {share.status === 'disputed' && share.history.at(-1)?.note && (
        <p className="ml-12 rounded-xl bg-destructive/10 px-3 py-2 text-sm">
          {nameOf(share.payerUid)}: “{share.history.at(-1)!.note}”
        </p>
      )}
      {actions.length > 0 && (
        <div className="ml-12 flex flex-wrap gap-2">
          {actions.includes('markSent') && (
            <Button size="sm" onClick={() => setPaying(true)}>
              <Send /> {share.status === 'disputed' ? 'Send again' : 'I’ve paid'}
            </Button>
          )}
          {actions.includes('confirm') && (
            <Button size="sm" variant={secondary ? 'secondary' : 'default'} onClick={() => confirmShare(share, me).then(() => toast.success('Confirmed. Thanks!'), fail)}>
              <Check /> Confirm received
            </Button>
          )}
          {actions.includes('dispute') && (
            <Button size="sm" variant="secondary" onClick={() => setDisputing(true)}>
              <X /> Not received
            </Button>
          )}
          {actions.includes('markReceived') && (
            <Button size="sm" variant="secondary" onClick={() => markReceived(share, me).then(() => toast.success('Marked as received'), fail)}>
              <HandCoins /> Mark as received
            </Button>
          )}
        </div>
      )}
      <MarkPaidDialog
        open={paying}
        onOpenChange={setPaying}
        title={`Pay ${nameOf(share.payerUid)}`}
        description={`${formatMoney(share.amountMinor, share.currency)} for ${share.expenseTitle}`}
        onSubmit={(d) => markSent(share, me, d).then(() => void toast.success(`We’ll ask ${nameOf(share.payerUid)} to confirm`), fail)}
      />
      <DisputeDialog open={disputing} onOpenChange={setDisputing} onSubmit={(r) => disputeShare(share, me, r).then(() => void toast.success('Marked as not received'), fail)} />
    </li>
  )
}
