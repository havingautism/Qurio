import { useGSAP } from '@gsap/react'
import { useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import gsap from 'gsap'
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right'
import Brain from 'lucide-react/dist/esm/icons/brain'
import BrainCircuit from 'lucide-react/dist/esm/icons/brain-circuit'
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
import useScrollLock from '../hooks/useScrollLock'
import { getAgentDisplayName } from '../lib/agentDisplay'
import {
  ACADEMIC_SEARCH_TOOL_OPTIONS,
  SEARCH_BACKEND_OPTIONS,
  getSearchToolOptions,
  setSearchToolRegistry,
  TAVILY_TOOL_IDS,
} from '../lib/searchTools'
import useChatStore from '../lib/chatStore'
import { createConversation } from '../lib/conversationsService'
import { providerSupportsSearch, resolveThinkingToggleRule } from '../lib/providers'
import { loadSettings } from '../lib/settings'
import { getSpaceDisplayLabel } from '../lib/spaceDisplay'
import { listSpaceAgents } from '../lib/spacesService'
import { listSpaceDocuments, setConversationDocuments } from '../lib/documentsService'
import { useDeepResearchGuide } from '../contexts/DeepResearchGuideContext'
import { splitTextWithUrls } from '../lib/urlHighlight'
import { listToolsViaBackend } from '../lib/backendClient'

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
  const [homeSearchBackend, setHomeSearchBackend] = useState(null)
  const [homeSearchTools, setHomeSearchTools] = useState([])
  const [isHomeSearchMenuOpen, setIsHomeSearchMenuOpen] = useState(false)
  const [isHomeThinkingActive, setIsHomeThinkingActive] = useState(false)
  const [isHomeExpertMode, setIsHomeExpertMode] = useState(false)
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
  const homeSearchMenuRef = useRef(null)
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
      void refreshHomeSearchTools(Boolean(newSettings.tavilyApiKey))
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
    setIsHomeSearchActive(Boolean(homeSearchBackend) || homeSearchTools.length > 0)
  }, [homeSearchBackend, homeSearchTools])

  const refreshHomeSearchTools = async tavilyEnabledOverride => {
    try {
      const tools = await listToolsViaBackend()
      const tavilyEnabled =
        typeof tavilyEnabledOverride === 'boolean'
          ? tavilyEnabledOverride
          : Boolean(loadSettings().tavilyApiKey)
      const filteredTools = tavilyEnabled
        ? tools
        : tools.filter(tool => {
            const id = String(tool?.id || tool?.name || '')
            return !TAVILY_TOOL_IDS.has(id)
          })
      setSearchToolRegistry(filteredTools)
      const options = getSearchToolOptions()
      const academicIds = new Set(ACADEMIC_SEARCH_TOOL_OPTIONS.map(option => option.id))
      if (homeSearchTools.length > 0) {
        const filtered = homeSearchTools.filter(id =>
          options.some(option => option.id === id && academicIds.has(option.id)),
        )
        if (filtered.length !== homeSearchTools.length) {
          setHomeSearchTools(filtered)
        }
      }
    } catch (err) {
      console.error('Failed to load search tools:', err)
    }
  }

  useEffect(() => {
    void refreshHomeSearchTools()
  }, [])

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

  useEffect(() => {
    if (!isHomeSearchMenuOpen || isHomeMobile) return
    const handleClickOutside = event => {
      if (homeSearchMenuRef.current && !homeSearchMenuRef.current.contains(event.target)) {
        setIsHomeSearchMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isHomeSearchMenuOpen, isHomeMobile])

  const handleSelectHomeSearchTool = toolId => {
    if (!toolId) {
      setHomeSearchTools([])
      return
    }
    setHomeSearchBackend(null)
    setHomeSearchTools(prev => {
      const normalized = String(toolId)
      return prev.includes(normalized)
        ? prev.filter(id => id !== normalized)
        : [...prev, normalized]
    })
  }

  const handleSelectHomeSearchBackend = backendId => {
    if (!backendId) {
      setHomeSearchBackend(null)
      return
    }
    setHomeSearchTools([])
    setHomeSearchBackend(String(backendId))
  }

  const handleClearHomeSearch = () => {
    setHomeSearchBackend(null)
    setHomeSearchTools([])
    setIsHomeSearchMenuOpen(false)
  }

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
      <div className="mb-2 px-2 text-[10px] font-bold tracking-widest text-gray-400 uppercase">
        {t('common.upload')}
      </div>
      <div className="space-y-1">
        <button
          type="button"
          onClick={handleHomeImageUpload}
          className="mb-1.5 flex w-full items-center gap-1.5 rounded-xl px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-zinc-800"
        >
          <div className="bg-primary-100 dark:bg-primary-900/30 rounded-lg p-1.5">
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
        <div className="border-t border-gray-200/70 pt-3 dark:border-zinc-700/50">
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
      const resolvedSearchTools = new Set()
      if (homeSearchBackend) resolvedSearchTools.add('web_search')
      homeSearchTools.forEach(id => resolvedSearchTools.add(String(id)))
      const chatState = {
        initialMessage: homeInput,
        initialAttachments: homeAttachments,
        initialDocumentIds: _homeSelectedDocumentIds,
        initialToggles: {
          search: isHomeSearchActive,
          searchTool: isHomeSearchActive ? Array.from(resolvedSearchTools) : [],
          searchBackend: homeSearchBackend || null,
          thinking: resolvedThinkingActive,
          deepResearch: false,
          expertMode: isHomeExpertMode,
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
        to: isHomeExpertMode ? '/expert/$conversationId' : '/conversation/$conversationId',
        params: { conversationId: conversation.id },
        state: chatState,
      })

      // Reset home input
      setHomeInput('')
      setHomeAttachments([])
      setIsHomeSearchActive(false)
      setHomeSearchTools([])
      setHomeSearchBackend(null)
      setIsHomeThinkingActive(false)
      setIsHomeExpertMode(false)
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
    <div className="flex flex-col space-y-1 divide-y divide-gray-200 px-2 py-1 dark:divide-zinc-800">
      <div>
        <button
          onClick={handleSelectHomeSpaceAuto}
          className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-zinc-700/50 ${
            isHomeSpaceAuto ? 'text-primary-500' : 'text-gray-700 dark:text-gray-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center text-lg">
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
            <div key={idx + 'content'} className="mb-1 rounded-lg">
              <button
                onClick={() => handleToggleHomeSpace(space)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-zinc-700/50"
              >
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center text-lg">
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
                <div className="mt-1 mb-2 ml-3 flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => handleSelectHomeAgentAuto(space)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-zinc-700/50 ${
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
                        <span className="inline-flex h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
                        <span className="inline-flex h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
                        <span className="inline-flex h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
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
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-zinc-700/50"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-lg">
                              <EmojiDisplay emoji={agent.emoji} size="1.125rem" />
                            </span>
                            <span className="truncate text-sm font-medium text-gray-700 dark:text-gray-200">
                              {getAgentDisplayName(agent, t)}
                            </span>
                            {isDefault && (
                              <span className="bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-md px-1.5 py-0.5 text-xs font-medium">
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
    <div className="bg-background text-foreground relative flex h-full flex-1 flex-col overflow-hidden transition-colors duration-300">
      {/* Elegant Ambient Background Glow - Layered for Depth */}
      <div className="pointer-events-none absolute inset-0 z-0 select-none">
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
          className="absolute inset-0 opacity-15 blur-3xl dark:opacity-35"
          style={{
            background:
              'radial-gradient(circle at 30% 20%, var(--color-primary-200) 0%, transparent 35%), radial-gradient(circle at 70% 60%, var(--color-primary-300) 0%, transparent 40%)',
          }}
        />
        {/* Highlight layer - subtle warm accents */}
        <div
          className="absolute inset-0 opacity-10 blur-2xl dark:opacity-25"
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
      <div className="bg-background z-30 flex h-12 w-full shrink-0 items-center justify-between border-b border-gray-200 px-4 md:hidden dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            className="-ml-2 rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-zinc-800"
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
          'flex h-full flex-1 flex-col items-center overflow-y-auto p-4 transition-all duration-300',
          isSidebarPinned ? 'md:ml-72' : 'md:ml-16',
        )}
      >
        {/* Main Container */}
        <div className="flex w-full max-w-3xl flex-col items-center gap-4 sm:mt-12 sm:gap-8">
          <div className="mb-2 block rounded-3xl p-4 sm:hidden">
            <Logo size={128} className="text-gray-900 dark:text-white" priority />
          </div>
          {/* Title */}
          <h1 className="home-title mt-0 mb-4 text-center font-serif! text-3xl font-medium text-gray-700 sm:mb-8 md:text-5xl dark:text-white">
            {t('app.tagline')}
          </h1>

          {/* Search Box */}
          <div className="home-search-box group relative z-20 w-full">
            <div className="input-glow-veil pointer-events-none absolute inset-0 rounded-xl opacity-0 blur-2xl transition-opacity duration-500 group-focus-within:opacity-100 group-hover:opacity-100" />
            <div className="relative rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-md dark:border-zinc-700/60 dark:bg-zinc-900">
              {(homeAttachments.length > 0 || homeSelectedDocuments.length > 0) && (
                <div className="code-scrollbar mb-3 flex gap-2 overflow-x-auto rounded-xl border border-gray-200/70 bg-[#F9F9F9] px-2 py-2 dark:border-zinc-700/50 dark:bg-[#1a1a1a]">
                  {homeAttachments.map((att, idx) => (
                    <div
                      key={`img-${idx}`}
                      className="group/img relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-200 shadow-sm dark:border-zinc-800"
                    >
                      <img
                        src={att.image_url.url}
                        alt="attachment"
                        className="h-full w-full object-cover"
                      />
                      <button
                        onClick={() =>
                          setHomeAttachments(homeAttachments.filter((_, i) => i !== idx))
                        }
                        className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover/img:opacity-100 dark:bg-white/60 dark:text-black"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {homeSelectedDocuments.map(doc => (
                    <div
                      key={`doc-${doc.id}`}
                      className="group/doc relative min-w-[110px] shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-zinc-700/50 dark:bg-[#111]"
                    >
                      <div className="flex h-full flex-col items-center justify-center gap-1 px-2 py-2 text-center">
                        <FileIcon fileType={doc.file_type} className="h-5 w-5" />
                        <span className="truncate text-[12px] font-semibold text-gray-900 dark:text-white">
                          {doc.name.replace(/\.[^/.]+$/, '')}
                        </span>
                      </div>
                      <button
                        onClick={() => toggleHomeDocument(doc.id)}
                        className="absolute top-1.5 right-3 rounded-full bg-black/60 p-0.5 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover/doc:opacity-100 dark:bg-white/60 dark:text-black"
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
                    className="pointer-events-none absolute inset-0 overflow-hidden text-lg wrap-break-word whitespace-pre-wrap text-gray-900 dark:text-gray-100"
                  >
                    {homeInputParts.map((part, index) =>
                      part.type === 'url' ? (
                        <span
                          key={`url-${index}`}
                          className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 decoration-primary-400/70 rounded-sm underline"
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
                  className="relative z-10 max-h-[200px] min-h-[60px] w-full resize-none overflow-y-auto border-none bg-transparent text-lg text-transparent placeholder-gray-400 caret-gray-900 outline-none dark:placeholder-gray-500 dark:caret-gray-100"
                  rows={1}
                />
              </div>

              <div className="mt-2 flex items-center justify-between">
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
                      className={`flex items-center gap-2 rounded-lg p-2 text-sm font-medium transition-all duration-200 ${
                        homeAttachments.length > 0
                          ? 'text-primary-500 bg-primary-50 dark:bg-primary-900/20'
                          : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <Paperclip size={18} strokeWidth={2} />
                    </button>
                    {/* Upload Dropdown */}
                    {isHomeUploadMenuOpen && !isHomeMobile && (
                      <UploadPopover className="top-full w-72">
                        <div className="no-scrollbar max-h-[min(calc(100vh-140px),600px)] overflow-y-auto scroll-smooth">
                          {homeUploadMenuContent}
                        </div>
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
                    className={`flex items-center gap-2 rounded-lg p-2 text-xs font-medium transition-colors ${
                      isHomeThinkingActive
                        ? 'text-primary-500 bg-gray-100 dark:bg-zinc-800'
                        : 'text-gray-500 dark:text-gray-400'
                    } ${isHomeThinkingLocked ? 'cursor-not-allowed opacity-60' : 'hover:bg-gray-100 dark:hover:bg-zinc-800'}`}
                  >
                    <Brain size={18} />
                    <span className="hidden md:inline">{t('homeView.think')}</span>
                  </button>
                  <button
                    onClick={() => setIsHomeExpertMode(prev => !prev)}
                    className={`flex items-center gap-2 rounded-lg p-2 text-xs font-medium transition-colors ${
                      isHomeExpertMode
                        ? 'text-primary-500 bg-gray-100 dark:bg-zinc-800'
                        : 'text-gray-500 dark:text-gray-400'
                    } hover:bg-gray-100 dark:hover:bg-zinc-800`}
                  >
                    <BrainCircuit size={18} />
                    <span className="hidden md:inline">{t('homeView.expertMode')}</span>
                  </button>
                  <div className="relative" ref={homeSearchMenuRef}>
                    <button
                      disabled={
                        !isHomeSpaceAuto &&
                        Boolean(selectedHomeAgent?.provider || defaultAgent?.provider) &&
                        !providerSupportsSearch(
                          selectedHomeAgent?.provider || defaultAgent?.provider,
                        )
                      }
                      value={isHomeSearchActive}
                      onClick={() => setIsHomeSearchMenuOpen(prev => !prev)}
                      className={`flex items-center gap-2 rounded-lg p-2 text-xs font-medium transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800 ${
                        isHomeSearchActive
                          ? 'text-primary-500 bg-gray-100 dark:bg-zinc-800'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      <Globe size={18} />
                      <span className="hidden md:inline">{t('homeView.search')}</span>
                    </button>
                    {isHomeSearchMenuOpen && !isHomeMobile && (
                      <div className="absolute top-full left-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-[#202222]">
                        <div className="px-4 py-2 text-[10px] tracking-wide text-gray-500 uppercase dark:text-zinc-400">
                          {/* {t('chatInterface.searchMenuTitle')} */}
                        </div>
                        <div className="no-scrollbar max-h-[min(calc(100vh-140px),550px)] space-y-3 overflow-y-auto scroll-smooth px-2 pb-2">
                          <div className="space-y-3">
                            <div className="px-2 py-1 text-[10px] tracking-wide text-gray-500 uppercase dark:text-zinc-400">
                              {t('tools.webSearch')}
                            </div>
                            <div className="flex flex-col gap-1">
                              {SEARCH_BACKEND_OPTIONS.map(option => {
                                const isActive = homeSearchBackend === option.id
                                return (
                                  <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => handleSelectHomeSearchBackend(option.id)}
                                    className={clsx(
                                      'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800',
                                      isActive
                                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                                        : 'text-gray-700 dark:text-gray-200',
                                    )}
                                  >
                                    <span className="flex items-center gap-2">
                                      {option.iconUrl ? (
                                        <img
                                          src={option.iconUrl}
                                          alt=""
                                          className="h-4 w-4 rounded-sm"
                                        />
                                      ) : (
                                        <Globe size={14} className="text-gray-400" />
                                      )}
                                      {t(option.labelKey)}
                                    </span>
                                    {isActive && <Check size={14} className="text-primary-500" />}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <div className="h-px bg-gray-200 dark:bg-zinc-700/70" />
                          <div className="space-y-3">
                            <div className="px-2 py-1 text-[10px] tracking-wide text-gray-500 uppercase dark:text-zinc-400">
                              {t('tools.academicSearch')}
                            </div>
                            <div className="flex flex-col gap-1">
                              {ACADEMIC_SEARCH_TOOL_OPTIONS.map(option => {
                                const isActive =
                                  isHomeSearchActive && homeSearchTools.includes(option.id)
                                return (
                                  <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => handleSelectHomeSearchTool(option.id)}
                                    className={clsx(
                                      'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800',
                                      isActive
                                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                                        : 'text-gray-700 dark:text-gray-200',
                                    )}
                                  >
                                    <span className="flex items-center gap-2">
                                      {option.iconUrl ? (
                                        <img
                                          src={option.iconUrl}
                                          alt=""
                                          className="h-4 w-4 rounded-sm"
                                        />
                                      ) : (
                                        <Globe size={14} className="text-gray-400" />
                                      )}
                                      {t(option.labelKey)}
                                    </span>
                                    {isActive && <Check size={14} className="text-primary-500" />}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <div className="h-px bg-gray-200 dark:bg-zinc-700/70" />
                          <button
                            type="button"
                            onClick={handleClearHomeSearch}
                            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
                          >
                            <span>{t('common.close')}</span>
                          </button>
                        </div>
                      </div>
                    )}
                    <Drawer
                      open={isHomeSearchMenuOpen && isHomeMobile}
                      onOpenChange={setIsHomeSearchMenuOpen}
                    >
                      <DrawerContent className="max-h-[70vh] rounded-t-3xl border-t border-gray-200 bg-white dark:border-zinc-800 dark:bg-[#1E1E1E]">
                        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-zinc-800/50">
                          <h3 className="text-base leading-none font-bold text-gray-900 dark:text-gray-100">
                            {/* {t('chatInterface.searchMenuTitle')} */}
                          </h3>
                          <button
                            onClick={() => setIsHomeSearchMenuOpen(false)}
                            className="-mr-2 rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-gray-200"
                          >
                            <X size={20} />
                          </button>
                        </div>
                        <div className="min-h-0 overflow-y-auto p-3">
                          <div className="space-y-4">
                            <div className="space-y-3">
                              <div className="px-2 py-1 text-[10px] tracking-wide text-gray-500 uppercase dark:text-zinc-400">
                                {t('tools.webSearch')}
                              </div>
                              <div className="flex flex-col gap-1">
                                {SEARCH_BACKEND_OPTIONS.map(option => {
                                  const isActive = homeSearchBackend === option.id
                                  return (
                                    <button
                                      key={option.id}
                                      type="button"
                                      onClick={() => handleSelectHomeSearchBackend(option.id)}
                                      className={clsx(
                                        'flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800',
                                        isActive
                                          ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                                          : 'text-gray-700 dark:text-gray-200',
                                      )}
                                    >
                                      <span className="flex items-center gap-2">
                                        {option.iconUrl ? (
                                          <img
                                            src={option.iconUrl}
                                            alt=""
                                            className="h-4 w-4 rounded-sm"
                                          />
                                        ) : (
                                          <Globe size={14} className="text-gray-400" />
                                        )}
                                        {t(option.labelKey)}
                                      </span>
                                      {isActive && <Check size={14} className="text-primary-500" />}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                            <div className="h-px bg-gray-200 dark:bg-zinc-700/70" />
                            <div className="space-y-3">
                              <div className="px-2 py-1 text-[10px] tracking-wide text-gray-500 uppercase dark:text-zinc-400">
                                {t('tools.academicSearch')}
                              </div>
                              <div className="flex flex-col gap-1">
                                {ACADEMIC_SEARCH_TOOL_OPTIONS.map(option => {
                                  const isActive =
                                    isHomeSearchActive && homeSearchTools.includes(option.id)
                                  return (
                                    <button
                                      key={option.id}
                                      type="button"
                                      onClick={() => handleSelectHomeSearchTool(option.id)}
                                      className={clsx(
                                        'flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800',
                                        isActive
                                          ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                                          : 'text-gray-700 dark:text-gray-200',
                                      )}
                                    >
                                      <span className="flex items-center gap-2">
                                        {option.iconUrl ? (
                                          <img
                                            src={option.iconUrl}
                                            alt=""
                                            className="h-4 w-4 rounded-sm"
                                          />
                                        ) : (
                                          <Globe size={14} className="text-gray-400" />
                                        )}
                                        {t(option.labelKey)}
                                      </span>
                                      {isActive && <Check size={14} className="text-primary-500" />}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                            <div className="h-px bg-gray-200 dark:bg-zinc-700/70" />
                            <button
                              type="button"
                              onClick={handleClearHomeSearch}
                              className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
                            >
                              <span>{t('common.close')}</span>
                            </button>
                          </div>
                        </div>
                        <div className="h-4 shrink-0" />
                      </DrawerContent>
                    </Drawer>
                  </div>

                  <div className="relative" ref={homeSpaceSelectorRef}>
                    <button
                      onClick={() => setIsHomeSpaceSelectorOpen(!isHomeSpaceSelectorOpen)}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                        isHomeSpaceAuto
                          ? 'text-gray-500 dark:text-gray-400'
                          : 'text-primary-500 bg-gray-100 dark:bg-zinc-800'
                      } hover:bg-gray-100 dark:hover:bg-zinc-800`}
                    >
                      <LayoutGrid size={18} />
                      <div className="hidden min-w-0 items-center gap-1 text-xs font-medium text-gray-900 md:flex dark:text-white">
                        {resolvedSpaceEmoji && (
                          <EmojiDisplay emoji={resolvedSpaceEmoji} size="1.15rem" />
                        )}
                        <span className="truncate">{resolvedSpaceLabel}</span>
                        {!showOnlySpaceLabel && (
                          <>
                            <span className="text-gray-400 select-none dark:text-gray-500">·</span>
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
                      <div className="absolute top-full left-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-[#202222]">
                        <div className="no-scrollbar max-h-[min(calc(100vh-140px),500px)] overflow-y-auto scroll-smooth">
                          {renderHomeSpaceMenuContent()}
                        </div>
                      </div>
                    )}
                  </div>

                  {isHomeMobile && (
                    <Drawer
                      open={isHomeSpaceSelectorOpen}
                      onOpenChange={setIsHomeSpaceSelectorOpen}
                    >
                      <DrawerContent className="max-h-[85vh] rounded-t-3xl border-t border-gray-200 bg-white dark:border-zinc-800 dark:bg-[#1E1E1E]">
                        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-zinc-800/50">
                          <div className="flex flex-col">
                            <h3 className="mb-1 text-base leading-none font-bold text-gray-900 dark:text-gray-100">
                              {t('homeView.spaces') + ' and ' + t('homeView.agents')}
                            </h3>
                          </div>
                          <button
                            onClick={() => setIsHomeSpaceSelectorOpen(false)}
                            className="-mr-2 rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-gray-200"
                          >
                            <X size={20} />
                          </button>
                        </div>
                        <div className="min-h-0 overflow-y-auto p-3">
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
                    className="bg-primary-500 hover:bg-primary-600 disabled:hover:bg-primary-500 rounded-full p-2 text-white transition-colors disabled:opacity-50"
                  >
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-1 grid w-full grid-cols-1 gap-4 px-0 md:grid-cols-2">
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
