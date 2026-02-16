import React from 'react'
import BaseMessageList from './BaseMessageList'
import MessageBubble from './MessageBubble'

/**
 * MessageList component that directly consumes chatStore state
 * Eliminates props drilling and automatically responds to message updates
 */
const MessageList = props => <BaseMessageList BubbleComponent={MessageBubble} {...props} />

export default React.memo(MessageList)
