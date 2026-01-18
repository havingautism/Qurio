import * as React from "react"
import { Command } from "cmdk"
import { Search, X } from "lucide-react"

import { cn } from "@/lib/utils"

const CommandDialog = ({ children, ...props }: React.ComponentProps<typeof Command>) => {
  return (
    <Command
      {...props}
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {children}
    </Command>
  )
}

const CommandInput = React.forwardRef<
  React.ElementRef<typeof Command.Input>,
  React.ComponentProps<typeof Command.Input>
>(({ className, ...props }, ref) => (
  <div className={cn(
    "flex items-center border-b border-gray-200 dark:border-zinc-700 px-3 bg-transparent",
    className
  )}>
    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
    <Command.Input
      ref={ref}
      className={cn(
        "flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-gray-500 dark:placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
      )}
      {...props}
    />
  </div>
))
CommandInput.displayName = "CommandInput"

const CommandList = React.forwardRef<
  React.ElementRef<typeof Command.List>,
  React.ComponentProps<typeof Command.List>
>(({ className, ...props }, ref) => (
  <Command.List
    ref={ref}
    className={cn("max-h-[300px] overflow-y-auto overflow-x-hidden", className)}
    {...props}
  />
))
CommandList.displayName = "CommandList"

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof Command.Empty>,
  React.ComponentProps<typeof Command.Empty>
>(({ className, ...props }, ref) => (
  <Command.Empty
    ref={ref}
    className={cn("py-6 text-center text-sm text-gray-500 dark:text-gray-400", className)}
    {...props}
  />
))
CommandEmpty.displayName = "CommandEmpty"

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof Command.Group>,
  React.ComponentProps<typeof Command.Group>
>(({ className, ...props }, ref) => (
  <Command.Group
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400",
      className
    )}
    {...props}
  />
))
CommandGroup.displayName = "CommandGroup"

const CommandItem = React.forwardRef<
  React.ElementRef<typeof Command.Item>,
  React.ComponentProps<typeof Command.Item> & {
    onSelect?: () => void
  }
>(({ className, onSelect, ...props }, ref) => (
  <Command.Item
    ref={ref}
    onClick={() => onSelect?.()}
    className={cn(
      "relative flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none transition-colors",
      "hover:bg-gray-100 dark:hover:bg-zinc-800",
      "data-[selected=true]:bg-primary-100 dark:data-[selected=true]:bg-primary-900/30 data-[selected=true]:text-primary-700 dark:data-[selected=true]:text-primary-300",
      "[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
      className
    )}
    {...props}
  />
))
CommandItem.displayName = "CommandItem"

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof Command.Separator>,
  React.ComponentProps<typeof Command.Separator>
>(({ className, ...props }, ref) => (
  <Command.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-gray-200 dark:bg-zinc-700", className)}
    {...props}
  />
))
CommandSeparator.displayName = "CommandSeparator"

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
}
