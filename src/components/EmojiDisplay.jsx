import emojiData from 'fluentui-emoji-js/emojiData.json'

const EmojiDisplay = ({ emoji, size = '1em', className = '' }) => {
  if (!emoji) return null

  // Find the emoji entry in the bundled JSON data
  const emojiEntry = emojiData.find(e => e.glyph === emoji || e.unicode === emoji)

  // Construct URL if found
  // path format in JSON: folder: "/Name", images: { "3D": ["file.png"] }
  let url = null
  if (emojiEntry) {
    const style = '3D' // Default style
    const files = emojiEntry.images[style]
    if (files && files.length > 0) {
      // Structure: assets / {folder} / {style} / {filename}
      // Note: emojiEntry.folder start with '/', so we construct carefuly
      const folder = emojiEntry.folder.startsWith('/') ? emojiEntry.folder : `/${emojiEntry.folder}`
      const filename = files[0]
      url = `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets${folder}/${style}/${filename}`
    }
  }

  if (!url) {
    // Fallback to native text rendering immediately if no mapping found
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: size,
          lineHeight: 1,
          verticalAlign: '-0.125em',
          fontFamily: '"Segoe UI Emoji", "Noto Color Emoji", sans-serif',
        }}
      >
        {emoji}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size,
        lineHeight: 1,
        verticalAlign: '-0.125em',
      }}
    >
      <img
        src={url}
        alt={emoji}
        className="w-full h-full object-contain"
        loading="lazy"
        onError={e => {
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
