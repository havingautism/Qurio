/**
 * ToolEnter Component
 * Provides enter animation for tool components
 */

import { useEffect, useState } from 'react'
import clsx from 'clsx'

export default function ToolEnter({ children, className }) {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      className={clsx(
        'transition-all duration-200 ease-out origin-top transform-gpu',
        entered ? 'opacity-100 scale-100' : 'opacity-0 scale-95',
        className,
      )}
    >
      {children}
    </div>
  )
}
