export const computeFrameTiming = (previousFrame, nowMs) => {
  if (!previousFrame || !Number.isFinite(previousFrame.lastFrameAtMs)) {
    return {
      deltaSeconds: 0,
      elapsedSeconds: 0,
      startedAtMs: nowMs,
    }
  }

  const startedAtMs = Number.isFinite(previousFrame.startedAtMs)
    ? previousFrame.startedAtMs
    : previousFrame.lastFrameAtMs

  return {
    deltaSeconds: Math.max(0, (nowMs - previousFrame.lastFrameAtMs) / 1000),
    elapsedSeconds: Math.max(0, (nowMs - startedAtMs) / 1000),
    startedAtMs,
  }
}
