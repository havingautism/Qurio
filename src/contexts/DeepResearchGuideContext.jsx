import clsx from 'clsx'
import { Check, Microscope, Sparkles, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import useScrollLock from '../hooks/useScrollLock'
import { addConversationEvent, createConversation } from '../lib/conversationsService'

const DeepResearchGuideContext = createContext(null)

export const useDeepResearchGuide = () => {
  const context = useContext(DeepResearchGuideContext)
  if (!context) {
    throw new Error('useDeepResearchGuide must be used within DeepResearchGuideProvider')
  }
  return context
}

export const DeepResearchGuideProvider = ({
  children,
  deepResearchSpace,
  deepResearchAgent,
  defaultAgent,
}) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [deepResearchStep, setDeepResearchStep] = useState(1)
  const [deepResearchQuestion, setDeepResearchQuestion] = useState('')
  const [deepResearchScope, setDeepResearchScope] = useState('')
  const [deepResearchScopeAuto, setDeepResearchScopeAuto] = useState(true)
  const [deepResearchOutput, setDeepResearchOutput] = useState('')
  const [deepResearchOutputAuto, setDeepResearchOutputAuto] = useState(true)
  const [deepResearchType, setDeepResearchType] = useState('general')
  const [deepResearchConcurrent, setDeepResearchConcurrent] = useState(false)

  const resetDeepResearchForm = useCallback(() => {
    setDeepResearchStep(1)
    setDeepResearchQuestion('')
    setDeepResearchScope('')
    setDeepResearchScopeAuto(true)
    setDeepResearchOutput('')
    setDeepResearchOutputAuto(true)
    setDeepResearchType('general')
    setDeepResearchConcurrent(false)
  }, [])

  const openDeepResearchGuide = useCallback(() => {
    resetDeepResearchForm()
    setIsOpen(true)
  }, [resetDeepResearchForm])

  const closeDeepResearchGuide = useCallback(() => {
    setIsOpen(false)
    resetDeepResearchForm()
  }, [resetDeepResearchForm])

  const buildDeepResearchPrompt = useCallback(() => {
    const autoLabel = t('homeView.auto')
    const scopeValue =
      deepResearchScopeAuto || !deepResearchScope.trim() ? autoLabel : deepResearchScope.trim()
    const outputValue =
      deepResearchOutputAuto || !deepResearchOutput.trim() ? autoLabel : deepResearchOutput.trim()

    return [
      `${t('homeView.deepResearchQuestionLabel')}: ${deepResearchQuestion.trim()}`,
      `${t('homeView.deepResearchScopeLabel')}: ${scopeValue}`,
      `${t('homeView.deepResearchOutputLabel')}: ${outputValue}`,
    ].join('\n')
  }, [
    deepResearchOutput,
    deepResearchOutputAuto,
    deepResearchQuestion,
    deepResearchScope,
    deepResearchScopeAuto,
    t,
  ])

  const handleStartDeepResearchGuide = useCallback(async () => {
    if (!deepResearchQuestion.trim()) return
    if (!deepResearchSpace || !deepResearchAgent) {
      console.error('Deep research space or agent missing.')
      return
    }

    try {
      const { data: conversation, error } = await createConversation({
        space_id: deepResearchSpace.id,
        title: 'Deep Research',
        api_provider: deepResearchAgent.provider || defaultAgent?.provider || '',
      })

      if (error || !conversation) {
        console.error('Failed to create deep research conversation:', error)
        return
      }

      addConversationEvent(conversation.id, 'deep_research', { enabled: true }).catch(err =>
        console.error('Failed to record deep research event:', err),
      )

      const chatState = {
        initialMessage: buildDeepResearchPrompt(),
        initialAttachments: [],
        initialToggles: {
          search: true,
          thinking: false,
          deepResearch: true,
          concurrentResearch: deepResearchConcurrent,
          related: false,
        },
        initialSpaceSelection: {
          mode: 'manual',
          space: deepResearchSpace,
        },
        initialAgentSelection: deepResearchAgent,
        initialIsAgentAutoMode: false,
        researchType: deepResearchType,
      }

      navigate({
        to: '/deepresearch/$conversationId',
        params: { conversationId: conversation.id },
        state: chatState,
      })

      closeDeepResearchGuide()
    } catch (err) {
      console.error('Failed to start deep research:', err)
    }
  }, [
    buildDeepResearchPrompt,
    closeDeepResearchGuide,
    deepResearchAgent,
    deepResearchConcurrent,
    deepResearchQuestion,
    deepResearchSpace,
    deepResearchType,
    defaultAgent,
    navigate,
  ])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        closeDeepResearchGuide()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, closeDeepResearchGuide])

  useScrollLock(isOpen)

  const contextValue = useMemo(
    () => ({
      isOpen,
      openDeepResearchGuide,
      closeDeepResearchGuide,
    }),
    [isOpen, openDeepResearchGuide, closeDeepResearchGuide],
  )

  return (
    <DeepResearchGuideContext.Provider value={contextValue}>
      {children}
      {isOpen &&
        createPortal(
          <div className="fixed inset-0 z-9999 flex items-end justify-center sm:items-center">
            <div
              className="absolute inset-0 bg-black/60 transition-opacity md:backdrop-blur-sm"
              onClick={closeDeepResearchGuide}
            />
            <div
              className="animate-slide-up relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[85vh] sm:animate-none sm:rounded-2xl dark:bg-[#1E1E1E]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex shrink-0 justify-center py-2 sm:hidden">
                <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-zinc-700" />
              </div>

              <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-zinc-800/60">
                <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  <div className="bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-lg p-1.5">
                    <Microscope size={18} />
                  </div>
                  <h3 className="text-base font-bold">{t('homeView.deepResearchModalTitle')}</h3>
                </div>
                <button
                  onClick={closeDeepResearchGuide}
                  className="-mr-2 rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-gray-200"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-6">
                <div className="mb-8 flex items-center gap-2">
                  {[1, 2, 3].map(step => (
                    <div key={step} className="flex flex-1 items-center gap-2">
                      <div
                        className={clsx(
                          'h-1.5 flex-1 rounded-full transition-all duration-300',
                          step <= deepResearchStep
                            ? 'bg-primary-500'
                            : 'bg-gray-100 dark:bg-zinc-800',
                        )}
                      />
                    </div>
                  ))}
                </div>

                <div className="space-y-6">
                  {deepResearchStep === 1 && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-4 duration-300">
                      <div className="space-y-1">
                        <label className="text-sm font-bold text-gray-900 dark:text-gray-100">
                          {t('homeView.deepResearchQuestionTitle')}
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t('homeView.deepResearchQuestionHint')}
                        </p>
                      </div>
                      <textarea
                        value={deepResearchQuestion}
                        onChange={event => setDeepResearchQuestion(event.target.value)}
                        placeholder={t('homeView.deepResearchQuestionPlaceholder')}
                        autoFocus
                        className="focus:ring-primary-500/20 focus:border-primary-500 min-h-[120px] w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm placeholder-gray-400 transition-all outline-none focus:ring-2 dark:border-zinc-700/50 dark:bg-zinc-800/50 dark:placeholder-gray-500"
                      />

                      <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-900 dark:text-gray-100">
                          {t('homeView.deepResearchTypeTitle')}
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setDeepResearchType('general')}
                            className={clsx(
                              'flex-1 rounded-xl border-2 px-4 py-3 text-left transition-all',
                              deepResearchType === 'general'
                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                : 'border-gray-200 hover:border-gray-300 dark:border-zinc-700 dark:hover:border-zinc-600',
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={clsx(
                                  'mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all',
                                  deepResearchType === 'general'
                                    ? 'border-primary-500 bg-primary-500'
                                    : 'border-gray-300 dark:border-zinc-600',
                                )}
                              >
                                {deepResearchType === 'general' && (
                                  <div className="h-2 w-2 rounded-full bg-white" />
                                )}
                              </div>
                              <div className="flex-1">
                                <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                                  {t('homeView.deepResearchTypeGeneral')}
                                </div>
                                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  {t('homeView.deepResearchTypeGeneralDesc')}
                                </div>
                              </div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeepResearchType('academic')}
                            className={clsx(
                              'flex-1 rounded-xl border-2 px-4 py-3 text-left transition-all',
                              deepResearchType === 'academic'
                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                : 'border-gray-200 hover:border-gray-300 dark:border-zinc-700 dark:hover:border-zinc-600',
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={clsx(
                                  'mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all',
                                  deepResearchType === 'academic'
                                    ? 'border-primary-500 bg-primary-500'
                                    : 'border-gray-300 dark:border-zinc-600',
                                )}
                              >
                                {deepResearchType === 'academic' && (
                                  <div className="h-2 w-2 rounded-full bg-white" />
                                )}
                              </div>
                              <div className="flex-1">
                                <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                                  {t('homeView.deepResearchTypeAcademic')}
                                </div>
                                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  {t('homeView.deepResearchTypeAcademicDesc')}
                                </div>
                              </div>
                            </div>
                          </button>
                        </div>
                      </div>

                      {/* Concurrent Execution Toggle - Available for ALL research types */}
                      <div className="space-y-2 border-t border-gray-100 pt-4 dark:border-zinc-800">
                        <label className="group flex cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            checked={deepResearchConcurrent}
                            onChange={e => setDeepResearchConcurrent(e.target.checked)}
                            className="text-primary-500 focus:ring-primary-500/20 mt-0.5 h-4 w-4 cursor-pointer rounded border-gray-300 focus:ring-2 dark:border-zinc-600"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="group-hover:text-primary-500 text-sm font-medium text-gray-900 transition-colors dark:text-gray-100">
                                {t('homeView.concurrentExecution')}
                              </span>
                              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                                {t('homeView.experimental')}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {t('homeView.concurrentExecutionDesc')}
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {deepResearchStep === 2 && (
                    <div className="animate-in fade-in slide-in-from-right-4 space-y-3 duration-300">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-bold text-gray-900 dark:text-gray-100">
                          {t('homeView.deepResearchScopeTitle')}
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setDeepResearchScopeAuto(prev => !prev)
                            if (!deepResearchScopeAuto) setDeepResearchScope('')
                          }}
                          className={clsx(
                            'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition-all',
                            deepResearchScopeAuto
                              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-400 dark:hover:bg-zinc-700',
                          )}
                        >
                          <span>{t('homeView.auto')}</span>
                          {deepResearchScopeAuto && <Check size={14} />}
                        </button>
                      </div>
                      <textarea
                        value={deepResearchScope}
                        onChange={event => setDeepResearchScope(event.target.value)}
                        placeholder={t('homeView.deepResearchScopePlaceholder')}
                        disabled={deepResearchScopeAuto}
                        className="focus:ring-primary-500/20 focus:border-primary-500 min-h-[120px] w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm placeholder-gray-400 transition-all outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700/50 dark:bg-zinc-800/50 dark:placeholder-gray-500"
                      />
                    </div>
                  )}

                  {deepResearchStep === 3 && (
                    <div className="animate-in fade-in slide-in-from-right-4 space-y-3 duration-300">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-bold text-gray-900 dark:text-gray-100">
                          {t('homeView.deepResearchOutputTitle')}
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setDeepResearchOutputAuto(prev => !prev)
                            if (!deepResearchOutputAuto) setDeepResearchOutput('')
                          }}
                          className={clsx(
                            'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition-all',
                            deepResearchOutputAuto
                              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-400 dark:hover:bg-zinc-700',
                          )}
                        >
                          <span>{t('homeView.auto')}</span>
                          {deepResearchOutputAuto && <Check size={14} />}
                        </button>
                      </div>
                      <textarea
                        value={deepResearchOutput}
                        onChange={event => setDeepResearchOutput(event.target.value)}
                        placeholder={t('homeView.deepResearchOutputPlaceholder')}
                        disabled={deepResearchOutputAuto}
                        className="focus:ring-primary-500/20 focus:border-primary-500 min-h-[120px] w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm placeholder-gray-400 transition-all outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700/50 dark:bg-zinc-800/50 dark:placeholder-gray-500"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="shrink-0 border-t border-gray-100 bg-gray-50/50 px-5 py-6 dark:border-zinc-800/60 dark:bg-zinc-900/30">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={closeDeepResearchGuide}
                    className="px-5 py-2.5 text-sm font-bold text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    {t('common.cancel')}
                  </button>
                  <div className="flex items-center gap-2">
                    {deepResearchStep > 1 && (
                      <button
                        type="button"
                        onClick={() => setDeepResearchStep(step => Math.max(1, step - 1))}
                        className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-bold text-gray-600 transition-all hover:bg-white dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800"
                      >
                        {t('homeView.deepResearchBack')}
                      </button>
                    )}
                    {deepResearchStep < 3 ? (
                      <button
                        type="button"
                        disabled={!deepResearchQuestion.trim()}
                        onClick={() => setDeepResearchStep(step => Math.min(3, step + 1))}
                        className="bg-primary-500 hover:bg-primary-600 shadow-primary-500/20 rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-lg transition-all disabled:opacity-50 disabled:shadow-none"
                      >
                        {t('homeView.deepResearchNext')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!deepResearchQuestion.trim()}
                        onClick={handleStartDeepResearchGuide}
                        className="bg-primary-500 hover:bg-primary-600 shadow-primary-500/20 flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-lg transition-all disabled:opacity-50 disabled:shadow-none"
                      >
                        <Sparkles size={16} />
                        {t('homeView.deepResearchStart')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </DeepResearchGuideContext.Provider>
  )
}
