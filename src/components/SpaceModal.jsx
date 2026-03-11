import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import useScrollLock from '../hooks/useScrollLock'
import EmojiDisplay from './EmojiDisplay'
import CustomEmojiPicker from './CustomEmojiPicker'
import { Checkbox } from '@/components/ui/checkbox'
import { Radio } from '@/components/ui/radio'
import { useAppContext } from '../App'
import { listSpaceAgents } from '../lib/spacesService'
import { getAgentDisplayName } from '../lib/agentDisplay'
import {
  DEEP_RESEARCH_EMOJI,
  DEEP_RESEARCH_SPACE_DESCRIPTION,
  DEEP_RESEARCH_SPACE_LABEL,
} from '../lib/deepResearchDefaults'
import { getSpaceDisplayDescription, getSpaceDisplayLabel } from '../lib/spaceDisplay'
import { MODAL_INPUT_CLASS, MODAL_TEXTAREA_CLASS } from '../lib/modalFieldStyles'

const SpaceModal = ({ isOpen, onClose, editingSpace = null, onSave, onDelete }) => {
  const { t } = useTranslation()
  useScrollLock(isOpen)
  const {
    showConfirmation,
    agents = [],
    agentsLoading = false,
    spaces = [],
    defaultAgent,
    deepResearchAgent,
  } = useAppContext()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const [emoji, setEmoji] = useState('🌍') // Default emoji
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedAgentIds, setSelectedAgentIds] = useState([])
  const [defaultAgentId, setDefaultAgentId] = useState(null)
  const [availableSelectedIds, setAvailableSelectedIds] = useState([])
  const [assignedSelectedIds, setAssignedSelectedIds] = useState([])
  const [isAgentsLoading, setIsAgentsLoading] = useState(false)
  const pickerRef = useRef(null)
  const buttonRef = useRef(null)
  const isDeepResearchSpace = Boolean(
    editingSpace?.isDeepResearchSystem ||
    editingSpace?.isDeepResearch ||
    editingSpace?.is_deep_research,
  )

  const availableAgents = useMemo(
    () =>
      isDeepResearchSpace
        ? []
        : agents.filter(agent => !agent.isDefault && !selectedAgentIds.includes(agent.id)),
    [agents, isDeepResearchSpace, selectedAgentIds],
  )

  const selectedAgents = useMemo(
    () =>
      isDeepResearchSpace && deepResearchAgent
        ? [deepResearchAgent]
        : selectedAgentIds
            .map(id => agents.find(agent => String(agent.id) === String(id)))
            .filter(agent => agent && !agent.isDefault),
    [agents, deepResearchAgent, isDeepResearchSpace, selectedAgentIds],
  )

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = event => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setShowEmojiPicker(false)
      }
    }

    if (showEmojiPicker) {
      document.addEventListener('click', handleClickOutside)
    }
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showEmojiPicker])

  // Populate form when modal opens/changes
  useEffect(() => {
    if (isOpen) {
      if (editingSpace) {
        setName(editingSpace.label || '')
        setDescription(editingSpace.description || '')
        setEmoji(editingSpace.emoji || '🌍')
      } else {
        setName('')
        setDescription('')
        setEmoji('🌍')
      }
      setShowEmojiPicker(false)
      setError('')
      setIsSaving(false)
      setAvailableSelectedIds([])
      setAssignedSelectedIds([])
    }
  }, [isOpen, editingSpace])

  useEffect(() => {
    if (!isOpen) return
    const loadAgents = async () => {
      if (!editingSpace?.id) {
        setSelectedAgentIds([])
        setDefaultAgentId(null)
        return
      }
      setIsAgentsLoading(true)
      const { data, error } = await listSpaceAgents(editingSpace.id)
      if (!error && data) {
        const filteredIds = data
          .map(item => item.agent_id)
          .filter(id => String(id) !== String(defaultAgent?.id))
        setSelectedAgentIds(filteredIds)
        const primary = data.find(item => item.is_primary)?.agent_id || null
        setDefaultAgentId(primary && String(primary) !== String(defaultAgent?.id) ? primary : null)
      } else {
        setSelectedAgentIds([])
        setDefaultAgentId(null)
      }
      setIsAgentsLoading(false)
    }
    loadAgents()
  }, [defaultAgent?.id, editingSpace?.id, isOpen])

  useEffect(() => {
    if (!isOpen || !isDeepResearchSpace) return
    if (deepResearchAgent?.id) {
      setSelectedAgentIds([deepResearchAgent.id])
      setDefaultAgentId(deepResearchAgent.id)
      setAvailableSelectedIds([])
      setAssignedSelectedIds([])
    }
  }, [deepResearchAgent?.id, isDeepResearchSpace, isOpen])

  useEffect(() => {
    if (!selectedAgentIds.length) {
      setDefaultAgentId(null)
      return
    }
    if (!defaultAgentId || !selectedAgentIds.includes(defaultAgentId)) {
      setDefaultAgentId(selectedAgentIds[0])
    }
  }, [defaultAgentId, selectedAgentIds])

  const handleSave = async () => {
    if (!isDeepResearchSpace && !name.trim()) {
      setError(t('spaceModal.nameRequired'))
      return
    }
    if (!isDeepResearchSpace) {
      const normalizedName = name.trim().toLowerCase()
      const duplicateName = spaces.some(
        space =>
          space.id !== editingSpace?.id &&
          (space.label || '').trim().toLowerCase() === normalizedName,
      )
      if (duplicateName) {
        setError(t('spaceModal.nameDuplicate'))
        return
      }
    }
    setIsSaving(true)
    setError('')
    try {
      const resolvedLabel = isDeepResearchSpace ? DEEP_RESEARCH_SPACE_LABEL : name.trim()
      const resolvedDescription = isDeepResearchSpace
        ? DEEP_RESEARCH_SPACE_DESCRIPTION
        : description.trim()
      const resolvedEmoji = isDeepResearchSpace ? DEEP_RESEARCH_EMOJI : emoji
      const resolvedAgentIds = isDeepResearchSpace
        ? [deepResearchAgent?.id].filter(Boolean)
        : selectedAgentIds
      const resolvedDefaultAgentId = isDeepResearchSpace
        ? deepResearchAgent?.id || null
        : defaultAgentId
      await onSave?.({
        emoji: resolvedEmoji,
        label: resolvedLabel,
        description: resolvedDescription,
        agentIds: resolvedAgentIds,
        defaultAgentId: resolvedDefaultAgentId,
      })
    } catch (err) {
      setError(err.message || t('spaceModal.saveFailed'))
      setIsSaving(false)
    }
  }

  const toggleAvailableAgent = agentId => {
    if (isDeepResearchSpace) return
    setAvailableSelectedIds(prev =>
      prev.includes(agentId) ? prev.filter(id => id !== agentId) : [...prev, agentId],
    )
  }

  const toggleAssignedAgent = agentId => {
    if (isDeepResearchSpace) return
    setAssignedSelectedIds(prev =>
      prev.includes(agentId) ? prev.filter(id => id !== agentId) : [...prev, agentId],
    )
  }

  const handleAddAgents = () => {
    if (isDeepResearchSpace) return
    if (!availableSelectedIds.length) return
    setSelectedAgentIds(prev => [...prev, ...availableSelectedIds.filter(id => !prev.includes(id))])
    setAvailableSelectedIds([])
  }

  const handleRemoveAgents = () => {
    if (isDeepResearchSpace) return
    if (!assignedSelectedIds.length) return
    setSelectedAgentIds(prev => prev.filter(id => !assignedSelectedIds.includes(id)))
    setAssignedSelectedIds([])
  }

  const handleDelete = async () => {
    if (!editingSpace?.id) return

    showConfirmation({
      title: t('spaceModal.deleteTitle'),
      message: t('spaceModal.deleteMessage', { name: getSpaceDisplayLabel(editingSpace, t) }),
      confirmText: t('spaceModal.deleteConfirm'),
      isDangerous: true,
      onConfirm: async () => {
        try {
          await onDelete?.(editingSpace.id)
        } catch (err) {
          setError(err.message || t('spaceModal.deleteFailed'))
        }
      },
    })
  }

  if (!isOpen) return null

  const displayName = isDeepResearchSpace ? getSpaceDisplayLabel(editingSpace, t) : name
  const displayDescription = isDeepResearchSpace
    ? getSpaceDisplayDescription(editingSpace, t)
    : description

  return (
    <div className="fixed inset-0 z-200 flex items-start justify-center overflow-y-auto bg-black/50 p-0 backdrop-blur-sm md:items-center md:overflow-hidden md:p-4">
      <div className="glass-elite-panel flex h-dvh w-full flex-col overflow-hidden border-0 shadow-2xl md:h-[88vh] md:max-w-4xl md:rounded-[28px]">
        <div className="hidden border-b border-black/5 px-4 py-5 sm:block sm:px-10 dark:border-white/5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="mt-2 text-4xl font-semibold tracking-tight text-gray-900 dark:text-white">
                {editingSpace ? t('spaceModal.edit') : t('spaceModal.create')}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-gray-500 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Content */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-10 sm:py-8">
            <div className="flex h-full flex-col gap-4">
              {/* Icon and Name Row - Fixed height */}
              <div className="flex shrink-0 flex-col gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('spaceModal.iconName')}
                </label>
                <div className="flex items-center gap-3">
                  {/* Emoji Picker */}
                  <div className="relative">
                    <button
                      ref={buttonRef}
                      onClick={() => {
                        if (isDeepResearchSpace) return
                        setShowEmojiPicker(!showEmojiPicker)
                      }}
                      disabled={isDeepResearchSpace}
                      className="focus:border-primary-500 focus:ring-primary-500/20 flex h-12 w-12 items-center justify-center rounded-xl border border-transparent bg-black/5 text-2xl transition-colors outline-none hover:bg-black/10 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/5 dark:hover:bg-white/10"
                    >
                      <EmojiDisplay emoji={emoji} />
                    </button>

                    {/* Picker Popover */}
                    {showEmojiPicker && (
                      <div
                        ref={pickerRef}
                        className="absolute top-full left-0 z-50 mt-2 overflow-hidden rounded-xl shadow-2xl"
                      >
                        <CustomEmojiPicker
                          onEmojiSelect={e => {
                            setEmoji(e.native)
                            setShowEmojiPicker(false)
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Name Input */}
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => setName(e.target.value)}
                    placeholder={t('spaceModal.namePlaceholder')}
                    disabled={isDeepResearchSpace}
                    className={`${MODAL_INPUT_CLASS} h-12 flex-1`}
                  />
                </div>
              </div>

              {/* Description Input - Fixed height */}
              <div className="flex shrink-0 flex-col gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('spaceModal.description')}{' '}
                  <span className="font-normal text-gray-400">
                    ({t('spaceModal.descriptionOptional')})
                  </span>
                </label>
                <textarea
                  value={displayDescription}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={t('spaceModal.descriptionPlaceholder')}
                  rows={2}
                  disabled={isDeepResearchSpace}
                  className={MODAL_TEXTAREA_CLASS}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('spaceModal.agents')}
                </label>
                <div className="rounded-lg border-none bg-black/5 p-3 dark:bg-white/5">
                  {agentsLoading || isAgentsLoading ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {t('spaceModal.agentsLoading')}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      <div className="rounded-lg border border-black/5 dark:border-white/5">
                        <div className="px-3 py-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
                          {t('spaceModal.agentsAvailable')}
                        </div>
                        <div className="max-h-40 overflow-y-auto">
                          {availableAgents.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                              {t('spaceModal.agentsEmpty')}
                            </div>
                          ) : (
                            availableAgents.map(agent => (
                              <div
                                key={agent.id}
                                onClick={() => toggleAvailableAgent(agent.id)}
                                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/5"
                              >
                                <Checkbox
                                  checked={availableSelectedIds.includes(agent.id)}
                                  onCheckedChange={() => {}}
                                  disabled={isDeepResearchSpace}
                                />
                                <span className="truncate">
                                  {agent.emoji ? `${agent.emoji} ` : ''}
                                  {getAgentDisplayName(agent, t)}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={handleAddAgents}
                          disabled={isDeepResearchSpace || availableSelectedIds.length === 0}
                          className="bg-primary-500 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                        >
                          {t('spaceModal.agentsAdd')}
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveAgents}
                          disabled={isDeepResearchSpace || assignedSelectedIds.length === 0}
                          className="rounded-lg border border-black/5 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-black/5 disabled:opacity-40 dark:border-white/5 dark:text-gray-300 dark:hover:bg-white/5"
                        >
                          {t('spaceModal.agentsRemove')}
                        </button>
                      </div>

                      <div className="rounded-lg border border-black/5 dark:border-white/5">
                        <div className="px-3 py-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
                          {t('spaceModal.agentsSelected')}
                        </div>
                        <div className="max-h-40 overflow-y-auto">
                          {selectedAgents.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                              {t('spaceModal.agentsSelectedEmpty')}
                            </div>
                          ) : (
                            selectedAgents.map(agent => (
                              <div
                                key={agent.id}
                                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/5"
                              >
                                <div
                                  className="flex cursor-pointer items-center gap-2"
                                  onClick={() => toggleAssignedAgent(agent.id)}
                                >
                                  <Checkbox
                                    checked={assignedSelectedIds.includes(agent.id)}
                                    onCheckedChange={() => {}}
                                    disabled={isDeepResearchSpace}
                                  />
                                  <span className="truncate">
                                    {agent.emoji ? `${agent.emoji} ` : ''}
                                    {getAgentDisplayName(agent, t)}
                                  </span>
                                </div>
                                <div
                                  className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
                                  onClick={() => setDefaultAgentId(agent.id)}
                                >
                                  {t('spaceModal.defaultAgent')}
                                  <Radio
                                    checked={String(defaultAgentId) === String(agent.id)}
                                    onClick={() =>
                                      !isDeepResearchSpace && setDefaultAgentId(agent.id)
                                    }
                                    disabled={isDeepResearchSpace}
                                  />
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {error && (
              <div className="rounded-2xl border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-t border-black/5 bg-transparent px-4 sm:px-10 dark:border-white/5">
          <div className="flex items-center gap-2">
            {editingSpace && (
              <button
                onClick={handleDelete}
                className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                {t('sidebar.delete')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-black/5 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-white/5"
            >
              {t('spaceModal.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-primary-500 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isSaving
                ? t('spaceModal.saving')
                : editingSpace
                  ? t('spaceModal.save')
                  : t('spaceModal.createSpace')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SpaceModal
