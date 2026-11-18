import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Native select styled to match shadcn inputs. Native is used on purpose:
 * on phones it opens the OS picker, which is the most usable option.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'flex h-11 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm dark:bg-input/30 [&>option]:bg-popover',
        className,
      )}
      {...props}
    />
  )
}

export { NativeSelect }
