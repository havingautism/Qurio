import * as React from 'react'
import { Circle } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface RadioProps extends React.HTMLAttributes<HTMLDivElement> {
  checked?: boolean
  onClick?: () => void
  disabled?: boolean
}

const Radio = ({ checked, onClick, disabled, className, ...props }: RadioProps) => {
  return (
    <div
      className={cn(
        'relative flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border transition-all duration-200',
        checked
          ? 'bg-primary-500 border-primary-500'
          : 'hover:border-primary-400 dark:hover:border-primary-600 border-gray-300 bg-white dark:border-zinc-600 dark:bg-zinc-900',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      onClick={() => !disabled && onClick?.()}
      {...props}
    >
      <div
        className={cn(
          'h-2 w-2 rounded-full bg-white transition-transform duration-200',
          checked ? 'scale-100' : 'scale-0',
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
