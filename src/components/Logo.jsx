import logoSrc from '../assets/Qurio-logo-light-theme.png'

const Logo = ({ size = 64, className = '' }) => {
  return (
    <img
      src={logoSrc}
      alt="Qurio"
      width={size}
      height={size}
      className={`dark:invert ${className}`}
    />
  )
}

export default Logo
