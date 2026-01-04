import React, { useCallback, useEffect, useMemo, useState } from 'react'
import QuestionTimelineSidebar from './QuestionTimelineSidebar'

const extractUserQuestion = msg => {
  if (!msg) return ''
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) {
    const textPart = msg.content.find(c => c.type === 'text')
    return textPart?.text || ''
  }
  return ''
}

const QuestionTimelineController = ({
  messages = [],
  messageRefs,
  messagesContainerRef,
  isOpen,
  onToggle,
}) => {
  const [activeId, setActiveId] = useState(null)

  const items = useMemo(
    () =>
      messages
        .map((msg, idx) => {
          if (msg.role !== 'user') return null
          const text = extractUserQuestion(msg).trim()
          if (!text) return null
          return {
            id: `message-${idx}`,
            index: idx + 1,
            label: text.length > 120 ? `${text.slice(0, 117)}...` : text,
            timestamp: msg.created_at,
          }
        })
        .filter(Boolean),
    [messages],
  )

  useEffect(() => {
    const container = messagesContainerRef?.current
    if (!container || !messageRefs?.current) return undefined

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting || entry.intersectionRatio <= 0.1) return
          const id = entry.target.id
          if (!id) return
          const index = Number.parseInt(id.replace('message-', ''), 10)
          if (Number.isNaN(index)) return
          const message = messages[index]
          if (!message) return
          if (message.role === 'user') {
            setActiveId(id)
            return
          }
          if (index > 0 && messages[index - 1]?.role === 'user') {
            setActiveId(`message-${index - 1}`)
          }
        })
      },
      {
        root: container,
        rootMargin: '-10% 0px -60% 0px',
        threshold: [0.1],
      },
    )

    Object.values(messageRefs.current).forEach(el => {
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [messages, messageRefs, messagesContainerRef])

  const jumpToMessage = useCallback(
    id => {
      const node = messageRefs?.current?.[id]
      if (!node || !messagesContainerRef?.current) return

      const containerRect = messagesContainerRef.current.getBoundingClientRect()
      const nodeRect = node.getBoundingClientRect()
      const yOffset = 20
      const scrollTop = nodeRect.top - containerRect.top + messagesContainerRef.current.scrollTop - yOffset

      messagesContainerRef.current.scrollTo({
        top: scrollTop,
        behavior: 'smooth',
      })
    },
    [messageRefs, messagesContainerRef],
  )

  return (
    <QuestionTimelineSidebar
      items={items}
      onJump={jumpToMessage}
      activeId={activeId}
      isOpen={isOpen}
      onToggle={onToggle}
    />
  )
}

export default React.memo(QuestionTimelineController)
