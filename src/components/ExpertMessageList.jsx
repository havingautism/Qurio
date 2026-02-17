import React from 'react'
import BaseMessageList from './BaseMessageList'
import ExpertMessageBubble from './expert/ExpertMessageBubble'

const ExpertMessageList = props => (
  <BaseMessageList BubbleComponent={ExpertMessageBubble} {...props} />
)

export default React.memo(ExpertMessageList)
