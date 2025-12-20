import Image from 'next/image'
import logoSrc from '../assets/Qurio-logo-light-theme.png'

const Logo = ({ size = 64, className = '' }) => {
  const resolvedSrc =
    (typeof logoSrc === 'string' ? logoSrc : logoSrc?.src || logoSrc?.default) ||
    '/Qurio-logo-app.png'
  return (
    <Image
      src={resolvedSrc}
      alt="Qurio"
      width={size}
      height={size}
      className={`dark:invert ${className}`}
    />
  )
}

export default Logo
