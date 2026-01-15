/**
 * useMergedFormMessage Hook
 * Merges form submission chains into a single message
 * Handles complex logic for combining form submissions with AI responses
 */

import { useMemo } from 'react'

export function useMergedFormMessage(message, messages, messageIndex, isLoading) {
  return useMemo(() => {
    if (!message || message.role !== 'ai') return message

    const messageContent = String(message.content || '')
    const initialToolCallHistory = message.toolCallHistory || []
    const hasForm = initialToolCallHistory.some(tc => tc.name === 'interactive_form')

    if (!hasForm) return message

    // Recursively merge all form submission chains
    let currentIndex = messageIndex
    let mergedContent = messageContent
    // Clone the toolCallHistory to avoid mutating the original message object!
    // We map to new objects so we can add properties like _isSubmitted
    let toolCallHistory = (message.toolCallHistory || []).map(tc => ({ ...tc }))
    let sources = [...(message.sources || [])]
    let related = [...(message.related || [])]
    let relatedLoading = message.relatedLoading || false
    let documentSources = [...(message.documentSources || [])]
    let allSubmittedValues = {}
    let hasAnySubmission = false
    let isContinuationStreaming = false

    // Keep scanning forward for [Form Submission] → AI pairs
    while (true) {
      const nextUserMsg = messages[currentIndex + 1]
      const nextAiMsg = messages[currentIndex + 2]

      // Check if we have a submission
      if (
        nextUserMsg &&
        nextUserMsg.role === 'user' &&
        typeof nextUserMsg.content === 'string' &&
        nextUserMsg.content.startsWith('[Form Submission]')
      ) {
        hasAnySubmission = true

        // Mark all current interactive_form tools as submitted BY THIS user message
        toolCallHistory.forEach(tc => {
          if (tc.name === 'interactive_form') {
            tc._isSubmitted = true
          }
        })

        // Parse submitted values from this [Form Submission]
        const submissionContent = nextUserMsg.content
        const lines = submissionContent.split('\n').slice(1) // Skip "[Form Submission]" line
        lines.forEach(line => {
          const match = line.match(/^([^:]+):\s*(.+)$/)
          if (match) {
            const fieldName = match[1].trim()
            const value = match[2].trim()
            allSubmittedValues[fieldName] = value
          }
        })

        // If generic AI response follows, merge it
        if (nextAiMsg && nextAiMsg.role === 'ai') {
          const nextAiIndex = currentIndex + 2
          const nextAiIsStreaming =
            nextAiMsg.isStreaming || (isLoading && nextAiIndex === messages.length - 1)
          if (nextAiIsStreaming) {
            isContinuationStreaming = true
          }
          // Merge tool calls if any
          if (nextAiMsg.toolCallHistory && nextAiMsg.toolCallHistory.length > 0) {
            // Avoid duplicates by checking IDs
            const existingIds = new Set(toolCallHistory.map(tc => tc.id))
            const offset = mergedContent.length + 2 // +2 for the '\n\n' separator

            const newTools = (nextAiMsg.toolCallHistory || [])
              .filter(tc => !existingIds.has(tc.id))
              .map(tc => ({
                ...tc,
                // Adjust textIndex by adding the current content length + separator
                textIndex: (tc.textIndex || 0) + offset,
              }))

            toolCallHistory.push(...newTools)
          }

          // Merge sources if any
          if (nextAiMsg.sources && nextAiMsg.sources.length > 0) {
            const existingTitles = new Set(sources.map(s => s.title))
            const newSources = nextAiMsg.sources.filter(s => !existingTitles.has(s.title))
            sources.push(...newSources)
          }

          // Merge document sources if any
          if (nextAiMsg.documentSources && nextAiMsg.documentSources.length > 0) {
            const existingDocIds = new Set(documentSources.map(doc => doc.id))
            const newDocumentSources = nextAiMsg.documentSources.filter(
              doc => !existingDocIds.has(doc.id),
            )
            documentSources.push(...newDocumentSources)
          }

          // Merge related questions if any
          if (nextAiMsg.related && nextAiMsg.related.length > 0) {
            related = nextAiMsg.related
          }
          // Update relatedLoading status
          if (nextAiMsg.relatedLoading) {
            relatedLoading = nextAiMsg.relatedLoading
          }

          const continuationPrefixLength = mergedContent.length + 2
          mergedContent += '\n\n' + (nextAiMsg.content || '')
          toolCallHistory.push({
            id: `form-status-${currentIndex + 1}`,
            name: 'form_submission_status',
            textIndex: continuationPrefixLength,
          })

          currentIndex += 2
        } else {
          // Orphan form submission (e.g. streaming started but no placeholder yet, or error)
          // Mark as submitted but stop merging sequence
          break
        }
      } else {
        // No more form submission pairs, stop
        break
      }
    }

    // Check if the chain is currently waiting for a continuation
    let isContinuationLoading = false
    if (isLoading && hasAnySubmission) {
      // If we broke out of the loop because of an orphan submission or finished merging
      // Check if we are at the end of the known chain
      const nextUserMsg = messages[currentIndex + 1]
      const nextAiMsg = messages[currentIndex + 2]

      // Check if nextUserMsg is a form submission
      const isFormSubmission =
        nextUserMsg &&
        nextUserMsg.role === 'user' &&
        typeof nextUserMsg.content === 'string' &&
        nextUserMsg.content.startsWith('[Form Submission]')

      if (isFormSubmission) {
        // If we have a submission but no AI message yet OR an empty AI message
        if (
          !nextAiMsg ||
          (nextAiMsg &&
            nextAiMsg.role === 'ai' &&
            !nextAiMsg.content &&
            (!nextAiMsg.toolCallHistory || nextAiMsg.toolCallHistory.length === 0))
        ) {
          isContinuationLoading = true
        }
      }
    }

    // If we found any submissions, return merged message
    if (hasAnySubmission) {
      return {
        ...message,
        content: mergedContent,
        toolCallHistory: toolCallHistory,
        sources: sources,
        documentSources: documentSources,
        related: related,
        relatedLoading: relatedLoading,
        _formSubmitted: true,
        _formSubmittedValues: allSubmittedValues,
        _isContinuationLoading: isContinuationLoading,
        _isContinuationStreaming: isContinuationStreaming,
      }
    }

    return message
  }, [message, messages, messageIndex, isLoading])
}
