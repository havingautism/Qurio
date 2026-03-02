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
} from 'lucide-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { getBackendUrl } from '../lib/settings'
import { useAppContext } from '../App'
import { useToast } from '../contexts/ToastContext'

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
      toast.error(t('skills.loadError', 'Failed to load skills'))
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
        fetchSkillFiles(skillId)
      } else {
        throw new Error('Failed to fetch skill details')
      }
    } catch (err) {
      console.error(err)
      toast.error(t('skills.detailsError', 'Failed to load skill details'))
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
    toast.success(t('skills.fileStaged', 'Changes staged locally'))
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
      toast.success(t('skills.fileStaged', 'File created locally (Save Skill to commit)'))
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
        toast.success(t('skills.fileDeleted', 'File removed'))
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
          toast.success(t('skills.deleteSuccess', 'Skill deleted successfully'))
          window.dispatchEvent(new CustomEvent('skills-changed'))
          fetchSkills()
        } else {
          throw new Error('Failed to delete skill')
        }
      } catch (err) {
        console.error(err)
        toast.error(t('skills.deleteError', 'Failed to delete skill'))
      }
    }

    showConfirmation({
      title: t('skills.deleteConfirmTitle', 'Delete Skill?'),
      message: t(
        'skills.deleteConfirmMessage',
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
      toast.error(t('skills.idRequired', 'Skill ID is required'))
      setIsSaving(false)
      return
    }
    if (!formData.name.trim()) {
      toast.error(t('skills.nameRequired', 'Display Name is required'))
      setIsSaving(false)
      return
    }
    if (!formData.description.trim()) {
      toast.error(t('skills.descriptionRequired', 'Short Description is required'))
      setIsSaving(false)
      return
    }
    if (!formData.instructions.trim() || formData.instructions.trim() === '# Instructions') {
      toast.error(t('skills.instructionsRequired', 'System Instructions are required'))
      setIsSaving(false)
      return
    }

    const cleanId = formData.id.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    if (!/^[a-z0-9-]+$/.test(cleanId) || cleanId.length > 64) {
      toast.error(
        t(
          'skills.invalidId',
          'Skill ID must be 1-64 characters, lowercase, alphanumeric, and hyphens only',
        ),
      )
      setIsSaving(false)
      return
    }

    if (formData.description.length > 1024) {
      toast.error(t('skills.descTooLong', 'Description must be 1024 characters or less'))
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
        toast.success(t('skills.saveSuccess', 'Skill saved successfully'))

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
        if (shouldClose) onClose()
      } else {
        const errData = await res.json()
        throw new Error(errData.detail || 'Save failed')
      }
    } catch (err) {
      console.error(err)
      toast.error(err.message || t('skills.saveError', 'Failed to save skill'))
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
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-zinc-800">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {isEditing
                ? isNew
                  ? t('skills.createNew', 'Create New Skill')
                  : t('skills.editSkill', 'Edit Skill')
                : t('sidebar.skills', 'Skills Workshop')}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {isEditing
                ? t(
                    'skills.editDesc',
                    'Define the system instructions and capabilities for this skill',
                  )
                : t(
                    'skills.workshopDesc',
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
        <div className="no-scrollbar flex-1 overflow-y-auto bg-gray-50/50 dark:bg-zinc-900/50">
          {isEditing ? (
            <div className="flex h-full min-h-[500px]">
              {/* Left Sidebar for Files */}
              <div className="no-scrollbar flex w-64 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-gray-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
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
                          toast.error(t('skills.idRequired', 'Please enter a Skill ID first'))
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
                      <div className="border-primary-300 dark:border-primary-900/50 flex items-center gap-1 rounded border bg-white p-1 dark:bg-zinc-800">
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
                              ? 'bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400 font-medium'
                              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-zinc-800',
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
                          toast.error(t('skills.idRequired', 'Please enter a Skill ID first'))
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
                      <div className="border-primary-300 dark:border-primary-900/50 flex items-center gap-1 rounded border bg-white p-1 dark:bg-zinc-800">
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
                              ? 'bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400 font-medium'
                              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-zinc-800',
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
                          {t('skills.idLabel', 'Skill ID (Internal Name)')}
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
                          className="focus:border-primary-500 focus:ring-primary-500/20 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 transition-all outline-none placeholder:text-gray-400 focus:ring-2 disabled:bg-gray-100 disabled:text-gray-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:disabled:bg-zinc-800/50"
                        />
                        {isNew && (
                          <p className="text-[10px] text-gray-500">
                            Lowercase, alphanumeric, and hyphens only (max 64 chars).
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('skills.nameLabel', 'Display Name')}
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={e => setFormData({ ...formData, name: e.target.value })}
                          placeholder="e.g. Pirate Greeter"
                          className="focus:border-primary-500 focus:ring-primary-500/20 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 transition-all outline-none placeholder:text-gray-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('skills.descLabel', 'Short Description')}
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
                        className="focus:border-primary-500 focus:ring-primary-500/20 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 transition-all outline-none placeholder:text-gray-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                      <p className="text-right text-[10px] text-gray-400">
                        {formData.description.length}/1024
                      </p>
                    </div>

                    <div className="flex min-h-[300px] flex-1 flex-col space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('skills.instructionsLabel', 'System Instructions (Markdown)')}
                        </label>
                      </div>
                      <textarea
                        required
                        value={formData.instructions}
                        onChange={e => setFormData({ ...formData, instructions: e.target.value })}
                        placeholder="You are an expert at..."
                        className="focus:border-primary-500 focus:ring-primary-500/20 min-h-[300px] w-full flex-1 resize-none rounded-xl border border-gray-200 bg-white p-4 font-mono text-sm text-gray-900 transition-all outline-none placeholder:text-gray-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
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
                        className="focus:border-primary-500 focus:ring-primary-500/20 w-full flex-1 resize-none rounded-xl border border-gray-200 bg-white p-4 font-mono text-sm text-gray-900 transition-all outline-none focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-6">
              {/* Header Action */}
              <div className="mb-6 flex justify-end">
                <button
                  onClick={handleCreateNew}
                  className="bg-primary-500 hover:bg-primary-600 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md active:scale-95"
                >
                  <Plus size={16} />
                  {t('skills.createButton', 'Create Skill')}
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
                    className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
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
                      className="group flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-gray-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
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
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-100 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              onClick={saveCombined}
              disabled={isSaving}
              className="bg-primary-500 hover:bg-primary-600 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md active:scale-95 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Check size={16} />
                  Save Skill
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
