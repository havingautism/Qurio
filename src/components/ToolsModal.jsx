import { useEffect, useState } from 'react'
import { X, Plus, Trash2, Edit2, Save } from 'lucide-react'
import {
  createUserTool,
  deleteUserTool,
  getUserTools,
  updateUserTool,
} from '../lib/userToolsService'

const ToolsModal = ({ isOpen, onClose }) => {
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(false)
  const [editingTool, setEditingTool] = useState(null)
  const [isCreating, setIsCreating] = useState(false)

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
          alert('Invalid JSON for parameters')
          return
        }
      }

      // Parse allowed domains
      const allowedDomains = formData.allowedDomains
        .split(',')
        .map(d => d.trim())
        .filter(Boolean)

      if (allowedDomains.length === 0) {
        alert('At least one allowed domain is required')
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
            Object.keys(params).map(key => [
              key.replace(/^\{\{|\}\}$/g, ''), // Remove template syntax
              {
                type: 'string',
                description: `Parameter: ${key}`,
              },
            ]),
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
      alert(`Failed to save tool: ${error.message}`)
    }
  }

  const handleDelete = async toolId => {
    if (!confirm('Are you sure you want to delete this tool?')) return

    try {
      await deleteUserTool(toolId)
      await loadTools()
    } catch (error) {
      console.error('Failed to delete tool:', error)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-zinc-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Custom Tools</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : (
            <>
              {/* Tool List */}
              {!isCreating && !editingTool && (
                <>
                  <button
                    onClick={handleCreate}
                    className="mb-4 flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    <Plus size={16} />
                    Create New Tool
                  </button>

                  <div className="space-y-3">
                    {tools.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        No custom tools yet. Create one to get started!
                      </div>
                    ) : (
                      tools.map(tool => (
                        <div
                          key={tool.id}
                          className="p-4 border border-gray-200 dark:border-zinc-700 rounded-lg hover:border-primary-500 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="font-medium text-gray-900 dark:text-gray-100">
                                {tool.name}
                              </h3>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {tool.description}
                              </p>
                              <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                                <span className="px-2 py-1 bg-gray-100 dark:bg-zinc-800 rounded">
                                  {tool.config.method}
                                </span>
                                <span className="truncate">{tool.config.url}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <button
                                onClick={() => handleEdit(tool)}
                                className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded transition-colors"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={() => handleDelete(tool.id)}
                                className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}

              {/* Create/Edit Form */}
              {(isCreating || editingTool) && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium">
                      {isCreating ? 'Create Tool' : 'Edit Tool'}
                    </h3>
                    <button
                      onClick={() => {
                        setIsCreating(false)
                        setEditingTool(null)
                      }}
                      className="text-gray-600 hover:text-gray-900"
                    >
                      Cancel
                    </button>
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Tool Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. get_weather"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Description *
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      placeholder="e.g. Query weather information"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  {/* Method */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Method
                    </label>
                    <select
                      value={formData.method}
                      onChange={e => setFormData({ ...formData, method: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="DELETE">DELETE</option>
                    </select>
                  </div>

                  {/* URL */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      URL *
                    </label>
                    <input
                      type="url"
                      value={formData.url}
                      onChange={e => setFormData({ ...formData, url: e.target.value })}
                      placeholder="https://api.example.com/data"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  {/* Parameters */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Parameters (JSON)
                    </label>
                    <textarea
                      value={formData.params}
                      onChange={e => setFormData({ ...formData, params: e.target.value })}
                      placeholder='{"q": "{{city}}"}'
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Use {'{{'} variable {'}}'} for dynamic values.
                    </p>
                  </div>

                  {/* Allowed Domains */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Allowed Domains * (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={formData.allowedDomains}
                      onChange={e => setFormData({ ...formData, allowedDomains: e.target.value })}
                      placeholder="api.example.com"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  {/* Advanced Settings */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Max Response Size (bytes)
                      </label>
                      <input
                        type="number"
                        value={formData.maxResponseSize}
                        onChange={e =>
                          setFormData({ ...formData, maxResponseSize: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Timeout (ms)
                      </label>
                      <input
                        type="number"
                        value={formData.timeout}
                        onChange={e => setFormData({ ...formData, timeout: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  </div>

                  {/* Save Button */}
                  <button
                    onClick={handleSave}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                  >
                    <Save size={16} />
                    {isCreating ? 'Create Tool' : 'Save Changes'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ToolsModal
