import { useState, useEffect } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Edit2, Save, X, Trash2, Loader2, Globe, Database } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  getMemoryDomains,
  upsertMemoryDomainSummary,
  deleteMemoryDomain,
} from '../lib/longTermMemoryService'
import clsx from 'clsx'

const Badge = ({ children, className, variant = 'default' }) => {
  const variants = {
    default:
      'bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300 border-primary-200 dark:border-primary-800',
    secondary:
      'bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-zinc-300 border-gray-200 dark:border-zinc-700',
    outline: 'bg-transparent border-gray-200 text-gray-600 dark:border-zinc-700 dark:text-gray-400',
  }
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}

const MemoryTable = () => {
  const { t } = useTranslation()
  const [memories, setMemories] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [isSaving, setIsSaving] = useState(false)

  const fetchMemories = async () => {
    setIsLoading(true)
    try {
      const data = await getMemoryDomains()
      setMemories(data)
    } catch (error) {
      console.error('Failed to fetch memories:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchMemories()
  }, [])

  const handleEdit = memory => {
    setEditingId(memory.id)
    setEditForm({
      domainKey: memory.domain_key,
      summary: memory.latest_summary?.summary || memory.summary || '',
      aliases: (memory.aliases || []).join(', '),
      scope: memory.scope || '',
    })
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditForm({})
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const { domainKey, summary, aliases, scope } = editForm
      await upsertMemoryDomainSummary({
        domainKey,
        summary,
        aliases: aliases
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
        scope,
        append: false, // Overwrite summary
      })
      await fetchMemories()
      setEditingId(null)
    } catch (error) {
      console.error('Failed to save memory:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async domainKey => {
    if (!window.confirm(t('settings.memory.actions.confirmDelete'))) return
    try {
      await deleteMemoryDomain(domainKey)
      await fetchMemories()
    } catch (error) {
      console.error('Failed to delete memory:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-gray-500">
        <Loader2 className="text-primary-500 h-6 w-6 animate-spin" />
        <p className="text-sm">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
      <Table>
        <TableHeader className="bg-gray-50/50 dark:bg-zinc-800/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="min-w-[320px] font-semibold">
              {t('settings.memory.table.summary')}
            </TableHead>
            <TableHead className="w-[160px] font-semibold">
              {t('settings.memory.table.domain')}
            </TableHead>
            <TableHead className="w-[160px] font-semibold">
              {t('settings.memory.table.aliases')}
            </TableHead>
            <TableHead className="w-[140px] font-semibold">
              {t('settings.memory.table.scope')}
            </TableHead>
            <TableHead className="w-[80px] text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {memories.map(memory => (
            <TableRow
              key={memory.id || memory.domain_key}
              className="group transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/50"
            >
              <TableCell className="py-4 align-top">
                {editingId === memory.id ? (
                  <Textarea
                    value={editForm.summary}
                    onChange={e => setEditForm(prev => ({ ...prev, summary: e.target.value }))}
                    className="min-h-[80px] resize-y text-xs"
                    placeholder="Memory summary..."
                  />
                ) : (
                  <div className="custom-scrollbar max-h-[120px] overflow-y-auto pr-2 text-sm leading-relaxed whitespace-pre-wrap text-gray-600 dark:text-gray-400">
                    {memory.latest_summary?.summary || memory.summary || (
                      <span className="text-gray-400 italic">No summary</span>
                    )}
                  </div>
                )}
              </TableCell>

              <TableCell className="py-4 align-top">
                <div className="flex items-center gap-2">
                  <Database size={14} className="text-primary-500/70 shrink-0" />
                  <span
                    className="max-w-[110px] truncate font-medium text-gray-900 dark:text-gray-100"
                    title={memory.domain_key}
                  >
                    {memory.domain_key}
                  </span>
                </div>
              </TableCell>

              <TableCell className="py-4 align-top">
                {editingId === memory.id ? (
                  <div className="flex flex-col gap-1">
                    <span className="px-1 text-xs font-medium text-gray-500">Comma separated</span>
                    <Input
                      value={editForm.aliases}
                      onChange={e => setEditForm(prev => ({ ...prev, aliases: e.target.value }))}
                      placeholder="e.g. coding, dev, work"
                      className="h-8 text-xs"
                    />
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(memory.aliases || []).length > 0 ? (
                      (memory.aliases || []).slice(0, 3).map((alias, idx) => (
                        <Badge key={idx} variant="secondary">
                          {alias}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-gray-400 italic">No aliases</span>
                    )}
                    {(memory.aliases || []).length > 3 && (
                      <Badge variant="secondary">+{memory.aliases.length - 3}</Badge>
                    )}
                  </div>
                )}
              </TableCell>

              <TableCell className="py-4 align-top">
                {editingId === memory.id ? (
                  <Input
                    value={editForm.scope}
                    onChange={e => setEditForm(prev => ({ ...prev, scope: e.target.value }))}
                    className="h-8 text-xs"
                    placeholder="Scope"
                  />
                ) : memory.scope ? (
                  <Badge variant="outline" className="max-w-full gap-1">
                    <Globe size={10} className="shrink-0" />
                    <span className="truncate">{memory.scope}</span>
                  </Badge>
                ) : (
                  <span className="text-xs text-gray-400">-</span>
                )}
              </TableCell>

              <TableCell className="py-4 text-right align-top">
                <div className="flex items-center justify-end gap-1">
                  {editingId === memory.id ? (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="h-8 w-8 rounded-full text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-900/20"
                        title={t('common.save')}
                      >
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleCancel}
                        disabled={isSaving}
                        className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
                        title={t('common.cancel')}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEdit(memory)}
                        className="hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 h-8 w-8 rounded-full text-gray-400"
                        title={t('common.edit')}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(memory.domain_key)}
                        className="h-8 w-8 rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                        title={t('common.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {memories.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="h-32 text-center text-gray-500">
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-zinc-800">
                    <Database size={20} />
                  </div>
                  {/* <p className="font-medium text-gray-900 dark:text-gray-200">No memories yet</p> */}
                  <p className="max-w-xs text-xs text-gray-400">
                    {t('settings.memory.table.emptyHint') ||
                      'Long-term memories will be automatically created as you chat with the agent.'}
                  </p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export default MemoryTable
