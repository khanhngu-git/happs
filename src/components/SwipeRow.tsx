import { useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SwipeAction {
  label: string
  icon: ReactNode
  /** Background of the revealed action. */
  className: string
  onAction(): void
}

const REVEAL = 84 // how far a short swipe opens to show the button
const SLOP = 8 // movement before deciding between a swipe and a scroll

/**
 * A list row with iOS-style swipe actions: swipe right for the leading action,
 * left for the trailing one. A short swipe reveals the button; a long swipe
 * (past half the row) does it straight away. Vertical drags still scroll.
 * The actions are also buttons for keyboards and screen readers.
 */
export function SwipeRow({
  children,
  leading,
  trailing,
  className,
}: {
  children: ReactNode
  leading?: SwipeAction
  trailing?: SwipeAction
  className?: string
}) {
  const [offset, setOffsetState] = useState(0)
  // The latest position, for the release handler (state may lag a fast swipe).
  const offsetRef = useRef(0)
  const setOffset = (v: number) => {
    offsetRef.current = v
    setOffsetState(v)
  }
  const [dragging, setDragging] = useState(false)
  const row = useRef<HTMLDivElement>(null)
  const justSwiped = useRef(false)
  const g = useRef<{ x: number; y: number; base: number; mode: 'idle' | 'swipe' | 'scroll'; moved: boolean } | null>(
    null,
  )

  const clamp = (dx: number) => {
    // No action on that side: resist instead of moving freely.
    if (dx > 0 && !leading) return Math.min(dx * 0.15, 24)
    if (dx < 0 && !trailing) return Math.max(dx * 0.15, -24)
    return dx
  }

  function end() {
    const width = row.current?.offsetWidth ?? 320
    const g0 = g.current
    g.current = null
    setDragging(false)
    if (!g0 || g0.mode !== 'swipe') return
    justSwiped.current = true
    const offset = offsetRef.current
    if (offset > width * 0.5 && leading) {
      setOffset(0)
      leading.onAction()
    } else if (offset < -width * 0.5 && trailing) {
      setOffset(-width)
      trailing.onAction()
    } else if (offset > REVEAL * 0.6 && leading) setOffset(REVEAL)
    else if (offset < -REVEAL * 0.6 && trailing) setOffset(-REVEAL)
    else setOffset(0)
  }

  function run(side: 'leading' | 'trailing') {
    const a = side === 'leading' ? leading : trailing
    if (!a) return
    setOffset(side === 'trailing' ? -(row.current?.offsetWidth ?? 320) : 0)
    a.onAction()
  }

  return (
    <div ref={row} className={cn('relative overflow-hidden', className)}>
      {leading && offset > 0 && <ActionButton action={leading} side="leading" width={offset} onPress={() => run('leading')} />}
      {trailing && offset < 0 && <ActionButton action={trailing} side="trailing" width={-offset} onPress={() => run('trailing')} />}
      <div
        className={cn(
          'bg-card relative touch-pan-y',
          !dragging &&
            'transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1)] motion-reduce:transition-none',
        )}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          justSwiped.current = false
          g.current = { x: e.clientX, y: e.clientY, base: offset, mode: 'idle', moved: false }
        }}
        onPointerMove={(e) => {
          const s = g.current
          if (!s) return
          const dx = e.clientX - s.x
          const dy = e.clientY - s.y
          if (s.mode === 'idle') {
            if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) s.mode = 'scroll'
            else if (Math.abs(dx) > SLOP) {
              s.mode = 'swipe'
              s.moved = true
              setDragging(true)
              e.currentTarget.setPointerCapture(e.pointerId)
            }
          }
          if (s.mode === 'swipe') setOffset(clamp(s.base + dx))
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onClickCapture={(e) => {
          // A swipe isn't a tap; and a tap on an open row just closes it.
          if (offset !== 0 || justSwiped.current) {
            justSwiped.current = false
            e.preventDefault()
            e.stopPropagation()
            setOffset(0)
          }
        }}
      >
        {children}
      </div>
      {/* The same actions for keyboards and screen readers. */}
      <div className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:inset-y-0 focus-within:right-2 focus-within:flex focus-within:items-center focus-within:gap-2">
        {leading && (
          <button
            type="button"
            onClick={leading.onAction}
            className={cn('rounded-full px-3 py-2 text-sm font-medium text-white', leading.className)}
          >
            {leading.label}
          </button>
        )}
        {trailing && (
          <button
            type="button"
            onClick={trailing.onAction}
            className={cn('rounded-full px-3 py-2 text-sm font-medium text-white', trailing.className)}
          >
            {trailing.label}
          </button>
        )}
      </div>
    </div>
  )
}

/** The coloured action revealed behind a row as it's swiped. */
function ActionButton({ action, side, width, onPress }: { action: SwipeAction; side: 'leading' | 'trailing'; width: number; onPress(): void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={onPress}
      className={cn(
        'absolute inset-y-0 flex flex-col items-center justify-center gap-1 text-xs font-medium text-white',
        side === 'leading' ? 'left-0 pl-1' : 'right-0 pr-1',
        action.className,
      )}
      style={{ width }}
    >
      {width > 40 && (
        <>
          {action.icon}
          {action.label}
        </>
      )}
    </button>
  )
}
