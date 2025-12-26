import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Settings, Info } from 'lucide-react'
import useScrollLock from '../hooks/useScrollLock'
import EmojiDisplay from './EmojiDisplay'
import CustomEmojiPicker from './CustomEmojiPicker'
import { useAppContext } from '../App'
import { listSpaceAgents } from '../lib/spacesService'
import clsx from 'clsx'

const SpaceModal = ({ isOpen, onClose, editingSpace = null, onSave, onDelete }) => {
  const { t } = useTranslation()
  useScrollLock(isOpen)
  const { showConfirmation, agents = [], agentsLoading = false } = useAppContext()
  const [activeTab, setActiveTab] = useState('general')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const [emoji, setEmoji] = useState('🌍') // Default emoji
  const [temperature, setTemperature] = useState(1.0)
  const [topK, setTopK] = useState(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedAgentIds, setSelectedAgentIds] = useState([])
  const [availableSelectedIds, setAvailableSelectedIds] = useState([])
  const [assignedSelectedIds, setAssignedSelectedIds] = useState([])
  const [isAgentsLoading, setIsAgentsLoading] = useState(false)
  const pickerRef = useRef(null)
  const buttonRef = useRef(null)

  // Tab menu items - use constant keys for logic, translate labels for display
  const TAB_ITEMS = [
    { id: 'general', icon: Info },
    { id: 'advanced', icon: Settings },
  ]

  const menuItems = useMemo(
    () => TAB_ITEMS.map(item => ({ ...item, label: t(`spaceModal.${item.id}`) })),
    [t],
  )

  const availableAgents = useMemo(
    () => agents.filter(agent => !selectedAgentIds.includes(agent.id)),
    [agents, selectedAgentIds],
  )

  const selectedAgents = useMemo(
    () =>
      selectedAgentIds
        .map(id => agents.find(agent => String(agent.id) === String(id)))
        .filter(Boolean),
    [agents, selectedAgentIds],
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
        setTemperature(editingSpace.temperature ?? 1.0)
        setTopK(editingSpace.top_k ?? null)
      } else {
        setName('')
        setDescription('')
        setEmoji('🌍')
        setTemperature(1.0)
        setTopK(null)
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
        return
      }
      setIsAgentsLoading(true)
      const { data, error } = await listSpaceAgents(editingSpace.id)
      if (!error && data) {
        setSelectedAgentIds(data.map(item => item.agent_id))
      } else {
        setSelectedAgentIds([])
      }
      setIsAgentsLoading(false)
    }
    loadAgents()
  }, [editingSpace?.id, isOpen])

  const handleSave = async () => {
    if (!name.trim()) {
      setError(t('spaceModal.nameRequired'))
      return
    }
    setIsSaving(true)
    setError('')
    try {
        await onSave?.({
        emoji,
        label: name.trim(),
        description: description.trim(),
        temperature,
        top_k: topK,
        agentIds: selectedAgentIds,
      })
    } catch (err) {
      setError(err.message || t('spaceModal.saveFailed'))
      setIsSaving(false)
    }
  }

  const toggleAvailableAgent = agentId => {
    setAvailableSelectedIds(prev =>
      prev.includes(agentId) ? prev.filter(id => id !== agentId) : [...prev, agentId],
    )
  }

  const toggleAssignedAgent = agentId => {
    setAssignedSelectedIds(prev =>
      prev.includes(agentId) ? prev.filter(id => id !== agentId) : [...prev, agentId],
    )
  }

  const handleAddAgents = () => {
    if (!availableSelectedIds.length) return
    setSelectedAgentIds(prev => [
      ...prev,
      ...availableSelectedIds.filter(id => !prev.includes(id)),
    ])
    setAvailableSelectedIds([])
  }

  const handleRemoveAgents = () => {
    if (!assignedSelectedIds.length) return
    setSelectedAgentIds(prev => prev.filter(id => !assignedSelectedIds.includes(id)))
    setAssignedSelectedIds([])
  }

  const handleDelete = async () => {
    if (!editingSpace?.id) return

    showConfirmation({
      title: t('spaceModal.deleteTitle'),
      message: t('spaceModal.deleteMessage', { name: editingSpace.label }),
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

  return (
    <div className="fixed inset-0 z-[100] flex items-start md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4 overflow-y-auto md:overflow-hidden">
      <div className="w-full h-[100vh] md:max-w-2xl md:h-[80vh] bg-white dark:bg-[#191a1a] rounded-none md:rounded-2xl shadow-2xl flex flex-col overflow-hidden border-0 md:border border-gray-200 dark:border-zinc-800">
        {/* Header */}
        <div className="h-14 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-4 sm:px-6 shrink-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {editingSpace ? t('spaceModal.edit') : t('spaceModal.create')}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Tab Navigation */}
          <div className="px-2 sm:px-3 pt-2 pb-2 border-b border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-[#191a1a] shrink-0">
            <nav className="flex gap-1">
              {menuItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    activeTab === item.id
                      ? 'bg-primary-100 dark:bg-zinc-800 text-primary-600 dark:text-primary-400'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-primary-100 dark:hover:bg-zinc-800',
                  )}
                >
                  <item.icon size={16} />
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="flex-1 px-4 sm:px-6 py-6 overflow-y-auto min-h-0">
            {activeTab === 'general' && (
              <div className="flex flex-col gap-4 h-full">
                {/* Icon and Name Row - Fixed height */}
                <div className="flex flex-col gap-2 shrink-0">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('spaceModal.iconName')}
                  </label>
                  <div className="flex items-center gap-3">
                    {/* Emoji Picker */}
                    <div className="relative">
                      <button
                        ref={buttonRef}
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-2xl hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors border border-transparent focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none"
                      >
                        <EmojiDisplay emoji={emoji} />
                      </button>

                      {/* Picker Popover */}
                      {showEmojiPicker && (
                        <div
                          ref={pickerRef}
                          className="absolute top-full left-0 mt-2 z-50 shadow-2xl rounded-xl overflow-hidden"
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
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder={t('spaceModal.namePlaceholder')}
                      className="flex-1 h-12 px-4 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600"
                    />
                  </div>
                </div>

                {/* Description Input - Fixed height */}
                <div className="flex flex-col gap-2 shrink-0">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('spaceModal.description')} <span className="text-gray-400 font-normal">({t('spaceModal.descriptionOptional')})</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder={t('spaceModal.descriptionPlaceholder')}
                    rows={2}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600 resize-none"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('spaceModal.agents')}
                  </label>
                  <div className="rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3">
                    {agentsLoading || isAgentsLoading ? (
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {t('spaceModal.agentsLoading')}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3">
                        <div className="rounded-lg border border-gray-200 dark:border-zinc-700">
                          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                            {t('spaceModal.agentsAvailable')}
                          </div>
                          <div className="max-h-40 overflow-y-auto">
                            {availableAgents.length === 0 ? (
                              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                {t('spaceModal.agentsEmpty')}
                              </div>
                            ) : (
                              availableAgents.map(agent => (
                                <label
                                  key={agent.id}
                                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={availableSelectedIds.includes(agent.id)}
                                    onChange={() => toggleAvailableAgent(agent.id)}
                                  />
                                  <span className="truncate">
                                    {agent.emoji ? `${agent.emoji} ` : ''}
                                    {agent.name}
                                  </span>
                                </label>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="flex md:flex-col items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={handleAddAgents}
                            disabled={availableSelectedIds.length === 0}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-500 text-white disabled:opacity-40"
                          >
                            {t('spaceModal.agentsAdd')}
                          </button>
                          <button
                            type="button"
                            onClick={handleRemoveAgents}
                            disabled={assignedSelectedIds.length === 0}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-300 disabled:opacity-40"
                          >
                            {t('spaceModal.agentsRemove')}
                          </button>
                        </div>

                        <div className="rounded-lg border border-gray-200 dark:border-zinc-700">
                          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                            {t('spaceModal.agentsSelected')}
                          </div>
                          <div className="max-h-40 overflow-y-auto">
                            {selectedAgents.length === 0 ? (
                              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                {t('spaceModal.agentsSelectedEmpty')}
                              </div>
                            ) : (
                              selectedAgents.map(agent => (
                                <label
                                  key={agent.id}
                                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={assignedSelectedIds.includes(agent.id)}
                                    onChange={() => toggleAssignedAgent(agent.id)}
                                  />
                                  <span className="truncate">
                                    {agent.emoji ? `${agent.emoji} ` : ''}
                                    {agent.name}
                                  </span>
                                </label>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'advanced' && (
              <div className="flex flex-col gap-4">


                {/* Model Settings */}
                <div className="flex flex-col gap-4">
                  <div className="flex gap-4">
                    <div className="flex flex-col gap-2 flex-1">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('spaceModal.temperature')} <span className="text-gray-400 font-normal">({temperature})</span>
                      </label>
                      <div className="h-10 flex items-center px-1">
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.1"
                          value={temperature}
                          onChange={e => setTemperature(parseFloat(e.target.value))}
                          className="w-full accent-black dark:accent-white cursor-pointer"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 w-24">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('spaceModal.topK')}</label>
                      <input
                        type="number"
                        min="0"
                        value={topK ?? ''}
                        onChange={e => {
                          const val = e.target.value
                          setTopK(val === '' ? null : parseInt(val))
                        }}
                        placeholder={t('spaceModal.topKPlaceholder')}
                        className="w-full h-10 px-3 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600"
                      />
                    </div>
                  </div>
                </div>

                {/* Info Box */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <Info size={16} className="text-blue-600 dark:text-blue-400 mt-0.5" />
                    <div className="text-sm text-blue-800 dark:text-blue-200">
                      <p className="font-medium mb-1">{t('spaceModal.modelSettingsInfo')}</p>
                      <ul className="text-xs space-y-1">
                        <li>• <strong>{t('spaceModal.temperature')}:</strong> {t('spaceModal.temperatureInfo')}</li>
                        <li>• <strong>{t('spaceModal.topK')}:</strong> {t('spaceModal.topKInfo')}</li>
                        <li>• {t('spaceModal.overrideInfo')}</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && <div className="text-sm text-red-500">{error}</div>}
          </div>
        </div>

        {/* Footer */}
        <div className="h-16 border-t border-gray-200 dark:border-zinc-800 flex items-center justify-between px-4 sm:px-6 gap-3 bg-gray-50/50 dark:bg-[#191a1a] shrink-0">
          <div className="flex items-center gap-2">
            {editingSpace && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                {t('sidebar.delete')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {t('spaceModal.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isSaving ? t('spaceModal.saving') : editingSpace ? t('spaceModal.save') : t('spaceModal.createSpace')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SpaceModal
