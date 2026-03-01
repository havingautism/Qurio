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
  Box,
  Loader2,
} from 'lucide-react'
import {
  createUserTool,
  deleteUserTool,
  getUserTools,
  updateUserTool,
  syncMcpTools,
} from '../lib/userToolsService'
import { fetchMcpToolsViaBackend } from '../lib/backendClient'
import { getBackendUrl } from '../lib/settings'
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
  const [mcpGroupToolStates, setMcpGroupToolStates] = useState({})

  // Form state
  const [formData, setFormData] = useState({
    toolType: 'mcp',
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
    serverTransport: 'streamable_http',
    serverBearerToken: '',
    serverHeaders: [],
  })

  // MCP tools list state
  const [mcpToolsList, setMcpToolsList] = useState([])
  const [mcpToolsLoading, setMcpToolsLoading] = useState(false)
  const [selectedMcpTools, setSelectedMcpTools] = useState(new Set())

  // MCP server URL editing state
  const [editingServerUrl, setEditingServerUrl] = useState(null) // Server name being edited
  const [newServerUrl, setNewServerUrl] = useState('')
  const [newServerTransport, setNewServerTransport] = useState('streamable_http')
  const [newServerBearerToken, setNewServerBearerToken] = useState('')
  const [newServerHeaders, setNewServerHeaders] = useState([])
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
      const defaultCollapsed = new Set(
        tools
          .filter(tool => tool.type === 'mcp')
          .map(tool => tool.config?.serverName || 'Unknown Server'),
      )
      setCollapsedGroups(defaultCollapsed)
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
      toolType: 'mcp',
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
      serverTransport: 'streamable_http',
      serverBearerToken: '',
      serverHeaders: [],
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
        serverTransport:
          tool.config?.transport === 'http' || tool.config?.transport === 'streamable'
            ? 'streamable_http'
            : tool.config?.transport || 'sse',
        serverBearerToken: tool.config?.bearerToken || '',
        serverHeaders: Object.entries(tool.config?.headers || {}).map(([key, value]) => ({
          key,
          value,
        })),
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
        serverTransport: 'streamable_http',
        serverBearerToken: '',
        serverHeaders: [],
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
      console.log('[MCP] Loading tools from:', {
        name: formData.serverName,
        url: formData.serverUrl,
        transport: formData.serverTransport,
      })

      const response = await fetch(`${getBackendUrl()}/api/mcp-tools/servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.serverName,
          url: formData.serverUrl,
          transport: formData.serverTransport,
          bearerToken: formData.serverBearerToken || undefined,
          headers: buildHeaders(formData.serverHeaders),
        }),
      })

      if (!response.ok) {
        let backendError = response.statusText
        try {
          const errorData = await response.json()
          backendError = errorData?.error || backendError
        } catch {
          // ignore non-JSON error responses
        }
        throw new Error(`${t('customTools.mcp.loadFailed')}: ${backendError}`)
      }

      const data = await response.json()
      console.log('[MCP] Response data:', data)
      console.log('[MCP] Tools array:', data.tools)
      console.log('[MCP] Tools count:', data.tools?.length)

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
        const headers = buildHeaders(formData.serverHeaders)

        for (const mcpTool of toolsToSave) {
          const toolData = {
            name: mcpTool.name,
            description: `[MCP ${formData.serverName}] ${mcpTool.description}`,
            type: 'mcp',
            config: {
              serverName: formData.serverName,
              serverUrl: formData.serverUrl,
              toolName: mcpTool.name,
              transport: formData.serverTransport,
              bearerToken: formData.serverBearerToken || undefined,
              headers,
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
        } catch {
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
      setNewServerTransport(
        serverTools[0].config?.transport === 'http' ||
          serverTools[0].config?.transport === 'streamable'
          ? 'streamable_http'
          : serverTools[0].config?.transport || 'sse',
      )
      setNewServerBearerToken(serverTools[0].config?.bearerToken || '')
      setNewServerHeaders(
        Object.entries(serverTools[0].config?.headers || {}).map(([key, value]) => ({
          key,
          value,
        })),
      )
      setMcpGroupToolStates(
        serverTools.reduce((acc, tool) => {
          acc[tool.id] = !tool.config?.disabled
          return acc
        }, {}),
      )
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
      const fetchResult = await fetchMcpToolsViaBackend(editingServerUrl, newServerUrl, {
        transport: newServerTransport,
        bearerToken: newServerBearerToken || undefined,
        headers: buildHeaders(newServerHeaders),
      })

      if (!fetchResult.success) {
        throw new Error(fetchResult.error || 'Failed to fetch tools')
      }

      console.log('[MCP Sync] Fetched tools:', fetchResult.tools)

      // Step 2: Sync tools to database
      console.log('[MCP Sync] Syncing tools to database...')
      const syncResult = await syncMcpTools(editingServerUrl, newServerUrl, fetchResult.tools, {
        transport: newServerTransport,
        bearerToken: newServerBearerToken || undefined,
        headers: buildHeaders(newServerHeaders),
      })

      const serverTools = tools.filter(
        tool => tool.type === 'mcp' && tool.config?.serverName === editingServerUrl,
      )
      await Promise.all(
        serverTools.map(tool => {
          const enabled = mcpGroupToolStates[tool.id] ?? true
          const disabled = !enabled
          if (tool.config?.disabled === disabled) return null
          return updateUserTool(tool.id, {
            name: tool.name,
            description: tool.description,
            config: {
              ...tool.config,
              disabled,
            },
            input_schema: tool.input_schema,
          })
        }),
      )

      console.log('[MCP Sync] Sync result:', syncResult)

      // Step 3: Reload tools and close modal
      await loadTools()
      setIsEditingServerUrl(false)
      setEditingServerUrl(null)
      setNewServerUrl('')

      // Show detailed sync result
      alert(
        t('customTools.mcp.syncSuccess', {
          server: syncResult.serverName,
          updated: syncResult.updated,
          added: syncResult.added,
          total: fetchResult.total,
        }),
      )
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
    setNewServerTransport('streamable_http')
    setNewServerBearerToken('')
    setNewServerHeaders([])
    setMcpGroupToolStates({})
  }

  const buildHeaders = headerEntries => {
    return (headerEntries || [])
      .filter(item => item.key && item.value)
      .reduce((acc, item) => {
        acc[item.key] = item.value
        return acc
      }, {})
  }

  const handleDeleteMcpGroup = async serverName => {
    if (!confirm(t('customTools.mcp.deleteGroupConfirm', { server: serverName }))) return

    const serverTools = tools.filter(t => t.type === 'mcp' && t.config?.serverName === serverName)
    try {
      await Promise.all(serverTools.map(tool => deleteUserTool(tool.id)))
      await loadTools()
      if (editingTool && serverTools.some(tool => tool.id === editingTool.id)) {
        setEditingTool(null)
        setIsCreating(false)
      }
      if (isEditingServerUrl && editingServerUrl === serverName) {
        handleCancelEditServerUrl()
      }
    } catch (error) {
      console.error('Failed to delete MCP group:', error)
      alert(`${t('customTools.mcp.deleteGroupFailed')} ${error.message}`)
    }
  }

  const renderTransportLabel = value => {
    if (value === 'streamable_http') return t('customTools.mcp.transportStreamableHttp')
    if (value === 'sse') return t('customTools.mcp.transportSse')
    return value
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
            tools: [],
          })
        } else {
          groups.set(groupKey, {
            type: 'http',
            name: 'HTTP 自定义工具',
            tools: [],
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

  const mcpGroupTools = useMemo(() => {
    if (!isEditingServerUrl || !editingServerUrl) return []
    return tools.filter(tool => tool.type === 'mcp' && tool.config?.serverName === editingServerUrl)
  }, [tools, isEditingServerUrl, editingServerUrl])

  if (!isOpen) return null

  const showForm = isCreating || editingTool || isEditingServerUrl

  return (
    <div className="animate-in fade-in fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm duration-200 md:p-4">
      <div className="relative flex h-dvh w-full flex-col overflow-hidden border-gray-200 bg-white shadow-2xl md:h-[85vh] md:max-w-5xl md:flex-row md:rounded-2xl md:border dark:border-zinc-800 dark:bg-[#191a1a]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-30 rounded-full bg-gray-100/50 p-2 text-gray-500 backdrop-blur-sm transition-colors hover:bg-gray-200 dark:bg-zinc-800/50 dark:hover:bg-zinc-700"
        >
          <X size={20} />
        </button>

        {/* LEFT PANE: List */}
        <div
          className={clsx(
            'flex h-full w-full shrink-0 flex-col border-r border-gray-200 bg-gray-50/50 md:w-80 dark:border-zinc-800 dark:bg-zinc-900/50',
            showForm ? 'hidden md:flex' : 'flex',
          )}
        >
          <div className="mt-8 flex flex-col gap-4 border-b border-gray-200 p-6 md:mt-0 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {t('customTools.title')}
              </h2>
            </div>
            <div className="group relative">
              <Search
                size={14}
                className="group-focus-within:text-primary-500 absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 transition-colors"
              />
              <input
                type="text"
                placeholder={t('customTools.searchPlaceholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="focus:ring-primary-500/20 focus:border-primary-500/50 w-full rounded-xl border border-gray-200 bg-white py-2 pr-4 pl-9 text-sm transition-all focus:ring-2 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <button
              onClick={handleCreate}
              className="bg-primary-600 hover:bg-primary-700 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all active:scale-95"
            >
              <Plus size={16} />
              {t('customTools.create')}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="flex h-40 items-center justify-center text-sm text-gray-500">
                {t('common.loading')}
              </div>
            ) : filteredTools.length === 0 ? (
              <div className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                <div className="mb-2 flex justify-center">
                  <CloudAlert size={24} className="opacity-20" />
                </div>
                <p className="text-sm">{t('customTools.noToolsFound')}</p>
              </div>
            ) : (
              groupedTools.map(group => (
                <div key={group.name} className="mb-4 last:mb-0">
                  {/* Group Header */}
                  <div className="mb-2 px-2 py-1.5">
                    <div className="flex items-center justify-between">
                      <div
                        className="truncated flex flex-1 cursor-pointer items-center gap-1.5 rounded-lg py-1.5 hover:bg-gray-100 dark:hover:bg-zinc-800"
                        onClick={() => toggleGroup(group.name)}
                      >
                        <ChevronRight
                          size={14}
                          className={clsx(
                            'mx-1 text-gray-400 transition-transform',
                            !collapsedGroups.has(group.name) && 'rotate-90',
                          )}
                        />
                        {group.type === 'mcp' && (
                          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold tracking-wider whitespace-nowrap text-purple-700 uppercase dark:bg-purple-900/40 dark:text-purple-300">
                            MCP
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-wider text-gray-600 dark:text-gray-400">
                          {group.name}
                        </span>
                        <span className="pr-1.5 text-xs whitespace-nowrap text-gray-400 dark:text-gray-500">
                          ({group.tools.length})
                        </span>
                      </div>
                      {group.type === 'mcp' && (
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            handleEditServerUrl(group.name)
                          }}
                          className="hover:text-primary-600 dark:hover:text-primary-400 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800"
                          title={t('customTools.mcp.updateUrlTooltip')}
                        >
                          <Settings size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tools in this group */}
                  {!collapsedGroups.has(group.name) && (
                    <div className="space-y-2">
                      {group.tools.map(tool => {
                        const isDisabled = Boolean(tool.config?.disabled)
                        return (
                          <div
                            key={tool.id}
                            onClick={() => handleEdit(tool)}
                            className={clsx(
                              'group flex cursor-pointer items-center justify-between rounded-xl border p-1.5 transition-all select-none',
                              editingTool?.id === tool.id
                                ? 'bg-primary-100 border-primary-500/30 shadow-sm dark:bg-zinc-800'
                                : 'hover:bg-primary-50 border-transparent bg-white hover:border-gray-200 hover:shadow-sm dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50',
                              isDisabled && 'opacity-60',
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="mb-0.5 flex items-center gap-1.5">
                                <span
                                  className={clsx(
                                    'rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider whitespace-nowrap uppercase',
                                    tool.type === 'mcp'
                                      ? 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-300'
                                      : tool.config.method === 'GET'
                                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                        : tool.config.method === 'POST'
                                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
                                  )}
                                >
                                  {tool.type === 'mcp'
                                    ? t('customTools.mcp.toolTag')
                                    : tool.config.method}
                                </span>
                                <span
                                  className={clsx(
                                    'truncate text-sm font-semibold',
                                    editingTool?.id === tool.id
                                      ? 'text-primary-600 dark:text-primary-400'
                                      : 'text-gray-900 dark:text-gray-100',
                                  )}
                                >
                                  {tool.name}
                                </span>
                              </div>
                              {/* <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate pl-1 font-mono opacity-60">
                              {tool.type === 'mcp'
                                ? tool.config.toolName || tool.name
                                : tool.config.url}
                            </div> */}
                            </div>
                            {tool.type !== 'mcp' && (
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  handleDelete(tool.id)
                                }}
                                className="rounded-lg p-1.5 text-gray-400 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        )
                      })}
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
            'flex h-full w-full flex-1 flex-col overflow-hidden bg-white dark:bg-[#191a1a]',
            !showForm && 'hidden md:flex',
          )}
        >
          <div className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white/50 px-4 backdrop-blur-sm sm:px-8 dark:border-zinc-800 dark:bg-[#191a1a]/50">
            <div className="flex items-center gap-3">
              {showForm && (
                <button
                  onClick={() => {
                    setIsCreating(false)
                    setEditingTool(null)
                    setIsEditingServerUrl(false)
                  }}
                  className="-ml-2 rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 md:hidden dark:text-gray-400 dark:hover:bg-zinc-800"
                >
                  <ChevronRight size={20} className="rotate-180" />
                </button>
              )}
              <div className="flex flex-col">
                <h3 className="font-bold text-gray-900 dark:text-white">
                  {isEditingServerUrl
                    ? t('customTools.mcp.updateServerUrl')
                    : showForm
                      ? isCreating
                        ? t('customTools.createTitle')
                        : t('customTools.editTitle')
                      : t('customTools.selectTool')}
                </h3>
                {isEditingServerUrl && (
                  <span className="mt-0.5 font-mono text-[10px] text-gray-500 dark:text-gray-400">
                    {editingServerUrl}
                  </span>
                )}
              </div>
            </div>
          </div>

          {showForm ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-8">
                <div className="mx-auto max-w-2xl space-y-8">
                  {/* Edit Server URL Mode */}
                  {isEditingServerUrl ? (
                    <>
                      <div className="hidden md:block">
                        {/* <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                          {t('customTools.mcp.updateServerUrl')}: {editingServerUrl}
                        </h3> */}
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          更新MCP服务器的URL以获取最新的工具定义
                        </p>
                      </div>

                      <div className="space-y-6">
                        {/* Current URL (display only) */}
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
                          <label className="mb-2 block text-xs font-medium text-gray-600 dark:text-gray-400">
                            {t('customTools.mcp.currentUrl')}
                          </label>
                          <div className="font-mono text-sm break-all text-gray-900 dark:text-gray-100">
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
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                              {t('customTools.mcp.transportLabel')}
                            </label>
                            <CustomSelect
                              value={newServerTransport}
                              onChange={setNewServerTransport}
                              options={['streamable_http', 'sse']}
                              renderLabel={renderTransportLabel}
                            />
                          </div>
                          <FormInput
                            label={t('customTools.mcp.bearerTokenLabel')}
                            value={newServerBearerToken}
                            onChange={setNewServerBearerToken}
                            placeholder="eyJhbGciOi..."
                            type="password"
                          />
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                              {t('customTools.mcp.headersLabel')}
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                setNewServerHeaders([...newServerHeaders, { key: '', value: '' }])
                              }
                              className="text-primary-600 dark:text-primary-400 text-xs font-semibold hover:underline"
                            >
                              {t('customTools.mcp.addHeader')}
                            </button>
                          </div>
                          {newServerHeaders.length === 0 ? (
                            <div className="text-xs text-gray-400 dark:text-gray-500">
                              {t('customTools.mcp.noHeaders')}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {newServerHeaders.map((header, index) => (
                                <div
                                  key={`${header.key}-${index}`}
                                  className="grid grid-cols-5 gap-2"
                                >
                                  <div className="col-span-2">
                                    <input
                                      type="text"
                                      value={header.key}
                                      onChange={e => {
                                        const next = [...newServerHeaders]
                                        next[index] = { ...next[index], key: e.target.value }
                                        setNewServerHeaders(next)
                                      }}
                                      placeholder={t('customTools.mcp.headerNamePlaceholder')}
                                      className="focus:ring-primary-500/20 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900/50"
                                    />
                                  </div>
                                  <div className="col-span-2">
                                    <input
                                      type="text"
                                      value={header.value}
                                      onChange={e => {
                                        const next = [...newServerHeaders]
                                        next[index] = { ...next[index], value: e.target.value }
                                        setNewServerHeaders(next)
                                      }}
                                      placeholder={t('customTools.mcp.headerValuePlaceholder')}
                                      className="focus:ring-primary-500/20 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900/50"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setNewServerHeaders(
                                        newServerHeaders.filter((_, i) => i !== index),
                                      )
                                    }
                                    className="text-xs text-gray-400 hover:text-red-500"
                                  >
                                    {t('customTools.mcp.removeHeader')}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                              {t('customTools.mcp.toolEnableLabel')}
                            </label>
                            {mcpGroupTools.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const allEnabled = mcpGroupTools.every(
                                    tool => mcpGroupToolStates[tool.id] ?? true,
                                  )
                                  const next = mcpGroupTools.reduce((acc, tool) => {
                                    acc[tool.id] = !allEnabled
                                    return acc
                                  }, {})
                                  setMcpGroupToolStates(next)
                                }}
                                className="text-primary-600 dark:text-primary-400 text-xs font-semibold hover:underline"
                              >
                                {mcpGroupTools.every(tool => mcpGroupToolStates[tool.id] ?? true)
                                  ? t('common.deselectAll')
                                  : t('common.selectAll')}
                              </button>
                            )}
                          </div>
                          {mcpGroupTools.length === 0 ? (
                            <div className="text-xs text-gray-400 dark:text-gray-500">
                              {t('customTools.mcp.toolEnableEmpty')}
                            </div>
                          ) : (
                            <div className="h-full space-y-2 overflow-y-auto pr-1">
                              {mcpGroupTools.map(tool => (
                                <label
                                  key={tool.id}
                                  className="flex items-center justify-between gap-2 rounded-lg border border-gray-200/70 bg-white/50 px-3 py-2 text-xs text-gray-600 dark:border-zinc-700/60 dark:bg-zinc-900/40 dark:text-gray-300"
                                >
                                  <div className="min-w-0">
                                    <div className="truncate font-medium">{tool.name}</div>
                                    <div className="truncate text-[10px] text-gray-400 dark:text-gray-500">
                                      {tool.config?.toolName || tool.name}
                                    </div>
                                  </div>
                                  <input
                                    type="checkbox"
                                    checked={mcpGroupToolStates[tool.id] ?? true}
                                    onChange={e => {
                                      setMcpGroupToolStates(prev => ({
                                        ...prev,
                                        [tool.id]: e.target.checked,
                                      }))
                                    }}
                                    className="accent-primary-600 h-4 w-4"
                                  />
                                </label>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-900/30 dark:bg-blue-900/20">
                          <p className="text-sm text-blue-800 dark:text-blue-300">
                            ℹ️ {t('customTools.mcp.syncInfo')}
                          </p>
                          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-blue-800 dark:text-blue-300">
                            {t('customTools.mcp.syncSteps', { returnObjects: true }).map(
                              (step, index) => (
                                <li key={index}>{step}</li>
                              ),
                            )}
                          </ul>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Redundant titles removed for cleaner look, handled by header */}

                      {/* Tool Type Selector - Segmented Control */}
                      {isCreating && (
                        <div className="space-y-3">
                          <label className="ml-1 block text-[11px] font-bold tracking-wider text-gray-500 uppercase dark:text-gray-400">
                            {t('customTools.form.toolType')}
                          </label>
                          <div className="flex items-center gap-1 rounded-xl border border-gray-200/50 bg-gray-100 p-1 dark:border-zinc-700/50 dark:bg-zinc-800/80">
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, toolType: 'mcp' })}
                              className={clsx(
                                'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200',
                                formData.toolType === 'mcp'
                                  ? 'text-primary-600 dark:text-primary-400 border border-gray-200 bg-white shadow-sm dark:border-zinc-600 dark:bg-zinc-700'
                                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                              )}
                            >
                              <Box size={14} />
                              MCP
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, toolType: 'http' })}
                              className={clsx(
                                'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200',
                                formData.toolType === 'http'
                                  ? 'text-primary-600 dark:text-primary-400 border border-gray-200 bg-white shadow-sm dark:border-zinc-600 dark:bg-zinc-700'
                                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                              )}
                            >
                              <Globe size={14} />
                              HTTP
                            </button>
                          </div>
                        </div>
                      )}

                      {/* MCP Form */}
                      {formData.toolType === 'mcp' && (
                        <>
                          {/* Edit mode: Show tool details */}
                          {!isCreating && editingTool ? (
                            <div className="space-y-6">
                              {/* Tool Name */}
                              <div className="rounded-xl border border-purple-100 bg-purple-50 p-4 dark:border-purple-900/30 dark:bg-purple-900/20">
                                <label className="mb-1 block text-xs font-medium text-purple-800 dark:text-purple-300">
                                  {t('customTools.form.name')}
                                </label>
                                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                  {editingTool.config?.toolName || editingTool.name}
                                </div>
                              </div>

                              {/* Tool Description */}
                              {editingTool.description && (
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                                  <label className="mb-2 block text-xs font-medium text-gray-700 dark:text-gray-300">
                                    {t('customTools.form.description')}
                                  </label>
                                  <div className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                                    {editingTool.description.replace(/^\[MCP.*?\]\s*/, '')}
                                  </div>
                                </div>
                              )}

                              {/* Parameters */}
                              {editingTool.parameters && (
                                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-900/30 dark:bg-blue-900/20">
                                  <label className="mb-2 block text-xs font-medium text-blue-800 dark:text-blue-300">
                                    参数定义
                                  </label>
                                  <pre className="overflow-x-auto text-xs text-gray-700 dark:text-gray-300">
                                    {JSON.stringify(editingTool.parameters, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {/* Server Info */}
                              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
                                <label className="mb-2 block text-xs font-medium text-gray-600 dark:text-gray-400">
                                  服务器信息
                                </label>
                                <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                  <div>
                                    <span className="font-medium">服务器:</span>
                                    {editingTool.config?.serverName || 'N/A'}
                                  </div>
                                  <div className="font-mono text-xs break-all">
                                    <span className="font-medium">URL:</span>
                                    {editingTool.config?.serverUrl || 'N/A'}
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900/30 dark:bg-yellow-900/20">
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
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                  <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                                    {t('customTools.mcp.transportLabel')}
                                  </label>
                                  <CustomSelect
                                    value={formData.serverTransport}
                                    onChange={v => setFormData({ ...formData, serverTransport: v })}
                                    options={['streamable_http', 'sse']}
                                    renderLabel={renderTransportLabel}
                                  />
                                </div>
                                <FormInput
                                  label={t('customTools.mcp.bearerTokenLabel')}
                                  value={formData.serverBearerToken}
                                  onChange={v => setFormData({ ...formData, serverBearerToken: v })}
                                  placeholder="eyJhbGciOi..."
                                  type="password"
                                />
                              </div>
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                                    {t('customTools.mcp.headersLabel')}
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFormData({
                                        ...formData,
                                        serverHeaders: [
                                          ...formData.serverHeaders,
                                          { key: '', value: '' },
                                        ],
                                      })
                                    }
                                    className="text-primary-600 dark:text-primary-400 text-xs font-semibold hover:underline"
                                  >
                                    {t('customTools.mcp.addHeader')}
                                  </button>
                                </div>
                                {formData.serverHeaders.length === 0 ? (
                                  <div className="text-xs text-gray-400 dark:text-gray-500">
                                    {t('customTools.mcp.noHeaders')}
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {formData.serverHeaders.map((header, index) => (
                                      <div
                                        key={`${header.key}-${index}`}
                                        className="grid grid-cols-5 gap-2"
                                      >
                                        <div className="col-span-2">
                                          <input
                                            type="text"
                                            value={header.key}
                                            onChange={e => {
                                              const next = [...formData.serverHeaders]
                                              next[index] = { ...next[index], key: e.target.value }
                                              setFormData({ ...formData, serverHeaders: next })
                                            }}
                                            placeholder={t('customTools.mcp.headerNamePlaceholder')}
                                            className="focus:ring-primary-500/20 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900/50"
                                          />
                                        </div>
                                        <div className="col-span-2">
                                          <input
                                            type="text"
                                            value={header.value}
                                            onChange={e => {
                                              const next = [...formData.serverHeaders]
                                              next[index] = {
                                                ...next[index],
                                                value: e.target.value,
                                              }
                                              setFormData({ ...formData, serverHeaders: next })
                                            }}
                                            placeholder={t(
                                              'customTools.mcp.headerValuePlaceholder',
                                            )}
                                            className="focus:ring-primary-500/20 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900/50"
                                          />
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const next = formData.serverHeaders.filter(
                                              (_, i) => i !== index,
                                            )
                                            setFormData({ ...formData, serverHeaders: next })
                                          }}
                                          className="text-xs text-gray-400 hover:text-red-500"
                                        >
                                          {t('customTools.mcp.removeHeader')}
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={loadMcpTools}
                                disabled={mcpToolsLoading}
                                className="bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-white shadow-md transition-all active:scale-[0.98]"
                              >
                                {mcpToolsLoading
                                  ? t('common.loading')
                                  : t('customTools.mcp.loadTools')}
                              </button>
                            </div>
                          )}

                          {/* MCP Tools List - show after loading, inside MCP branch */}
                          {isCreating && mcpToolsList.length > 0 && (
                            <>
                              {/* Debug: Show tools list status */}
                              {console.log('[MCP] Rendering tools list:', {
                                isCreating,
                                toolType: formData.toolType,
                                mcpToolsListLength: mcpToolsList.length,
                              })}
                              <div className="border-t border-gray-100 dark:border-zinc-800" />
                              <div className="flex min-h-0 flex-1 flex-col space-y-4">
                                <div className="flex items-center justify-between">
                                  <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    {t('customTools.mcp.availableTools')} ({mcpToolsList.length})
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (selectedMcpTools.size === mcpToolsList.length) {
                                        setSelectedMcpTools(new Set())
                                      } else {
                                        setSelectedMcpTools(new Set(mcpToolsList.map(t => t.id)))
                                      }
                                    }}
                                    className="text-primary-600 dark:text-primary-400 text-xs font-semibold hover:underline"
                                  >
                                    {selectedMcpTools.size === mcpToolsList.length
                                      ? t('common.deselectAll')
                                      : t('common.selectAll')}
                                  </button>
                                </div>

                                <div className="flex-1 space-y-2 overflow-y-auto pr-2">
                                  {mcpToolsList.map(tool => (
                                    <div
                                      key={tool.id}
                                      onClick={() => toggleMcpToolSelection(tool.id)}
                                      className={clsx(
                                        'group/item cursor-pointer rounded-xl border p-4 transition-all duration-200',
                                        selectedMcpTools.has(tool.id)
                                          ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/10 shadow-sm'
                                          : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50/50 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50',
                                      )}
                                    >
                                      <div className="flex items-start gap-3">
                                        <div
                                          className={clsx(
                                            'mt-0.5 flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all duration-200',
                                            selectedMcpTools.has(tool.id)
                                              ? 'border-primary-500 bg-primary-500 shadow-[0_0_10px_rgba(var(--color-primary-500),0.3)]'
                                              : 'border-gray-300 bg-transparent dark:border-zinc-700',
                                          )}
                                        >
                                          {selectedMcpTools.has(tool.id) && (
                                            <Check size={14} className="stroke-[3px] text-white" />
                                          )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                            {tool.name}
                                          </div>
                                          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                            {tool.description}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}
                        </>
                      )}

                      {/* HTTP Form - show for non-MCP tools */}
                      {formData.toolType === 'http' && (
                        <>
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
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
                                <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
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
                              <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                <Settings size={14} />
                                {t('customTools.form.securityTitle')}
                              </label>
                            </div>

                            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-900/20 dark:bg-blue-900/10">
                              <label className="mb-2 flex items-center gap-2 text-xs font-medium text-blue-800 dark:text-blue-300">
                                {t('customTools.form.params')}
                              </label>
                              <textarea
                                value={formData.params}
                                onChange={e => setFormData({ ...formData, params: e.target.value })}
                                placeholder={t('customTools.form.paramsPlaceholder')}
                                rows={5}
                                className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-blue-800 dark:bg-zinc-900"
                              />
                              <p className="mt-2 flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
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
                    </>
                  )}
                </div>
              </div>

              {/* Fixed Footer */}
              <div
                className={clsx(
                  'z-10 flex h-20 shrink-0 items-center gap-3 border-t border-gray-200 bg-white px-6 sm:px-8 dark:border-zinc-800 dark:bg-[#191a1a]',
                  isEditingServerUrl ? 'justify-between' : 'justify-end',
                )}
              >
                {isEditingServerUrl ? (
                  <>
                    <button
                      onClick={() => handleDeleteMcpGroup(editingServerUrl)}
                      disabled={updatingServerUrl}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      {t('customTools.mcp.deleteGroup')}
                    </button>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleCancelEditServerUrl}
                        disabled={updatingServerUrl}
                        className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-zinc-800"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={handleUpdateServerUrl}
                        disabled={updatingServerUrl}
                        className="bg-primary-500 flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {updatingServerUrl ? <Loader2 size={16} className="animate-spin" /> : <></>}
                        {updatingServerUrl ? t('common.loading') : t('common.save')}
                      </button>
                    </div>
                  </>
                ) : !isCreating && formData.toolType === 'mcp' ? (
                  <button
                    onClick={() => {
                      setIsCreating(false)
                      setEditingTool(null)
                    }}
                    className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-zinc-800"
                  >
                    {t('common.cancel')}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setIsCreating(false)
                        setEditingTool(null)
                      }}
                      className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-zinc-800"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={handleSave}
                      className="bg-primary-500 flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90"
                    >
                      <Save size={16} />
                      {isCreating ? t('customTools.form.save') : t('customTools.form.saveChanges')}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-gray-500 dark:text-gray-400">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50 dark:bg-zinc-900">
                <Hammer size={32} className="text-gray-300 dark:text-zinc-600" />
              </div>
              <h3 className="mb-1 text-lg font-medium text-gray-900 dark:text-gray-100">
                {t('customTools.selectTool')}
              </h3>
              <p className="mx-auto max-w-xs text-sm">{t('customTools.selectToolHelp')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const CustomSelect = ({ value, onChange, options, renderLabel }) => {
  const [isOpen, setIsOpen] = useState(false)
  const getLabel = option => (renderLabel ? renderLabel(option) : option)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="focus:ring-primary-500/20 group flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-center font-mono text-sm transition-all focus:ring-2 focus:outline-none md:text-left dark:border-zinc-800 dark:bg-zinc-900"
      >
        <span>{getLabel(value)}</span>
        <div className="rounded bg-gray-200 p-0.5 dark:bg-zinc-700">
          <ChevronRight size={12} className={clsx('transition-transform', isOpen && 'rotate-90')} />
        </div>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="animate-in fade-in zoom-in-95 absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg duration-100 dark:border-zinc-700 dark:bg-zinc-800">
            {options.map(option => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option)
                  setIsOpen(false)
                }}
                className={clsx(
                  'w-full px-3 py-2 text-left font-mono text-sm transition-colors hover:bg-gray-50 dark:hover:bg-zinc-700',
                  value === option &&
                    'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20',
                )}
              >
                {getLabel(option)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const FormInput = ({ label, value, onChange, placeholder, type = 'text', icon, rows }) => (
  <div className="w-full space-y-1.5">
    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
      {label}
    </label>
    <div className="relative">
      {icon && (
        <div className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
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
            'w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm transition-all disabled:bg-gray-50/10 dark:border-zinc-800 dark:bg-zinc-900/50',
            'focus:ring-primary-500/20 focus:border-primary-500/50 focus:ring-2 focus:outline-none',
            'placeholder:text-gray-400 dark:placeholder:text-zinc-600',
            icon && 'pl-11',
          )}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={clsx(
            'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm transition-all disabled:bg-gray-50/10 dark:border-zinc-800 dark:bg-zinc-900/50',
            'focus:ring-primary-500/20 focus:border-primary-500/50 focus:ring-2 focus:outline-none',
            'placeholder:text-gray-400 dark:placeholder:text-zinc-600',
            icon && 'pl-11',
          )}
        />
      )}
    </div>
  </div>
)

export default ToolsModal
