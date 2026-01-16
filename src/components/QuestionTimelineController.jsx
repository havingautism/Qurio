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

const isFormSubmission = msg =>
  msg?.role === 'user' &&
  typeof msg.content === 'string' &&
  msg.content.startsWith('[Form Submission]')

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
          if (isFormSubmission(msg)) return null
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
            if (isFormSubmission(message)) return
            setActiveId(id)
            return
          }
          if (index > 0) {
            for (let i = index - 1; i >= 0; i -= 1) {
              const prevMessage = messages[i]
              if (!prevMessage || prevMessage.role !== 'user') continue
              if (isFormSubmission(prevMessage)) continue
              setActiveId(`message-${i}`)
              break
            }
          }
        })
      },
      {
        root: container,
        rootMargin: '0px 0px -70% 0px',
        threshold: [0, 0.1],
      },
    )

    Object.values(messageRefs.current).forEach(el => {
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [messages, messageRefs, messagesContainerRef])

  // Fallback: ensure the first user question is active on mount
  useEffect(() => {
    if (activeId || items.length === 0) return
    setActiveId(items[0].id)
  }, [activeId, items])

  const jumpToMessage = useCallback(
    id => {
      const node = messageRefs?.current?.[id]
      if (!node || !messagesContainerRef?.current) return

      const containerRect = messagesContainerRef.current.getBoundingClientRect()
      const nodeRect = node.getBoundingClientRect()
      const yOffset = 20
      const scrollTop =
        nodeRect.top - containerRect.top + messagesContainerRef.current.scrollTop - yOffset

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
      messagesContainerRef={messagesContainerRef}
    />
  )
}

export default React.memo(QuestionTimelineController)
