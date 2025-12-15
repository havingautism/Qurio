const EmojiDisplay = ({ emoji, size = '1em', className = '' }) => {
  if (!emoji) return null

  // Helper to convert unicode to hex string
  // This handles surrogate pairs and variation selectors correctly for the CDN
  const getHex = emojiChar => {
    return Array.from(emojiChar)
      .map(c => c.codePointAt(0).toString(16))
      .join('-')
  }

  const hex = getHex(emoji)
  // Using Advena's Fluent Emoji CDN
  const url = `https://emoji.fluent-cdn.com/1.0.0/100x100/${hex}.png`

  return (
    <span
      className={`inline-flex mb-1 items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size, // Keep fontSize for layout alignment if needed
        lineHeight: 1,
        verticalAlign: 'middle',
      }}
    >
      <img
        src={url}
        alt={emoji}
        className="w-full h-full object-contain"
        loading="lazy"
        onError={e => {
          // Fallback to native emoji if image fails to load
          e.target.style.display = 'none'
          e.target.nextSibling.style.display = 'inline-block'
        }}
      />
      <span
        style={{ display: 'none', fontFamily: '"Segoe UI Emoji", "Noto Color Emoji", sans-serif' }}
      >
        {emoji}
      </span>
    </span>
  )
}

export default EmojiDisplay
