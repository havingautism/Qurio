const DEFAULT_FLUSH_MS = 50
const DEFAULT_HEARTBEAT_MS = 15000

export const getSseConfig = () => {
  const flushMs = Number.parseInt(process.env.SSE_FLUSH_MS, 10)
  const heartbeatMs = Number.parseInt(process.env.SSE_HEARTBEAT_MS, 10)
  return {
    flushMs: Number.isFinite(flushMs) ? flushMs : DEFAULT_FLUSH_MS,
    heartbeatMs: Number.isFinite(heartbeatMs) ? heartbeatMs : DEFAULT_HEARTBEAT_MS,
  }
}

export const createSseStream = (res, config = {}) => {
  const flushMs = Number.isFinite(config.flushMs) ? config.flushMs : DEFAULT_FLUSH_MS
  const heartbeatMs = Number.isFinite(config.heartbeatMs)
    ? config.heartbeatMs
    : DEFAULT_HEARTBEAT_MS
  let buffer = ''
  let flushTimer = null
  let heartbeatTimer = null

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders()
  }
  if (res.socket?.setTimeout) {
    res.socket.setTimeout(0)
  }

  const flush = () => {
    if (!buffer || res.writableEnded || res.writableFinished) return
    res.write(buffer)
    buffer = ''
  }

  const scheduleFlush = () => {
    if (flushMs <= 0 || flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      flush()
    }, flushMs)
  }

  const writeRaw = (text, immediate = false) => {
    if (res.writableEnded || res.writableFinished) return
    buffer += text
    if (immediate || flushMs <= 0) {
      flush()
    } else {
      scheduleFlush()
    }
  }

  const writeComment = comment => {
    writeRaw(`:${comment}\n\n`, true)
  }

  const sendEvent = data => {
    writeRaw(`data: ${JSON.stringify(data)}\n\n`)
  }

  if (heartbeatMs > 0) {
    heartbeatTimer = setInterval(() => {
      writeComment('keep-alive')
    }, heartbeatMs)
  }

  const close = () => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    flush()
    res.end()
  }

  return {
    sendEvent,
    writeComment,
    flush,
    close,
  }
}
