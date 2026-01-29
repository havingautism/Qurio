import {
  createConversation,
  notifyConversationsChanged,
  addConversationEvent,
  addMessage,
} from '../conversationsService'
import { deleteMessageById } from '../supabase'
import { sanitizeJson } from './utils'
import { normalizeMessageForSend } from './formatters'

/**
 * Ensures a conversation exists in the database, creating one if necessary
 */
export const ensureConversationExists = async (
  conversationId,
  settings,
  toggles,
  spaceInfo,
  set,
  providerOverride,
  selectedAgent,
) => {
  // If conversation already exists, return it
  if (conversationId) {
    return { id: conversationId, data: null, isNew: false }
  }

  // Create new conversation payload
  const creationPayload = {
    space_id: spaceInfo.selectedSpace ? spaceInfo.selectedSpace.id : null,
    title: 'New Conversation',
    api_provider: providerOverride || '',
    agent_selection_mode: toggles?.deepResearch ? 'manual' : 'auto',
    last_agent_id: toggles?.deepResearch ? selectedAgent?.id || null : null,
  }

  const { data, error } = await createConversation(creationPayload)
  if (!error && data) {
    // Update store with new conversation ID
    set({ conversationId: data.id })
    // Notify other components that conversations list changed
    notifyConversationsChanged()
    if (toggles?.deepResearch) {
      addConversationEvent(data.id, 'deep_research', { enabled: true }).catch(err =>
        console.error('Failed to record deep research event:', err),
      )
    }
    return { id: data.id, data, isNew: true }
  } else {
    console.error('Create conversation failed:', error)
    // Reset loading state on error
    set({ isLoading: false })
    throw new Error('Failed to create conversation')
  }
}

/**
 * Persists user message to database and handles editing cleanup
 * @param {string} convId - Conversation ID
 * @param {Object|null} editingInfo - Information about message being edited
 * @param {string|Array} content - Message content (text or structured with attachments)
 * @param {Function} set - Zustand set function
 * @param {Array} extraIdsToDelete - Additional message IDs to delete (e.g. form chain)
 */
export const persistUserMessage = async (
  convId,
  editingInfo,
  content,
  set,
  extraIdsToDelete = [],
) => {
  // Handle editing: delete old messages if editing
  if (editingInfo?.index !== undefined && editingInfo.index !== null) {
    const ids = new Set()
    if (editingInfo.targetId) ids.add(editingInfo.targetId)
    if (editingInfo.partnerId) ids.add(editingInfo.partnerId)
    if (Array.isArray(extraIdsToDelete)) {
      extraIdsToDelete.forEach(id => id && ids.add(id))
    }

    // Delete all collected IDs
    const deletePromises = Array.from(ids).map(id => deleteMessageById(id))
    await Promise.all(deletePromises)
  }

  // Insert the new user message into database
  const { data: insertedUser } = await addMessage({
    conversation_id: convId,
    role: 'user',
    content: sanitizeJson(content),
    created_at: new Date().toISOString(),
  })

  // Update UI message with database ID and timestamp
  if (insertedUser) {
    set(state => {
      const updated = [...state.messages]
      // Find the last user message without ID and update it with database info
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].role === 'user' && !updated[i].id) {
          updated[i] = {
            ...updated[i],
            id: insertedUser.id,
            created_at: insertedUser.created_at,
          }
          break
        }
      }
      return { messages: updated }
    })
  }
}

/**
 * Appends an AI message placeholder to the UI
 */
export const appendAIPlaceholder = (selectedAgent, toggles, documentSources, set) => {
  const normalizedSearchBackends = Array.isArray(toggles?.searchBackends)
    ? toggles.searchBackends.map(item => String(item)).filter(Boolean)
    : typeof toggles?.searchBackend === 'string'
      ? [toggles.searchBackend]
      : []
  const aiMessagePlaceholder = {
    role: 'ai',
    content: '',
    created_at: new Date().toISOString(),
    thinkingEnabled: !!(toggles?.thinking || toggles?.deepResearch),
    deepResearch: !!toggles?.deepResearch,
    researchPlan: '',
    researchPlanLoading: !!toggles?.deepResearch,
    agentId: selectedAgent?.id || null,
    agentName: selectedAgent?.name || null,
    agentEmoji: selectedAgent?.emoji || '',
    agentIsDefault: !!selectedAgent?.isDefault,
    documentSources: documentSources || [],
    searchBackend: normalizedSearchBackends[0] || null,
    searchBackends: normalizedSearchBackends,
  }

  set(state => ({ messages: [...state.messages, aiMessagePlaceholder] }))
  return aiMessagePlaceholder
}

/**
 * Handles message editing and history context preparation
 */
export const handleEditingAndHistory = (
  messages,
  editingInfo,
  userMessage,
  historyOverride = null,
) => {
  // Base history for context: when editing, include only messages before the edited one
  const baseHistory =
    editingInfo?.index !== undefined && editingInfo.index !== null
      ? messages.slice(0, editingInfo.index)
      : messages

  const historyForSend = historyOverride !== null ? historyOverride : baseHistory
  const safeHistoryForSend = (historyForSend || []).map(normalizeMessageForSend)

  // Initialize idsToRemove at the top level to avoid ReferenceError
  const idsToRemove = new Set()

  // UI state: remove edited user message (and its paired AI answer if any), then append the new user message at the end
  let newMessages
  if (editingInfo?.index !== undefined && editingInfo.index !== null) {
    // Intelligently identify related messages to remove (e.g. form interactions)
    // Scan forward from the edited message to find the "chain" of interaction

    // Always remove the edited message itself
    const editedMsgId = messages[editingInfo.index]?.id
    if (editedMsgId) idsToRemove.add(editedMsgId)

    // Add explicitly provided partner IDs if any
    if (Array.isArray(editingInfo.partnerIds)) {
      editingInfo.partnerIds.forEach(id => id && idsToRemove.add(id))
    }
    if (editingInfo.partnerId) idsToRemove.add(editingInfo.partnerId)

    // AUTO-SCAN: Identify subsequent messages belonging to the same flow (like Forms)
    for (let i = editingInfo.index + 1; i < messages.length; i++) {
      const m = messages[i]

      // 1. AI Messages: usually responses to the edited message or part of a form flow
      if (m.role === 'ai' || m.role === 'assistant') {
        idsToRemove.add(m.id)
        continue
      }

      // 2. User Messages: Only remove if they are Form Submissions
      if (m.role === 'user') {
        let contentToCheck = ''
        if (typeof m.content === 'string') {
          contentToCheck = m.content
        } else if (typeof m.content === 'object' && m.content !== null) {
          contentToCheck = JSON.stringify(m.content)
        }

        // Robust check: unwrap potential double-encoding if it starts with quote
        if (contentToCheck.startsWith('"')) {
          try {
            const parsed = JSON.parse(contentToCheck)
            if (typeof parsed === 'string') contentToCheck = parsed
          } catch (e) {
            // ignore
          }
        }

        const isFormSubmission =
          (contentToCheck && contentToCheck.includes('[Form Submission]')) || m.formValues

        if (isFormSubmission) {
          idsToRemove.add(m.id)
          continue
        } else {
          // Found a normal user message -> Stop scanning/deleting
          break
        }
      }
    }

    // Filter out all identified messages
    const filtered = messages.filter((msg, idx) => {
      if (idx === editingInfo.index) return false
      return !idsToRemove.has(msg.id)
    })

    // Reinsert the new user message
    const shouldMoveToEnd = editingInfo.moveToEnd !== false

    if (shouldMoveToEnd) {
      newMessages = [...filtered, userMessage]
    } else {
      newMessages = [
        ...filtered.slice(0, editingInfo.index),
        userMessage,
        ...filtered.slice(editingInfo.index),
      ]
    }
  } else {
    newMessages = [...messages, userMessage]
  }

  return { newMessages, historyForSend: safeHistoryForSend, idsToDelete: Array.from(idsToRemove) }
}
