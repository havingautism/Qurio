import { useEffect, useState, useMemo } from 'react'
import {
  X,
  Plus,
  Trash2,
  Save,
  Search,
  Globe,
  Settings,
  AlertCircle,
  Code,
  Check,
  ChevronRight,
  CloudAlert,
  Hammer,
} from 'lucide-react'
import {
  createUserTool,
  deleteUserTool,
  getUserTools,
  updateUserTool,
  updateMcpServerUrl,
  syncMcpTools,
} from '../lib/userToolsService'
import { fetchMcpToolsViaBackend } from '../lib/backendClient'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

const ToolsModal = ({ isOpen, onClose }) => {
  const { t } = useTranslation()
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(false)
  const [editingTool, setEditingTool] = useState(null)
  const [isCreating, setIsCreating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Collapsed groups state
  const [collapsedGroups, setCollapsedGroups] = useState(new Set())

  // Form state
  const [formData, setFormData] = useState({
    toolType: 'http',
    name: '',
    description: '',
    url: '',
    method: 'GET',
    params: '',
    allowedDomains: '',
    maxResponseSize: '100000',
    timeout: '10000',
    serverName: '',
    serverUrl: '',
  })

  // MCP tools list state
  const [mcpToolsList, setMcpToolsList] = useState([])
  const [mcpToolsLoading, setMcpToolsLoading] = useState(false)
  const [selectedMcpTools, setSelectedMcpTools] = useState(new Set())

  // MCP server URL editing state
  const [editingServerUrl, setEditingServerUrl] = useState(null) // Server name being edited
  const [newServerUrl, setNewServerUrl] = useState('')
  const [updatingServerUrl, setUpdatingServerUrl] = useState(false)

  // Track when editing server URL (for right panel)
  const [isEditingServerUrl, setIsEditingServerUrl] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadTools()
    }
  }, [isOpen])

  const loadTools = async () => {
    setLoading(true)
    try {
      const tools = await getUserTools()
      setTools(tools)
    } catch (error) {
      console.error('Failed to load tools:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleGroup = groupName => {
    const newCollapsed = new Set(collapsedGroups)
    if (newCollapsed.has(groupName)) {
      newCollapsed.delete(groupName)
    } else {
      newCollapsed.add(groupName)
    }
    setCollapsedGroups(newCollapsed)
  }

  const handleCreate = () => {
    setIsCreating(true)
    setEditingTool(null)

    // Exit server URL editing mode if switching to create
    if (isEditingServerUrl) {
      setIsEditingServerUrl(false)
      setEditingServerUrl(null)
      setNewServerUrl('')
    }
    setFormData({
      toolType: 'http',
      name: '',
      description: '',
      url: '',
      method: 'GET',
      params: '',
      allowedDomains: '',
      maxResponseSize: '100000',
      timeout: '10000',
      serverName: '',
      serverUrl: '',
    })
    setMcpToolsList([])
    setSelectedMcpTools(new Set())
  }

  const handleEdit = tool => {
    setIsCreating(false)
    setEditingTool(tool)

    // Exit server URL editing mode if switching to tool edit
    if (isEditingServerUrl) {
      setIsEditingServerUrl(false)
      setEditingServerUrl(null)
      setNewServerUrl('')
    }

    if (tool.type === 'mcp') {
      setFormData({
        toolType: 'mcp',
        name: tool.name,
        description: tool.description,
        serverName: tool.config?.serverName || '',
        serverUrl: tool.config?.serverUrl || '',
        url: '',
        method: 'GET',
        params: '',
        allowedDomains: '',
        maxResponseSize: '100000',
        timeout: '10000',
      })
    } else {
      setFormData({
        toolType: 'http',
        name: tool.name,
        description: tool.description,
        url: tool.config.url,
        method: tool.config.method || 'GET',
        params: JSON.stringify(tool.config.params || {}, null, 2),
        allowedDomains: (tool.config.security?.allowedDomains || []).join(', '),
        maxResponseSize: String(tool.config.security?.maxResponseSize || 100000),
        timeout: String(tool.config.security?.timeout || 10000),
        serverName: '',
        serverUrl: '',
      })
    }
    setMcpToolsList([])
    setSelectedMcpTools(new Set())
  }

  const loadMcpTools = async () => {
    if (!formData.serverName || !formData.serverUrl) {
      alert(t('customTools.mcp.fillServerInfo'))
      return
    }

    setMcpToolsLoading(true)
    try {
      const settings = JSON.parse(localStorage.getItem('qurio-settings') || '{}')
      const backendUrl = settings.backendUrl || 'http://localhost:3001'

      const response = await fetch(`${backendUrl}/api/mcp-tools/servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.serverName,
          url: formData.serverUrl,
        }),
      })

      if (!response.ok) {
        throw new Error(`${t('customTools.mcp.loadFailed')}: ${response.statusText}`)
      }

      const data = await response.json()
      setMcpToolsList(data.tools || [])
    } catch (error) {
      console.error('Failed to load MCP tools:', error)
      alert(`${t('customTools.mcp.loadError')}: ${error.message}`)
    } finally {
      setMcpToolsLoading(false)
    }
  }

  const toggleMcpToolSelection = toolId => {
    const newSelection = new Set(selectedMcpTools)
    if (newSelection.has(toolId)) {
      newSelection.delete(toolId)
    } else {
      newSelection.add(toolId)
    }
    setSelectedMcpTools(newSelection)
  }

  const handleSave = async () => {
    try {
      if (formData.toolType === 'mcp') {
        if (!formData.serverName || !formData.serverUrl) {
          alert(t('customTools.mcp.fillServerInfo'))
          return
        }

        if (selectedMcpTools.size === 0) {
          alert(t('customTools.mcp.selectTools'))
          return
        }

        const toolsToSave = mcpToolsList.filter(tool => selectedMcpTools.has(tool.id))

        for (const mcpTool of toolsToSave) {
          const toolData = {
            name: mcpTool.name,
            description: `[MCP ${formData.serverName}] ${mcpTool.description}`,
            type: 'mcp',
            config: {
              serverName: formData.serverName,
              serverUrl: formData.serverUrl,
              toolName: mcpTool.name,
            },
            input_schema: mcpTool.parameters,
            parameters: mcpTool.parameters,
          }

          await createUserTool(toolData)
        }

        await loadTools()
        setIsCreating(false)
        setEditingTool(null)
        setMcpToolsList([])
        setSelectedMcpTools(new Set())
        return
      }

      // HTTP tool save logic
      let params = {}
      if (formData.params.trim()) {
        try {
          params = JSON.parse(formData.params)
        } catch (e) {
          alert(t('customTools.invalidJson'))
          return
        }
      }

      const allowedDomains = formData.allowedDomains
        .split(',')
        .map(d => d.trim())
        .filter(Boolean)

      if (allowedDomains.length === 0) {
        alert(t('customTools.domainRequired'))
        return
      }

      const toolData = {
        name: formData.name,
        description: formData.description,
        type: 'http',
        config: {
          url: formData.url,
          method: formData.method,
          params,
          headers: {},
          security: {
            allowedDomains,
            maxResponseSize: parseInt(formData.maxResponseSize),
            timeout: parseInt(formData.timeout),
          },
        },
        input_schema: {
          type: 'object',
          properties: Object.fromEntries(
            (() => {
              const variables = new Set()
              const templateRegex = /\{\{(\w+)\}\}/g

              let match
              while ((match = templateRegex.exec(formData.url)) !== null) {
                variables.add(match[1])
              }

              for (const value of Object.values(params)) {
                if (typeof value === 'string') {
                  templateRegex.lastIndex = 0
                  while ((match = templateRegex.exec(value)) !== null) {
                    variables.add(match[1])
                  }
                }
              }

              return Array.from(variables).map(varName => [
                varName,
                {
                  type: 'string',
                  description: `Parameter: ${varName}`,
                },
              ])
            })(),
          ),
          required: [],
        },
      }

      if (editingTool) {
        await updateUserTool(editingTool.id, toolData)
      } else {
        await createUserTool(toolData)
      }

      await loadTools()
      setIsCreating(false)
      setEditingTool(null)
    } catch (error) {
      console.error('Failed to save tool:', error)
      alert(`${t('customTools.saveError')} ${error.message}`)
    }
  }

  const handleDelete = async toolId => {
    if (!confirm(t('customTools.deleteConfirm'))) return

    try {
      await deleteUserTool(toolId)
      await loadTools()
      if (editingTool?.id === toolId) {
        setEditingTool(null)
        setIsCreating(false)
      }
    } catch (error) {
      console.error('Failed to delete tool:', error)
    }
  }

  const handleEditServerUrl = serverName => {
    const serverTools = tools.filter(t => t.type === 'mcp' && t.config?.serverName === serverName)
    if (serverTools.length > 0) {
      setEditingServerUrl(serverName)
      setNewServerUrl(serverTools[0].config?.serverUrl || '')
      setIsEditingServerUrl(true)
    }
  }

  const handleUpdateServerUrl = async () => {
    if (!newServerUrl.trim()) {
      alert(t('customTools.mcp.urlRequired'))
      return
    }

    setUpdatingServerUrl(true)
    try {
      // Step 1: Fetch latest tools from new URL
      console.log('[MCP Sync] Fetching tools from', newServerUrl)
      const fetchResult = await fetchMcpToolsViaBackend(editingServerUrl, newServerUrl)

      if (!fetchResult.success) {
        throw new Error(fetchResult.error || 'Failed to fetch tools')
      }

      console.log('[MCP Sync] Fetched tools:', fetchResult.tools)

      // Step 2: Sync tools to database
      console.log('[MCP Sync] Syncing tools to database...')
      const syncResult = await syncMcpTools(editingServerUrl, newServerUrl, fetchResult.tools)

      console.log('[MCP Sync] Sync result:', syncResult)

      // Step 3: Reload tools and close modal
      await loadTools()
      setIsEditingServerUrl(false)
      setEditingServerUrl(null)
      setNewServerUrl('')

      // Show detailed sync result
      alert(t('customTools.mcp.syncSuccess', {
        server: syncResult.serverName,
        updated: syncResult.updated,
        added: syncResult.added,
        total: fetchResult.total
      }))
    } catch (error) {
      console.error('Failed to sync MCP tools:', error)
      alert(t('customTools.mcp.syncFailed', { error: error.message }))
    } finally {
      setUpdatingServerUrl(false)
    }
  }

  const handleCancelEditServerUrl = () => {
    setIsEditingServerUrl(false)
    setEditingServerUrl(null)
    setNewServerUrl('')
  }

  const filteredTools = useMemo(() => {
    if (!searchQuery) return tools
    const query = searchQuery.toLowerCase()
    return tools.filter(
      t => t.name.toLowerCase().includes(query) || t.description.toLowerCase().includes(query),
    )
  }, [tools, searchQuery])

  // Group tools by server/source
  const groupedTools = useMemo(() => {
    const groups = new Map()

    filteredTools.forEach(tool => {
      let groupKey
      if (tool.type === 'mcp') {
        // Group by MCP server name
        groupKey = `mcp_${tool.config?.serverName || 'unknown'}`
      } else {
        // All HTTP tools in one group
        groupKey = 'http_custom'
      }

      if (!groups.has(groupKey)) {
        if (tool.type === 'mcp') {
          groups.set(groupKey, {
            type: 'mcp',
            name: tool.config?.serverName || 'Unknown Server',
            tools: []
          })
        } else {
          groups.set(groupKey, {
            type: 'http',
            name: 'HTTP 自定义工具',
            tools: []
          })
        }
      }

      groups.get(groupKey).tools.push(tool)
    })

    // Convert to array and sort (MCP groups first, then HTTP)
    return Array.from(groups.values()).sort((a, b) => {
      if (a.type === 'mcp' && b.type === 'http') return -1
      if (a.type === 'http' && b.type === 'mcp') return 1
      return a.name.localeCompare(b.name)
    })
  }, [filteredTools])

  if (!isOpen) return null

  const showForm = isCreating || editingTool || isEditingServerUrl

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm md:p-4 animate-in fade-in duration-200">
      <div className="w-full h-[100dvh] md:max-w-5xl md:h-[85vh] bg-white dark:bg-[#191a1a] md:rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row md:border border-gray-200 dark:border-zinc-800 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-30 p-2 rounded-full bg-gray-100/50 dark:bg-zinc-800/50 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-500 backdrop-blur-sm transition-colors"
        >
          <X size={20} />
        </button>

        {/* LEFT PANE: List */}
        <div
          className={clsx(
            'flex flex-col w-full md:w-72 bg-primary-50 dark:bg-background/70 border-r border-gray-200 dark:border-zinc-800 h-full shrink-0',
            showForm ? 'hidden md:flex' : 'flex',
          )}
        >
          <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-zinc-800 flex flex-col gap-4 mt-8 md:mt-0">
            <h2 className="text-xl font-bold px-1 text-gray-900 dark:text-white">
              {t('customTools.title')}
            </h2>
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder={t('customTools.searchPlaceholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
            <button
              onClick={handleCreate}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-all shadow-sm active:scale-95"
            >
              <Plus size={16} />
              {t('customTools.create')}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
                {t('common.loading')}
              </div>
            ) : filteredTools.length === 0 ? (
              <div className="text-center py-10 px-4 text-gray-500 dark:text-gray-400">
                <div className="mb-2 flex justify-center">
                  <CloudAlert size={24} className="opacity-20" />
                </div>
                <p className="text-sm">{t('customTools.noToolsFound')}</p>
              </div>
            ) : (
              groupedTools.map(group => (
                <div key={group.name} className="mb-4 last:mb-0">
                  {/* Group Header */}
                  <div className="px-2 py-1.5 mb-2">
                    <div className="flex items-center justify-between">
                      <div
                        className="flex items-center gap-2 flex-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        onClick={() => toggleGroup(group.name)}
                      >
                        <ChevronRight
                          size={14}
                          className={clsx(
                            'transition-transform text-gray-400',
                            !collapsedGroups.has(group.name) && 'rotate-90'
                          )}
                        />
                        {group.type === 'mcp' && (
                          <div className="w-2 h-2 rounded-full bg-purple-500" />
                        )}
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                          {group.name}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          ({group.tools.length})
                        </span>
                      </div>
                      {group.type === 'mcp' && (
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            handleEditServerUrl(group.name)
                          }}
                          className="p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                          title={t('customTools.mcp.updateUrlTooltip')}
                        >
                          <Settings size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tools in this group */}
                  {!collapsedGroups.has(group.name) && (
                    <div className="space-y-2">
                    {group.tools.map(tool => (
                      <div
                        key={tool.id}
                        onClick={() => handleEdit(tool)}
                        className={clsx(
                          'group flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none',
                          editingTool?.id === tool.id
                            ? 'bg-primary-100 dark:bg-zinc-800 border-primary-500/30 shadow-sm'
                            : 'bg-white dark:bg-zinc-900 border-transparent hover:bg-primary-50 dark:hover:bg-zinc-800/50 hover:border-gray-200 dark:hover:border-zinc-700 hover:shadow-sm',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span
                              className={clsx(
                                'text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider',
                                tool.type === 'mcp'
                                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                                  : tool.config.method === 'GET'
                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                    : tool.config.method === 'POST'
                                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
                              )}
                            >
                              {tool.type === 'mcp' ? 'MCP' : tool.config.method}
                            </span>
                            <span
                              className={clsx(
                                'text-sm font-semibold truncate',
                                editingTool?.id === tool.id
                                  ? 'text-primary-600 dark:text-primary-400'
                                  : 'text-gray-900 dark:text-gray-100',
                              )}
                            >
                              {tool.name}
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate pl-1 font-mono opacity-60">
                            {tool.type === 'mcp'
                              ? tool.config.toolName || tool.name
                              : tool.config.url}
                          </div>
                        </div>
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            handleDelete(tool.id)
                          }}
                          className="p-1.5 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT PANE: Detail/Form */}
        <div
          className={clsx(
            'flex-1 flex flex-col bg-white dark:bg-[#191a1a] w-full h-full overflow-hidden',
            !showForm && 'hidden md:flex',
          )}
        >
          <div className="h-16 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-4 sm:px-8">
            <div className="flex items-center gap-3">
              {showForm && (
                <button
                  onClick={() => {
                    setIsCreating(false)
                    setEditingTool(null)
                    setIsEditingServerUrl(false)
                  }}
                  className="md:hidden p-2 -ml-2 text-gray-600 dark:text-gray-400"
                >
                  <ChevronRight size={20} className="rotate-180" />
                </button>
              )}
              <h3 className="font-semibold text-gray-900 dark:text-white capitalize">
                {isEditingServerUrl
                  ? `${t('customTools.mcp.updateServerUrl')}: ${editingServerUrl}`
                  : showForm
                    ? isCreating
                      ? t('customTools.createTitle')
                      : t('customTools.editTitle')
                    : t('customTools.selectTool')}
              </h3>
            </div>
            <div className="w-10 h-10 hidden md:block" />
          </div>

          {showForm ? (
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-8 min-h-0">
              <div className="max-w-2xl mx-auto space-y-8">
                {/* Edit Server URL Mode */}
                {isEditingServerUrl ? (
                  <>
                    <div className="hidden md:block">
                      <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                        {t('customTools.mcp.updateServerUrl')}: {editingServerUrl}
                      </h3>
                      <p className="text-gray-500 dark:text-gray-400 text-sm">
                        更新此 MCP 服务器的 URL 以获取最新的工具定义
                      </p>
                    </div>

                    <div className="space-y-6">
                      {/* Current URL (display only) */}
                      <div className="bg-gray-50 dark:bg-zinc-900/60 p-4 rounded-xl border border-gray-200 dark:border-zinc-700">
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 block">
                          {t('customTools.mcp.currentUrl')}
                        </label>
                        <div className="text-sm text-gray-900 dark:text-gray-100 font-mono break-all">
                          {newServerUrl || 'N/A'}
                        </div>
                      </div>

                      {/* New URL Input */}
                      <FormInput
                        label={t('customTools.mcp.newUrl')}
                        value={newServerUrl}
                        onChange={setNewServerUrl}
                        placeholder="https://xxx.modelscope.cn/mcp/..."
                        icon={<Globe size={14} />}
                      />

                      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                        <p className="text-sm text-blue-800 dark:text-blue-300">
                          ℹ️ {t('customTools.mcp.syncInfo')}
                        </p>
                        <ul className="text-sm text-blue-800 dark:text-blue-300 mt-2 space-y-1 list-disc list-inside">
                          {t('customTools.mcp.syncSteps', { returnObjects: true }).map((step, index) => (
                            <li key={index}>{step}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-4 flex flex-col gap-3 pb-8 md:pb-0">
                      <button
                        onClick={handleUpdateServerUrl}
                        disabled={updatingServerUrl}
                        className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white rounded-xl font-medium transition-all active:scale-95"
                      >
                        <Save size={18} />
                        {updatingServerUrl ? t('common.loading') : t('common.save')}
                      </button>
                      <button
                        onClick={handleCancelEditServerUrl}
                        disabled={updatingServerUrl}
                        className="px-6 py-3 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-xl font-medium transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="hidden md:block">
                      <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                        {isCreating ? t('customTools.createTitle') : t('customTools.editTitle')}
                      </h3>
                      <p className="text-gray-500 dark:text-gray-400 text-sm">
                        {t('customTools.tooltip')}
                      </p>
                    </div>

                {/* Tool Type Selector */}
                {isCreating && (
                  <div className="space-y-4">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1.5">
                      {t('customTools.form.toolType')}
                    </label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, toolType: 'http' })}
                        className={clsx(
                          'flex-1 px-4 py-3 rounded-xl border-2 font-medium text-sm transition-all',
                          formData.toolType === 'http'
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                            : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-zinc-600',
                        )}
                      >
                        HTTP
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, toolType: 'mcp' })}
                        className={clsx(
                          'flex-1 px-4 py-3 rounded-xl border-2 font-medium text-sm transition-all',
                          formData.toolType === 'mcp'
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                            : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-zinc-600',
                        )}
                      >
                        MCP
                      </button>
                    </div>
                  </div>
                )}

                {/* MCP Form */}
                {formData.toolType === 'mcp' ? (
                  <>
                    {/* Edit mode: Show tool details */}
                    {!isCreating && editingTool ? (
                      <div className="space-y-6">
                        {/* Tool Name */}
                        <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-100 dark:border-purple-900/30">
                          <label className="text-xs font-medium text-purple-800 dark:text-purple-300 mb-1 block">
                            {t('customTools.form.name')}
                          </label>
                          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {editingTool.config?.toolName || editingTool.name}
                          </div>
                        </div>

                        {/* Tool Description */}
                        {editingTool.description && (
                          <div className="bg-gray-50 dark:bg-zinc-900/60 p-4 rounded-xl border border-gray-100 dark:border-zinc-800">
                            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                              {t('customTools.form.description')}
                            </label>
                            <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                              {editingTool.description.replace(/^\[MCP.*?\]\s*/, '')}
                            </div>
                          </div>
                        )}

                        {/* Parameters */}
                        {editingTool.parameters && (
                          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                            <label className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-2 block">
                              参数定义
                            </label>
                            <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
                              {JSON.stringify(editingTool.parameters, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Server Info */}
                        <div className="bg-gray-50 dark:bg-zinc-900/60 p-4 rounded-xl border border-gray-200 dark:border-zinc-700">
                          <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 block">
                            服务器信息
                          </label>
                          <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                            <div><span className="font-medium">服务器：</span>{editingTool.config?.serverName || 'N/A'}</div>
                            <div className="font-mono text-xs break-all">
                              <span className="font-medium">URL：</span>{editingTool.config?.serverUrl || 'N/A'}
                            </div>
                          </div>
                        </div>

                        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-900/30">
                          <p className="text-sm text-yellow-800 dark:text-yellow-300">
                            ℹ️ MCP 工具无法编辑，如需更改请删除后重新添加
                          </p>
                        </div>
                      </div>
                    ) : (
                      /* Create mode: Show server configuration form */
                      <div className="space-y-4">
                        <FormInput
                          label={t('customTools.form.serverName')}
                          value={formData.serverName}
                          onChange={v => setFormData({ ...formData, serverName: v })}
                          placeholder="12306-mcp"
                          icon={<Settings size={14} />}
                        />
                        <FormInput
                          label={t('customTools.form.serverUrl')}
                          value={formData.serverUrl}
                          onChange={v => setFormData({ ...formData, serverUrl: v })}
                          placeholder="https://xxx.modelscope.cn/mcp/..."
                          icon={<Globe size={14} />}
                        />
                        <button
                          type="button"
                          onClick={loadMcpTools}
                          disabled={mcpToolsLoading}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-medium transition-all"
                        >
                          {mcpToolsLoading ? t('common.loading') : t('customTools.mcp.loadTools')}
                        </button>
                      </div>
                    )}
                  </>
                ) : isCreating && formData.toolType === 'mcp' && mcpToolsList.length > 0 ? (
                  /* Tools list (rendered after the ternary) */
                  <>
                    <div className="border-t border-gray-100 dark:border-zinc-800" />
                    <div className="space-y-4">
                      <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {t('customTools.mcp.availableTools')}
                      </label>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {mcpToolsList.map(tool => (
                          <div
                            key={tool.id}
                            onClick={() => toggleMcpToolSelection(tool.id)}
                            className={clsx(
                              'p-3 rounded-lg border-2 cursor-pointer transition-all',
                              selectedMcpTools.has(tool.id)
                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600',
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={clsx(
                                  'mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-all',
                                  selectedMcpTools.has(tool.id)
                                    ? 'border-primary-500 bg-primary-500'
                                    : 'border-gray-300 dark:border-zinc-600',
                                )}
                              >
                                {selectedMcpTools.has(tool.id) && <Check size={12} className="text-white" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                                  {tool.name}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                  {tool.description}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  /* HTTP Form */
                  <>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-3">
                          <FormInput
                            label={t('customTools.form.name')}
                            value={formData.name}
                            onChange={v => setFormData({ ...formData, name: v })}
                            placeholder={t('customTools.form.namePlaceholder')}
                            icon={<Code size={14} />}
                          />
                        </div>
                        <div className="md:col-span-1">
                          <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1.5">
                            {t('customTools.form.method')}
                          </label>
                          <CustomSelect
                            value={formData.method}
                            onChange={v => setFormData({ ...formData, method: v })}
                            options={['GET', 'POST', 'PUT', 'DELETE']}
                          />
                        </div>
                      </div>

                      <FormInput
                        label={t('customTools.form.description')}
                        value={formData.description}
                        onChange={v => setFormData({ ...formData, description: v })}
                        placeholder={t('customTools.form.descriptionPlaceholder')}
                        type="textarea"
                      />

                      <FormInput
                        label={t('customTools.form.url')}
                        value={formData.url}
                        onChange={v => setFormData({ ...formData, url: v })}
                        placeholder={t('customTools.form.urlPlaceholder')}
                        icon={<Globe size={14} />}
                      />
                    </div>

                    <div className="border-t border-gray-100 dark:border-zinc-800" />

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          <Settings size={14} />
                          {t('customTools.form.securityTitle')}
                        </label>
                      </div>

                      <div className="bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/20">
                        <label className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
                          {t('customTools.form.params')}
                        </label>
                        <textarea
                          value={formData.params}
                          onChange={e => setFormData({ ...formData, params: e.target.value })}
                          placeholder={t('customTools.form.paramsPlaceholder')}
                          rows={5}
                          className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-800 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 flex items-center gap-1">
                          <AlertCircle size={12} />
                          {t('customTools.form.paramsHelp')}
                        </p>
                      </div>

                      <FormInput
                        label={t('customTools.form.allowedDomains')}
                        value={formData.allowedDomains}
                        onChange={v => setFormData({ ...formData, allowedDomains: v })}
                        placeholder={t('customTools.form.allowedDomainsPlaceholder')}
                      />

                      <div className="grid grid-cols-2 gap-4">
                        <FormInput
                          label={t('customTools.form.maxResponseSize')}
                          type="number"
                          value={formData.maxResponseSize}
                          onChange={v => setFormData({ ...formData, maxResponseSize: v })}
                          placeholder={t('customTools.form.maxResponseSizePlaceholder')}
                        />
                        <FormInput
                          label={t('customTools.form.timeout')}
                          type="number"
                          value={formData.timeout}
                          onChange={v => setFormData({ ...formData, timeout: v })}
                          placeholder={t('customTools.form.timeoutPlaceholder')}
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="pt-4 flex flex-col gap-3 pb-8 md:pb-0">
                  {!isCreating && formData.toolType === 'mcp' ? (
                    // Edit MCP tool mode - show delete button instead
                    <button
                      onClick={() => {
                        if (confirm(t('customTools.deleteConfirm'))) {
                          handleDelete(editingTool.id)
                          setIsCreating(false)
                          setEditingTool(null)
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-all active:scale-95"
                    >
                      <Trash2 size={18} />
                      删除工具
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleSave}
                        className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-all active:scale-95"
                      >
                        <Save size={18} />
                        {isCreating ? t('customTools.form.save') : t('customTools.form.saveChanges')}
                      </button>
                      <button
                        onClick={() => {
                          setIsCreating(false)
                          setEditingTool(null)
                        }}
                        className="px-6 py-3 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-xl font-medium transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                    </>
                  )}
                </div>
              </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-500 dark:text-gray-400">
              <div className="w-16 h-16 bg-gray-50 dark:bg-zinc-900 rounded-2xl flex items-center justify-center mb-4">
                <Hammer size={32} className="text-gray-300 dark:text-zinc-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
                {t('customTools.selectTool')}
              </h3>
              <p className="text-sm max-w-xs mx-auto">{t('customTools.selectToolHelp')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const CustomSelect = ({ value, onChange, options }) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2.5 text-sm md:text-left text-center bg-[#f9f9f987] disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 font-mono flex items-center justify-between"
      >
        <span>{value}</span>
        <div className="bg-gray-200 dark:bg-zinc-700 rounded p-0.5">
          <ChevronRight size={12} className={clsx('transition-transform', isOpen && 'rotate-90')} />
        </div>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg z-20 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            {options.map(option => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option)
                  setIsOpen(false)
                }}
                className={clsx(
                  'w-full px-3 py-2 text-sm text-left font-mono hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors',
                  value === option &&
                    'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const FormInput = ({ label, value, onChange, placeholder, type = 'text', icon, rows }) => (
  <div className="space-y-1.5 w-full">
    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
      {label}
    </label>
    <div className="relative">
      {icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          {icon}
        </div>
      )}
      {type === 'textarea' ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows || 3}
          className={clsx(
            'w-full px-3 py-2.5 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm transition-all resize-none',
            'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500',
            'placeholder:text-gray-400 dark:placeholder:text-zinc-600',
            icon && 'pl-9',
          )}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={clsx(
            'w-full px-3 py-2.5 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm transition-all',
            'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500',
            'placeholder:text-gray-400 dark:placeholder:text-zinc-600',
            icon && 'pl-9',
          )}
        />
      )}
    </div>
  </div>
)

export default ToolsModal
