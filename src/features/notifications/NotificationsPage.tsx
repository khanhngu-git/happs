import { useNavigate } from 'react-router'
import { limit, orderBy, query, updateDoc, writeBatch, doc } from 'firebase/firestore'
import { BellOff, CheckCheck, CircleAlert, CircleCheck, Clock, Send, UserPlus, CalendarDays } from 'lucide-react'
import { PageHeader, LargeTitle } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useUser } from '@/features/auth/AuthProvider'
import { db } from '@/lib/firebase'
import { refs, useLiveQuery, type AppNotification } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import type { NotificationType } from '@/shared/schemas'

const ICON: Record<NotificationType, typeof Send> = {
  memberJoined: UserPlus,
  itemChanged: CalendarDays,
  shareSent: Send,
  shareConfirmed: CircleCheck,
  shareDisputed: CircleAlert,
  confirmReminder: Clock,
}

function relative(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(ms).toLocaleDateString()
}

export function NotificationsPage() {
  const user = useUser()
  const navigate = useNavigate()
  const { data, loading } = useLiveQuery<AppNotification>(query(refs.notifications(user.uid), orderBy('createdAt', 'desc'), limit(60)), `notifs:${user.uid}`)
  const unread = data.filter((n) => !n.read)

  async function open(n: AppNotification) {
    if (!n.read) void updateDoc(doc(db, n.path), { read: true })
    const url = (n as AppNotification & { url?: string | null }).url
    navigate(url || (n.tripId ? `/trips/${n.tripId}` : '/'))
  }

  async function markAll() {
    const b = writeBatch(db)
    unread.forEach((n) => b.update(doc(db, n.path), { read: true }))
    await b.commit()
  }

  return (
    <>
      <PageHeader
        backTo="/"
        backLabel="Trips"
        actions={
          unread.length > 0 && (
            <Button variant="ghost" size="sm" onClick={markAll}>
              <CheckCheck /> Mark all read
            </Button>
          )
        }
      />
      <main className="mx-auto max-w-2xl pb-16">
        <LargeTitle>Notifications</LargeTitle>
        <div className="px-4">
          {loading ? (
            <div className="space-y-2" aria-busy>
              <Skeleton className="h-16 rounded-[1.25rem]" />
              <Skeleton className="h-16 rounded-[1.25rem]" />
            </div>
          ) : data.length === 0 ? (
            <EmptyState icon={<BellOff />} title="You’re all caught up" description="Payment updates and new members will show up here." />
          ) : (
            <ul className="divide-y divide-border/70 overflow-hidden rounded-[1.25rem] bg-card ring-1 ring-border/70">
              {data.map((n) => {
                const Icon = ICON[n.type] ?? Send
                return (
                  <li key={n.id}>
                    <button type="button" onClick={() => open(n)} className="flex min-h-16 w-full items-start gap-3 px-4 py-3 text-left outline-none hover:bg-foreground/[0.03] focus-visible:bg-foreground/5">
                      <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full', n.type === 'shareDisputed' ? 'bg-destructive/12 text-destructive' : 'bg-primary/12 text-primary')} aria-hidden>
                        <Icon className="size-4.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block', !n.read && 'font-semibold')}>{n.title}</span>
                        {n.body && <span className="block text-sm text-muted-foreground">{n.body}</span>}
                        <span className="block text-xs text-muted-foreground">{n.createdAt ? relative(n.createdAt.toMillis()) : ''}</span>
                      </span>
                      {!n.read && (
                        <span className="mt-2 size-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </main>
    </>
  )
}
