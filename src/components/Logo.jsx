const Logo = ({ size = 64, className = '' }) => {
  return (
    <img
      src="/Qurio-logo-light-theme.png"
      alt="Qurio"
      width={size}
      height={size}
      className={`dark:invert ${className}`}
    />
  )
}

export default Logo
