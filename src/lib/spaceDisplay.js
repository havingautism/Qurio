export const getSpaceDisplayLabel = (space, t) => {
  if (!space) return ''
  if (
    (space.isDeepResearchSystem || space.isDeepResearch || space.is_deep_research) &&
    typeof t === 'function'
  ) {
    return t('deepResearch.spaceName') || space.label || ''
  }
  return space.label || ''
}

export const getSpaceDisplayDescription = (space, t) => {
  if (!space) return ''
  if (
    (space.isDeepResearchSystem || space.isDeepResearch || space.is_deep_research) &&
    typeof t === 'function'
  ) {
    return t('deepResearch.spaceDescription') || space.description || ''
  }
  return space.description || ''
}
