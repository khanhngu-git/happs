import { CheckCircle2, CircleAlert, CircleDashed, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SHARE_STATUS_LABEL, type ShareStatus } from '@/shared/shareState'

const VARIANT: Record<ShareStatus, { variant: 'secondary' | 'warning' | 'success' | 'destructive'; icon: typeof Clock }> = {
  unpaid: { variant: 'secondary', icon: CircleDashed },
  sent: { variant: 'warning', icon: Clock },
  confirmed: { variant: 'success', icon: CheckCircle2 },
  disputed: { variant: 'destructive', icon: CircleAlert },
}

/** Status is always text + icon, never colour alone. */
export function ShareStatusChip({ status, label }: { status: ShareStatus; label?: string }) {
  const { variant, icon: Icon } = VARIANT[status]
  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {label ? `${label}: ` : ''}
      {SHARE_STATUS_LABEL[status]}
    </Badge>
  )
}
