import { useGSAP } from '@gsap/react'
import { useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import gsap from 'gsap'
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right'
import Brain from 'lucide-react/dist/esm/icons/brain'
import Check from 'lucide-react/dist/esm/icons/check'
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down'
import File from 'lucide-react/dist/esm/icons/file'
import FileCode from 'lucide-react/dist/esm/icons/file-code'
import FileJson from 'lucide-react/dist/esm/icons/file-json'
import FileSpreadsheet from 'lucide-react/dist/esm/icons/file-spreadsheet'
import FileText from 'lucide-react/dist/esm/icons/file-text'
import Globe from 'lucide-react/dist/esm/icons/globe'
import Image from 'lucide-react/dist/esm/icons/image'
import LayoutGrid from 'lucide-react/dist/esm/icons/layout-grid'
import Menu from 'lucide-react/dist/esm/icons/menu'
import Paperclip from 'lucide-react/dist/esm/icons/paperclip'
import X from 'lucide-react/dist/esm/icons/x'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Drawer, DrawerContent } from '@/components/ui/drawer'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../App'
import DeepResearchCard from '../components/DeepResearchCard'
import SpaceShortcutCard from '../components/SpaceShortcutCard'
import EmojiDisplay from '../components/EmojiDisplay'
import Logo from '../components/Logo'
import HomeWidgets from '../components/widgets/HomeWidgets'
import MobileDrawer from '../components/MobileDrawer'
import UploadPopover from '../components/UploadPopover'
import DocumentsSection from '../components/DocumentsSection'
import SearchSourceSelector from '../components/SearchSourceSelector'
import useScrollLock from '../hooks/useScrollLock'
import { getAgentDisplayName } from '../lib/agentDisplay'
import useChatStore from '../lib/chatStore'
import { createConversation } from '../lib/conversationsService'
import { providerSupportsSearch, resolveThinkingToggleRule } from '../lib/providers'
import { loadSettings } from '../lib/settings'
import { getSpaceDisplayLabel } from '../lib/spaceDisplay'
import { listSpaceAgents } from '../lib/spacesService'
import { listSpaceDocuments, setConversationDocuments } from '../lib/documentsService'
import { useDeepResearchGuide } from '../contexts/DeepResearchGuideContext'
import { splitTextWithUrls } from '../lib/urlHighlight'

const HomeView = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    toggleSidebar,
    isSidebarPinned,
    spaces,
    agents: appAgents = [],
    defaultAgent,
    deepResearchSpace,
  } = useAppContext()
  const { isOpen: isDeepResearchGuideOpen, openDeepResearchGuide } = useDeepResearchGuide()

  const [settings, setSettings] = useState(loadSettings())
  const fileInputRef = useRef(null)

  // Homepage Input State
  const [homeInput, setHomeInput] = useState('')
  const homeInputParts = useMemo(() => splitTextWithUrls(homeInput), [homeInput])
  const [isHomeSearchActive, setIsHomeSearchActive] = useState(false)
  const [homeSearchSource, setHomeSearchSource] = useState('web')
  const [isHomeThinkingActive, setIsHomeThinkingActive] = useState(false)
  const [homeAttachments, setHomeAttachments] = useState([])
  const [homeSelectedSpace, setHomeSelectedSpace] = useState(null)
  const homeSpaceSelectorRef = useRef(null)
  const [isHomeSpaceSelectorOpen, setIsHomeSpaceSelectorOpen] = useState(false)
  const [homeSpaceSelectionType, setHomeSpaceSelectionType] = useState('auto') // 'auto' | 'space'
  const [homeExpandedSpaceId, setHomeExpandedSpaceId] = useState(null)
  const [homeAgentIds, setHomeAgentIds] = useState([])
  const [homePrimaryAgentId, setHomePrimaryAgentId] = useState(null)
  const [homeAgentsLoading, setHomeAgentsLoading] = useState(false)
  const [homeSelectedAgentId, setHomeSelectedAgentId] = useState(null)
  const [isHomeAgentAuto, setIsHomeAgentAuto] = useState(true) // Default to auto mode
  const homeContainerRef = useRef(null)
  const [isHomeMobile, setIsHomeMobile] = useState(() => window.innerWidth < 768)
  const [isHomeUploadMenuOpen, setIsHomeUploadMenuOpen] = useState(false)
  const homeUploadMenuRef = useRef(null)
  const [homeSpaceDocuments, setHomeSpaceDocuments] = useState([])
  const [homeDocumentsLoading, setHomeDocumentsLoading] = useState(false)
  const [_homeSelectedDocumentIds, setHomeSelectedDocumentIds] = useState([])
  const homePreviousSpaceIdRef = useRef(null)
  const homeTextareaRef = useRef(null)
  const homeInputHighlightRef = useRef(null)

  useScrollLock((isHomeSpaceSelectorOpen && isHomeMobile) || isDeepResearchGuideOpen)

  // Reset conversation state when entering Home/New Chat view
  useEffect(() => {
    useChatStore.getState().resetConversation()
  }, [])

  useGSAP(
    () => {
      const tl = gsap.timeline()

      // Animate Title
      tl.from('.home-title', {
        y: -20,
        opacity: 0,
        duration: 0.8,
        ease: 'power3.out',
      })

        // Animate Search Box
        .from(
          '.home-search-box',
          {
            scale: 0.95,
            opacity: 0,
            duration: 0.6,
            ease: 'back.out(1.7)',
          },
          '-=0.4',
        )

        // Animate Widgets
        .from(
          '.home-widgets',
          {
            y: 20,
            opacity: 0,
            duration: 0.8,
            ease: 'power2.out',
          },
          '-=0.4',
        )
    },
    { scope: homeContainerRef, dependencies: [] },
  )

  useEffect(() => {
    const handleSettingsChange = () => {
      const newSettings = loadSettings()
      setSettings(newSettings)
    }

    const handleSpaceAgentsChange = async event => {
      const { spaceId } = event.detail || {}
      // Only reload if the changed space matches the current home selected space
      if (homeSelectedSpace?.id && String(homeSelectedSpace.id) === String(spaceId)) {
        setHomeAgentsLoading(true)
        const { data, error } = await listSpaceAgents(homeSelectedSpace.id)
        if (!error && data) {
          setHomeAgentIds(data.map(item => item.agent_id))
          const primaryAgent = data.find(item => item.is_primary)
          setHomePrimaryAgentId(primaryAgent?.agent_id || null)
        } else {
          setHomeAgentIds([])
          setHomePrimaryAgentId(null)
        }
        setHomeAgentsLoading(false)
      }
    }

    window.addEventListener('settings-changed', handleSettingsChange)
    window.addEventListener('space-agents-changed', handleSpaceAgentsChange)
    return () => {
      window.removeEventListener('settings-changed', handleSettingsChange)
      window.removeEventListener('space-agents-changed', handleSpaceAgentsChange)
    }
  }, [homeSelectedSpace?.id])

  useEffect(() => {
    const handleResize = () => {
      setIsHomeMobile(window.innerWidth < 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const loadAgents = async () => {
      if (!homeSelectedSpace?.id) {
        setHomeAgentIds([])
        setHomePrimaryAgentId(null)
        setHomeSelectedAgentId(null)
        return
      }
      setHomeAgentsLoading(true)
      const { data, error } = await listSpaceAgents(homeSelectedSpace.id)
      if (!error && data) {
        setHomeAgentIds(data.map(item => item.agent_id))
        const primaryAgent = data.find(item => item.is_primary)
        setHomePrimaryAgentId(primaryAgent?.agent_id || null)
      } else {
        setHomeAgentIds([])
        setHomePrimaryAgentId(null)
      }
      setHomeSelectedAgentId(null)
      setIsHomeAgentAuto(true)
      setHomeAgentsLoading(false)
    }
    loadAgents()
  }, [homeSelectedSpace?.id])

  useEffect(() => {
    let isMounted = true
    const loadDocuments = async () => {
      if (homeSpaceSelectionType !== 'space' || !homeSelectedSpace?.id) {
        homePreviousSpaceIdRef.current = null
        setHomeSpaceDocuments([])
        setHomeSelectedDocumentIds([])
        return
      }

      if (homePreviousSpaceIdRef.current !== homeSelectedSpace.id) {
        setHomeSpaceDocuments([])
        setHomeSelectedDocumentIds([])
      }
      homePreviousSpaceIdRef.current = homeSelectedSpace.id

      setHomeDocumentsLoading(true)
      const { data, error } = await listSpaceDocuments(homeSelectedSpace.id)
      if (!isMounted) return
      if (!error) {
        setHomeSpaceDocuments(data || [])
        const allowed = new Set((data || []).map(doc => String(doc.id)))
        setHomeSelectedDocumentIds(prev => prev.filter(id => allowed.has(String(id))))
      } else {
        console.error('Failed to load space documents:', error)
      }
      setHomeDocumentsLoading(false)
    }

    loadDocuments()
    return () => {
      isMounted = false
    }
  }, [homeSelectedSpace?.id, homeSpaceSelectionType])

  useEffect(() => {
    const handleClickOutside = event => {
      if (homeSpaceSelectorRef.current && !homeSpaceSelectorRef.current.contains(event.target)) {
        setIsHomeSpaceSelectorOpen(false)
      }
    }

    if (isHomeSpaceSelectorOpen && !isHomeMobile) {
      document.addEventListener('click', handleClickOutside)
    }

    return () => document.removeEventListener('click', handleClickOutside)
  }, [isHomeSpaceSelectorOpen, isHomeMobile])

  useEffect(() => {
    if (!isHomeUploadMenuOpen || isHomeMobile) return
    const handleClickOutside = event => {
      if (homeUploadMenuRef.current && !homeUploadMenuRef.current.contains(event.target)) {
        setIsHomeUploadMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isHomeUploadMenuOpen, isHomeMobile])

  const handleFileChange = async e => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // Use dynamic import to load compression utility
    const { compressImages } = await import('../lib/imageCompression')

    // Filter only image files
    const imageFiles = files.filter(file => file.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      e.target.value = ''
      return
    }

    try {
      // Compress images
      const results = await compressImages(imageFiles)

      // Process successful compressions
      const successfulUploads = results
        .filter(result => result.success)
        .map(result => ({
          type: 'image_url',
          image_url: { url: result.dataUrl },
          _meta: {
            originalSize: result.originalSize,
            compressedSize: result.compressedSize,
            dimensions: result.dimensions,
          },
        }))

      // Show errors for failed compressions
      const failedUploads = results.filter(result => !result.success)
      if (failedUploads.length > 0) {
        console.error('Image compression errors:', failedUploads)
        alert(
          `Failed to compress ${failedUploads.length} image(s):\n${failedUploads.map(f => `- ${f.fileName}: ${f.error}`).join('\n')}`,
        )
      }

      // Add successful uploads to attachments
      if (successfulUploads.length > 0) {
        setHomeAttachments(prev => [...prev, ...successfulUploads])
      }
    } catch (error) {
      console.error('Image upload error:', error)
      alert(`Failed to upload images: ${error.message}`)
    }

    e.target.value = ''
  }

  const handleHomeImageUpload = () => {
    setIsHomeUploadMenuOpen(false)
    fileInputRef.current?.click()
  }

  const isHomeSpaceAuto = homeSpaceSelectionType === 'auto'
  const shouldShowHomeDocuments = !isHomeSpaceAuto && Boolean(homeSelectedSpace?.id)
  const homeSelectedDocumentCount = _homeSelectedDocumentIds.length
  const homeSelectedDocumentIdSet = useMemo(
    () => new Set((_homeSelectedDocumentIds || []).map(id => String(id))),
    [_homeSelectedDocumentIds],
  )
  const homeSelectedDocuments = useMemo(() => {
    if (!homeSpaceDocuments || homeSpaceDocuments.length === 0) return []
    return homeSpaceDocuments.filter(doc => homeSelectedDocumentIdSet.has(String(doc.id)))
  }, [homeSpaceDocuments, homeSelectedDocumentIdSet])

  const homeUploadMenuContent = (
    <>
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">
        {t('common.upload')}
      </div>
      <div className="space-y-1">
        <button
          type="button"
          onClick={handleHomeImageUpload}
          className="flex items-center mb-2 gap-1.5 w-full px-3 py-2 hover:bg-gray-50 dark:hover:bg-zinc-800 text-sm rounded-xl"
        >
          <div className="p-1.5 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
            <Image size={16} className="text-primary-500" />
          </div>
          {t('common.uploadImage')}
        </button>
        {/* <button
          type="button"
          disabled
          className="flex items-center gap-1.5 w-full px-3 py-2 rounded-xl text-sm text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-60"
        >
          <div className="p-1.5 bg-gray-100 dark:bg-zinc-800 rounded-lg">
            <FileText size={16} />
          </div>
          {t('common.uploadDocument')}
        </button> */}
      </div>
      {shouldShowHomeDocuments && (
        <div className="border-t border-gray-200/70 dark:border-zinc-700/50 pt-3">
          <DocumentsSection
            documents={homeSpaceDocuments}
            documentsLoading={homeDocumentsLoading}
            selectedDocumentCount={homeSelectedDocumentCount}
            selectedDocumentIdSet={homeSelectedDocumentIdSet}
            onToggleDocument={toggleHomeDocument}
            t={t}
          />
        </div>
      )}
    </>
  )

  function toggleHomeDocument(documentId) {
    const docKey = String(documentId)
    setHomeSelectedDocumentIds(prev =>
      prev.some(id => String(id) === docKey)
        ? prev.filter(id => String(id) !== docKey)
        : [...prev, docKey],
    )
  }

  const handleSelectHomeSpaceAuto = () => {
    setHomeSelectedSpace(null)
    setHomeSpaceSelectionType('auto')
    setIsHomeAgentAuto(true)
    setHomeSelectedAgentId(null)
    setHomeExpandedSpaceId(null)
    setIsHomeSpaceSelectorOpen(false)
    setHomeSelectedDocumentIds([])
    setHomeSpaceDocuments([])
  }

  const handleToggleHomeSpace = space => {
    setHomeSelectedSpace(space)
    setHomeSpaceSelectionType('space')
    setIsHomeAgentAuto(true)
    setHomeSelectedAgentId(null)
    setHomeExpandedSpaceId(prev => (prev === space.id ? null : space.id))
  }

  const handleSelectHomeAgent = (space, agentId) => {
    setHomeSelectedSpace(space)
    setHomeSpaceSelectionType('space')
    setIsHomeAgentAuto(false)
    setHomeSelectedAgentId(agentId)
    setIsHomeSpaceSelectorOpen(false)
  }

  const handleSelectHomeAgentAuto = space => {
    setHomeSelectedSpace(space)
    setHomeSpaceSelectionType('space')
    setIsHomeAgentAuto(true)
    setHomeSelectedAgentId(null)
    setIsHomeSpaceSelectorOpen(false)
  }

  const handleStartChat = async () => {
    if (!homeInput.trim() && homeAttachments.length === 0) return
    const resolvedThinkingActive = isHomeThinkingActive
    const resolvedSpace = homeSelectedSpace
    const resolvedAgent = selectedHomeAgent

    try {
      // Determine space selection
      const selectedSpace = isHomeSpaceAuto ? null : resolvedSpace
      const selectedAgent = isHomeAgentAuto ? null : resolvedAgent

      // Create conversation in database first
      const { data: conversation, error } = await createConversation({
        space_id: selectedSpace?.id || null,
        title: 'New Conversation',
        api_provider: selectedAgent?.provider || defaultAgent?.provider || '',
      })

      if (error || !conversation) {
        console.error('Failed to create conversation:', error)
        return
      }
      if (_homeSelectedDocumentIds.length > 0) {
        const { success: documentsPersisted, error: documentError } =
          await setConversationDocuments(conversation.id, _homeSelectedDocumentIds)
        if (!documentsPersisted) {
          console.error('Failed to persist selected documents for conversation:', documentError)
        }
      }
      // Prepare initial chat state to pass via router state
      const chatState = {
        initialMessage: homeInput,
        initialAttachments: homeAttachments,
        initialDocumentIds: _homeSelectedDocumentIds,
        initialToggles: {
          search: isHomeSearchActive,
          searchSource: isHomeSearchActive ? homeSearchSource : undefined,
          thinking: resolvedThinkingActive,
          deepResearch: false,
          related: Boolean(settings.enableRelatedQuestions),
        },
        initialSpaceSelection: {
          mode: isHomeSpaceAuto ? 'auto' : 'manual',
          space: selectedSpace,
        },
        initialAgentSelection: selectedAgent,
        initialIsAgentAutoMode: isHomeAgentAuto,
      }

      // Navigate to the conversation route with state
      navigate({
        to: '/conversation/$conversationId',
        params: { conversationId: conversation.id },
        state: chatState,
      })

      // Reset home input
      setHomeInput('')
      setHomeAttachments([])
      setIsHomeSearchActive(false)
      setHomeSearchSource('web')
      setIsHomeThinkingActive(false)
      setHomeSelectedSpace(null)
      setHomeSpaceSelectionType('auto')
      setHomeSelectedAgentId(null)
      setIsHomeAgentAuto(true) // Reset to auto mode for next chat
      setHomeExpandedSpaceId(null)
      setHomeSelectedDocumentIds([])
      setHomeSpaceDocuments([])
    } catch (err) {
      console.error('Failed to start chat:', err)
    }
  }

  const FileIcon = ({ fileType, className }) => {
    const type = (fileType || '').toLowerCase()
    if (type.includes('pdf')) return <FileText className={clsx('text-red-500', className)} />
    if (type.includes('doc') || type.includes('word'))
      return <FileText className={clsx('text-blue-500', className)} />
    if (type.includes('json')) return <FileJson className={clsx('text-yellow-500', className)} />
    if (type.includes('csv') || type.includes('excel') || type.includes('sheet'))
      return <FileSpreadsheet className={clsx('text-emerald-500', className)} />
    if (
      type.includes('md') ||
      type.includes('start') ||
      type.includes('code') ||
      type === 'js' ||
      type === 'py'
    )
      return <FileCode className={clsx('text-purple-500', className)} />
    return <File className={clsx('text-gray-400', className)} />
  }
  const homeAgents = useMemo(() => {
    // In Auto mode or when no space selected, return empty
    if (!homeSelectedSpace?.id) return []
    // In manual space mode, return space's agents
    const idSet = new Set(homeAgentIds.map(id => String(id)))
    return appAgents.filter(agent => idSet.has(String(agent.id)))
  }, [appAgents, homeAgentIds, homeSelectedSpace?.id])

  const selectedHomeAgent = useMemo(() => {
    if (isHomeAgentAuto) return null
    // First try to find in homeAgents (space's agents)
    const found = homeAgents.find(agent => String(agent.id) === String(homeSelectedAgentId))
    if (found) return found
    // If not found in homeAgents, try to find in all appAgents (for default agent)
    return appAgents.find(agent => String(agent.id) === String(homeSelectedAgentId)) || null
  }, [homeAgents, homeSelectedAgentId, isHomeAgentAuto, appAgents])

  const homeModelConfig = useMemo(() => {
    const resolveFromAgent = agent => {
      if (!agent) return null
      const defaultModel = agent.defaultModel
      const liteModel = agent.liteModel ?? ''
      const defaultModelProvider = agent.defaultModelProvider || ''
      const liteModelProvider = agent.liteModelProvider || ''
      const hasDefault = typeof defaultModel === 'string' && defaultModel.trim() !== ''
      const hasLite = typeof liteModel === 'string' && liteModel.trim() !== ''
      if (!hasDefault && !hasLite) return null
      const model = defaultModel || liteModel
      const provider = defaultModelProvider || liteModelProvider || agent.provider || ''
      if (!model) return null
      return { model, provider }
    }
    return resolveFromAgent(selectedHomeAgent) || resolveFromAgent(defaultAgent) || { model: '' }
  }, [selectedHomeAgent, defaultAgent])

  const homeResolvedModel = homeModelConfig?.model || ''
  const homeThinkingRule = resolveThinkingToggleRule('', homeResolvedModel)
  const isHomeThinkingLocked = homeThinkingRule.isLocked

  useEffect(() => {
    if (!isHomeThinkingLocked) return
    setIsHomeThinkingActive(homeThinkingRule.isThinkingActive)
  }, [isHomeThinkingLocked, homeThinkingRule.isThinkingActive])

  const homeSpaceButtonContent = useMemo(() => {
    const autoLabelWithSparkle = `${t('homeView.auto')} ✨`
    const spaceLabel = isHomeSpaceAuto
      ? autoLabelWithSparkle
      : homeSelectedSpace
        ? getSpaceDisplayLabel(homeSelectedSpace, t)
        : t('homeView.none')
    const agentLabel = isHomeAgentAuto
      ? autoLabelWithSparkle
      : getAgentDisplayName(selectedHomeAgent, t) || t('homeView.agentsLabel')
    // When both space and agent are auto, show only one auto label
    const showOnlySpaceLabel = isHomeSpaceAuto && isHomeAgentAuto
    return {
      spaceLabel: showOnlySpaceLabel ? autoLabelWithSparkle : spaceLabel,
      agentLabel: showOnlySpaceLabel ? null : agentLabel,
      spaceEmoji: homeSelectedSpace?.emoji || '',
      agentEmoji: showOnlySpaceLabel ? '' : selectedHomeAgent?.emoji || '',
      showOnlySpaceLabel,
    }
  }, [isHomeSpaceAuto, homeSelectedSpace, isHomeAgentAuto, selectedHomeAgent, t])
  const {
    spaceLabel: resolvedSpaceLabel,
    agentLabel: resolvedAgentLabel,
    spaceEmoji: resolvedSpaceEmoji,
    agentEmoji: resolvedAgentEmoji,
    showOnlySpaceLabel,
  } = homeSpaceButtonContent

  const availableHomeSpaces = useMemo(() => {
    const deepResearchId = deepResearchSpace?.id ? String(deepResearchSpace.id) : null
    return spaces.filter(
      space =>
        !(space?.isDeepResearchSystem || space?.isDeepResearch || space?.is_deep_research) &&
        (!deepResearchId || String(space.id) !== String(deepResearchId)),
    )
  }, [spaces, deepResearchSpace?.id])

  const renderHomeSpaceMenuContent = () => (
    <div className="px-2 py-1 flex flex-col divide-y space-y-1  divide-gray-200 dark:divide-zinc-800">
      <div>
        <button
          onClick={handleSelectHomeSpaceAuto}
          className={`flex mb-1 items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left ${
            isHomeSpaceAuto ? 'text-primary-500' : 'text-gray-700 dark:text-gray-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg flex items-center justify-center">
              <EmojiDisplay emoji={'✨'} size="1.25rem" />
            </span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {t('homeView.auto')}
            </span>
          </div>
          {isHomeSpaceAuto && <Check size={14} className="text-primary-500" />}
        </button>
      </div>
      {availableHomeSpaces.map((space, idx) => {
        const isSelected = homeSelectedSpace?.label === space.label
        return (
          <div key={idx}>
            <div key={idx + 'content'} className="rounded-lg mb-1">
              <button
                onClick={() => handleToggleHomeSpace(space)}
                className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg flex items-center justify-center">
                    <EmojiDisplay emoji={space.emoji} size="1.25rem" />
                  </span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {getSpaceDisplayLabel(space, t)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isSelected && <Check size={14} className="text-primary-500" />}
                  <ChevronDown
                    size={14}
                    className={`text-gray-400 transition-transform ${
                      homeExpandedSpaceId === space.id ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </button>
              {homeExpandedSpaceId === space.id && (
                <div className="ml-3 mt-1 mb-2 flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => handleSelectHomeAgentAuto(space)}
                    className={`flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left ${
                      isHomeAgentAuto && isSelected
                        ? 'text-primary-500'
                        : 'text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    <span className="text-sm font-medium">{t('homeView.auto')}</span>
                    {isHomeAgentAuto && isSelected && (
                      <Check size={14} className="text-primary-500" />
                    )}
                  </button>
                  {homeAgentsLoading && isSelected ? (
                    <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <span className="inline-flex w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.2s]" />
                        <span className="inline-flex w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.1s]" />
                        <span className="inline-flex w-1.5 h-1.5 rounded-full bg-current animate-bounce" />
                      </div>
                    </div>
                  ) : homeAgents.length === 0 && isSelected ? (
                    <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                      {t('homeView.agentsNone')}
                    </div>
                  ) : (
                    isSelected &&
                    homeAgents.map(agent => {
                      const isAgentSelected = !isHomeAgentAuto && selectedHomeAgent?.id === agent.id
                      const isDefault =
                        agent.isDefault || String(agent.id) === String(homePrimaryAgentId)
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => handleSelectHomeAgent(space, agent.id)}
                          className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-lg">
                              <EmojiDisplay emoji={agent.emoji} size="1.125rem" />
                            </span>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                              {getAgentDisplayName(agent, t)}
                            </span>
                            {isDefault && (
                              <span className="text-xs px-1.5 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-md font-medium">
                                {t('homeView.default')}
                              </span>
                            )}
                          </div>
                          {isAgentSelected && <Check size={14} className="text-primary-500" />}
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="flex-1 h-full bg-background text-foreground transition-colors duration-300 relative flex flex-col overflow-hidden">
      {/* Elegant Ambient Background Glow - Layered for Depth */}
      <div className="absolute inset-0 z-0 pointer-events-none select-none">
        {/* Deep ambient base layer - lighter for light mode */}
        <div
          className="absolute inset-0 opacity-20 dark:opacity-40"
          style={{
            background:
              'radial-gradient(ellipse 120% 100% at 20% 0%, var(--color-primary-300) 0%, transparent 50%), radial-gradient(ellipse 100% 80% at 80% 100%, var(--color-primary-400) 0%, transparent 50%)',
          }}
        />
        {/* Mid-tone accent layer - softer and larger */}
        <div
          className="absolute inset-0 opacity-15 dark:opacity-35 blur-3xl"
          style={{
            background:
              'radial-gradient(circle at 30% 20%, var(--color-primary-200) 0%, transparent 35%), radial-gradient(circle at 70% 60%, var(--color-primary-300) 0%, transparent 40%)',
          }}
        />
        {/* Highlight layer - subtle warm accents */}
        <div
          className="absolute inset-0 opacity-10 dark:opacity-25 blur-2xl"
          style={{
            background:
              'radial-gradient(circle at 15% 35%, rgba(168, 85, 247, 0.2) 0%, transparent 30%), radial-gradient(circle at 85% 15%, rgba(59, 130, 246, 0.15) 0%, transparent 35%)',
          }}
        />
        {/* Edge vignette for depth */}
        <div
          className="absolute inset-0 opacity-8 dark:opacity-20"
          style={{
            background:
              'radial-gradient(ellipse 80% 120% at 50% 100%, var(--color-primary-500) 0%, transparent 60%)',
          }}
        />
      </div>

      {/* Mobile Header for Home View */}
      <div className="md:hidden w-full h-12 shrink-0 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-4 bg-background z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            className="p-2 -ml-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg"
          >
            <Menu size={20} />
          </button>
          <span className="font-semibold text-gray-900 dark:text-white">{t('app.name')}</span>
        </div>
        {/* Space for right button if needed, or just spacer */}
        <div className="w-8" />
      </div>

      <div
        ref={homeContainerRef}
        className={clsx(
          'flex-1 h-full overflow-y-auto p-4 transition-all duration-300 flex flex-col items-center',
          isSidebarPinned ? 'md:ml-72' : 'md:ml-16',
        )}
      >
        {/* Main Container */}
        <div className="w-full max-w-3xl flex flex-col items-center gap-4 sm:gap-8 sm:mt-12">
          <div className="p-4 block sm:hidden rounded-3xl mb-2">
            <Logo size={128} className="text-gray-900 dark:text-white" priority />
          </div>
          {/* Title */}
          <h1 className="home-title text-3xl md:text-5xl font-serif! font-medium text-center mb-4 mt-0 sm:mb-8 text-gray-700 dark:text-white">
            {t('app.tagline')}
          </h1>

          {/* Search Box */}
          <div className="home-search-box w-full relative group z-20">
            <div className="absolute inset-0 input-glow-veil rounded-xl blur-2xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="relative bg-white dark:bg-zinc-900 border border-stone-200/60 dark:border-zinc-700/60 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 p-4">
              {(homeAttachments.length > 0 || homeSelectedDocuments.length > 0) && (
                <div className="flex gap-2 mb-3 px-2 py-2 code-scrollbar overflow-x-auto rounded-xl border border-gray-200/70 dark:border-zinc-700/50 bg-[#F9F9F9] dark:bg-[#1a1a1a]">
                  {homeAttachments.map((att, idx) => (
                    <div
                      key={`img-${idx}`}
                      className="relative group/img shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-800 shadow-sm"
                    >
                      <img
                        src={att.image_url.url}
                        alt="attachment"
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() =>
                          setHomeAttachments(homeAttachments.filter((_, i) => i !== idx))
                        }
                        className="absolute top-0.5 right-0.5 bg-black/60 dark:bg-white/60 dark:text-black text-white rounded-full p-0.5 opacity-100 sm:opacity-0 sm:group-hover/img:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {homeSelectedDocuments.map(doc => (
                    <div
                      key={`doc-${doc.id}`}
                      className="relative group/doc shrink-0 min-w-[110px] overflow-hidden rounded-xl border border-gray-200 dark:border-zinc-700/50 bg-white dark:bg-[#111] shadow-sm"
                    >
                      <div className="flex h-full flex-col items-center justify-center gap-1 px-2 py-2 text-center">
                        <FileIcon fileType={doc.file_type} className="h-5 w-5" />
                        <span className="text-[12px] font-semibold text-gray-900 dark:text-white truncate">
                          {doc.name.replace(/\.[^/.]+$/, '')}
                        </span>
                      </div>
                      <button
                        onClick={() => toggleHomeDocument(doc.id)}
                        className="absolute top-1.5 right-3 bg-black/60 dark:bg-white/60 dark:text-black text-white rounded-full p-0.5 opacity-100 sm:opacity-0 sm:group-hover/doc:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="relative">
                {homeInput && (
                  <div
                    ref={homeInputHighlightRef}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 overflow-hidden text-lg whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100"
                  >
                    {homeInputParts.map((part, index) =>
                      part.type === 'url' ? (
                        <span
                          key={`url-${index}`}
                          className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-sm underline decoration-primary-400/70"
                        >
                          {part.value}
                        </span>
                      ) : (
                        <span key={`text-${index}`}>{part.value}</span>
                      ),
                    )}
                  </div>
                )}
                <textarea
                  ref={homeTextareaRef}
                  value={homeInput}
                  onChange={e => {
                    setHomeInput(e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = `${e.target.scrollHeight}px`
                  }}
                  onScroll={e => {
                    if (homeInputHighlightRef.current) {
                      homeInputHighlightRef.current.scrollTop = e.target.scrollTop
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleStartChat()
                    }
                  }}
                  placeholder={t('homeView.askAnything')}
                  className="relative z-10 w-full bg-transparent border-none outline-none resize-none text-lg text-transparent caret-gray-900 dark:caret-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-h-[60px] max-h-[200px] overflow-y-auto"
                  rows={1}
                />
              </div>

              <div className="flex justify-between items-center mt-2">
                <div className="flex gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    multiple
                    className="hidden"
                  />
                  <div className="relative" ref={homeUploadMenuRef}>
                    <button
                      type="button"
                      onClick={() => setIsHomeUploadMenuOpen(prev => !prev)}
                      className={`p-2 rounded-lg transition-all duration-200 flex items-center gap-2 text-sm font-medium ${
                        homeAttachments.length > 0
                          ? 'text-primary-500 bg-primary-50 dark:bg-primary-900/20'
                          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <Paperclip size={18} strokeWidth={2} />
                    </button>
                    {/* Upload Dropdown */}
                    {isHomeUploadMenuOpen && !isHomeMobile && (
                      <UploadPopover className="top-full w-72">
                        {homeUploadMenuContent}
                      </UploadPopover>
                    )}
                    <MobileDrawer
                      isOpen={isHomeUploadMenuOpen && isHomeMobile}
                      onClose={() => setIsHomeUploadMenuOpen(false)}
                      title={t('common.files')}
                    >
                      <div className="space-y-2">{homeUploadMenuContent}</div>
                    </MobileDrawer>
                  </div>
                  <button
                    disabled={isHomeThinkingLocked}
                    onClick={() =>
                      setIsHomeThinkingActive(prev => {
                        const next = !prev
                        return next
                      })
                    }
                    className={`p-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                      isHomeThinkingActive
                        ? 'text-primary-500 bg-gray-100 dark:bg-zinc-800'
                        : 'text-gray-500 dark:text-gray-400'
                    } ${isHomeThinkingLocked ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-zinc-800'}`}
                  >
                    <Brain size={18} />
                    <span className="hidden md:inline">{t('homeView.think')}</span>
                  </button>
                  <button
                    disabled={
                      !isHomeSpaceAuto &&
                      Boolean(selectedHomeAgent?.provider || defaultAgent?.provider) &&
                      !providerSupportsSearch(selectedHomeAgent?.provider || defaultAgent?.provider)
                    }
                    value={isHomeSearchActive}
                    onClick={() => setIsHomeSearchActive(!isHomeSearchActive)}
                    className={`p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                      isHomeSearchActive
                        ? 'text-primary-500 bg-gray-100 dark:bg-zinc-800'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    <Globe size={18} />
                    <span className="hidden md:inline">{t('homeView.search')}</span>
                  </button>

                  {isHomeSearchActive && (
                    <div className="flex items-center">
                      <SearchSourceSelector
                        selectedSource={homeSearchSource}
                        onSelect={setHomeSearchSource}
                        isMobile={isHomeMobile}
                      />
                    </div>
                  )}

                  <div className="relative" ref={homeSpaceSelectorRef}>
                    <button
                      onClick={() => setIsHomeSpaceSelectorOpen(!isHomeSpaceSelectorOpen)}
                      className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${
                        isHomeSpaceAuto
                          ? 'text-gray-500 dark:text-gray-400'
                          : 'text-primary-500 bg-gray-100 dark:bg-zinc-800'
                      } hover:bg-gray-100 dark:hover:bg-zinc-800`}
                    >
                      <LayoutGrid size={18} />
                      <div className="hidden md:flex items-center gap-1 text-xs font-medium text-gray-900 dark:text-white min-w-0">
                        {resolvedSpaceEmoji && (
                          <EmojiDisplay emoji={resolvedSpaceEmoji} size="1.15rem" />
                        )}
                        <span className="truncate">{resolvedSpaceLabel}</span>
                        {!showOnlySpaceLabel && (
                          <>
                            <span className="text-gray-400 dark:text-gray-500 select-none">·</span>
                            {resolvedAgentEmoji && (
                              <EmojiDisplay emoji={resolvedAgentEmoji} size="1.15rem" />
                            )}
                            <span className="truncate text-gray-600 dark:text-gray-300">
                              {resolvedAgentLabel}
                            </span>
                          </>
                        )}
                      </div>
                      <ChevronDown size={14} />
                    </button>
                    {!isHomeMobile && isHomeSpaceSelectorOpen && (
                      <div className="absolute top-full left-0 mt-2 w-60 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl z-50">
                        {renderHomeSpaceMenuContent()}
                      </div>
                    )}
                  </div>

                  {isHomeMobile && (
                    <Drawer
                      open={isHomeSpaceSelectorOpen}
                      onOpenChange={setIsHomeSpaceSelectorOpen}
                    >
                      <DrawerContent className="max-h-[85vh] rounded-t-3xl bg-white dark:bg-[#1E1E1E] border-t border-gray-200 dark:border-zinc-800">
                        <div className="px-5 py-4 flex items-center justify-between shrink-0 border-b border-gray-100 dark:border-zinc-800/50">
                          <div className="flex flex-col">
                            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-none mb-1">
                              {t('homeView.spaces') + ' and ' + t('homeView.agents')}
                            </h3>
                          </div>
                          <button
                            onClick={() => setIsHomeSpaceSelectorOpen(false)}
                            className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                          >
                            <X size={20} />
                          </button>
                        </div>
                        <div className="overflow-y-auto min-h-0 p-3">
                          {renderHomeSpaceMenuContent()}
                        </div>
                        <div className="h-6 shrink-0" />
                      </DrawerContent>
                    </Drawer>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleStartChat}
                    disabled={!homeInput.trim() && homeAttachments.length === 0}
                    className="p-2 bg-primary-500 hover:bg-primary-600 text-white rounded-full transition-colors disabled:opacity-50  disabled:hover:bg-primary-500"
                  >
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mb-1 px-0">
            <DeepResearchCard onClick={openDeepResearchGuide} />
            <SpaceShortcutCard
              spaces={spaces}
              selectedSpaceId={homeSelectedSpace?.id}
              onSpaceSelect={space => {
                navigate({ to: `/space/${space.id}` })
              }}
              onManageClick={() => navigate({ to: '/spaces' })}
            />
          </div>

          {/* Widgets Section */}
          <div className="home-widgets w-full">
            <HomeWidgets />
          </div>
        </div>
      </div>
    </div>
  )
}

export default HomeView
