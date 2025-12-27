import { Check } from 'lucide-react'
import clsx from 'clsx'

const Checkbox = ({ checked, onChange, disabled, className }) => {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={clsx(
        'h-5 w-5 rounded border flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-1 dark:focus:ring-offset-zinc-900',
        checked
          ? 'bg-primary-500 border-primary-500 text-white'
          : 'bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-600 hover:border-primary-400 dark:hover:border-primary-600',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      <Check
        size={14}
        className={clsx('transition-transform duration-200', checked ? 'scale-100' : 'scale-0')}
        strokeWidth={3}
      />
    </button>
  )
}

export default Checkbox
