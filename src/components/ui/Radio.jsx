import clsx from 'clsx'

const Radio = ({ checked, onChange, disabled, className, name, value }) => {
  return (
    <div
      className={clsx(
        'relative h-5 w-5 rounded-full border flex items-center justify-center transition-all duration-200 cursor-pointer',
        checked
          ? 'bg-primary-500 border-primary-500'
          : 'bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-600 hover:border-primary-400 dark:hover:border-primary-600',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      onClick={() => !disabled && onChange?.()}
    >
      <div
        className={clsx(
          'h-2 w-2 rounded-full bg-white transition-transform duration-200',
          checked ? 'scale-100' : 'scale-0',
        )}
      />
      <input
        type="radio"
        className="sr-only"
        name={name}
        value={value}
        checked={checked}
        onChange={() => !disabled && onChange?.()}
        disabled={disabled}
      />
    </div>
  )
}

export default Radio
