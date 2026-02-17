export const isHiddenFormSubmission = msg =>
  msg?.role === 'user' &&
  typeof msg?.content === 'string' &&
  msg.content.startsWith('[Form Submission]')

export const isHiddenAiContinuation = (messages, index) => {
  if (!Array.isArray(messages) || index <= 0) return false
  const current = messages[index]
  const prev = messages[index - 1]
  return current?.role === 'ai' && isHiddenFormSubmission(prev)
}

export const getLatestEditableUserIndex = messages => {
  if (!Array.isArray(messages)) return -1
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (msg?.role === 'user' && !isHiddenFormSubmission(msg)) return i
  }
  return -1
}

export const getLatestRegeneratableAiIndex = messages => {
  if (!Array.isArray(messages)) return -1
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (msg?.role === 'ai' && !isHiddenAiContinuation(messages, i)) return i
  }
  return -1
}

export const getRenderableMessageEntries = messages => {
  if (!Array.isArray(messages)) return []
  return messages
    .map((msg, originalIndex) => ({ msg, originalIndex }))
    .filter(({ msg, originalIndex }) => {
      if (isHiddenFormSubmission(msg)) return false
      if (isHiddenAiContinuation(messages, originalIndex)) return false
      return true
    })
}
