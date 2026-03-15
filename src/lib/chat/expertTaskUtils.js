const DELEGATION_TOOL_NAME = 'delegate_task_to_member'

const cleanTaskText = value => String(value || '').trim()

const parseArgumentsObject = argumentsText => {
  if (!argumentsText) return {}
  if (typeof argumentsText === 'object') return argumentsText

  try {
    const parsed = JSON.parse(String(argumentsText))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const pickFirstString = (obj, keys) => {
  for (const key of keys) {
    const value = obj?.[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

export const buildInitialExpertTasks = ({ teamMode, userTask, memberIds = [] }) => {
  const normalizedTask = cleanTaskText(userTask)
  const memberTasks = Object.fromEntries(
    memberIds.map(memberId => [String(memberId), teamMode === 'broadcast' ? normalizedTask : '']),
  )

  return {
    leaderTask: normalizedTask,
    memberTasks,
  }
}

export const parseDelegatedExpertTask = ({ toolName, argumentsText }) => {
  if (toolName !== DELEGATION_TOOL_NAME) return null

  const args = parseArgumentsObject(argumentsText)
  const memberId = pickFirstString(args, [
    'member_id',
    'memberId',
    'agent_id',
    'agentId',
    'delegate_member_id',
    'delegateMemberId',
  ])
  const memberName = pickFirstString(args, [
    'member_name',
    'memberName',
    'agent_name',
    'agentName',
    'member',
    'agent',
  ])
  const task = pickFirstString(args, [
    'task',
    'task_description',
    'taskDescription',
    'description',
    'instructions',
    'prompt',
    'message',
  ])

  if (!memberId && !memberName) return null
  if (!task) return null

  return { memberId, memberName, task }
}
