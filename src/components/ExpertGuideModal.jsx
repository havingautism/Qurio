import { Drawer, DrawerContent } from '@/components/ui/drawer'
import clsx from 'clsx'
import { BrainCircuit, Check, X, Users, GitBranch, Radio, ListChecks } from 'lucide-react'
import { useMemo, useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import useIsMobile from '../hooks/useIsMobile'
import { getSpaceDisplayLabel } from '../lib/spaceDisplay'
import EmojiDisplay from './EmojiDisplay'

import { listSpaceAgents } from '../lib/spacesService'

const ExpertGuideModal = ({
  isOpen,
  onClose,
  spaces = [],
  agents = [],
  onStart,
  loading = false,
}) => {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [question, setQuestion] = useState('')
  const [selectedSpaceId, setSelectedSpaceId] = useState('')
  const [teamMode, setTeamMode] = useState('coordinate')

  // Agent selection state
  const [mappings, setMappings] = useState([])
  const [spaceAgentsLoading, setSpaceAgentsLoading] = useState(false)
  const [leaderAgentId, setLeaderAgentId] = useState('')
  const [memberAgentIds, setMemberAgentIds] = useState([])

  const teamModeOptions = useMemo(
    () => [
      {
        id: 'coordinate',
        label: t('sidebar.expertMode.modes.coordinate'),
        desc: t('sidebar.expertMode.modes.coordinateDesc'),
        icon: Users,
      },
      {
        id: 'route',
        label: t('sidebar.expertMode.modes.route'),
        desc: t('sidebar.expertMode.modes.routeDesc'),
        icon: GitBranch,
      },
      {
        id: 'broadcast',
        label: t('sidebar.expertMode.modes.broadcast'),
        desc: t('sidebar.expertMode.modes.broadcastDesc'),
        icon: Radio,
      },
      {
        id: 'tasks',
        label: t('sidebar.expertMode.modes.tasks'),
        desc: t('sidebar.expertMode.modes.tasksDesc'),
        icon: ListChecks,
      },
    ],
    [t],
  )

  const availableSpaces = useMemo(
    () =>
      (spaces || []).filter(
        space => !(space?.isDeepResearchSystem || space?.isDeepResearch || space?.is_deep_research),
      ),
    [spaces],
  )

  // Fetch mappings for the selected space
  const lastFetchedSpaceIdRef = useRef('')
  useEffect(() => {
    const fetchMappings = async () => {
      if (!selectedSpaceId) {
        setMappings(prev => (prev.length > 0 ? [] : prev))
        setLeaderAgentId('')
        setMemberAgentIds([])
        lastFetchedSpaceIdRef.current = ''
        return
      }

      if (selectedSpaceId === lastFetchedSpaceIdRef.current) return

      // Clear selections for the new space
      setLeaderAgentId('')
      setMemberAgentIds([])

      setSpaceAgentsLoading(true)
      try {
        const { data, error } = await listSpaceAgents(selectedSpaceId)
        if (error) throw error
        setMappings(data || [])
        lastFetchedSpaceIdRef.current = selectedSpaceId
      } catch (err) {
        console.error('Failed to load space mappings:', err)
      } finally {
        setSpaceAgentsLoading(false)
      }
    }

    fetchMappings()
  }, [selectedSpaceId])

  // Compute spaceAgents reactively from mappings and global agents list
  const spaceAgents = useMemo(() => {
    if (!mappings.length || !agents.length) return []
    const idSet = new Set(mappings.map(m => String(m.agent_id)))
    const filtered = agents.filter(a => idSet.has(String(a.id)))

    // Sort by mappings sort_order
    return [...filtered].sort((a, b) => {
      const mA = mappings.find(m => String(m.agent_id) === String(a.id))
      const mB = mappings.find(m => String(m.agent_id) === String(b.id))
      return (mA?.sort_order || 0) - (mB?.sort_order || 0)
    })
  }, [mappings, agents])

  // Set default leader and members when spaceAgents changes
  useEffect(() => {
    if (spaceAgents.length > 0) {
      if (!leaderAgentId) {
        const primaryMapping = mappings.find(m => m.is_primary)
        const primaryId = primaryMapping
          ? String(primaryMapping.agent_id)
          : String(spaceAgents[0]?.id || '')

        setLeaderAgentId(primaryId)
        setMemberAgentIds(
          spaceAgents.filter(a => String(a.id) !== primaryId).map(a => String(a.id)),
        )
      }
    } else {
      // Guard against infinite loop: only set if not already empty
      setLeaderAgentId(prev => (prev !== '' ? '' : prev))
      setMemberAgentIds(prev => (prev.length > 0 ? [] : prev))
    }
  }, [spaceAgents, mappings])

  const canSubmit = question.trim().length > 0 && selectedSpaceId && leaderAgentId

  const handleSubmit = async () => {
    if (!canSubmit || loading) return
    const selectedSpace =
      availableSpaces.find(s => String(s.id) === String(selectedSpaceId)) || null
    if (!selectedSpace) return

    await onStart?.({
      question: question.trim(),
      space: selectedSpace,
      teamMode: teamMode,
      leaderAgentId: leaderAgentId,
      memberAgentIds: memberAgentIds,
    })
    setQuestion('')
    setSelectedSpaceId('')
    setLeaderAgentId('')
    setMemberAgentIds([])
  }

  const toggleMember = id => {
    const normalizedId = String(id)
    setMemberAgentIds(prev =>
      prev.includes(normalizedId)
        ? prev.filter(mid => mid !== normalizedId)
        : [...prev, normalizedId],
    )
  }

  const content = (
    <div className={clsx('flex h-full min-h-0 flex-col')}>
      {/* Header - Fixed */}
      <div className="mb-4 flex shrink-0 items-start justify-between">
        <div className="flex items-center gap-2">
          {!isMobile && (
            <div className="glass-elite-chip rounded-xl p-2">
              <BrainCircuit size={18} className="text-primary-500" />
            </div>
          )}
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
              {t('homeView.expertModalTitle')}
            </h3>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="glass-elite-chip rounded-full p-2 text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-300 dark:hover:text-white"
        >
          <X size={20} />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="custom-scrollbar -mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-5 pb-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
              {t('homeView.expertQuestionTitle')}
            </label>
            <textarea
              value={question}
              onChange={event => setQuestion(event.target.value)}
              placeholder={t('homeView.expertQuestionPlaceholder')}
              autoFocus={!isMobile}
              className={clsx(
                'focus:ring-primary-500/30 focus:border-primary-500 min-h-[100px] w-full resize-none rounded-2xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm transition-all focus:ring-4 focus:outline-none dark:border-zinc-700/50 dark:bg-zinc-800/50 dark:placeholder-gray-500',
                isMobile ? 'text-base' : '',
              )}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
              {t('homeView.expertSpaceTitle')}
            </label>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {availableSpaces.length === 0 && (
                <div className="col-span-full py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  {t('homeView.expertNoSpace')}
                </div>
              )}
              {availableSpaces.map(space => {
                const isSelected = String(selectedSpaceId) === String(space.id)
                return (
                  <button
                    key={space.id}
                    type="button"
                    onClick={() => setSelectedSpaceId(String(space.id))}
                    className={clsx(
                      'glass-elite-soft relative flex items-center gap-3 rounded-[20px] p-3 text-left transition-all',
                      isSelected
                        ? 'border-primary-300/35 dark:border-primary-500/35 bg-white/82 dark:bg-white/[0.12]'
                        : 'hover:border-white/26 hover:bg-white/18 dark:hover:border-white/10 dark:hover:bg-white/[0.05]',
                    )}
                  >
                    <div className="glass-elite-chip flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                      <EmojiDisplay emoji={space?.emoji} size="1.25rem" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {getSpaceDisplayLabel(space, t)}
                      </span>
                    </div>
                    <div
                      className={clsx(
                        'mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 transition-all',
                        isSelected
                          ? 'border-primary-500 bg-primary-500'
                          : 'border-slate-300 dark:border-zinc-600',
                      )}
                    >
                      {isSelected && <Check size={10} className="text-white" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {selectedSpaceId && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="mb-1.5 block text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
                {t('sidebar.expertMode.teamComposition')}
              </label>
              {spaceAgentsLoading ? (
                <div className="flex h-20 items-center justify-center rounded-2xl border border-dashed border-gray-200 dark:border-zinc-700">
                  <div className="bg-primary-500 h-5 w-5 animate-pulse rounded-full" />
                </div>
              ) : (
                <div className="space-y-3">
                  {spaceAgents.length === 0 ? (
                    <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      {t('sidebar.expertMode.noAgents')}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {spaceAgents.map(agent => {
                        const isLeader = String(agent.id) === String(leaderAgentId)
                        const isMember = memberAgentIds.includes(String(agent.id))
                        return (
                          <div
                            key={agent.id}
                            className={clsx(
                              'glass-elite-soft flex items-center gap-3 rounded-[20px] p-2.5 transition-all',
                              isLeader || isMember
                                ? 'border-primary-300/35 dark:border-primary-500/35 bg-white/82 dark:bg-white/[0.12]'
                                : 'border-gray-100 bg-transparent dark:border-zinc-800',
                            )}
                          >
                            <div className="glass-elite-chip flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                              <EmojiDisplay emoji={agent?.emoji} size="1.1rem" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                {agent.name}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {/* Leader Toggle */}
                              <button
                                type="button"
                                onClick={() => {
                                  setLeaderAgentId(String(agent.id))
                                  setMemberAgentIds(prev =>
                                    prev.filter(id => id !== String(agent.id)),
                                  )
                                }}
                                className={clsx(
                                  'flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-bold tracking-tight uppercase transition-all',
                                  isLeader
                                    ? 'bg-primary-500 text-white'
                                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-500 dark:hover:bg-zinc-700',
                                )}
                              >
                                {isLeader && <BrainCircuit size={10} />}
                                {t('sidebar.expertMode.leader')}
                              </button>

                              {/* Member Toggle */}
                              {!isLeader && (
                                <button
                                  type="button"
                                  onClick={() => toggleMember(agent.id)}
                                  className={clsx(
                                    'flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-bold tracking-tight uppercase transition-all',
                                    isMember
                                      ? 'bg-primary-500/20 text-primary-600 dark:text-primary-400'
                                      : 'border border-gray-200 text-gray-400 hover:bg-gray-50 dark:border-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800',
                                  )}
                                >
                                  {isMember
                                    ? t('sidebar.expertMode.member')
                                    : t('sidebar.expertMode.addMember')}
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
              {t('sidebar.expertMode.teamMode')}
            </label>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {teamModeOptions.map(option => {
                const isActive = teamMode === option.id
                const isDisabled = option.id === 'tasks'
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => !isDisabled && setTeamMode(option.id)}
                    className={clsx(
                      'glass-elite-soft relative flex items-start gap-3 rounded-[20px] p-3 text-left transition-all',
                      isDisabled
                        ? 'cursor-not-allowed opacity-40'
                        : isActive
                          ? 'border-primary-300/35 dark:border-primary-500/35 bg-white/82 dark:bg-white/[0.12]'
                          : 'hover:border-white/26 hover:bg-white/18 dark:hover:border-white/10 dark:hover:bg-white/[0.05]',
                    )}
                  >
                    <div
                      className={clsx(
                        'glass-elite-chip flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                        isActive ? 'text-primary-500' : 'text-gray-400',
                      )}
                    >
                      <option.icon size={18} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-gray-900 dark:text-gray-100">
                          {option.label}
                        </span>
                        {isDisabled && (
                          <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-bold tracking-wide uppercase bg-amber-100/80 text-amber-600 dark:bg-amber-900/30 dark:text-amber-500">
                            {t('sidebar.expertMode.modes.comingSoon')}
                          </span>
                        )}
                      </div>
                      {!isDisabled && (
                        <span className="line-clamp-2 text-[10px] leading-tight text-gray-500 dark:text-zinc-400">
                          {option.desc}
                        </span>
                      )}
                    </div>
                    <div
                      className={clsx(
                        'mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                        isActive
                          ? 'border-primary-500 bg-primary-500'
                          : 'border-slate-300 dark:border-zinc-600',
                      )}
                    >
                      {isActive && <Check size={10} className="text-white" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Footer - Fixed */}
      <div
        className={clsx(
          'mt-4 flex shrink-0 gap-2 border-t border-gray-100 pt-2 dark:border-zinc-800',
          isMobile ? 'pb-[calc(env(safe-area-inset-bottom,0px)+0.25rem)]' : 'justify-end',
        )}
      >
        {!isMobile && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800"
          >
            {t('common.cancel')}
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          className={clsx(
            'bg-primary-500 hover:bg-primary-600 disabled:hover:bg-primary-500 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50',
            isMobile ? 'w-full py-3 text-base' : 'min-w-[100px]',
          )}
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              <span>{t('common.loading')}</span>
            </div>
          ) : (
            t('homeView.expertStart')
          )}
        </button>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={open => !open && onClose()}>
        <DrawerContent className="h-[92dvh] max-h-[92dvh] overflow-hidden">
          <div className="flex h-full min-h-0 flex-col px-4 pt-4 pb-3">{content}</div>
        </DrawerContent>
      </Drawer>
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <div className="glass-elite-panel flex max-h-[85vh] w-full max-w-xl flex-col rounded-[28px] border-0 p-5 shadow-2xl">
        {content}
      </div>
    </div>
  )
}

export default ExpertGuideModal
