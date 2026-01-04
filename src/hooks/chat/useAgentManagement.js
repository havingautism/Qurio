import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listSpaceAgents } from '../../lib/spacesService'

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
 * @property {Array} spaceAgentIds - IDs of agents in the current space
 * @property {object} spacePrimaryAgentId - Primary agent ID for the current space
 * @property {boolean} isAgentsLoading - Whether agents are currently loading
 * @property {string} agentsLoadingLabel - Full loading label with animated dots
 * @property {string} agentLoadingDots - Animated dots only (for separate UI indicator)
 * @property {boolean} isAgentResolving - Whether agent is currently resolving (loading/pending/preselecting)
 * @property {string} selectedAgentId - Currently selected agent ID
 * @property {boolean} isAgentAutoMode - Whether agent auto mode is enabled
 * @property {boolean} isAgentSelectorOpen - Whether agent selector dropdown is open
 * @property {string} pendingAgentId - Pending agent ID to be set
 * @property {function} setSelectedAgentId - Set selected agent ID
 * @property {function} setIsAgentAutoMode - Set agent auto mode
 * @property {function} setIsAgentSelectorOpen - Set agent selector open state
 * @property {function} setPendingAgentId - Set pending agent ID
 * @property {function} reloadSpaceAgents - Function to reload space agents
 * @property {object} manualAgentSelectionRef - Ref to track manual agent selection
 * @property {object} agentSelectorRef - Ref for agent selector dropdown
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
  t = (key) => key,
}) => {
  const [spaceAgentIds, setSpaceAgentIds] = useState([])
  const [spacePrimaryAgentId, setSpacePrimaryAgentId] = useState(null)
  const [isAgentsLoading, setIsAgentsLoading] = useState(false)
  const [agentLoadingDots, setAgentLoadingDots] = useState('')
  const [selectedAgentId, setSelectedAgentId] = useState(null)
  const [isAgentAutoMode, setIsAgentAutoMode] = useState(() => {
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
      setSpaceAgentIds([])
      setSpacePrimaryAgentId(null)
      setIsAgentsLoading(false)
      return
    }

    setIsAgentsLoading(true)
    setAgentLoadingDots('')
    const dotsInterval = setInterval(() => {
      setAgentLoadingDots(prev => (prev.length >= 3 ? '' : prev + '.'))
    }, 500)

    try {
      const { data, error } = await listSpaceAgents(displaySpace.id)
      clearInterval(dotsInterval)
      setAgentLoadingDots('')

      if (!error && data) {
        const ids = data.map(a => String(a.agent_id))
        const primary = data.find(a => a.is_primary)
        setSpaceAgentIds(ids)
        setSpacePrimaryAgentId(primary?.agent_id || null)
      } else {
        setSpaceAgentIds([])
        setSpacePrimaryAgentId(null)
      }
    } catch (err) {
      console.error('Failed to load space agents:', err)
      setSpaceAgentIds([])
      setSpacePrimaryAgentId(null)
    } finally {
      setIsAgentsLoading(false)
    }
  }, [displaySpace?.id])

  // Load agents when space changes
  useEffect(() => {
    reloadSpaceAgents()
  }, [reloadSpaceAgents])

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
  useEffect(() => {
    if (!isAgentResolving) {
      setAgentLoadingDots('')
      return
    }
    let step = 0
    const interval = setInterval(() => {
      step = (step + 1) % 4
      setAgentLoadingDots('.'.repeat(step))
    }, 450)
    return () => clearInterval(interval)
  }, [isAgentResolving])

  // Computed agents loading label with animated dots
  const agentsLoadingLabel = useMemo(
    () => {
      const baseLabel = t('chatInterface.agentsLoading')
      return `${baseLabel.replace(/\.\.\.$/, '')}${agentLoadingDots}`
    },
    [agentLoadingDots, t],
  )

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
