export const getSearchFilterFallbackPresentation = reason => {
  const normalized = String(reason || '').trim().toLowerCase()

  if (!normalized) {
    return {
      tone: 'warning',
      badgeKey: 'messageBubble.searchFilterFallbackGenericBadge',
      titleKey: 'messageBubble.searchFilterFallbackGenericTitle',
      bodyKey: 'messageBubble.searchFilterFallbackGenericBody',
    }
  }

  if (normalized === 'empty_selection') {
    return {
      tone: 'success',
      badgeKey: 'messageBubble.searchFilterEmptySelectionBadge',
      titleKey: 'messageBubble.searchFilterEmptySelectionTitle',
      bodyKey: 'messageBubble.searchFilterEmptySelectionBody',
    }
  }

  if (normalized.includes('timeout')) {
    return {
      tone: 'warning',
      badgeKey: 'messageBubble.searchFilterTimeoutBadge',
      titleKey: 'messageBubble.searchFilterTimeoutTitle',
      bodyKey: 'messageBubble.searchFilterTimeoutBody',
    }
  }

  return {
    tone: 'warning',
    badgeKey: 'messageBubble.searchFilterFallbackGenericBadge',
    titleKey: 'messageBubble.searchFilterFallbackGenericTitle',
    bodyKey: 'messageBubble.searchFilterFallbackGenericBody',
  }
}
