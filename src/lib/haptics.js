const HAPTIC_PATTERNS = {
  light: 10,
  medium: [15, 25],
  heavy: [25, 35],
}

export const triggerHaptic = (pattern = 'light') => {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false
  }
  const resolvedPattern = HAPTIC_PATTERNS[pattern] || pattern
  return navigator.vibrate(resolvedPattern)
}
