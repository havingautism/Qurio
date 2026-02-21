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
import Sparkles from 'lucide-react/dist/esm/icons/sparkles'
import X from 'lucide-react/dist/esm/icons/x'
import Zap from 'lucide-react/dist/esm/icons/zap'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Drawer, DrawerContent } from '@/components/ui/drawer'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../App'
import DeepResearchCard from '../components/DeepResearchCard'
import ExpertModeCard from '../components/ExpertModeCard'
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
import { addConversationEvent } from '../lib/conversationsService'
import { providerSupportsSearch, resolveThinkingToggleRule } from '../lib/providers'
import { loadSettings } from '../lib/settings'
import { getSpaceDisplayLabel } from '../lib/spaceDisplay'
import { listSpaceAgents } from '../lib/spacesService'
import { listSpaceDocuments, setConversationDocuments } from '../lib/documentsService'
import { useDeepResearchGuide } from '../contexts/DeepResearchGuideContext'
import ExpertGuideModal from '../components/ExpertGuideModal'
import { splitTextWithUrls } from '../lib/urlHighlight'
import { listToolsViaBackend } from '../lib/backendClient'
import {
  loadTogglePreferences,
  persistSearchBackendPreference,
  persistSearchEnabledPreference,
  persistSearchToolsPreference,
  persistThinkingModePreference,
  persistThinkingPreference,
} from '../lib/togglePreferences'
import ColorBendsBackground from '../components/ui/ColorBendsBackground'
import { THEMES } from '../lib/themes'

const hexToRgb = hex => {
  const cleaned = String(hex || '')
    .trim()
    .replace('#', '')
  if (cleaned.length !== 6) return null
  const r = Number.parseInt(cleaned.slice(0, 2), 16)
  const g = Number.parseInt(cleaned.slice(2, 4), 16)
  const b = Number.parseInt(cleaned.slice(4, 6), 16)
  if ([r, g, b].some(v => Number.isNaN(v))) return null
  return { r, g, b }
}

const mixHex = (base, accent, weight = 0.3) => {
  const a = hexToRgb(base)
  const b = hexToRgb(accent)
  if (!a || !b) return base || accent
  const w = Math.max(0, Math.min(1, weight))
  const r = Math.round(a.r * (1 - w) + b.r * w)
  const g = Math.round(a.g * (1 - w) + b.g * w)
  const bVal = Math.round(a.b * (1 - w) + b.b * w)
  return `#${[r, g, bVal].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

const rgbToHsl = ({ r, g, b }) => {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0)
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  return { h: h * 60, s, l }
}

const hslToHex = ({ h, s, l }) => {
  const hue = ((h % 360) + 360) % 360
  if (s === 0) {
    const v = Math.round(l * 255)
    return `#${[v, v, v].map(n => n.toString(16).padStart(2, '0')).join('')}`
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hk = hue / 360
  const hueToRgb = t => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  const r = Math.round(hueToRgb(hk + 1 / 3) * 255)
  const g = Math.round(hueToRgb(hk) * 255)
  const b = Math.round(hueToRgb(hk - 1 / 3) * 255)
  return `#${[r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')}`
}

const shiftHexHue = (hex, deltaDeg, satBoost = 0, lightBoost = 0) => {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const hsl = rgbToHsl(rgb)
  return hslToHex({
    h: hsl.h + deltaDeg,
    s: Math.max(0, Math.min(1, hsl.s + satBoost)),
    l: Math.max(0, Math.min(1, hsl.l + lightBoost)),
  })
}

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

  const getInitialTogglePreferences = () => {
    try {
      return loadTogglePreferences()
    } catch {
      return {
        searchEnabled: null,
        thinkingEnabled: null,
        thinkingMode: null,
        searchBackend: null,
        searchTools: [],
      }
    }
  }

  const [settings, setSettings] = useState(loadSettings())
  const [isDarkMode, setIsDarkMode] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false,
  )
  const fileInputRef = useRef(null)

  // Homepage Input State
  const [homeInput, setHomeInput] = useState('')
  const homeInputParts = useMemo(() => splitTextWithUrls(homeInput), [homeInput])
  const [isHomeSearchActive, setIsHomeSearchActive] = useState(() => {
    const prefs = getInitialTogglePreferences()
    return Boolean(
      prefs.searchEnabled || prefs.searchBackend || (prefs.searchTools || []).length > 0,
    )
  })
  const [homeSearchBackend, setHomeSearchBackend] = useState(() => {
    const prefs = getInitialTogglePreferences()
    if (prefs.searchBackend) return prefs.searchBackend
    if (prefs.searchEnabled) return 'auto'
    return null
  })
  const [homeSearchTools, setHomeSearchTools] = useState(() => {
    const prefs = getInitialTogglePreferences()
    return Array.isArray(prefs.searchTools) ? prefs.searchTools : []
  })
  const [isHomeSearchMenuOpen, setIsHomeSearchMenuOpen] = useState(false)
  const [isHomeThinkingMenuOpen, setIsHomeThinkingMenuOpen] = useState(false)
  const [homeThinkingMode, setHomeThinkingMode] = useState(() => {
    const prefs = getInitialTogglePreferences()
    if (prefs.thinkingMode === 'smart' || prefs.thinkingMode === 'deep' || prefs.thinkingMode === 'fast') {
      return prefs.thinkingMode
    }
    return prefs.thinkingEnabled ? 'deep' : 'fast'
  })
  const [isExpertGuideOpen, setIsExpertGuideOpen] = useState(false)
  const [isCreatingExpertConversation, setIsCreatingExpertConversation] = useState(false)
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
  const homeThinkingMenuRef = useRef(null)
  const [homeSpaceDocuments, setHomeSpaceDocuments] = useState([])
  const [homeDocumentsLoading, setHomeDocumentsLoading] = useState(false)
  const [_homeSelectedDocumentIds, setHomeSelectedDocumentIds] = useState([])
  const homePreviousSpaceIdRef = useRef(null)
  const homeTextareaRef = useRef(null)
  const homeInputHighlightRef = useRef(null)

  useScrollLock(
    (isHomeSpaceSelectorOpen && isHomeMobile) ||
      (isHomeThinkingMenuOpen && isHomeMobile) ||
      isDeepResearchGuideOpen ||
      isExpertGuideOpen,
  )

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

  useEffect(() => {
    persistThinkingPreference(homeThinkingMode === 'deep')
    persistThinkingModePreference(homeThinkingMode)
  }, [homeThinkingMode])

  useEffect(() => {
    persistSearchEnabledPreference(isHomeSearchActive)
  }, [isHomeSearchActive])

  useEffect(() => {
    persistSearchBackendPreference(homeSearchBackend)
  }, [homeSearchBackend])

  useEffect(() => {
    persistSearchToolsPreference(homeSearchTools)
  }, [homeSearchTools])

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
    const root = document.documentElement
    const update = () => {
      setIsDarkMode(root.classList.contains('dark'))
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
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

  useEffect(() => {
    if (!isHomeThinkingMenuOpen || isHomeMobile) return
    const handleClickOutside = event => {
      if (homeThinkingMenuRef.current && !homeThinkingMenuRef.current.contains(event.target)) {
        setIsHomeThinkingMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isHomeThinkingMenuOpen, isHomeMobile])

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
    const resolvedThinkingMode = homeThinkingMode
    const resolvedThinkingActive = resolvedThinkingMode === 'deep'
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
          thinkingMode: resolvedThinkingMode,
          deepResearch: false,
          expertMode: false,
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

  const handleStartExpertConversation = async ({ question, space }) => {
    if (!question?.trim() || !space?.id || isCreatingExpertConversation) return
    setIsCreatingExpertConversation(true)
    try {
      const { data: conversation, error } = await createConversation({
        space_id: space.id,
        title: 'New Expert Conversation',
        api_provider: defaultAgent?.provider || '',
      })
      if (error || !conversation) {
        console.error('Failed to create expert conversation:', error)
        return
      }

      await addConversationEvent(conversation.id, 'expert_mode_start', {
        source: 'expert_entry',
        question: question.trim(),
        space_id: space.id,
      })

      navigate({
        to: '/expert/$conversationId',
        params: { conversationId: conversation.id },
        state: {
          initialMessage: question.trim(),
          initialToggles: {
            search: false,
            searchTool: [],
            searchBackend: null,
            thinking: false,
            deepResearch: false,
            expertMode: true,
            related: Boolean(settings.enableRelatedQuestions),
          },
          initialSpaceSelection: {
            mode: 'manual',
            space,
          },
          initialIsAgentAutoMode: true,
        },
      })
      setIsExpertGuideOpen(false)
    } catch (err) {
      console.error('Failed to start expert conversation:', err)
    } finally {
      setIsCreatingExpertConversation(false)
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
  const selectedHomeSearchBackendOption = useMemo(
    () => SEARCH_BACKEND_OPTIONS.find(option => option.id === homeSearchBackend) || null,
    [homeSearchBackend],
  )
  const activeTheme = THEMES[settings.themeColor] || THEMES['violet']
  const homeWaveColors = useMemo(() => {
    const p400 = activeTheme.colors['--color-primary-400']
    const p500 = activeTheme.colors['--color-primary-500']
    const p600 = activeTheme.colors['--color-primary-600']
    const p700 = activeTheme.colors['--color-primary-700'] || p600

    const base = isDarkMode ? p600 || p500 : p500 || p400
    const triadA = shiftHexHue(base, -38, isDarkMode ? 0.08 : 0.05, isDarkMode ? 0.06 : 0.1)
    const triadB = shiftHexHue(base, 0, isDarkMode ? 0.06 : 0.03, isDarkMode ? 0.02 : 0.08)
    const triadC = shiftHexHue(base, 42, isDarkMode ? 0.1 : 0.06, isDarkMode ? 0.04 : 0.1)

    const neonViolet = mixHex(triadA, '#8a5cff', isDarkMode ? 0.52 : 0.34)
    const neonRose = mixHex(triadB, '#ff5c7a', isDarkMode ? 0.46 : 0.3)
    const neonAqua = mixHex(triadC, '#00ffd1', isDarkMode ? 0.42 : 0.26)

    return isDarkMode
      ? [
          mixHex(mixHex(neonViolet, p700, 0.2), '#0b1020', 0.28),
          mixHex(mixHex(neonRose, p600, 0.2), '#0b1020', 0.32),
          mixHex(mixHex(neonAqua, p600, 0.18), '#0b1020', 0.3),
        ]
      : [
          mixHex(neonViolet, '#ffffff', 0.18),
          mixHex(neonRose, '#ffffff', 0.14),
          mixHex(neonAqua, '#ffffff', 0.12),
        ]
  }, [activeTheme, isDarkMode])
  useEffect(() => {
    if (!isHomeThinkingLocked) return
    setHomeThinkingMode(homeThinkingRule.isThinkingActive ? 'deep' : 'fast')
  }, [isHomeThinkingLocked, homeThinkingRule.isThinkingActive])

  const homeThinkingOptions = useMemo(
    () => [
      {
        id: 'smart',
        label: t('thinkingMode.smartLabel'),
        description: t('thinkingMode.smartDescription'),
        icon: Sparkles,
      },
      {
        id: 'deep',
        label: t('thinkingMode.deepLabel'),
        description: t('thinkingMode.deepDescription'),
        icon: Brain,
      },
      {
        id: 'fast',
        label: t('thinkingMode.fastLabel'),
        description: t('thinkingMode.fastDescription'),
        icon: Zap,
      },
    ],
    [t],
  )

  const selectedHomeThinkingOption =
    homeThinkingOptions.find(option => option.id === homeThinkingMode) || homeThinkingOptions[0]

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
    <div className="bg-background text-foreground relative isolate flex h-full flex-1 flex-col overflow-hidden transition-colors duration-300">
      {/* Aurora Background Effect */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none">
        <ColorBendsBackground
          className="h-full"
          colors={homeWaveColors}
          speed={0.2}
          rotation={0}
          autoRotate={0}
          scale={1}
          frequency={1}
          warpStrength={1}
          mouseInfluence={0.75}
          parallax={0.5}
          noise={0.08}
          blur={isDarkMode ? 5.2 : 3.2}
          transparent
        />
        <div
          aria-hidden="true"
          className={clsx(
            'absolute inset-0',
            isDarkMode
              ? 'bg-[linear-gradient(180deg,rgba(3,6,14,0.52)_0%,rgba(3,6,14,0.32)_35%,rgba(3,6,14,0.18)_100%)]'
              : 'bg-[linear-gradient(180deg,rgba(255,255,255,0.58)_0%,rgba(255,255,255,0.44)_40%,rgba(255,255,255,0.3)_100%)]',
          )}
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[350px]"
          style={{
            background: isDarkMode
              ? 'radial-gradient(47% 58% at 50% 34%, rgba(6,9,18,0.84) 0%, rgba(6,9,18,0.66) 38%, rgba(6,9,18,0.22) 68%, rgba(6,9,18,0) 100%)'
              : 'radial-gradient(47% 58% at 50% 34%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.78) 38%, rgba(255,255,255,0.34) 70%, rgba(255,255,255,0) 100%)',
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[360px] md:hidden dark:hidden"
          style={{
            background:
              'radial-gradient(52% 62% at 50% 30%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.9) 42%, rgba(255,255,255,0.48) 74%, rgba(255,255,255,0) 100%)',
          }}
        />
      </div>

      {/* Mobile Header for Home View: keep only sidebar button, matching chat header style */}
      <div className="pointer-events-none absolute top-0 right-0 left-0 z-30 flex w-full shrink-0 items-center p-4 md:hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-21 bg-gradient-to-b from-white/68 via-white/28 to-transparent [mask-image:linear-gradient(to_bottom,black_58%,transparent)] opacity-100 backdrop-blur-xl dark:from-zinc-950/68 dark:via-zinc-950/28"
        />
        <div className="pointer-events-auto flex w-full items-center">
          <button
            onClick={toggleSidebar}
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gray-200/50 bg-white/90 p-0 leading-none text-gray-600 shadow-sm backdrop-blur-xl transition-all hover:bg-white hover:shadow-md dark:border-zinc-800/50 dark:bg-zinc-900/90 dark:text-gray-300 dark:hover:bg-zinc-900"
          >
            <Menu size={21} className="block" />
          </button>
        </div>
      </div>

      <div
        ref={homeContainerRef}
        className={clsx(
          'flex h-full flex-1 flex-col items-center overflow-y-auto p-4 pt-16 transition-all duration-300 md:pt-4',
          isSidebarPinned ? 'md:ml-72' : 'md:ml-16',
        )}
      >
        {/* Main Container */}
        <div className="flex w-full max-w-5xl flex-col items-center gap-4 pb-4 sm:mt-12 sm:gap-8">
          <div className="mb-2 block rounded-3xl p-4 sm:hidden">
            <div className="relative flex items-center justify-center">
              <div
                aria-hidden="true"
                className="absolute inset-0 rounded-[28px] bg-white/78 blur-2xl dark:hidden"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 rounded-[28px] bg-white/62 [mask-image:radial-gradient(circle_at_center,black_52%,transparent_100%)] dark:hidden"
              />
              <Logo size={128} className="relative z-10 text-gray-900 dark:text-white" priority />
            </div>
          </div>
          {/* Title */}
          <h1 className="home-title mt-0 mb-4 text-center font-serif! text-3xl font-medium text-gray-700 sm:mb-8 md:text-5xl dark:text-white">
            {t('app.tagline')}
          </h1>

          {/* Search Box */}
          <div className="home-search-box group relative z-20 w-full max-w-3xl">
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
                  <div className="relative" ref={homeThinkingMenuRef}>
                    <button
                      disabled={isHomeThinkingLocked}
                      onClick={() => {
                        if (isHomeThinkingLocked) return
                        setIsHomeThinkingMenuOpen(prev => !prev)
                      }}
                      className={`flex items-center gap-2 rounded-lg p-2 text-xs font-medium transition-colors ${
                        homeThinkingMode !== 'fast'
                          ? 'text-primary-500 bg-gray-100 dark:bg-zinc-800'
                          : 'text-gray-500 dark:text-gray-400'
                      } ${isHomeThinkingLocked ? 'cursor-not-allowed opacity-60' : 'hover:bg-gray-100 dark:hover:bg-zinc-800'}`}
                    >
                      <Brain size={18} />
                      <span className="hidden md:inline">{selectedHomeThinkingOption?.label}</span>
                      <ChevronDown
                        size={14}
                        className={clsx(
                          'transition-transform',
                          isHomeThinkingMenuOpen && 'rotate-180',
                        )}
                      />
                    </button>
                    {isHomeThinkingMenuOpen && !isHomeMobile && (
                      <div className="absolute top-full left-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-[#202222]">
                        <div className="space-y-1 p-2">
                          {homeThinkingOptions.map(option => {
                            const isActive = option.id === homeThinkingMode
                            const OptionIcon = option.icon || Brain
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => {
                                  setHomeThinkingMode(option.id)
                                  setIsHomeThinkingMenuOpen(false)
                                }}
                                className={clsx(
                                  'flex w-full items-start justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800',
                                  isActive
                                    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                                    : 'text-gray-700 dark:text-gray-200',
                                )}
                              >
                                <span className="flex items-start gap-2.5">
                                  <span
                                    className={clsx(
                                      'mt-0.5 rounded-md p-1',
                                      isActive
                                        ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400'
                                        : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400',
                                    )}
                                  >
                                    <OptionIcon size={14} />
                                  </span>
                                  <span className="flex flex-col">
                                    <span className="font-medium">{option.label}</span>
                                    <span className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                      {option.description}
                                    </span>
                                  </span>
                                </span>
                                {isActive && <Check size={14} className="mt-0.5 text-primary-500" />}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    <Drawer
                      open={isHomeThinkingMenuOpen && isHomeMobile}
                      onOpenChange={setIsHomeThinkingMenuOpen}
                    >
                      <DrawerContent className="max-h-[55vh] rounded-t-3xl border-t border-gray-200 bg-white dark:border-zinc-800 dark:bg-[#1E1E1E]">
                        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-zinc-800/50">
                          <h3 className="text-base leading-none font-bold text-gray-900 dark:text-gray-100">
                            {t('homeView.think')}
                          </h3>
                          <button
                            onClick={() => setIsHomeThinkingMenuOpen(false)}
                            className="-mr-2 rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-gray-200"
                          >
                            <X size={20} />
                          </button>
                        </div>
                        <div className="min-h-0 overflow-y-auto p-3">
                          <div className="space-y-1.5">
                            {homeThinkingOptions.map(option => {
                              const isActive = option.id === homeThinkingMode
                              const OptionIcon = option.icon || Brain
                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => {
                                    setHomeThinkingMode(option.id)
                                    setIsHomeThinkingMenuOpen(false)
                                  }}
                                  className={clsx(
                                    'flex w-full items-start justify-between rounded-lg px-4 py-3 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800',
                                    isActive
                                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                                      : 'text-gray-700 dark:text-gray-200',
                                  )}
                                >
                                  <span className="flex items-start gap-2.5">
                                    <span
                                      className={clsx(
                                        'mt-0.5 rounded-md p-1',
                                        isActive
                                          ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400'
                                          : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400',
                                      )}
                                    >
                                      <OptionIcon size={14} />
                                    </span>
                                    <span className="flex flex-col">
                                      <span className="font-medium">{option.label}</span>
                                      <span className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                        {option.description}
                                      </span>
                                    </span>
                                  </span>
                                  {isActive && <Check size={14} className="text-primary-500" />}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        <div className="h-4 shrink-0" />
                      </DrawerContent>
                    </Drawer>
                  </div>
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
                      {isHomeSearchActive && homeSearchBackend === 'auto' ? (
                        <EmojiDisplay emoji={'✨'} size="1.1rem" />
                      ) : isHomeSearchActive && selectedHomeSearchBackendOption?.iconUrl ? (
                        <img
                          src={selectedHomeSearchBackendOption.iconUrl}
                          alt={t(selectedHomeSearchBackendOption.labelKey)}
                          className="h-[18px] w-[18px] rounded-sm"
                        />
                      ) : (
                        <Globe size={18} />
                      )}
                      <span className="hidden md:inline">{t('homeView.search')}</span>
                      <ChevronDown
                        size={14}
                        className={clsx('transition-transform', isHomeSearchMenuOpen && 'rotate-180')}
                      />
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
                                        <EmojiDisplay emoji={'✨'} size="1.1rem" />
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
                                        <EmojiDisplay emoji={'✨'} size="1.1rem" />
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
                                          <EmojiDisplay emoji={'✨'} size="1.1rem" />
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
                                          <EmojiDisplay emoji={'✨'} size="1.1rem" />
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
                      <ChevronDown
                        size={14}
                        className={clsx(
                          'transition-transform',
                          isHomeSpaceSelectorOpen && 'rotate-180',
                        )}
                      />
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

          <div className="mb-1 grid w-full grid-cols-1 gap-4 px-0 md:grid-cols-3">
            <DeepResearchCard onClick={openDeepResearchGuide} />
            <ExpertModeCard onClick={() => setIsExpertGuideOpen(true)} />
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

      <ExpertGuideModal
        isOpen={isExpertGuideOpen}
        onClose={() => setIsExpertGuideOpen(false)}
        spaces={spaces}
        loading={isCreatingExpertConversation}
        onStart={handleStartExpertConversation}
      />
    </div>
  )
}

export default React.memo(HomeView)
