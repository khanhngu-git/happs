import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '?').trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase()
}

export function UserAvatar({ name, photoURL, className }: { name?: string | null; photoURL?: string | null; className?: string }) {
  return (
    <Avatar className={className}>
      {photoURL && <AvatarImage src={photoURL} alt="" />}
      <AvatarFallback aria-label={name ?? undefined}>{initials(name)}</AvatarFallback>
    </Avatar>
  )
}

export function AvatarStack({ people, max = 4, className }: { people: { id: string; displayName: string; photoURL: string | null }[]; max?: number; className?: string }) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  return (
    <div className={cn('flex -space-x-2', className)} aria-label={`${people.length} member${people.length === 1 ? '' : 's'}`}>
      {shown.map((p) => (
        <UserAvatar key={p.id} name={p.displayName} photoURL={p.photoURL} className="size-7 ring-2 ring-card" />
      ))}
      {extra > 0 && (
        <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-[0.6875rem] font-semibold ring-2 ring-card">+{extra}</span>
      )}
    </div>
  )
}
