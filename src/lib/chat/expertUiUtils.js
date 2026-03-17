const normalizeTask = task => String(task || '').trim()

export const getExpertTaskCardModel = ({ teamMode, response }) => {
  const task = normalizeTask(response?.task)
  const isLeader = response?.agentRole === 'leader'

  if (task) {
    return {
      kind: 'task',
      labelKey: isLeader ? 'messageBubble.expert.overallTask' : 'messageBubble.expert.assignedTask',
      task,
    }
  }

  if (isLeader) return null

  if (teamMode === 'route') {
    return {
      kind: 'empty',
      titleKey: 'messageBubble.expert.notEngagedTitle',
      bodyKey: 'messageBubble.expert.notEngagedBody',
    }
  }

  if (teamMode === 'coordinate' || teamMode === 'tasks') {
    return {
      kind: 'empty',
      titleKey: 'messageBubble.expert.standbyTitle',
      bodyKey: 'messageBubble.expert.standbyBody',
    }
  }

  return null
}

export const getExpertTabIndicators = ({ response, isActive }) => {
  const task = normalizeTask(response?.task)
  const isLeader = response?.agentRole === 'leader'
  const showAssignedMarker =
    Boolean(task) && !isLeader && !isActive && response?.status !== 'active'

  return {
    showAssignedMarker,
  }
}
