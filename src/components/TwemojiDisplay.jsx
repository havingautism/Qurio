const TwemojiDisplay = ({ emoji, size = '1em', className = '' }) => {
  if (!emoji) return null

  return (
    <span
      className={`inline-flex mb-2 items-center justify-center ${className}`}
      style={{ fontSize: size, lineHeight: 1 }}
    >
      <em-emoji set="twitter" size={size} native={emoji}></em-emoji>
    </span>
  )
}

export default TwemojiDisplay
