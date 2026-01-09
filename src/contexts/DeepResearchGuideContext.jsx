import clsx from 'clsx'
import { Check, Sparkles, X } from 'lucide-react'
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
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
              onClick={closeDeepResearchGuide}
            />
            <div
              className="relative w-full max-w-xl bg-white dark:bg-[#1E1E1E] rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] sm:max-h-[85vh] animate-slide-up sm:animate-none"
              onClick={e => e.stopPropagation()}
            >
              <div className="sm:hidden flex justify-center py-2 shrink-0">
                <div className="w-10 h-1 bg-gray-300 dark:bg-zinc-700 rounded-full" />
              </div>

              <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100 dark:border-zinc-800/60 shrink-0">
                <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  <div className="p-1.5 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-lg">
                    <Sparkles size={18} />
                  </div>
                  <h3 className="text-base font-bold">{t('homeView.deepResearchModalTitle')}</h3>
                </div>
                <button
                  onClick={closeDeepResearchGuide}
                  className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-6">
                <div className="flex items-center gap-2 mb-8">
                  {[1, 2, 3].map(step => (
                    <div key={step} className="flex-1 flex items-center gap-2">
                      <div
                        className={clsx(
                          'h-1.5 flex-1 rounded-full transition-all duration-300',
                          step <= deepResearchStep ? 'bg-primary-500' : 'bg-gray-100 dark:bg-zinc-800',
                        )}
                      />
                    </div>
                  ))}
                </div>

                <div className="space-y-6">
                  {deepResearchStep === 1 && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
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
                        className="w-full bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700/50 rounded-2xl px-4 py-3 text-sm placeholder-gray-400 dark:placeholder-gray-500 min-h-[120px] resize-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none"
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
                              'flex-1 px-4 py-3 rounded-xl border-2 transition-all text-left',
                              deepResearchType === 'general'
                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600',
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={clsx(
                                  'w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center transition-all',
                                  deepResearchType === 'general'
                                    ? 'border-primary-500 bg-primary-500'
                                    : 'border-gray-300 dark:border-zinc-600',
                                )}
                              >
                                {deepResearchType === 'general' && (
                                  <div className="w-2 h-2 rounded-full bg-white" />
                                )}
                              </div>
                              <div className="flex-1">
                                <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                                  {t('homeView.deepResearchTypeGeneral')}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {t('homeView.deepResearchTypeGeneralDesc')}
                                </div>
                              </div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeepResearchType('academic')}
                            className={clsx(
                              'flex-1 px-4 py-3 rounded-xl border-2 transition-all text-left',
                              deepResearchType === 'academic'
                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600',
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={clsx(
                                  'w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center transition-all',
                                  deepResearchType === 'academic'
                                    ? 'border-primary-500 bg-primary-500'
                                    : 'border-gray-300 dark:border-zinc-600',
                                )}
                              >
                                {deepResearchType === 'academic' && (
                                  <div className="w-2 h-2 rounded-full bg-white" />
                                )}
                              </div>
                              <div className="flex-1">
                                <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                                  {t('homeView.deepResearchTypeAcademic')}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {t('homeView.deepResearchTypeAcademicDesc')}
                                </div>
                              </div>
                            </div>
                          </button>
                        </div>
                      </div>

                      {deepResearchType === 'academic' && (
                        <div className="space-y-2 pt-4 border-t border-gray-100 dark:border-zinc-800">
                          <label className="flex items-start gap-3 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={deepResearchConcurrent}
                              onChange={e => setDeepResearchConcurrent(e.target.checked)}
                              className="w-4 h-4 mt-0.5 rounded border-gray-300 dark:border-zinc-600 text-primary-500 focus:ring-2 focus:ring-primary-500/20 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-primary-500 transition-colors">
                                  {t('homeView.concurrentExecution')}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  {t('homeView.experimental')}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {t('homeView.concurrentExecutionDesc')}
                              </p>
                            </div>
                          </label>
                        </div>
                      )}
                    </div>
                  )}

                  {deepResearchStep === 2 && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-300">
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
                            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all',
                            deepResearchScopeAuto
                              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                              : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700',
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
                        className="w-full bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700/50 rounded-2xl px-4 py-3 text-sm placeholder-gray-400 dark:placeholder-gray-500 min-h-[120px] resize-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  )}

                  {deepResearchStep === 3 && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-300">
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
                            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all',
                            deepResearchOutputAuto
                              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                              : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700',
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
                        className="w-full bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700/50 rounded-2xl px-4 py-3 text-sm placeholder-gray-400 dark:placeholder-gray-500 min-h-[120px] resize-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="px-5 py-6 border-t border-gray-100 dark:border-zinc-800/60 bg-gray-50/50 dark:bg-zinc-900/30 shrink-0">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={closeDeepResearchGuide}
                    className="px-5 py-2.5 text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                  <div className="flex items-center gap-2">
                    {deepResearchStep > 1 && (
                      <button
                        type="button"
                        onClick={() => setDeepResearchStep(step => Math.max(1, step - 1))}
                        className="px-5 py-2.5 text-sm font-bold rounded-xl border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-zinc-800 transition-all"
                      >
                        {t('homeView.deepResearchBack')}
                      </button>
                    )}
                    {deepResearchStep < 3 ? (
                      <button
                        type="button"
                        disabled={!deepResearchQuestion.trim()}
                        onClick={() => setDeepResearchStep(step => Math.min(3, step + 1))}
                        className="px-6 py-2.5 text-sm font-bold rounded-xl bg-primary-500 text-white hover:bg-primary-600 shadow-lg shadow-primary-500/20 transition-all disabled:opacity-50 disabled:shadow-none"
                      >
                        {t('homeView.deepResearchNext')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!deepResearchQuestion.trim()}
                        onClick={handleStartDeepResearchGuide}
                        className="px-6 py-2.5 text-sm font-bold rounded-xl bg-primary-500 text-white hover:bg-primary-600 shadow-lg shadow-primary-500/20 transition-all disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
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
