const fallbackHash = text => {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export const computeSha256 = async text => {
  if (typeof text !== 'string') return ''
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    const digest = await subtle.digest('SHA-256', data)
    const array = Array.from(new Uint8Array(digest))
    return array.map(byte => byte.toString(16).padStart(2, '0')).join('')
  }
  return fallbackHash(text)
}
