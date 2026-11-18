import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Member, Trip } from '@/lib/firestore'

export interface TripContextValue {
  trip: Trip
  members: Member[]
  membersById: Map<string, Member>
  me: string
  isOwner: boolean
  /** Member display name, with a fallback for people who have left. */
  nameOf(uid: string): string
}

const Ctx = createContext<TripContextValue | null>(null)

export function TripProvider({ trip, members, me, children }: { trip: Trip; members: Member[]; me: string; children: ReactNode }) {
  const value = useMemo<TripContextValue>(() => {
    const membersById = new Map(members.map((m) => [m.id, m]))
    return {
      trip,
      members: [...members].sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : a.displayName.localeCompare(b.displayName))),
      membersById,
      me,
      isOwner: trip.ownerId === me,
      nameOf: (uid) => (uid === me ? 'You' : (membersById.get(uid)?.displayName ?? 'Former member')),
    }
  }, [trip, members, me])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTrip(): TripContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTrip must be used inside a trip route')
  return v
}
