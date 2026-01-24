import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { notifyConversationsChanged, updateConversation } from '../../lib/conversationsService'

/**
 * useSpaceManagement Hook
 * Manages space selection and synchronization logic
 *
 * @param {object} params
 * @param {Array} params.spaces - List of available spaces
 * @param {object} params.initialSpaceSelection - Initial space selection { mode, space }
 * @param {object} params.activeConversation - Current active conversation
 * @param {object} params.deepResearchSpace - Deep research space configuration
 * @param {string} params.conversationId - Current conversation ID
 *
 * @returns {object}
 * @property {object} selectedSpace - Currently selected space
 * @property {boolean} isManualSpaceSelection - Whether space was manually selected
 * @property {boolean} isSelectorOpen - Whether space selector dropdown is open
 * @property {object} selectorRef - Ref for space selector dropdown
 * @property {object} displaySpace - Space to display in UI
 * @property {Array} availableSpaces - Filtered list of available spaces
 * @property {boolean} isDeepResearchConversation - Whether this is a deep research conversation
 * @property {function} setSelectedSpace - Set selected space
 * @property {function} setIsManualSpaceSelection - Set manual space selection mode
 * @property {function} setIsSelectorOpen - Set selector open state
 * @property {function} handleSelectSpace - Handle space selection
 * @property {function} handleClearSpaceSelection - Handle clearing space selection
 */
const useSpaceManagement = ({
  spaces,
  initialSpaceSelection,
  activeConversation,
  deepResearchSpace,
  conversationId,
}) => {
  // Compute conversationSpace from activeConversation
  const conversationSpace = useMemo(() => {
    if (!activeConversation?.space_id) return null
    const sid = String(activeConversation.space_id)
    return spaces.find(s => String(s.id) === sid) || null
  }, [activeConversation?.space_id, spaces])
  const [selectedSpace, setSelectedSpace] = useState(initialSpaceSelection?.space || null)
  const [isManualSpaceSelection, setIsManualSpaceSelection] = useState(
    initialSpaceSelection?.mode === 'manual',
  )
  const [isSelectorOpen, setIsSelectorOpen] = useState(false)
  const selectorRef = useRef(null)

  // Track manual space override to prevent re-syncing
  const manualSpaceOverrideRef = useRef({
    conversationId: null,
    spaceId: null,
  })

  const isPlaceholderConversation = Boolean(activeConversation?._isPlaceholder)

  // Calculate display space
  const displaySpace = useMemo(() => {
    const result = isManualSpaceSelection
      ? selectedSpace
      : selectedSpace || conversationSpace || null
    return result
  }, [isManualSpaceSelection, selectedSpace, conversationSpace])

  // Check if this is a deep research conversation
  const isDeepResearchConversation = useMemo(
    () =>
      Boolean(
        deepResearchSpace?.id &&
        displaySpace?.id &&
        String(displaySpace.id) === String(deepResearchSpace.id),
      ),
    [deepResearchSpace?.id, displaySpace?.id],
  )

  // Filter available spaces (exclude deep research spaces unless in deep research mode)
  const availableSpaces = useMemo(() => {
    if (isDeepResearchConversation) return spaces
    const deepResearchId = deepResearchSpace?.id ? String(deepResearchSpace.id) : null
    return spaces.filter(
      space =>
        !(space?.isDeepResearchSystem || space?.isDeepResearch || space?.is_deep_research) &&
        (!deepResearchId || String(space.id) !== deepResearchId),
    )
  }, [spaces, isDeepResearchConversation, deepResearchSpace?.id])

  // Handle initial space selection from props
  useEffect(() => {
    const canAdoptInitialSpace =
      !activeConversation ||
      isPlaceholderConversation ||
      (!activeConversation?.space_id && !selectedSpace && !isManualSpaceSelection)

    if (!canAdoptInitialSpace) return

    if (initialSpaceSelection?.mode === 'manual') {
      setSelectedSpace(initialSpaceSelection.space || null)
      setIsManualSpaceSelection(true)
      return
    }

    if (initialSpaceSelection?.mode === 'auto') {
      if (initialSpaceSelection?.space) {
        setSelectedSpace(initialSpaceSelection.space)
        setIsManualSpaceSelection(false)
      } else if (!selectedSpace && !isManualSpaceSelection) {
        setSelectedSpace(null)
        setIsManualSpaceSelection(false)
      }
    }
  }, [
    initialSpaceSelection,
    activeConversation,
    isPlaceholderConversation,
    selectedSpace,
    isManualSpaceSelection,
  ])

  // Handle deep research conversation space
  useEffect(() => {
    if (!isDeepResearchConversation) return
    if (deepResearchSpace && deepResearchSpace.id !== selectedSpace?.id) {
      setSelectedSpace(deepResearchSpace)
      setIsManualSpaceSelection(true)
    }
  }, [isDeepResearchConversation, deepResearchSpace, selectedSpace?.id])

  /**
   * Handle space selection
   */
  const handleSelectSpace = useCallback(
    space => {
      if (isDeepResearchConversation) return
      const isDeepResearchSpace =
        space?.isDeepResearchSystem ||
        space?.isDeepResearch ||
        space?.is_deep_research ||
        (deepResearchSpace?.id && String(space?.id) === String(deepResearchSpace.id))
      if (isDeepResearchSpace) return

      setSelectedSpace(space)
      setIsManualSpaceSelection(true)
      setIsSelectorOpen(false)
      manualSpaceOverrideRef.current = {
        conversationId: activeConversation?.id || conversationId || null,
        spaceId: space?.id || null,
      }

      const targetConversationId = activeConversation?.id || conversationId
      if (targetConversationId) {
        updateConversation(targetConversationId, {
          space_id: space?.id || null,
        })
          .then(() => {
            // Trigger event to refresh sidebar
            notifyConversationsChanged()
            window.dispatchEvent(
              new CustomEvent('conversation-space-updated', {
                detail: {
                  conversationId: targetConversationId,
                  space,
                },
              }),
            )
          })
          .catch(err => console.error('Failed to update conversation space:', err))
      }
    },
    [isDeepResearchConversation, deepResearchSpace, activeConversation, conversationId],
  )

  /**
   * Handle clearing space selection
   */
  const handleClearSpaceSelection = useCallback(() => {
    if (isDeepResearchConversation) return

    setSelectedSpace(null)
    setIsManualSpaceSelection(true)
    setIsSelectorOpen(false)
    manualSpaceOverrideRef.current = {
      conversationId: activeConversation?.id || conversationId || null,
      spaceId: null,
    }

    const targetConversationId = activeConversation?.id || conversationId
    if (targetConversationId) {
      updateConversation(targetConversationId, {
        space_id: null,
      })
        .then(() => {
          // Trigger event to refresh sidebar
          notifyConversationsChanged()
          window.dispatchEvent(
            new CustomEvent('conversation-space-updated', {
              detail: {
                conversationId: targetConversationId,
                space: null,
              },
            }),
          )
        })
        .catch(err => console.error('Failed to clear conversation space:', err))
    }
  }, [isDeepResearchConversation, activeConversation, conversationId])

  return {
    selectedSpace,
    isManualSpaceSelection,
    isSelectorOpen,
    selectorRef,
    displaySpace,
    availableSpaces,
    isDeepResearchConversation,
    conversationSpace,
    setSelectedSpace,
    setIsManualSpaceSelection,
    setIsSelectorOpen,
    handleSelectSpace,
    handleClearSpaceSelection,
    manualSpaceOverrideRef,
  }
}

export default useSpaceManagement
