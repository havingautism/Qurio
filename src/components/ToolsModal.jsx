import { useEffect, useState, useMemo } from 'react'
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Save,
  Search,
  Globe,
  Settings,
  AlertCircle,
  Code,
  Check,
  ChevronRight,
} from 'lucide-react'
import {
  createUserTool,
  deleteUserTool,
  getUserTools,
  updateUserTool,
} from '../lib/userToolsService'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

const ToolsModal = ({ isOpen, onClose }) => {
  const { t } = useTranslation()
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(false)
  const [editingTool, setEditingTool] = useState(null) // null = create mode if isCreating is true
  const [isCreating, setIsCreating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    url: '',
    method: 'GET',
    params: '',
    allowedDomains: '',
    maxResponseSize: '100000',
    timeout: '10000',
  })

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

  const handleCreate = () => {
    setIsCreating(true)
    setEditingTool(null)
    setFormData({
      name: '',
      description: '',
      url: '',
      method: 'GET',
      params: '',
      allowedDomains: '',
      maxResponseSize: '100000',
      timeout: '10000',
    })
  }

  const handleEdit = tool => {
    setIsCreating(false)
    setEditingTool(tool)
    setFormData({
      name: tool.name,
      description: tool.description,
      url: tool.config.url,
      method: tool.config.method || 'GET',
      params: JSON.stringify(tool.config.params || {}, null, 2),
      allowedDomains: (tool.config.security?.allowedDomains || []).join(', '),
      maxResponseSize: String(tool.config.security?.maxResponseSize || 100000),
      timeout: String(tool.config.security?.timeout || 10000),
    })
  }

  const handleSave = async () => {
    try {
      // Parse params
      let params = {}
      if (formData.params.trim()) {
        try {
          params = JSON.parse(formData.params)
        } catch (e) {
          alert(t('customTools.invalidJson'))
          return
        }
      }

      // Parse allowed domains
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
            // Extract all template variables from URL and params values
            (() => {
              const variables = new Set()
              const templateRegex = /\{\{(\w+)\}\}/g

              // Extract from URL
              let match
              while ((match = templateRegex.exec(formData.url)) !== null) {
                variables.add(match[1])
              }

              // Extract from params values
              for (const value of Object.values(params)) {
                if (typeof value === 'string') {
                  templateRegex.lastIndex = 0 // Reset regex
                  while ((match = templateRegex.exec(value)) !== null) {
                    variables.add(match[1])
                  }
                }
              }

              // Generate properties for each variable
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

      // Reset view but keep list loaded
      if (isCreating) {
        setIsCreating(false)
        setEditingTool(null) // Go back to empty state or list
      } else {
        // If editing, keep editing the updated tool (or reload it)
        // Ideally we should select the updated tool. For now, simple reset to list
        setEditingTool(null)
      }
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

  const filteredTools = useMemo(() => {
    if (!searchQuery) return tools
    const query = searchQuery.toLowerCase()
    return tools.filter(
      t => t.name.toLowerCase().includes(query) || t.description.toLowerCase().includes(query),
    )
  }, [tools, searchQuery])

  if (!isOpen) return null

  // Determine what to show in the right pane
  const showForm = isCreating || editingTool

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-5xl h-[85vh] bg-white dark:bg-[#191a1a] rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row border border-gray-200 dark:border-zinc-800">
        {/* LEFT PANE: List */}
        <div
          className={clsx(
            'flex flex-col w-full md:w-1/3 border-r border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50',
            showForm ? 'hidden md:flex' : 'flex', // Hide list on mobile if form is open
          )}
        >
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-zinc-800 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('customTools.title')}
              </h2>
              <div className="flex md:hidden">
                <button onClick={onClose} className="p-2 -mr-2 text-gray-500">
                  <X size={20} />
                </button>
              </div>
            </div>
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
                className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
            <button
              onClick={handleCreate}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-all shadow-sm active:scale-95"
            >
              <Plus size={16} />
              {t('customTools.create')}
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
                {t('common.loading')}
              </div>
            ) : filteredTools.length === 0 ? (
              <div className="text-center py-10 px-4 text-gray-500 dark:text-gray-400">
                <div className="mb-2 flex justify-center">
                  <Globe size={24} className="opacity-20" />
                </div>
                <p className="text-sm">{t('customTools.noToolsFound')}</p>
              </div>
            ) : (
              filteredTools.map(tool => (
                <div
                  key={tool.id}
                  onClick={() => handleEdit(tool)}
                  className={clsx(
                    'group flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all',
                    editingTool?.id === tool.id
                      ? 'bg-white dark:bg-zinc-800 border-primary-500 shadow-sm'
                      : 'bg-white dark:bg-zinc-900 border-transparent hover:border-gray-200 dark:hover:border-zinc-700 hover:shadow-sm',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className={clsx(
                          'text-xs font-mono px-1.5 py-0.5 rounded',
                          tool.config.method === 'GET'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : tool.config.method === 'POST'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
                        )}
                      >
                        {tool.config.method}
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {tool.name}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate pl-1">
                      {tool.config.url}
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
              ))
            )}
          </div>
        </div>

        {/* RIGHT PANE: Detail/Form */}
        <div
          className={clsx(
            'flex-1 flex flex-col bg-white dark:bg-[#191a1a] w-full',
            !showForm && 'hidden md:flex', // Hide details on mobile if not editing
          )}
        >
          {/* Mobile Header for Detail View */}
          {showForm && (
            <div className="md:hidden flex items-center gap-3 p-4 border-b border-gray-200 dark:border-zinc-800">
              <button
                onClick={() => {
                  setIsCreating(false)
                  setEditingTool(null)
                }}
                className="p-2 -ml-2 text-gray-600 dark:text-gray-400"
              >
                <ChevronRight size={20} className="rotate-180" />
              </button>
              <h3 className="font-semibold">
                {isCreating ? t('customTools.createTitle') : t('customTools.editTitle')}
              </h3>
            </div>
          )}

          {/* Desktop Close Button (Absolute) */}
          <div className="hidden md:block absolute top-4 right-4 z-10">
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {showForm ? (
            <div className="flex-1 overflow-y-auto p-6 md:p-10">
              <div className="max-w-2xl mx-auto space-y-8">
                <div>
                  <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                    {isCreating ? t('customTools.createTitle') : t('customTools.editTitle')}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    {t('customTools.tooltip')}
                  </p>
                </div>

                {/* Basic Info Group */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormInput
                      label={t('customTools.form.name')}
                      value={formData.name}
                      onChange={v => setFormData({ ...formData, name: v })}
                      placeholder={t('customTools.form.namePlaceholder')}
                      icon={<Code size={14} />}
                    />
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {t('customTools.form.method')}
                      </label>
                      <div className="relative">
                        <select
                          value={formData.method}
                          onChange={e => setFormData({ ...formData, method: e.target.value })}
                          className="w-full appearance-none pl-3 pr-8 py-2.5 text-sm bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all font-mono"
                        >
                          <option>GET</option>
                          <option>POST</option>
                          <option>PUT</option>
                          <option>DELETE</option>
                        </select>
                      </div>
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

                {/* Configuration Group */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <Settings size={14} />
                      {t('customTools.form.securityTitle')}
                    </label>
                  </div>

                  <div className="bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/20">
                    <label className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-2 block flex items-center gap-2">
                      {t('customTools.form.params')}
                    </label>
                    <textarea
                      value={formData.params}
                      onChange={e => setFormData({ ...formData, params: e.target.value })}
                      placeholder='{ "q": "{{city}}" }'
                      rows={5}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-800 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {t('customTools.form.paramsHelp', {
                        variable: '{{variable}}',
                        defaultValue: 'Use {{variable}} syntax for dynamic values.',
                      })}
                    </p>
                  </div>

                  <FormInput
                    label={t('customTools.form.allowedDomains')}
                    value={formData.allowedDomains}
                    onChange={v => setFormData({ ...formData, allowedDomains: v })}
                    placeholder="api.weather.com, api.google.com"
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormInput
                      label={t('customTools.form.maxResponseSize')}
                      type="number"
                      value={formData.maxResponseSize}
                      onChange={v => setFormData({ ...formData, maxResponseSize: v })}
                    />
                    <FormInput
                      label={t('customTools.form.timeout')}
                      type="number"
                      value={formData.timeout}
                      onChange={v => setFormData({ ...formData, timeout: v })}
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    onClick={handleSave}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-all shadow-lg shadow-primary-500/20 active:scale-95"
                  >
                    <Save size={18} />
                    {isCreating ? t('customTools.create') : t('customTools.form.saveChanges')}
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
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-500 dark:text-gray-400">
              <div className="w-16 h-16 bg-gray-50 dark:bg-zinc-900 rounded-2xl flex items-center justify-center mb-4">
                <Settings size={32} className="text-gray-300 dark:text-zinc-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
                {t('customTools.selectTool')}
              </h3>
              <p className="text-sm max-w-xs mx-auto mb-6">{t('customTools.selectToolHelp')}</p>
              <button
                onClick={handleCreate}
                className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-700 transition-all font-medium shadow-sm"
              >
                <Plus size={16} />
                {t('customTools.create')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Helper Component for inputs
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
            'w-full px-3 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm transition-all resize-none',
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
            'w-full px-3 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm transition-all',
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
