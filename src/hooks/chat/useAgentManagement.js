import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listSpaceAgents } from '../../lib/spacesService'
import { SCRAPBOOK_AGENT_ID } from '../../lib/systemAgents'

const sameStringArray = (a, b) => {
  if (a === b) return true
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i]) !== String(b[i])) return false
  }
  return true
}

/**
 * useAgentManagement Hook
 * Manages agent selection, space agents loading, and agent switching logic
 *
 * @param {object} params
 * @param {Array} params.appAgents - List of all available agents
 * @param {object} params.defaultAgent - Default agent
 * @param {object} params.displaySpace - Currently displayed space
 * @param {object} params.initialAgentSelection - Initial agent selection
 * @param {boolean} params.initialIsAgentAutoMode - Whether initial agent mode is auto
 * @param {boolean} params.isPlaceholderConversation - Whether conversation is a placeholder
 * @param {object} params.activeConversation - Current active conversation
 * @param {string} params.conversationId - Current conversation ID
 * @param {boolean} params.isDeepResearchConversation - Whether this is a deep research conversation
 * @param {object} params.deepResearchAgent - Deep research agent configuration
 * @param {object} params.selectedSpace - Currently selected space
 * @param {boolean} params.isManualSpaceSelection - Whether space was manually selected
 * @param {boolean} params.isAgentPreselecting - Whether agent is being preselected
 * @param {function} params.t - Translation function
 *
 * @returns {object}
 */
const useAgentManagement = ({
  appAgents,
  defaultAgent,
  displaySpace,
  initialAgentSelection,
  initialIsAgentAutoMode,
  isPlaceholderConversation,
  activeConversation,
  conversationId,
  isDeepResearchConversation,
  deepResearchAgent,
  selectedSpace,
  isManualSpaceSelection,
  isAgentPreselecting = false,
  t = key => key,
}) => {
  const [spaceAgentIds, setSpaceAgentIds] = useState([])
  const [spacePrimaryAgentId, setSpacePrimaryAgentId] = useState(null)
  const [isAgentsLoading, setIsAgentsLoading] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState(() => {
    if (activeConversation?.scrapbook_id) return SCRAPBOOK_AGENT_ID
    return initialAgentSelection?.id || null
  })
  const [isAgentAutoMode, setIsAgentAutoMode] = useState(() => {
    // If it's a scrapbook conversation, force manual mode
    if (activeConversation?.scrapbook_id) return false
    if (isPlaceholderConversation) return initialIsAgentAutoMode
    return activeConversation?.agent_selection_mode !== 'manual'
  })
  const [isAgentSelectorOpen, setIsAgentSelectorOpen] = useState(false)
  const [pendingAgentId, setPendingAgentId] = useState(null)

  const agentSelectorRef = useRef(null)
  const initialAgentAppliedRef = useRef({
    key: null,
    agentId: null,
    isAgentAutoMode: null,
  })
  const manualAgentSelectionRef = useRef({
    conversationId: null,
    agentId: null,
    isAgentAutoMode: null,
  })

  // Function to reload space agents
  const reloadSpaceAgents = useCallback(async () => {
    if (!displaySpace?.id) {
      setSpaceAgentIds(prev => (prev.length === 0 ? prev : []))
      setSpacePrimaryAgentId(prev => (prev === null ? prev : null))
      setIsAgentsLoading(prev => (prev ? false : prev))
      return
    }

    setIsAgentsLoading(true)

    try {
      const { data, error } = await listSpaceAgents(displaySpace.id)

      if (!error && data) {
        const ids = data.map(a => String(a.agent_id))
        const primary = data.find(a => a.is_primary)
        setSpaceAgentIds(prev => (sameStringArray(prev, ids) ? prev : ids))
        setSpacePrimaryAgentId(prev => {
          const nextPrimary = primary?.agent_id || null
          return prev === nextPrimary ? prev : nextPrimary
        })
      } else {
        setSpaceAgentIds(prev => (prev.length === 0 ? prev : []))
        setSpacePrimaryAgentId(prev => (prev === null ? prev : null))
      }
    } catch (err) {
      console.error('Failed to load space agents:', err)
      setSpaceAgentIds(prev => (prev.length === 0 ? prev : []))
      setSpacePrimaryAgentId(prev => (prev === null ? prev : null))
    } finally {
      setIsAgentsLoading(prev => (prev ? false : prev))
    }
  }, [displaySpace?.id])

  // Load agents when space changes
  useEffect(() => {
    reloadSpaceAgents()
  }, [reloadSpaceAgents])

  // Agent Resolving/Locking for Scrapbook
  useEffect(() => {
    if (activeConversation?.scrapbook_id) {
      if (selectedAgentId !== SCRAPBOOK_AGENT_ID) {
        setSelectedAgentId(SCRAPBOOK_AGENT_ID)
      }
      if (isAgentAutoMode) {
        setIsAgentAutoMode(false)
      }
    }
  }, [activeConversation?.scrapbook_id, selectedAgentId, isAgentAutoMode])

  // Listen for space agents changes
  useEffect(() => {
    const handleSpaceAgentsChanged = event => {
      const { spaceId } = event.detail
      if (displaySpace?.id && String(displaySpace.id) === String(spaceId)) {
        reloadSpaceAgents()
      }
    }

    window.addEventListener('space-agents-changed', handleSpaceAgentsChanged)
    return () => {
      window.removeEventListener('space-agents-changed', handleSpaceAgentsChanged)
    }
  }, [displaySpace?.id, reloadSpaceAgents])

  // Agent resolving animation: animates dots when agents are loading, pending, or preselecting
  const isAgentResolving = isAgentsLoading || pendingAgentId !== null || isAgentPreselecting
  const agentLoadingDots = ''

  // Computed agents loading label with animated dots
  const agentsLoadingLabel = useMemo(() => {
    const baseLabel = t('chatInterface.agentsLoading')
    return `${baseLabel.replace(/\.\.\.$/, '')}${agentLoadingDots}`
  }, [agentLoadingDots, t])

  return {
    spaceAgentIds,
    spacePrimaryAgentId,
    isAgentsLoading,
    agentsLoadingLabel,
    agentLoadingDots,
    isAgentResolving,
    selectedAgentId,
    isAgentAutoMode,
    isAgentSelectorOpen,
    pendingAgentId,
    setSelectedAgentId,
    setIsAgentAutoMode,
    setIsAgentSelectorOpen,
    setPendingAgentId,
    reloadSpaceAgents,
    manualAgentSelectionRef,
    agentSelectorRef,
    initialAgentAppliedRef,
  }
}

export default useAgentManagement
