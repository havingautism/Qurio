import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../../lib/chatStore'
import useExpertAgentSelection from '../../hooks/expert/useExpertAgentSelection'
import {
  isExpertAiMessage,
  normalizeExpertResponses,
  resolveExpertPlanText,
} from '../../lib/chat/expertViewAdapter'
import ExpertAgentSwitcher from './ExpertAgentSwitcher'
import ExpertPlanPanel from './ExpertPlanPanel'
import ExpertTaskCard from './ExpertTaskCard'
import MessageBubble from '../MessageBubble'

const ExpertMessageBubble = props => {
  const { messageIndex } = props
  const { messages } = useChatStore(
    useShallow(state => ({
      messages: state.messages,
    })),
  )

  const message = messages[messageIndex]
  const expertResponses = useMemo(
    () => normalizeExpertResponses(message),
    [message?.expertResponses],
  )
  const expertPlanText = useMemo(() => resolveExpertPlanText(message), [message])
  const isExpertMessage = isExpertAiMessage(message, expertResponses)
  const { activeExpertAgentId, setActiveExpertAgentId, activeExpertResponse, syntheticMessage } =
    useExpertAgentSelection({
      message,
      expertResponses,
      isExpertMessage,
    })

  if (!isExpertMessage) {
    return <MessageBubble {...props} />
  }

  return (
    <div className="w-full">
      <div className="mx-5 sm:mx-0">
        <ExpertPlanPanel planText={expertPlanText} />
      </div>

      <ExpertAgentSwitcher
        responses={expertResponses}
        activeAgentId={activeExpertAgentId}
        onSelectAgent={setActiveExpertAgentId}
      />

      <MessageBubble
        {...props}
        messageOverride={syntheticMessage}
        headerExtraContent={<ExpertTaskCard task={activeExpertResponse?.task} />}
      />
    </div>
  )
}

export default React.memo(ExpertMessageBubble)
