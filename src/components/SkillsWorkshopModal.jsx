import React, { useState, useEffect } from 'react'
import {
  Plus,
  X,
  Pencil,
  Trash2,
  Check,
  AlertCircle,
  GraduationCap,
  Code,
  FileText,
  Sparkles,
  FileCheck,
  ArrowLeft,
  Settings,
  Github,
  ShieldAlert,
} from 'lucide-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { getBackendUrl, loadSettings } from '../lib/settings'
import { useAppContext } from '../App'
import { useToast } from '../contexts/ToastContext'
import { getModelsForProvider } from '../lib/models_api'
import { FALLBACK_MODEL_OPTIONS, PROVIDER_KEYS } from '../lib/modelConstants'
import { getPublicEnv } from '../lib/publicEnv'
import { getProvider } from '../lib/providers'
import { getModelIcon, getModelIconClassName, renderProviderIcon } from '../lib/modelIcons'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'

const SkillsWorkshopModal = ({ isOpen, onClose }) => {
  const { t } = useTranslation()
  const toast = useToast()
  const { showConfirmation } = useAppContext()

  const [skills, setSkills] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  // Form State
  const [isEditing, setIsEditing] = useState(false)
  const [isNew, setIsNew] = useState(false)
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    description: '',
    instructions: '',
  })
  const [isSaving, setIsSaving] = useState(false)

  // File Management State
  const [skillFiles, setSkillFiles] = useState([])
  const [activeFile, setActiveFile] = useState('SKILL.md')
  const [fileContent, setFileContent] = useState('')
  const [isLoadingFile, setIsLoadingFile] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [isCreatingFile, setIsCreatingFile] = useState(false)
  const [creatingFileType, setCreatingFileType] = useState(null) // 'script' | 'reference' | null
  const [stagedFiles, setStagedFiles] = useState({}) // path -> content cache for NEW skills
  const [skillEnvironment, setSkillEnvironment] = useState(null)
  const [isLoadingEnvironment, setIsLoadingEnvironment] = useState(false)
  const [dependencyName, setDependencyName] = useState('')
  const [isInstallingDependency, setIsInstallingDependency] = useState(false)

  // AI Skill Creator State
  const [isAIMode, setIsAIMode] = useState(false) // whether AI generator panel is visible
  const [aiPrompt, setAiPrompt] = useState('') // user's natural language description
  const [isGenerating, setIsGenerating] = useState(false) // generation in progress
  const [aiResult, setAiResult] = useState(null) // { skill_id, files_created } on success
  const [isGitImportMode, setIsGitImportMode] = useState(false)
  const [gitRepoUrl, setGitRepoUrl] = useState('')
  const [gitRef, setGitRef] = useState('')
  const [gitSkillPath, setGitSkillPath] = useState('')
  const [gitSkillId, setGitSkillId] = useState('')
  const [isImportingGit, setIsImportingGit] = useState(false)

  const [showAIConfig, setShowAIConfig] = useState(false)
  const [availableProviders, setAvailableProviders] = useState([])
  const [groupedModels, setGroupedModels] = useState({})
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [aiProvider, setAiProvider] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [aiModelSource, setAiModelSource] = useState('list') // 'list' | 'custom'
  const [aiCustomModel, setAiCustomModel] = useState('')

  useEffect(() => {
    if (isAIMode && availableProviders.length === 0) {
      loadKeysAndFetchModels()
    }
  }, [isAIMode])

  const loadKeysAndFetchModels = async () => {
    setIsLoadingModels(true)
    const settings = loadSettings()

    // Resolve the latest env vars
    const ENV_VARS = {
      openAIKey: getPublicEnv('PUBLIC_OPENAI_API_KEY'),
      googleApiKey: getPublicEnv('PUBLIC_GOOGLE_API_KEY'),
      siliconflowKey: getPublicEnv('PUBLIC_SILICONFLOW_API_KEY'),
      glmKey: getPublicEnv('PUBLIC_GLM_API_KEY'),
      deepseekKey: getPublicEnv('PUBLIC_DEEPSEEK_API_KEY'),
      volcengineKey: getPublicEnv('PUBLIC_VOLCENGINE_API_KEY'),
      modelscopeKey: getPublicEnv('PUBLIC_MODELSCOPE_API_KEY'),
      kimiKey: getPublicEnv('PUBLIC_KIMI_API_KEY'),
      nvidiaKey: getPublicEnv('PUBLIC_NVIDIA_API_KEY'),
      minimaxKey: getPublicEnv('PUBLIC_MINIMAX_API_KEY'),
    }

    const keys = {
      gemini: settings.googleApiKey,
      openai_compatibility: settings.OpenAICompatibilityKey,
      siliconflow: settings.SiliconFlowKey,
      glm: settings.GlmKey,
      deepseek: settings.DeepSeekKey,
      volcengine: settings.VolcengineKey,
      modelscope: settings.ModelScopeKey,
      kimi: settings.KimiKey,
      nvidia: settings.NvidiaKey,
      minimax: settings.MinimaxKey,
    }

    const enabledProviders = PROVIDER_KEYS.filter(key => {
      const hasApiKey =
        keys[key] ||
        ENV_VARS[`${key}Key`] ||
        ENV_VARS[`${key}ApiKey`] ||
        (key === 'gemini' && ENV_VARS.googleApiKey) ||
        (key === 'openai_compatibility' && (ENV_VARS.openAIKey || ENV_VARS.openaiKey))
      return hasApiKey
    })
    setAvailableProviders(enabledProviders)

    // Global Inheritance Logic
    const currentProvider = settings.skillGenProvider || settings.defaultModelProvider || ''
    const currentModel = settings.skillGenModel || settings.defaultModel || ''
    setAiProvider(currentProvider)
    setAiModel(currentModel)
    setAiModelSource(settings.skillGenModelSource || 'list')
    setAiCustomModel(settings.skillGenModelSource === 'custom' ? settings.skillGenModel || '' : '')

    if (currentProvider && currentProvider !== '__none__') {
      fetchModelsForProvider(currentProvider)
    }
    setIsLoadingModels(false)
  }

  const fetchModelsForProvider = async p => {
    if (!p || p === '__none__') return
    const settings = loadSettings()
    const providerCreds = {
      gemini: { apiKey: settings.googleApiKey },
      openai_compatibility: {
        apiKey: settings.OpenAICompatibilityKey,
        baseUrl: settings.OpenAICompatibilityUrl,
      },
      siliconflow: { apiKey: settings.SiliconFlowKey, baseUrl: 'https://api.siliconflow.cn/v1' },
      glm: { apiKey: settings.GlmKey },
      deepseek: {
        apiKey: settings.DeepSeekKey,
        baseUrl: getPublicEnv('PUBLIC_DEEPSEEK_BASE_URL') || 'https://api.deepseek.com/v1',
      },
      volcengine: {
        apiKey: settings.VolcengineKey,
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      },
      modelscope: { apiKey: settings.ModelScopeKey },
      kimi: { apiKey: settings.KimiKey },
      nvidia: { apiKey: settings.NvidiaKey, baseUrl: 'https://integrate.api.nvidia.com/v1' },
      minimax: { apiKey: settings.MinimaxKey, baseUrl: 'https://api.minimax.io/v1' },
    }

    try {
      const models = await getModelsForProvider(p, providerCreds[p] || {})
      setGroupedModels(prev => ({
        ...prev,
        [p]: models?.length ? models : FALLBACK_MODEL_OPTIONS[p] || [],
      }))
    } catch (e) {
      setGroupedModels(prev => ({
        ...prev,
        [p]: FALLBACK_MODEL_OPTIONS[p] || [],
      }))
    }
  }

  const handleAIProviderChange = val => {
    const p = val === '__none__' ? '' : val
    setAiProvider(p)
    setAiModel('')
    setAiCustomModel('')
    setAiModelSource('list')
    if (p) {
      fetchModelsForProvider(p)
    }
  }

  const handleSaveAIConfig = () => {
    const finalModel = aiModelSource === 'custom' ? aiCustomModel : aiModel
    const newSettings = {
      skillGenProvider: aiProvider,
      skillGenModel: finalModel,
      skillGenModelSource: aiModelSource,
    }
    const current = loadSettings()
    const updated = { ...current, ...newSettings }
    localStorage.setItem('app_settings', JSON.stringify(updated))
    setShowAIConfig(false)
    toast.success('AI Configuration saved')
  }

  const handleResetAIConfig = () => {
    const current = loadSettings()
    const updated = {
      ...current,
      skillGenProvider: '',
      skillGenModel: '',
      skillGenModelSource: 'list',
    }
    localStorage.setItem('app_settings', JSON.stringify(updated))
    setAiProvider(current.defaultModelProvider || '')
    setAiModel(current.defaultModel || '')
    setAiModelSource('list')
    setAiCustomModel('')
    toast.success('Reset to global defaults')
  }

  /**
   * Reads the selected provider + API key from current settings/session state,

   * calls POST /api/skills/generate, and on success refreshes the skill list.
   */
  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return

    const settings = loadSettings()
    // Resolve the latest env vars
    const ENV_VARS = {
      openAIKey: getPublicEnv('PUBLIC_OPENAI_API_KEY'),
      googleApiKey: getPublicEnv('PUBLIC_GOOGLE_API_KEY'),
      siliconflowKey: getPublicEnv('PUBLIC_SILICONFLOW_API_KEY'),
      glmKey: getPublicEnv('PUBLIC_GLM_API_KEY'),
      deepseekKey: getPublicEnv('PUBLIC_DEEPSEEK_API_KEY'),
      volcengineKey: getPublicEnv('PUBLIC_VOLCENGINE_API_KEY'),
      modelscopeKey: getPublicEnv('PUBLIC_MODELSCOPE_API_KEY'),
      kimiKey: getPublicEnv('PUBLIC_KIMI_API_KEY'),
      nvidiaKey: getPublicEnv('PUBLIC_NVIDIA_API_KEY'),
      minimaxKey: getPublicEnv('PUBLIC_MINIMAX_API_KEY'),
    }

    const provider = aiProvider || settings.defaultModelProvider || ''
    const model =
      aiModelSource === 'custom' ? aiCustomModel : aiModel || settings.defaultModel || ''

    if (!provider) {
      toast.error('Please select a provider or configure global default.')
      return
    }

    // Resolve credentials
    const credentials = {
      openai: { apiKey: settings.openaiApiKey || ENV_VARS.openAIKey },
      gemini: { apiKey: settings.googleApiKey || ENV_VARS.googleApiKey },
      openai_compatibility: {
        apiKey: settings.OpenAICompatibilityKey || ENV_VARS.openAIKey || ENV_VARS.openaiKey,
        baseUrl: settings.OpenAICompatibilityUrl,
      },
      siliconflow: {
        apiKey: settings.SiliconFlowKey || ENV_VARS.siliconflowKey,
        baseUrl: 'https://api.siliconflow.cn/v1',
      },
      glm: { apiKey: settings.GlmKey || ENV_VARS.glmKey },
      deepseek: {
        apiKey: settings.DeepSeekKey || ENV_VARS.deepseekKey,
        baseUrl: getPublicEnv('PUBLIC_DEEPSEEK_BASE_URL') || 'https://api.deepseek.com/v1',
      },
      volcengine: {
        apiKey: settings.VolcengineKey || ENV_VARS.volcengineKey,
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      },
      modelscope: { apiKey: settings.ModelScopeKey || ENV_VARS.modelscopeKey },
      kimi: { apiKey: settings.KimiKey || ENV_VARS.kimiKey },
      nvidia: {
        apiKey: settings.NvidiaKey || ENV_VARS.nvidiaKey,
        baseUrl: 'https://integrate.api.nvidia.com/v1',
      },
      minimax: {
        apiKey: settings.MinimaxKey || ENV_VARS.minimaxKey,
        baseUrl: 'https://api.minimax.io/v1',
      },
    }

    const creds = credentials[provider] || {}
    const apiKey = creds.apiKey

    if (!apiKey) {
      toast.error(
        t('agents.skills.aiConfigNoKey', 'No API key found. Configure one in Settings first.'),
      )
      return
    }

    setIsGenerating(true)
    setAiResult(null)
    try {
      const res = await fetch(`${getBackendUrl()}/api/skills/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-llm-api-key': apiKey,
        },
        body: JSON.stringify({
          prompt: aiPrompt.trim(),
          provider,
          base_url: creds.baseUrl,
          model,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setAiResult(data)
        toast.success(t('agents.skills.aiGenerateSuccess', 'Skill generated!'))
        // Refresh global skills list so new skill is immediately visible
        window.dispatchEvent(new CustomEvent('skills-changed'))
        fetchSkills()
      } else {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Generation failed')
      }
    } catch (err) {
      console.error(err)
      toast.error(
        err.message || t('agents.skills.aiGenerateError', 'Generation failed, please try again'),
      )
    } finally {
      setIsGenerating(false)
    }
  }

  const handleImportFromGit = async () => {
    if (!gitRepoUrl.trim()) {
      toast.error(
        t('agents.skills.gitImportRepoRequired', 'Please enter a Git repository URL first.'),
      )
      return
    }

    showConfirmation({
      title: t('agents.skills.gitImportConfirmTitle', 'Import third-party skill from Git?'),
      message: t(
        'agents.skills.gitImportConfirmMessage',
        'Third-party skills may contain unsafe instructions or scripts. Please verify the source and review imported files before use.',
      ),
      confirmText: t('agents.skills.gitImportBtn', 'Import from Git'),
      isDangerous: true,
      onConfirm: async () => {
        setIsImportingGit(true)
        try {
          const payload = {
            repo_url: gitRepoUrl.trim(),
          }
          if (gitRef.trim()) payload.ref = gitRef.trim()
          if (gitSkillPath.trim()) payload.skill_path = gitSkillPath.trim()
          if (gitSkillId.trim()) payload.skill_id = gitSkillId.trim()

          const res = await fetch(`${getBackendUrl()}/api/skills/import/git`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.detail || 'Failed to import skill from Git')
          }

          const data = await res.json()
          toast.success(
            t('agents.skills.gitImportSuccess', 'Imported skill: {{skillId}}', {
              skillId: data.id,
            }),
          )
          window.dispatchEvent(new CustomEvent('skills-changed'))
          await fetchSkills()
          setIsGitImportMode(false)
          setGitRepoUrl('')
          setGitRef('')
          setGitSkillPath('')
          setGitSkillId('')
        } catch (err) {
          console.error(err)
          toast.error(
            err.message || t('agents.skills.gitImportError', 'Failed to import skill from Git'),
          )
        } finally {
          setIsImportingGit(false)
        }
      },
    })
  }

  // Categorized Files
  const { scripts, references } = React.useMemo(() => {
    const s = skillFiles.filter(f => f.startsWith('scripts/'))
    const r = skillFiles.filter(f => f.startsWith('references/'))
    return { scripts: s, references: r }
  }, [skillFiles])

  // Fetch Skills
  const fetchSkills = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`${getBackendUrl()}/api/skills`)
      if (res.ok) {
        const data = await res.json()
        setSkills(data)
      } else {
        throw new Error('Failed to fetch skills')
      }
    } catch (err) {
      console.error(err)
      toast.error(t('agents.skills.loadError', 'Failed to load skills'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchSkills()
      setIsEditing(false)
    }
  }, [isOpen])

  const handleCreateNew = () => {
    setFormData({
      id: '',
      name: '',
      description: '',
      instructions: '# Instructions\n',
    })
    setIsNew(true)
    setIsEditing(true)
    setActiveFile('SKILL.md')
    setSkillFiles([])
    setStagedFiles({})
    setSkillEnvironment(null)
    setDependencyName('')
  }

  const handleEdit = async skillId => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/skills/${skillId}`)
      if (res.ok) {
        const data = await res.json()
        setFormData({
          id: data.id,
          name: data.name,
          description: data.description,
          instructions: data.instructions,
        })
        setIsNew(false)
        setIsEditing(true)
        setActiveFile('SKILL.md')
        setStagedFiles({}) // Clear any stale staged changes
        setDependencyName('')
        fetchSkillFiles(skillId)
        fetchSkillEnvironment(skillId)
      } else {
        throw new Error('Failed to fetch skill details')
      }
    } catch (err) {
      console.error(err)
      toast.error(t('agents.skills.detailsError', 'Failed to load skill details'))
    }
  }

  const fetchSkillFiles = async skillId => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/skills/${skillId}/files`)
      if (res.ok) {
        const data = await res.json()
        setSkillFiles(data.files || [])
      }
    } catch (err) {
      console.error('Failed to fetch skill files', err)
    }
  }

  const fetchSkillEnvironment = async skillId => {
    if (!skillId) {
      setSkillEnvironment(null)
      return
    }
    setIsLoadingEnvironment(true)
    try {
      const res = await fetch(`${getBackendUrl()}/api/skills/${skillId}/environment`)
      if (res.ok) {
        const data = await res.json()
        setSkillEnvironment(data)
      } else {
        throw new Error('Failed to fetch skill environment')
      }
    } catch (err) {
      console.error('Failed to fetch skill environment', err)
      setSkillEnvironment(null)
    } finally {
      setIsLoadingEnvironment(false)
    }
  }

  const handleInstallDependency = async () => {
    const skillId = formData.id?.trim()
    const packageName = dependencyName.trim()
    if (!skillId) {
      toast.error(t('agents.skills.idRequired', 'Please enter a Skill ID first'))
      return
    }
    if (isNew) {
      toast.error(
        t(
          'agents.skills.installDependencySaveFirst',
          'Save the skill first before installing dependencies.',
        ),
      )
      return
    }
    if (!/^[A-Za-z0-9-]+$/.test(packageName)) {
      toast.error(
        t(
          'agents.skills.installDependencyInvalid',
          'Package name may only contain letters, numbers, and hyphens.',
        ),
      )
      return
    }

    showConfirmation({
      title: t('agents.skills.installDependencyConfirmTitle', 'Install dependency?'),
      message: t(
        'agents.skills.installDependencyConfirmMessage',
        'This will create or reuse an isolated virtual environment for the skill and install the requested package.',
      ),
      confirmText: t('agents.skills.installDependencyBtn', 'Install'),
      onConfirm: async () => {
        setIsInstallingDependency(true)
        try {
          const res = await fetch(`${getBackendUrl()}/api/skills/${skillId}/dependencies/install`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ package_name: packageName }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            const detail = err?.detail
            const message =
              typeof detail === 'string'
                ? detail
                : detail?.message || 'Failed to install dependency'
            throw new Error(message)
          }
          const data = await res.json()
          toast.success(
            data.venv_created
              ? t(
                  'agents.skills.installDependencyCreated',
                  'Dependency installed and isolated environment created.',
                )
              : t('agents.skills.installDependencySuccess', 'Dependency installed successfully.'),
          )
          setDependencyName('')
          fetchSkillEnvironment(skillId)
        } catch (err) {
          console.error(err)
          toast.error(
            err.message ||
              t('agents.skills.installDependencyError', 'Failed to install dependency'),
          )
        } finally {
          setIsInstallingDependency(false)
        }
      },
    })
  }

  const loadFileContent = async (skillId, path) => {
    let latestStaged = { ...stagedFiles }

    // Sync current file to stagedFiles before switching away
    if (activeFile !== 'SKILL.md') {
      latestStaged[activeFile] = fileContent
      setStagedFiles(latestStaged)
    }

    if (path === 'SKILL.md') {
      setActiveFile(path)
      return
    }

    // Check if the file we are loading has a staged version
    if (latestStaged[path] !== undefined) {
      setFileContent(latestStaged[path])
      setActiveFile(path)
      return
    }

    setIsLoadingFile(true)
    try {
      const res = await fetch(
        `${getBackendUrl()}/api/skills/${skillId}/file?path=${encodeURIComponent(path)}`,
      )
      if (res.ok) {
        const data = await res.json()
        setFileContent(data.content || '')
        setActiveFile(path)
      } else {
        throw new Error('Failed to load file')
      }
    } catch (err) {
      console.error(err)
      toast.error('Failed to load file content')
    } finally {
      setIsLoadingFile(false)
    }
  }

  const handleSaveFileContent = async () => {
    if (activeFile === 'SKILL.md') return

    setStagedFiles(prev => ({ ...prev, [activeFile]: fileContent }))
    toast.success(t('agents.skills.fileStaged', 'Changes staged locally'))
  }

  const handleCreateFile = async e => {
    e.preventDefault()
    if (!newFileName.trim()) return

    const sanitizedName = newFileName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
    if (!sanitizedName) return

    let finalPath = sanitizedName
    let initialContent = ''

    if (creatingFileType === 'script') {
      if (!finalPath.endsWith('.py')) finalPath += '.py'
      finalPath = `scripts/${finalPath}`
      initialContent = '#!/usr/bin/env python3\n\n'
    } else if (creatingFileType === 'reference') {
      if (!finalPath.endsWith('.md')) finalPath += '.md'
      finalPath = `references/${finalPath}`
    }

    try {
      // ALWAYS STAGE LOCALLY FIRST
      let latestStaged = { ...stagedFiles }

      // 1. Sync current editor content before switching to the new file
      if (activeFile !== 'SKILL.md') {
        latestStaged[activeFile] = fileContent
      }

      // 2. Add the new file to the stage
      latestStaged[finalPath] = initialContent

      setSkillFiles(prev => [...prev, finalPath])
      setStagedFiles(latestStaged)
      setActiveFile(finalPath)
      setFileContent(initialContent)
      setIsCreatingFile(false)
      setCreatingFileType(null)
      setNewFileName('')
      toast.success(t('agents.skills.fileCreated', 'File created locally (Save Skill to commit)'))
    } catch (err) {
      console.error(err)
      toast.error(`Failed to create ${finalPath}`)
    }
  }

  const handleDeleteFile = async (path, e) => {
    e.stopPropagation()
    const proceed = async () => {
      // If it exists only in stagedFiles (and was never committed), just remove it
      const isStagedOnly = stagedFiles[path] !== undefined && !skillFiles.includes(path)

      if (isStagedOnly) {
        setSkillFiles(prev => prev.filter(f => f !== path))
        setStagedFiles(prev => {
          const next = { ...prev }
          delete next[path]
          return next
        })
        if (activeFile === path) setActiveFile('SKILL.md')
        toast.success(t('agents.skills.fileDeleted', 'File removed'))
        return
      }

      try {
        const res = await fetch(
          `${getBackendUrl()}/api/skills/${formData.id}/file?path=${encodeURIComponent(path)}`,
          { method: 'DELETE' },
        )
        if (res.ok) {
          toast.success(`Deleted ${path}`)
          setSkillFiles(prev => prev.filter(f => f !== path))
          setStagedFiles(prev => {
            const next = { ...prev }
            delete next[path]
            return next
          })
          if (activeFile === path) setActiveFile('SKILL.md')
        } else {
          throw new Error('Failed to delete file')
        }
      } catch (err) {
        console.error(err)
        toast.error(`Failed to delete ${path}`)
      }
    }
    showConfirmation({
      title: `Delete ${path}?`,
      message: 'This action cannot be undone.',
      confirmText: t('common.delete', 'Delete'),
      isDangerous: true,
      onConfirm: proceed,
    })
  }

  const handleDelete = skillId => {
    const proceed = async () => {
      try {
        const res = await fetch(`${getBackendUrl()}/api/skills/${skillId}`, {
          method: 'DELETE',
        })
        if (res.ok) {
          toast.success(t('agents.skills.deleteSuccess', 'Skill deleted successfully'))
          window.dispatchEvent(new CustomEvent('skills-changed'))
          fetchSkills()
        } else {
          throw new Error('Failed to delete skill')
        }
      } catch (err) {
        console.error(err)
        toast.error(t('agents.skills.deleteError', 'Failed to delete skill'))
      }
    }

    showConfirmation({
      title: t('agents.skills.deleteConfirmTitle', 'Delete Skill?'),
      message: t(
        'agents.skills.deleteConfirmMessage',
        'Are you sure you want to delete this skill? Default agents may break if relying on it.',
      ),
      confirmText: t('common.delete', 'Delete'),
      isDangerous: true,
      onConfirm: proceed,
    })
  }

  const handleSave = async (e, shouldClose = true, currentStagedFiles = stagedFiles) => {
    if (e) e.preventDefault()
    setIsSaving(true)

    // Mandatory Metadata Validation
    if (!formData.id.trim()) {
      toast.error(t('agents.skills.idRequired', 'Skill ID is required'))
      setIsSaving(false)
      return
    }
    if (!formData.name.trim()) {
      toast.error(t('agents.skills.nameRequired', 'Display Name is required'))
      setIsSaving(false)
      return
    }
    if (!formData.description.trim()) {
      toast.error(t('agents.skills.descriptionRequired', 'Short Description is required'))
      setIsSaving(false)
      return
    }
    if (!formData.instructions.trim() || formData.instructions.trim() === '# Instructions') {
      toast.error(t('agents.skills.instructionsRequired', 'System Instructions are required'))
      setIsSaving(false)
      return
    }

    const cleanId = formData.id.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    if (!/^[a-z0-9-]+$/.test(cleanId) || cleanId.length > 64) {
      toast.error(
        t(
          'agents.skills.invalidId',
          'Skill ID must be 1-64 characters, lowercase, alphanumeric, and hyphens only',
        ),
      )
      setIsSaving(false)
      return
    }

    if (formData.description.length > 1024) {
      toast.error(t('agents.skills.descTooLong', 'Description must be 1024 characters or less'))
      setIsSaving(false)
      return
    }

    try {
      const method = isNew ? 'POST' : 'PUT'
      const url = isNew
        ? `${getBackendUrl()}/api/skills`
        : `${getBackendUrl()}/api/skills/${cleanId}`

      const payload = isNew
        ? {
            id: cleanId,
            name: formData.name || cleanId,
            description: formData.description,
            instructions: formData.instructions,
          }
        : {
            name: formData.name || cleanId,
            description: formData.description,
            instructions: formData.instructions,
          }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        toast.success(t('agents.skills.saveSuccess', 'Skill saved successfully'))

        // Dispatch global event to refresh other components
        window.dispatchEvent(new CustomEvent('skills-changed'))

        // Always push all staged files on successful metadata save
        const stagedEntries = Object.entries(currentStagedFiles)
        if (stagedEntries.length > 0) {
          try {
            await Promise.all(
              stagedEntries.map(([path, content]) =>
                fetch(`${getBackendUrl()}/api/skills/${cleanId}/file`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ path, content }),
                }),
              ),
            )
            setStagedFiles({}) // Clear after successful commit
          } catch (fileErr) {
            console.error('Failed to save some files', fileErr)
            toast.error('Skill saved, but some files failed to upload')
          }
        }

        fetchSkills()
        if (cleanId) {
          fetchSkillEnvironment(cleanId)
        }
        if (shouldClose) onClose()
      } else {
        const errData = await res.json()
        throw new Error(errData.detail || 'Save failed')
      }
    } catch (err) {
      console.error(err)
      toast.error(err.message || t('agents.skills.saveError', 'Failed to save skill'))
    } finally {
      setIsSaving(false)
    }
  }

  const saveCombined = async e => {
    if (e) e.preventDefault()

    let finalStaged = { ...stagedFiles }
    // If we are editing a file, include its current content in the save
    if (activeFile !== 'SKILL.md') {
      finalStaged[activeFile] = fileContent
      // Also update the state for UI consistency
      setStagedFiles(finalStaged)
    }

    // Now save everything (metadata + correctly calculated staged files) and close
    await handleSave(e, true, finalStaged)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="glass-elite-panel relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border-none shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-black/5 px-6 py-4 dark:border-white/5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {isEditing
                ? isNew
                  ? t('agents.skills.createNew', 'Create New Skill')
                  : t('agents.skills.editSkill', 'Edit Skill')
                : t('agents.tabs.skills', 'Skills Workshop')}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {isEditing
                ? t(
                    'agents.skills.editDesc',
                    'Define the system instructions and capabilities for this skill',
                  )
                : t(
                    'agents.skills.workshopDesc',
                    'Create macro-skills that can be attached to any Agent context',
                  )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-gray-300"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Area */}
        <div className="no-scrollbar flex-1 overflow-y-auto bg-transparent">
          {isEditing ? (
            <div className="flex h-full min-h-[500px]">
              {/* Left Sidebar for Files */}
              <div className="no-scrollbar flex w-64 shrink-0 flex-col overflow-y-auto border-r border-black/5 bg-transparent p-4 dark:border-white/5">
                {/* General Header (SKILL.md) */}
                <div className="mb-6">
                  <button
                    onClick={() => loadFileContent(formData.id, 'SKILL.md')}
                    className={clsx(
                      'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all',
                      activeFile === 'SKILL.md'
                        ? 'bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400 font-medium'
                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-zinc-800',
                    )}
                  >
                    <GraduationCap size={16} />
                    <span>SKILL.md</span>
                  </button>
                </div>

                {/* Scripts Section */}
                <div className="mb-6">
                  <div className="mb-2 flex items-center justify-between px-2">
                    <h3 className="text-xs font-bold tracking-wider text-gray-400 uppercase dark:text-zinc-500">
                      Scripts
                    </h3>
                    <button
                      onClick={() => {
                        if (isNew && !formData.id.trim()) {
                          toast.error(
                            t('agents.skills.idRequired', 'Please enter a Skill ID first'),
                          )
                          return
                        }
                        setIsCreatingFile(true)
                        setCreatingFileType('script')
                      }}
                      className="rounded-md p-0.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-gray-300"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  {isCreatingFile && creatingFileType === 'script' && (
                    <form onSubmit={handleCreateFile} className="mb-2 px-2">
                      <div className="flex items-center gap-1 rounded border-none bg-black/5 p-1 dark:bg-white/5">
                        <input
                          autoFocus
                          type="text"
                          value={newFileName}
                          onChange={e => setNewFileName(e.target.value)}
                          placeholder="filename"
                          className="w-full bg-transparent px-1 py-0.5 text-xs outline-none dark:text-white"
                        />
                        <button type="submit" className="text-primary-500 hover:text-primary-600">
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsCreatingFile(false)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </form>
                  )}

                  <ul className="space-y-0.5">
                    {scripts.map(file => (
                      <li key={file} className="group relative px-1">
                        <button
                          onClick={() => loadFileContent(formData.id, file)}
                          className={clsx(
                            'flex w-full items-center gap-2 truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                            activeFile === file
                              ? 'text-primary-600 dark:text-primary-400 bg-black/5 font-medium dark:bg-white/10'
                              : 'text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/5',
                          )}
                        >
                          <Code size={14} className="shrink-0 opacity-60" />
                          <span className="truncate">{file.replace('scripts/', '')}</span>
                        </button>
                        <button
                          className="absolute top-1.5 right-2 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                          onClick={e => handleDeleteFile(file, e)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </li>
                    ))}
                    {scripts.length === 0 && !isCreatingFile && (
                      <p className="px-2 py-1 text-[10px] text-gray-400 dark:text-zinc-600">
                        No scripts added
                      </p>
                    )}
                  </ul>
                </div>

                {/* References Section */}
                <div className="mb-6">
                  <div className="mb-2 flex items-center justify-between px-2">
                    <h3 className="text-xs font-bold tracking-wider text-gray-400 uppercase dark:text-zinc-500">
                      References
                    </h3>
                    <button
                      onClick={() => {
                        if (isNew && !formData.id.trim()) {
                          toast.error(
                            t('agents.skills.idRequired', 'Please enter a Skill ID first'),
                          )
                          return
                        }
                        setIsCreatingFile(true)
                        setCreatingFileType('reference')
                      }}
                      className="rounded-md p-0.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-gray-300"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  {isCreatingFile && creatingFileType === 'reference' && (
                    <form onSubmit={handleCreateFile} className="mb-2 px-2">
                      <div className="flex items-center gap-1 rounded border-none bg-black/5 p-1 dark:bg-white/5">
                        <input
                          autoFocus
                          type="text"
                          value={newFileName}
                          onChange={e => setNewFileName(e.target.value)}
                          placeholder="filename"
                          className="w-full bg-transparent px-1 py-0.5 text-xs outline-none dark:text-white"
                        />
                        <button type="submit" className="text-primary-500 hover:text-primary-600">
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsCreatingFile(false)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </form>
                  )}

                  <ul className="space-y-0.5">
                    {references.map(file => (
                      <li key={file} className="group relative px-1">
                        <button
                          onClick={() => loadFileContent(formData.id, file)}
                          className={clsx(
                            'flex w-full items-center gap-2 truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                            activeFile === file
                              ? 'text-primary-600 dark:text-primary-400 bg-black/5 font-medium dark:bg-white/10'
                              : 'text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/5',
                          )}
                        >
                          <FileText size={14} className="shrink-0 opacity-60" />
                          <span className="truncate">{file.replace('references/', '')}</span>
                        </button>
                        <button
                          className="absolute top-1.5 right-2 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                          onClick={e => handleDeleteFile(file, e)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </li>
                    ))}
                    {references.length === 0 && !isCreatingFile && (
                      <p className="px-2 py-1 text-[10px] text-gray-400 dark:text-zinc-600">
                        No references added
                      </p>
                    )}
                  </ul>
                </div>
              </div>

              {/* Main Content Area */}
              <div className="flex flex-1 flex-col overflow-y-auto p-6">
                {activeFile === 'SKILL.md' ? (
                  <form
                    id="skill-form"
                    onSubmit={handleSave}
                    className="flex flex-1 flex-col space-y-6"
                  >
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('agents.skills.idLabel', 'Skill ID (Internal Name)')}
                        </label>
                        <input
                          type="text"
                          required
                          disabled={!isNew}
                          value={formData.id}
                          onChange={e => {
                            const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')
                            if (val.length <= 64) {
                              setFormData({ ...formData, id: val })
                            }
                          }}
                          placeholder="e.g. pirate-greeter"
                          className="focus:ring-primary-500/20 w-full rounded-xl border-none bg-black/5 px-4 py-2.5 text-sm transition-all outline-none placeholder:text-gray-400 focus:ring-2 disabled:bg-gray-50/10 disabled:opacity-50 dark:bg-white/5 dark:placeholder:text-zinc-600"
                        />
                        {isNew && (
                          <p className="text-[10px] text-gray-500">
                            Lowercase, alphanumeric, and hyphens only (max 64 chars).
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('agents.skills.nameLabel', 'Display Name')}
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={e => setFormData({ ...formData, name: e.target.value })}
                          placeholder="e.g. Pirate Greeter"
                          className="focus:ring-primary-500/20 w-full rounded-xl border-none bg-black/5 px-4 py-2.5 text-sm transition-all outline-none placeholder:text-gray-400 focus:ring-2 dark:bg-white/5"
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-black/5 bg-black/5 p-4 dark:border-white/5 dark:bg-white/5">
                      <div className="mb-3 flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                            {t('agents.skills.environmentTitle', 'Runtime Environment')}
                          </h3>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {t(
                              'agents.skills.environmentDesc',
                              'Manage an isolated virtual environment for scripts generated by this skill.',
                            )}
                          </p>
                        </div>
                        {!isNew && formData.id && (
                          <button
                            type="button"
                            onClick={() => fetchSkillEnvironment(formData.id)}
                            disabled={isLoadingEnvironment}
                            className="rounded-lg border border-black/5 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/5 dark:text-gray-300 dark:hover:bg-white/5"
                          >
                            {isLoadingEnvironment
                              ? t('common.loading', 'Loading...')
                              : t('common.refresh', 'Refresh')}
                          </button>
                        )}
                      </div>

                      {isNew ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t(
                            'agents.skills.environmentSaveFirst',
                            'Save the skill first to create or inspect its isolated environment.',
                          )}
                        </p>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span
                              className={clsx(
                                'rounded-full px-2.5 py-1 font-medium',
                                skillEnvironment?.venv_exists
                                  ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400'
                                  : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
                              )}
                            >
                              {skillEnvironment?.venv_exists
                                ? t('agents.skills.environmentReady', 'Environment ready')
                                : t('agents.skills.environmentMissing', 'Environment not created')}
                            </span>
                            {skillEnvironment?.scripts_dir_exists && (
                              <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                                {t('agents.skills.environmentScriptsPresent', 'Scripts folder found')}
                              </span>
                            )}
                          </div>

                          <div className="rounded-xl bg-white/70 px-3 py-2 text-xs text-gray-600 dark:bg-black/10 dark:text-gray-300">
                            <span className="font-medium text-gray-700 dark:text-gray-200">
                              {t('agents.skills.environmentPython', 'Python path')}
                              {': '}
                            </span>
                            <span className="font-mono break-all">
                              {skillEnvironment?.python_path ||
                                t('agents.skills.environmentPythonPending', 'Will be created on first install')}
                            </span>
                          </div>

                          <div className="flex flex-col gap-3 sm:flex-row">
                            <input
                              type="text"
                              value={dependencyName}
                              onChange={e => setDependencyName(e.target.value)}
                              placeholder={t(
                                'agents.skills.installDependencyPlaceholder',
                                'e.g. requests',
                              )}
                              className="focus:ring-primary-500/20 h-10 flex-1 rounded-xl border-none bg-white/80 px-4 text-sm outline-none placeholder:text-gray-400 focus:ring-2 dark:bg-black/10 dark:text-white dark:placeholder:text-zinc-500"
                            />
                            <button
                              type="button"
                              onClick={handleInstallDependency}
                              disabled={isInstallingDependency || !dependencyName.trim()}
                              className="bg-primary-500 hover:bg-primary-600 flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isInstallingDependency ? (
                                <>
                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                  {t('agents.skills.installDependencyInstalling', 'Installing...')}
                                </>
                              ) : (
                                <>
                                  <Settings size={14} />
                                  {t('agents.skills.installDependencyBtn', 'Install Dependency')}
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('agents.skills.descLabel', 'Short Description')}
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.description}
                        onChange={e => {
                          if (e.target.value.length <= 1024) {
                            setFormData({ ...formData, description: e.target.value })
                          }
                        }}
                        placeholder="Describes what this skill does briefly"
                        className="focus:ring-primary-500/20 w-full rounded-xl border-none bg-black/5 px-4 py-2.5 text-sm transition-all outline-none placeholder:text-gray-400 focus:ring-2 dark:bg-white/5"
                      />
                      <p className="text-right text-[10px] text-gray-400">
                        {formData.description.length}/1024
                      </p>
                    </div>

                    <div className="flex min-h-[300px] flex-1 flex-col space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('agents.skills.instructionsLabel', 'System Instructions (Markdown)')}
                        </label>
                      </div>
                      <textarea
                        required
                        value={formData.instructions}
                        onChange={e => setFormData({ ...formData, instructions: e.target.value })}
                        placeholder="You are an expert at..."
                        className="focus:ring-primary-500/20 min-h-[300px] w-full flex-1 resize-none rounded-xl border-none bg-black/5 p-4 font-mono text-sm transition-all outline-none placeholder:text-gray-400 focus:ring-2 dark:bg-white/5"
                      />
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-1 flex-col">
                    <h3 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">
                      {activeFile}
                    </h3>
                    {isLoadingFile ? (
                      <div className="flex flex-1 items-center justify-center">
                        <div className="border-primary-500 h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"></div>
                      </div>
                    ) : (
                      <textarea
                        value={fileContent}
                        onChange={e => setFileContent(e.target.value)}
                        className="focus:ring-primary-500/20 w-full flex-1 resize-none rounded-xl border-none bg-black/5 p-4 font-mono text-sm transition-all outline-none focus:ring-2 dark:bg-white/5"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : isAIMode ? (
            /* ── AI Skill Creator Panel ─────────────────────────────────────── */
            <div className="flex flex-1 flex-col p-6">
              {/* Panel Header */}
              <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setIsAIMode(false)
                      setAiResult(null)
                      setAiPrompt('')
                    }}
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-gray-300"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {t('agents.skills.aiGenerateTitle', 'Generate Skill with AI')}
                    </h3>
                    <p className="text-xs text-gray-400 dark:text-zinc-500">
                      {t(
                        'agents.skills.aiGenerateSubtitle',
                        'Powered by your configured AI provider',
                      )}
                    </p>
                  </div>
                </div>

                {/* Settings Configuration Button */}
                <button
                  onClick={() => setShowAIConfig(true)}
                  className="flex h-9 items-center gap-2 rounded-xl border border-black/5 px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-black/5 dark:border-white/5 dark:text-gray-300 dark:hover:bg-white/5"
                >
                  <Settings size={16} />
                  {getProvider(aiProvider)?.name || t('settings.email.provider', 'Provider')}
                </button>
              </div>

              {/* AI Config Dialog */}
              <Dialog open={showAIConfig} onOpenChange={open => !open && setShowAIConfig(false)}>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle className="text-gray-900 dark:text-gray-100">
                      {t('settings.modelConfig', 'Model Configuration')}
                    </DialogTitle>
                    <DialogDescription className="text-gray-500 dark:text-gray-400">
                      {t(
                        'agents.skills.aiConfigDesc',
                        'Select the AI model specifically for generating this skill. Provider list based on your API keys.',
                      )}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="py-2">
                    {isLoadingModels ? (
                      <div className="flex items-center justify-center p-4">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-primary-500)] border-t-transparent" />
                      </div>
                    ) : availableProviders.length === 0 ? (
                      <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                        {t(
                          'agents.skills.aiConfigNoKey',
                          'Configure an API key in Settings first.',
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex flex-col gap-2">
                          <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                            {t('settings.email.provider', 'Provider')}
                          </span>
                          <Select
                            value={aiProvider || '__none__'}
                            onValueChange={handleAIProviderChange}
                          >
                            <SelectTrigger className="h-10 w-full rounded-xl border-none bg-black/5 focus-visible:ring-1 focus-visible:ring-black/10 dark:bg-white/5 dark:focus-visible:ring-white/10">
                              <SelectValue
                                placeholder={t('settings.inheritGlobal', 'Inherit Global')}
                              >
                                {aiProvider ? (
                                  <div className="flex items-center gap-2">
                                    {renderProviderIcon(aiProvider, { size: 16 })}
                                    <span>{getProvider(aiProvider)?.name || aiProvider}</span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400">
                                    {t('settings.inheritGlobal', 'Inherit Global')}
                                  </span>
                                )}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="z-[300] min-w-[200px] overflow-hidden rounded-xl border border-black/10 bg-white p-1 shadow-2xl dark:border-white/10 dark:bg-zinc-900">
                              {availableProviders.map(provKey => {
                                const config = getProvider(provKey)
                                return (
                                  <SelectItem key={provKey} value={provKey}>
                                    <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                                      {renderProviderIcon(provKey, { size: 16 })}
                                      <span>{config?.name || provKey}</span>
                                    </div>
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                              {t('settings.email.model', 'Model')}
                            </span>
                            {aiProvider && (
                              <button
                                onClick={() =>
                                  setAiModelSource(s => (s === 'custom' ? 'list' : 'custom'))
                                }
                                className="text-xs text-[var(--color-primary-500)] hover:underline"
                              >
                                {aiModelSource === 'custom'
                                  ? t('settings.selectFromList', 'Select from List')
                                  : t('settings.manualInput', 'Manual Input')}
                              </button>
                            )}
                          </div>

                          {aiModelSource === 'custom' ? (
                            <input
                              value={aiCustomModel}
                              onChange={e => setAiCustomModel(e.target.value)}
                              placeholder={t('settings.inputModelName', 'Input model name...')}
                              className="h-10 w-full rounded-xl border-none bg-black/5 px-4 text-sm outline-none focus-visible:ring-1 focus-visible:ring-black/10 dark:bg-white/5 dark:focus-visible:ring-white/10"
                            />
                          ) : (
                            <Select value={aiModel} onValueChange={val => setAiModel(val)}>
                              <SelectTrigger className="h-10 w-full rounded-xl border-none bg-black/5 focus-visible:ring-1 focus-visible:ring-black/10 dark:bg-white/5 dark:focus-visible:ring-white/10">
                                <SelectValue
                                  placeholder={t('settings.selectModel', 'Select Model')}
                                >
                                  {isLoadingModels ? (
                                    <div className="flex items-center gap-2">
                                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-primary-500)] border-t-transparent" />
                                      <span className="text-gray-400">
                                        {t('settings.loadingModels', 'Loading models...')}
                                      </span>
                                    </div>
                                  ) : aiModel ? (
                                    <div className="flex items-center gap-2 truncate">
                                      {getModelIcon(aiModel) && (
                                        <img
                                          src={getModelIcon(aiModel)}
                                          alt=""
                                          className={clsx(
                                            'h-4 w-4 shrink-0',
                                            getModelIconClassName(aiModel),
                                          )}
                                        />
                                      )}
                                      <span className="truncate text-gray-900 dark:text-gray-100">
                                        {(
                                          groupedModels[aiProvider] ||
                                          FALLBACK_MODEL_OPTIONS[aiProvider] ||
                                          []
                                        ).find(m => (m.id || m.value) === aiModel)?.name ||
                                          (
                                            groupedModels[aiProvider] ||
                                            FALLBACK_MODEL_OPTIONS[aiProvider] ||
                                            []
                                          ).find(m => (m.id || m.value) === aiModel)?.label ||
                                          aiModel}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-gray-400">
                                      {t('settings.selectModel', 'Select Model')}
                                    </span>
                                  )}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent className="z-[300] min-w-[200px] overflow-hidden rounded-xl border border-black/10 bg-white p-1 shadow-2xl dark:border-white/10 dark:bg-zinc-900">
                                <SelectGroup>
                                  {(
                                    groupedModels[aiProvider] ||
                                    FALLBACK_MODEL_OPTIONS[aiProvider] ||
                                    []
                                  ).map(m => {
                                    const mId = m.id || m.value
                                    const mName = m.name || m.label
                                    return (
                                      <SelectItem key={mId} value={mId}>
                                        <div className="flex items-center gap-2 truncate text-gray-900 dark:text-gray-100">
                                          {getModelIcon(mId) && (
                                            <img
                                              src={getModelIcon(mId)}
                                              alt=""
                                              className={clsx(
                                                'h-4 w-4 shrink-0',
                                                getModelIconClassName(mId),
                                              )}
                                            />
                                          )}
                                          <span className="truncate">{mName || mId}</span>
                                        </div>
                                      </SelectItem>
                                    )
                                  })}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <DialogFooter className="mt-4 flex w-full items-center gap-2 sm:justify-between">
                    <button
                      onClick={handleResetAIConfig}
                      className="h-10 flex-1 rounded-xl border border-black/5 text-sm font-medium text-gray-600 transition-colors hover:bg-black/5 dark:border-white/5 dark:text-gray-300 dark:hover:bg-white/5"
                    >
                      {t('settings.resetToGlobal', 'Reset to Global')}
                    </button>
                    <button
                      onClick={handleSaveAIConfig}
                      disabled={isLoadingModels}
                      className="h-10 flex-1 rounded-xl bg-zinc-900 text-sm font-medium text-white shadow-md transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      {t('common.save', 'Save')}
                    </button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {aiResult ? (
                /* ── Success State ──────────────────────────────────────────── */
                <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50 dark:bg-green-500/10">
                    <FileCheck size={32} className="text-green-500" />
                  </div>
                  <div>
                    <h4 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
                      {t('agents.skills.aiGenerateSuccess', 'Skill generated!')}
                    </h4>
                    <p className="font-mono text-sm text-gray-400">{aiResult.skill_id}</p>
                  </div>

                  {/* Files Created List */}
                  <div className="w-full max-w-sm rounded-xl bg-black/5 p-4 text-left dark:bg-white/5">
                    <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                      {t('agents.skills.aiGenerateFiles', 'Files created')}
                    </p>
                    <ul className="space-y-1">
                      {aiResult.files_created.map(f => (
                        <li
                          key={f}
                          className="flex items-center gap-2 font-mono text-xs text-gray-700 dark:text-gray-300"
                        >
                          <FileText size={12} className="shrink-0 text-gray-400" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setIsAIMode(false)
                        setAiResult(null)
                        setAiPrompt('')
                      }}
                      className="rounded-xl bg-black/5 px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-black/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                    >
                      {t('agents.skills.aiGenerateBack', 'Back to list')}
                    </button>
                    <button
                      onClick={() => {
                        setIsAIMode(false)
                        setAiResult(null)
                        setAiPrompt('')
                        handleEdit(aiResult.skill_id)
                      }}
                      className="bg-primary-500 hover:bg-primary-600 flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
                    >
                      <Pencil size={14} />
                      {t('agents.skills.aiGenerateOpenEditor', 'Open in Editor')}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Input State ────────────────────────────────────────────── */
                <div className="flex flex-1 flex-col gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('agents.skills.aiGeneratePromptLabel', 'Describe the Skill you want')}
                    </label>
                    <textarea
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                      placeholder={t(
                        'agents.skills.aiGeneratePromptPlaceholder',
                        'e.g. Create a skill that makes the agent always give a 3-point summary',
                      )}
                      rows={6}
                      className="focus:ring-primary-500/20 w-full resize-none rounded-xl border-none bg-black/5 p-4 text-sm transition-all outline-none placeholder:text-gray-400 focus:ring-2 dark:bg-white/5 dark:text-white dark:placeholder:text-zinc-500"
                    />
                    <p className="text-xs text-gray-400 dark:text-zinc-500">
                      {t(
                        'agents.skills.aiGenerateNote',
                        'The AI will generate SKILL.md and any necessary scripts / references automatically.',
                      )}
                    </p>
                  </div>

                  <button
                    onClick={handleAIGenerate}
                    disabled={isGenerating || !aiPrompt.trim()}
                    className="bg-primary-500 hover:bg-primary-600 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isGenerating ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        {t('agents.skills.aiGenerating', 'AI generating...')}
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        {t('agents.skills.aiGenerateBtn', 'Generate')}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : isGitImportMode ? (
            <div className="flex flex-1 flex-col p-6">
              <div className="mb-6 flex items-center gap-3">
                <button
                  onClick={() => setIsGitImportMode(false)}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-gray-300"
                >
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {t('agents.skills.gitImportTitle', 'Import Skill from Git')}
                  </h3>
                  <p className="text-xs text-gray-400 dark:text-zinc-500">
                    {t(
                      'agents.skills.gitImportSubtitle',
                      'Clone a third-party repository and import a skill folder.',
                    )}
                  </p>
                </div>
              </div>

              <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-400/20 dark:bg-amber-500/10">
                <div className="flex items-start gap-3">
                  <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      {t('agents.skills.gitImportRiskTitle', 'Security notice')}
                    </p>
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-200">
                      {t(
                        'agents.skills.gitImportRiskDesc',
                        'Skills from untrusted repositories may include malicious prompts or executable scripts. Import only from trusted sources and review every file before enabling it for agents.',
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('agents.skills.gitImportRepoLabel', 'Repository URL')}
                  </label>
                  <input
                    type="text"
                    value={gitRepoUrl}
                    onChange={e => setGitRepoUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    className="focus:ring-primary-500/20 h-10 w-full rounded-xl border-none bg-black/5 px-4 text-sm outline-none placeholder:text-gray-400 focus:ring-2 dark:bg-white/5 dark:text-white dark:placeholder:text-zinc-500"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('agents.skills.gitImportRefLabel', 'Git ref (optional)')}
                    </label>
                    <input
                      type="text"
                      value={gitRef}
                      onChange={e => setGitRef(e.target.value)}
                      placeholder="main"
                      className="focus:ring-primary-500/20 h-10 w-full rounded-xl border-none bg-black/5 px-4 text-sm outline-none placeholder:text-gray-400 focus:ring-2 dark:bg-white/5 dark:text-white dark:placeholder:text-zinc-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('agents.skills.gitImportPathLabel', 'Skill path in repo (optional)')}
                    </label>
                    <input
                      type="text"
                      value={gitSkillPath}
                      onChange={e => setGitSkillPath(e.target.value)}
                      placeholder="skills/my-skill"
                      className="focus:ring-primary-500/20 h-10 w-full rounded-xl border-none bg-black/5 px-4 text-sm outline-none placeholder:text-gray-400 focus:ring-2 dark:bg-white/5 dark:text-white dark:placeholder:text-zinc-500"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('agents.skills.gitImportIdLabel', 'Override skill ID (optional)')}
                  </label>
                  <input
                    type="text"
                    value={gitSkillId}
                    onChange={e => setGitSkillId(e.target.value)}
                    placeholder="my-imported-skill"
                    className="focus:ring-primary-500/20 h-10 w-full rounded-xl border-none bg-black/5 px-4 text-sm outline-none placeholder:text-gray-400 focus:ring-2 dark:bg-white/5 dark:text-white dark:placeholder:text-zinc-500"
                  />
                  <p className="text-xs text-gray-400 dark:text-zinc-500">
                    {t(
                      'agents.skills.gitImportIdHint',
                      'If omitted, the app will derive it from SKILL.md name or folder name.',
                    )}
                  </p>
                </div>

                <button
                  onClick={handleImportFromGit}
                  disabled={isImportingGit || !gitRepoUrl.trim()}
                  className="bg-primary-500 hover:bg-primary-600 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isImportingGit ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      {t('agents.skills.gitImporting', 'Importing...')}
                    </>
                  ) : (
                    <>
                      <Github size={16} />
                      {t('agents.skills.gitImportBtn', 'Import from Git')}
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6">
              {/* Header Action */}
              <div className="mb-6 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setIsAIMode(true)
                    setIsGitImportMode(false)
                    setAiResult(null)
                    setAiPrompt('')
                  }}
                  className="bg-primary-500 hover:bg-primary-600 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md active:scale-95"
                >
                  <Sparkles size={16} />
                  {t('agents.skills.aiGenerate', '✨ AI Generate')}
                </button>
                <button
                  onClick={() => {
                    setIsAIMode(false)
                    setIsGitImportMode(true)
                  }}
                  className="flex items-center gap-2 rounded-xl border border-black/10 bg-black/5 px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-black/10 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                >
                  <Github size={16} />
                  {t('agents.skills.gitImportAction', 'Import from Git')}
                </button>
                <button
                  onClick={handleCreateNew}
                  className="bg-primary-500 hover:bg-primary-600 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md active:scale-95"
                >
                  <Plus size={16} />
                  {t('agents.skills.createButton', 'Create Skill')}
                </button>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center p-12">
                  <div className="border-primary-500 h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"></div>
                </div>
              ) : skills.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center dark:border-zinc-800">
                  <div className="bg-primary-50 dark:bg-primary-500/10 mb-4 rounded-full p-4">
                    <AlertCircle className="text-primary-500 h-8 w-8" />
                  </div>
                  <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-white">
                    No custom skills yet
                  </h3>
                  <p className="mb-6 max-w-sm text-sm text-gray-500 dark:text-gray-400">
                    Skills allow you to encapsulate complex system prompts, scripts, and
                    capabilities into reusable blocks.
                  </p>
                  <button
                    onClick={handleCreateNew}
                    className="flex items-center gap-2 rounded-xl bg-black/5 px-4 py-2 text-sm font-medium text-gray-900 transition-all hover:bg-black/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                  >
                    <Plus size={16} />
                    Create your first Skill
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {skills.map(skill => (
                    <div
                      key={skill.id}
                      className="glass-elite-soft group flex flex-col justify-between rounded-2xl border-none p-5 shadow-sm transition-all hover:bg-black/5 hover:shadow-md active:scale-[0.99] dark:hover:bg-white/5"
                    >
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <h3 className="truncate font-medium text-gray-900 dark:text-white">
                            {skill.name}
                          </h3>
                          <span className="rounded-md bg-gray-50 px-2 py-1 font-mono text-xs text-gray-400 dark:bg-zinc-800">
                            {skill.id}
                          </span>
                        </div>
                        <p className="mb-4 line-clamp-3 text-sm text-gray-500 dark:text-gray-400">
                          {skill.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4 dark:border-zinc-800">
                        <button
                          onClick={() => handleEdit(skill.id)}
                          className="hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-lg p-1.5 text-gray-400 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(skill.id)}
                          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions when Editing */}
        {isEditing && (
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-black/5 bg-transparent px-6 py-4 dark:border-white/5">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-zinc-800"
            >
              {t('agents.actions.cancel', 'Cancel')}
            </button>
            <button
              onClick={saveCombined}
              disabled={isSaving}
              className="bg-primary-500 hover:bg-primary-600 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md active:scale-95 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                  {t('agents.actions.saving', 'Saving...')}
                </>
              ) : (
                <>
                  <Check size={16} />
                  {t('agents.skills.saveButton', 'Save Skill')}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default SkillsWorkshopModal
