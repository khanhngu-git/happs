import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Crown, LogOut, MapPin, MoreHorizontal, QrCode, ShieldCheck, ShieldOff, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { UserAvatar } from '@/components/UserAvatar'
import { Fab } from '@/components/Fab'
import type { Member } from '@/lib/firestore'
import { InviteDialog } from '@/features/invites/InviteDialog'
import { isInviteActive, revokeInvite, useInvites } from '@/features/invites/inviteApi'
import { useTrip } from './TripContext'
import { removeMember, setAdmin, transferOwnership } from './tripApi'
import { formatInstantDate } from '@/shared/dates'
import { useTripShares } from '@/features/expenses/expenseApi'
import { LiveLocationRow } from '@/features/location/LiveLocationControls'
import { useLiveLocation } from '@/features/location/LiveLocationProvider'
import { ageLabel } from '@/features/location/liveLocation'

function SectionTitle({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <h2 id={id} className="px-1 pb-2 text-[0.8125rem] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h2>
  )
}

export function MembersTab() {
  const { trip, members, me, isOwner, canManage, isAdminId } = useTrip()
  const [params, setParams] = useSearchParams()
  const [inviteOpen, setInviteOpen] = useState(params.get('invite') === '1')
  const [removing, setRemoving] = useState<Member | null>(null)
  const [promoting, setPromoting] = useState<Member | null>(null)
  const [leaving, setLeaving] = useState(false)
  /** An existing invite whose QR code and link are shown again. */
  const [showing, setShowing] = useState<string | null>(null)
  const navigate = useNavigate()
  const { data: invites } = useInvites(trip.id)
  const { data: shares } = useTripShares(trip.id)
  const live = useLiveLocation()
  /** Unconfirmed payments involving someone: they can't leave or be removed until these settle. */
  const openPayments = (uid: string) => shares.filter((x) => x.debtorUid !== x.payerUid && x.status !== 'confirmed' && (x.debtorUid === uid || x.payerUid === uid)).length
  const myOpen = openPayments(me)
  const removingOpen = removing ? openPayments(removing.id) : 0
  const active = invites.filter((i) => isInviteActive(i)).filter((i) => canManage || i.createdBy === me)

  const showOnMap = (m: Member) => {
    if (m.id === me) {
      navigate(`/trips/${trip.id}/map`)
      if (!live.sharing) toast('You’re not sharing your location. Turn it on under Live location.')
    } else if (live.byUid.has(m.id)) navigate(`/trips/${trip.id}/map?person=${m.id}`)
    else toast(`${m.displayName} isn’t sharing their location right now`)
  }

  const toggleAdmin = async (m: Member, admin: boolean) => {
    try {
      await setAdmin(trip.id, m.id, admin)
      toast.success(admin ? `${m.displayName} is now an admin` : `${m.displayName} is no longer an admin`)
    } catch (err) {
      console.error(err)
      toast.error('Couldn’t change admin. Check your connection and try again.')
    }
  }

  useEffect(() => {
    if (params.get('invite')) setParams({}, { replace: true })
  }, [params, setParams])

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4">
      <h1 className="large-title pt-1">Members</h1>
      <section aria-labelledby="members-h">
        <SectionTitle id="members-h">{members.length} {members.length === 1 ? 'member' : 'members'}</SectionTitle>
        <ul className="divide-y divide-border/70 overflow-hidden rounded-[1.25rem] bg-card ring-1 ring-border/70">
          {members.map((m) => (
            <li key={m.id} className="flex min-h-16 items-center gap-3 px-4 py-2">
              {/* Tap someone to see where they are, with directions to them. */}
              <button
                type="button"
                onClick={() => showOnMap(m)}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left active:opacity-60"
                aria-label={live.byUid.has(m.id) ? `Show ${m.displayName} on the map` : m.displayName}
              >
                <UserAvatar name={m.displayName} photoURL={m.photoURL} className="size-10" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {m.displayName}
                    {m.id === me && <span className="text-muted-foreground"> (you)</span>}
                  </span>
                  {live.byUid.has(m.id) && (
                    <span className="flex items-center gap-1 truncate text-sm text-primary">
                      <MapPin className="size-3.5 shrink-0" aria-hidden /> Sharing live location · {ageLabel(live.byUid.get(m.id)!.updatedAt, live.now)}
                    </span>
                  )}
                </span>
              </button>
              {m.id === trip.ownerId ? (
                <Badge variant="secondary">
                  <Crown aria-hidden /> Owner
                </Badge>
              ) : (
                isAdminId(m.id) && (
                  <Badge variant="secondary">
                    <ShieldCheck aria-hidden /> Admin
                  </Badge>
                )
              )}
              {/* The owner manages everyone; an admin can remove regular members. */}
              {m.id !== me && (isOwner || (canManage && m.id !== trip.ownerId && !isAdminId(m.id))) && (
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex size-11 items-center justify-center rounded-full hover:bg-foreground/6" aria-label={`Options for ${m.displayName}`}>
                    <MoreHorizontal className="size-5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isOwner && (
                      <>
                        {isAdminId(m.id) ? (
                          <DropdownMenuItem onSelect={() => toggleAdmin(m, false)}>
                            <ShieldOff /> Remove admin
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onSelect={() => toggleAdmin(m, true)}>
                            <ShieldCheck /> Make admin
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => setPromoting(m)}>
                          <Crown /> Make owner
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setRemoving(m)}>
                      <LogOut /> Remove from trip
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
        {isOwner && members.length > 1 && (
          <p className="px-4 pt-2 text-sm text-muted-foreground">Admins can edit trip details, remove members, and change or delete anyone’s plans, costs and ideas. Only you can delete the trip or choose admins.</p>
        )}
      </section>

      <section aria-labelledby="live-h">
        <SectionTitle id="live-h">Live location</SectionTitle>
        <div className="overflow-hidden rounded-[1.25rem] bg-card ring-1 ring-border/70">
          <LiveLocationRow />
        </div>
      </section>

      <section aria-labelledby="links-h">
        <SectionTitle id="links-h">Invite links</SectionTitle>
        {active.length === 0 ? (
          <div className="flex items-center gap-3 rounded-[1.25rem] bg-card p-4 ring-1 ring-border/70">
            <QrCode className="size-6 shrink-0 text-primary" aria-hidden />
            <p className="flex-1 text-sm">Share a link or QR code so friends can join this trip.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/70 overflow-hidden rounded-[1.25rem] bg-card ring-1 ring-border/70">
            {active.map((i) => (
              <li key={i.id} className="flex min-h-14 items-center gap-3 py-2 pr-4">
                <button
                  type="button"
                  onClick={() => setShowing(i.id)}
                  className="flex min-h-12 min-w-0 flex-1 items-center gap-3 pl-4 text-left active:opacity-60"
                  aria-label={`Show QR code and link for invite ${i.id}`}
                >
                  <QrCode className="size-5 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate font-mono">…/join/{i.id}</span>
                    <span className="block text-muted-foreground">
                      {i.uses} joined{i.maxUses ? ` of ${i.maxUses}` : ''} ·{' '}
                      {i.expiresAt ? `expires ${formatInstantDate(i.expiresAt.toDate())}` : 'never expires'}
                    </span>
                  </span>
                </button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => revokeInvite(i.id).then(() => toast.success('Link revoked'), () => toast.error('Couldn’t revoke'))}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!isOwner && (
        <Button variant="destructive" className="w-full" onClick={() => setLeaving(true)}>
          <LogOut /> Leave trip
        </Button>
      )}

      <Fab label="Invite friends" extended withTabBar icon={<UserPlus className="size-5" aria-hidden />} onClick={() => setInviteOpen(true)} />
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <InviteDialog open={!!showing} onOpenChange={(o) => !o && setShowing(null)} existingCode={showing} />

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.displayName}?`}
        description={
          removingOpen > 0
            ? `${removing?.displayName} has ${removingOpen} payment${removingOpen === 1 ? '' : 's'} that ${removingOpen === 1 ? 'isn’t' : 'aren’t'} confirmed yet. They need to settle up before they can be removed.`
            : 'They’ll lose access to this trip.'
        }
        confirmLabel={removingOpen > 0 ? 'OK' : 'Remove'}
        destructive={removingOpen === 0}
        onConfirm={async () => {
          if (removingOpen > 0) return
          try {
            await removeMember(trip.id, removing!.id)
            toast.success(`${removing!.displayName} was removed`)
          } catch (err) {
            console.error(err)
            toast.error('Couldn’t remove them. Check your connection and try again.')
          }
        }}
      />
      <ConfirmDialog
        open={!!promoting}
        onOpenChange={(o) => !o && setPromoting(null)}
        title={`Make ${promoting?.displayName} the owner?`}
        description="They’ll be able to edit trip details, remove members and delete the trip. You’ll become a regular member."
        confirmLabel="Make owner"
        onConfirm={async () => {
          try {
            await transferOwnership(trip.id, me, promoting!.id)
            toast.success('Ownership transferred')
          } catch {
            toast.error('Couldn’t transfer ownership')
          }
        }}
      />
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title={`Leave ${trip.name}?`}
        description={
          myOpen > 0
            ? `You have ${myOpen} payment${myOpen === 1 ? '' : 's'} that ${myOpen === 1 ? 'isn’t' : 'aren’t'} confirmed yet. Settle up in Expenses first, then you can leave.`
            : 'You’ll need a new invite link to come back.'
        }
        confirmLabel={myOpen > 0 ? 'Go to Expenses' : 'Leave trip'}
        destructive={myOpen === 0}
        onConfirm={async () => {
          if (myOpen > 0) {
            navigate(`/trips/${trip.id}/expenses`)
            return
          }
          try {
            await removeMember(trip.id, me)
            toast.success('You left the trip')
            navigate('/', { replace: true })
          } catch (err) {
            console.error(err)
            toast.error('Couldn’t leave the trip. Check your connection and try again.')
          }
        }}
      />
    </main>
  )
}
