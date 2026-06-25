import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { FileText } from 'lucide-react'
import clsx from 'clsx'

import MobileSourcesDrawer from '../MobileSourcesDrawer'
import { parseChildrenWithEmojis } from '../../lib/emojiParser'
import {
  buildDocumentCitationPath,
  canExpandDocumentCitation,
} from '../../lib/documentCitationViewModel'
import { getHostname } from '../message/messageUtils'

const CitationChip = ({ indices, sources, isMobile, onMobileClick, label }) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [expandedItemKey, setExpandedItemKey] = useState(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const containerRef = useRef(null)
  const timeoutRef = useRef(null)
  const normalizedIndices = useMemo(
    () =>
      Array.from(
        new Set(
          (Array.isArray(indices) ? indices : [])
            .map(value => Number(value))
            .filter(value => Number.isInteger(value) && value >= 0),
        ),
      ).sort((left, right) => left - right),
    [indices],
  )

  const drawerSources = useMemo(() => {
    if (!sources || !Array.isArray(sources)) return []
    const seen = new Set()
    return normalizedIndices
      .map(idx => ({ source: sources[idx], originalIndex: idx }))
      .filter(item => {
        if (!item.source) return false
        const dedupeKey =
          item.source.id ||
          item.source.nodeId ||
          item.source.url ||
          item.source.uri ||
          item.source.link ||
          item.source.href ||
          `${item.originalIndex}:${item.source.title || ''}`
        if (seen.has(dedupeKey)) return false
        seen.add(dedupeKey)
        return true
      })
      .map(item => ({ ...item.source, originalIndex: item.originalIndex }))
  }, [normalizedIndices, sources])

  const getSourceKey = useCallback(source => {
    const path = buildDocumentCitationPath(source)
    return (
      source?.id ||
      source?.nodeId ||
      source?.url ||
      source?.uri ||
      source?.link ||
      source?.href ||
      `${source?.citationIndex ?? source?.originalIndex ?? 'source'}:${source?.title || ''}:${path}`
    )
  }, [])

  const updatePosition = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const dropdownWidth = 256
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const padding = 12
      const inputEl = isMobile ? document.getElementById('chat-input-textarea') : null
      const inputRect = inputEl?.getBoundingClientRect()
      const inputSafeSpace = inputRect ? Math.max(0, viewportHeight - inputRect.top + 8) : 0
      const bottomSafeSpace = isMobile ? Math.max(140, inputSafeSpace) : padding

      let left = rect.left + rect.width / 2
      const minCenter = dropdownWidth / 2 + padding
      const maxCenter = viewportWidth - dropdownWidth / 2 - padding
      left = Math.max(minCenter, Math.min(left, maxCenter))

      const spaceBelow = viewportHeight - rect.bottom - bottomSafeSpace
      const spaceAbove = rect.top
      const preferUp = isMobile

      let showAbove = false
      if (preferUp && spaceAbove > 200) {
        showAbove = true
      } else if (spaceBelow < 250 && spaceAbove > spaceBelow) {
        showAbove = true
      }

      const top = showAbove ? rect.top - 8 : rect.bottom + 8
      const maxHeight = showAbove
        ? Math.min(240, spaceAbove - padding - 8)
        : Math.min(240, spaceBelow)

      setPosition({ top, left, showAbove, maxHeight })
    }
  }, [isMobile])

  const handleMouseEnter = () => {
    if (isMobile || window.innerWidth < 768) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    updatePosition()
    setIsOpen(true)
  }

  const handleMouseLeave = () => {
    if (isMobile) return
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false)
    }, 200)
  }

  const handleClick = e => {
    e.preventDefault()
    e.stopPropagation()
    if (isMobile || window.innerWidth < 768) {
      if (onMobileClick) onMobileClick(drawerSources)
      return
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    updatePosition()
    setIsOpen(prev => !prev)
  }

  useEffect(() => {
    if (!isOpen) return
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isOpen, updatePosition])

  useEffect(() => {
    if (!isOpen) return
    const handleOutside = e => {
      if (
        e.target.closest('.citation-dropdown') ||
        (containerRef.current && containerRef.current.contains(e.target))
      ) {
        return
      }
      setIsOpen(false)
    }

    document.addEventListener('touchstart', handleOutside)
    document.addEventListener('mousedown', handleOutside)
    return () => {
      document.removeEventListener('touchstart', handleOutside)
      document.removeEventListener('mousedown', handleOutside)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) return
    setExpandedItemKey(null)
  }, [isOpen])

  return (
    <>
      <span
        ref={containerRef}
        className="relative inline-block"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <span
          onClick={handleClick}
          onFocus={handleMouseEnter}
          className="bg-primary-200/50 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 hover:bg-primary-300/50 dark:hover:bg-primary-700/50 mx-0.5 cursor-pointer rounded-lg px-1 py-0.5 text-[12px] transition-colors"
        >
          {parseChildrenWithEmojis(label)}
        </span>
      </span>

      {isOpen &&
        !isMobile &&
        createPortal(
          <div
            className="citation-dropdown fixed z-9999 flex w-64 flex-col overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            style={{
              top: position.showAbove ? 'auto' : position.top,
              bottom: position.showAbove ? window.innerHeight - position.top : 'auto',
              left: position.left,
              transform: 'translateX(-50%)',
              maxHeight: position.maxHeight,
            }}
            onMouseEnter={() => {
              if (timeoutRef.current) clearTimeout(timeoutRef.current)
            }}
            onMouseLeave={handleMouseLeave}
          >
            {drawerSources.map((source, listIndex) => {
              if (!source) return null
              const url = source.url || source.uri || source.link || source.href || ''
              const previewSnippet = source.previewSnippet || source.snippet || source.content || ''
              const fullSnippet = source.fullSnippet || source.snippet || source.content || ''
              const hostname = getHostname(url)
              const faviconUrl = (() => {
                if (source.icon) return source.icon
                if (!url) return ''
                try {
                  const parsed = new URL(url)
                  const validHost = parsed.hostname.replace(/^www\./, '')
                  return validHost
                    ? `https://www.google.com/s2/favicons?domain=${validHost}&sz=32`
                    : ''
                } catch {
                  return ''
                }
              })()
              const titlePath = buildDocumentCitationPath(source)
              const metaLabel = url
                ? hostname
                : titlePath || source.fileType || t('sources.documentSources')
              const itemKey = getSourceKey(source)
              const canExpand = !url && canExpandDocumentCitation(source)
              const isExpanded = expandedItemKey === itemKey
              const displayIndex = source.originalIndex ?? listIndex
              const body = (
                <>
                  <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border border-gray-200 bg-gray-100 text-[9px] font-medium text-gray-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-400">
                    {displayIndex + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 block text-xs font-medium text-gray-800 dark:text-gray-200">
                      {source.title}
                    </span>
                    <span className="block truncate text-[10px]! text-gray-400 dark:text-gray-500">
                      <span className="inline-flex items-center gap-1.5">
                        {faviconUrl ? (
                          <img src={faviconUrl} alt="" className="h-3 w-3 rounded-sm" />
                        ) : (
                          <FileText size={12} className="opacity-70" />
                        )}
                        <span className="truncate">{metaLabel}</span>
                      </span>
                    </span>
                    {previewSnippet && (
                      <span
                        className={clsx(
                          'mt-1 block text-[10px] text-gray-500 dark:text-gray-400',
                          isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2',
                        )}
                      >
                        {isExpanded ? fullSnippet : previewSnippet}
                      </span>
                    )}
                    {canExpand && (
                      <button
                        type="button"
                        onClick={event => {
                          event.preventDefault()
                          event.stopPropagation()
                          setExpandedItemKey(prev => (prev === itemKey ? null : itemKey))
                        }}
                        className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 mt-1 text-[10px] font-medium transition-colors"
                      >
                        {isExpanded
                          ? t('sources.hideFullExcerpt', 'Hide full quote')
                          : t('sources.showFullExcerpt', 'Show full quote')}
                      </button>
                    )}
                  </span>
                </>
              )
              return url ? (
                <a
                  key={itemKey}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="flex items-start gap-2 rounded-lg p-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800"
                >
                  {body}
                </a>
              ) : (
                <div key={itemKey} className="flex items-start gap-2 rounded-lg p-2 text-left">
                  {body}
                </div>
              )
            })}
          </div>,
          document.body,
        )}

      <MobileSourcesDrawer
        isOpen={isOpen && isMobile}
        onClose={() => setIsOpen(false)}
        sources={drawerSources}
        title={t('sources.citationSources')}
      />
    </>
  )
}

export default CitationChip
