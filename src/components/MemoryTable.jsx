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
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
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
      <div className="flex flex-col items-center justify-center p-12 text-gray-500 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
        <p className="text-sm">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900/50 shadow-sm">
      <Table>
        <TableHeader className="bg-gray-50/50 dark:bg-zinc-800/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="font-semibold">{t('settings.memory.table.summary')}</TableHead>
            <TableHead className="w-[140px] font-semibold">
              {t('settings.memory.table.domain')}
            </TableHead>
            <TableHead className="w-[140px] font-semibold">
              {t('settings.memory.table.aliases')}
            </TableHead>
            <TableHead className="w-[100px] font-semibold">
              {t('settings.memory.table.scope')}
            </TableHead>
            <TableHead className="w-[80px] text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {memories.map(memory => (
            <TableRow
              key={memory.id || memory.domain_key}
              className="group hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <TableCell className="align-top py-4">
                {editingId === memory.id ? (
                  <Textarea
                    value={editForm.summary}
                    onChange={e => setEditForm(prev => ({ ...prev, summary: e.target.value }))}
                    className="min-h-[80px] text-xs resize-y"
                    placeholder="Memory summary..."
                  />
                ) : (
                  <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                    {memory.latest_summary?.summary || memory.summary || (
                      <span className="text-gray-400 italic">No summary</span>
                    )}
                  </div>
                )}
              </TableCell>

              <TableCell className="align-top py-4">
                <div className="flex items-center gap-2">
                  <Database size={14} className="text-primary-500/70 shrink-0" />
                  <span
                    className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[110px]"
                    title={memory.domain_key}
                  >
                    {memory.domain_key}
                  </span>
                </div>
              </TableCell>

              <TableCell className="align-top py-4">
                {editingId === memory.id ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500 font-medium px-1">Comma separated</span>
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

              <TableCell className="align-top py-4">
                {editingId === memory.id ? (
                  <Input
                    value={editForm.scope}
                    onChange={e => setEditForm(prev => ({ ...prev, scope: e.target.value }))}
                    className="h-8 text-xs"
                    placeholder="Scope"
                  />
                ) : memory.scope ? (
                  <Badge variant="outline" className="gap-1 max-w-full">
                    <Globe size={10} className="shrink-0" />
                    <span className="truncate">{memory.scope}</span>
                  </Badge>
                ) : (
                  <span className="text-xs text-gray-400">-</span>
                )}
              </TableCell>

              <TableCell className="align-top text-right py-4">
                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {editingId === memory.id ? (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-full"
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
                        className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
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
                        className="h-8 w-8 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-full"
                        title={t('common.edit')}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(memory.domain_key)}
                        className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full"
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
                  <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-gray-400">
                    <Database size={20} />
                  </div>
                  <p className="font-medium text-gray-900 dark:text-gray-200">No memories yet</p>
                  <p className="text-xs text-gray-400 max-w-xs">
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
