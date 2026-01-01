import React, { useCallback, useEffect, useState } from 'react'
import QuestionTimelineSidebar from './QuestionTimelineSidebar'

const ResearchTimelineController = ({
  messages = [],
  messagesContainerRef,
  isOpen,
  onToggle,
}) => {
  const [activeId, setActiveId] = useState(null)
  const [items, setItems] = useState([])

  useEffect(() => {
    const container = messagesContainerRef?.current
    if (!container) return undefined

    let rafId = null
    const collectHeadings = () => {
      const headingNodes = Array.from(container.querySelectorAll('[data-heading-id]'))
      const nextItems = headingNodes
        .filter(node => {
          const tag = node.tagName?.toLowerCase?.() || ''
          return tag === 'h1' || tag === 'h2'
        })
        .map(node => {
        const id = node.getAttribute('data-heading-id') || node.id
        const label = node.textContent?.trim() || ''
        const tag = node.tagName?.toLowerCase?.() || ''
        const level = tag === 'h1' ? 1 : tag === 'h2' ? 2 : tag === 'h3' ? 3 : 3
        return { id, label, level }
      })
      setItems(nextItems.filter(item => item.id && item.label))
    }

    const scheduleCollect = () => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(collectHeadings)
    }

    scheduleCollect()
    const mutationObserver = new MutationObserver(scheduleCollect)
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      mutationObserver.disconnect()
    }
  }, [messages, messagesContainerRef])

  useEffect(() => {
    const container = messagesContainerRef?.current
    if (!container || items.length === 0) return undefined

    const headingNodes = items
      .map(item => container.querySelector(`[data-heading-id="${item.id}"]`))
      .filter(Boolean)
    if (headingNodes.length === 0) return undefined

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting || entry.intersectionRatio <= 0.1) return
          const headingId = entry.target.getAttribute?.('data-heading-id')
          if (headingId) {
            setActiveId(headingId)
            return
          }
          const id = entry.target.getAttribute?.('data-heading-id') || entry.target.id
          if (!id) return
        })
      },
      {
        root: container,
        rootMargin: '-10% 0px -60% 0px',
        threshold: [0.1],
      },
    )

    headingNodes.forEach(el => observer.observe(el))

    return () => observer.disconnect()
  }, [items, messagesContainerRef])

  const jumpToItem = useCallback(
    id => {
      const container = messagesContainerRef?.current
      if (!container) return

      const headingEl = container.querySelector(`[data-heading-id="${id}"]`)
      if (!headingEl) return

      const containerRect = container.getBoundingClientRect()
      const nodeRect = headingEl.getBoundingClientRect()
      const yOffset = 20
      const scrollTop = nodeRect.top - containerRect.top + container.scrollTop - yOffset
      container.scrollTo({ top: scrollTop, behavior: 'smooth' })
    },
    [messagesContainerRef],
  )

  return (
    <QuestionTimelineSidebar
      items={items}
      onJump={jumpToItem}
      activeId={activeId}
      isOpen={isOpen}
      onToggle={onToggle}
    />
  )
}

export default React.memo(ResearchTimelineController)
