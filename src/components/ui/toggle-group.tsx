import * as React from 'react'
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

function ToggleGroup({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return <ToggleGroupPrimitive.Root className={cn('inline-flex rounded-full bg-foreground/[0.07] p-1', className)} {...props} />
}
function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn('inline-flex h-9 min-w-11 flex-1 items-center justify-center whitespace-nowrap rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none', className)}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem }
