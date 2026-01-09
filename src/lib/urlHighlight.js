const URL_REGEX = /((https?:\/\/|www\.)[^\s]+)/g

export const splitTextWithUrls = text => {
  if (typeof text !== 'string' || text.length === 0) return []
  const parts = []
  let lastIndex = 0

  text.replace(URL_REGEX, (match, _full, _prefix, offset) => {
    if (offset > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, offset) })
    }
    parts.push({ type: 'url', value: match })
    lastIndex = offset + match.length
    return match
  })

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) })
  }

  if (parts.length === 0) {
    parts.push({ type: 'text', value: text })
  }

  return parts
}
