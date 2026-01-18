import * as React from "react"
import { Circle } from "lucide-react"

import { cn } from "@/lib/utils"

export interface RadioProps extends React.HTMLAttributes<HTMLDivElement> {
  checked?: boolean
  onClick?: () => void
  disabled?: boolean
}

const Radio = ({ checked, onClick, disabled, className, ...props }: RadioProps) => {
  return (
    <div
      className={cn(
        "relative h-5 w-5 rounded-full border flex items-center justify-center transition-all duration-200 cursor-pointer",
        checked
          ? "bg-primary-500 border-primary-500"
          : "bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-600 hover:border-primary-400 dark:hover:border-primary-600",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      onClick={() => !disabled && onClick?.()}
      {...props}
    >
      <div
        className={cn(
          "h-2 w-2 rounded-full bg-white transition-transform duration-200",
          checked ? "scale-100" : "scale-0"
        )}
      />
      <input
        type="radio"
        className="sr-only"
        checked={checked}
        onChange={() => !disabled && onClick?.()}
        disabled={disabled}
      />
    </div>
  )
}

export { Radio }
