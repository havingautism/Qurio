import { useEffect, useMemo, useState } from 'react'
import {
  buildExpertSyntheticMessage,
  resolveActiveExpertResponse,
  resolvePreferredExpertAgentId,
} from '../../lib/chat/expertViewAdapter'

const useExpertAgentSelection = ({ message, expertResponses, isExpertMessage }) => {
  const [activeExpertAgentId, setActiveExpertAgentId] = useState(
    String(message?.expertActiveAgentId || expertResponses?.[0]?.agentId || ''),
  )

  useEffect(() => {
    if (!isExpertMessage) return
    const nextAgentId = resolvePreferredExpertAgentId({
      message,
      responses: expertResponses,
      currentAgentId: activeExpertAgentId,
    })
    if (nextAgentId !== activeExpertAgentId) {
      setActiveExpertAgentId(nextAgentId)
    }
  }, [activeExpertAgentId, expertResponses, isExpertMessage, message])

  const activeExpertResponse = useMemo(
    () => resolveActiveExpertResponse(expertResponses, activeExpertAgentId),
    [activeExpertAgentId, expertResponses],
  )

  const syntheticMessage = useMemo(
    () => buildExpertSyntheticMessage({ message, activeResponse: activeExpertResponse }),
    [activeExpertResponse, message],
  )

  return {
    activeExpertAgentId,
    setActiveExpertAgentId,
    activeExpertResponse,
    syntheticMessage,
  }
}

export default useExpertAgentSelection
