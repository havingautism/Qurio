import clsx from 'clsx'
import { Check, Microscope, Sparkles, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import useScrollLock from '../hooks/useScrollLock'
import { Drawer, DrawerContent } from '@/components/ui/drawer'
import useIsMobile from '../hooks/useIsMobile'
import {
  addConversationEvent,
  createConversation,
  notifyConversationsChanged,
} from '../lib/conversationsService'

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
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  // The provider only exposes open/close state. The detailed form state stays local
  // because it is used only by this guide UI.
  const [isOpen, setIsOpen] = useState(false)

  // Step 1 collects the question/type/language, step 2 scopes the search,
  // and step 3 describes the desired output.
  const [deepResearchStep, setDeepResearchStep] = useState(1)
  const [deepResearchQuestion, setDeepResearchQuestion] = useState('')
  const [deepResearchScope, setDeepResearchScope] = useState('')
  const [deepResearchScopeAuto, setDeepResearchScopeAuto] = useState(true)
  const [deepResearchOutput, setDeepResearchOutput] = useState('')
  const [deepResearchOutputAuto, setDeepResearchOutputAuto] = useState(true)
  const [deepResearchType, setDeepResearchType] = useState('general')
  const [deepResearchConcurrency, setDeepResearchConcurrency] = useState(3)

  // Default the report language from i18n so Chinese users start with Chinese reports.
  const getDefaultResponseLanguage = useCallback(() => {
    const normalized = String(i18n.language || '').toLowerCase()
    return normalized.startsWith('zh') ? 'zh-CN' : 'en'
  }, [i18n.language])
  const [deepResearchResponseLanguage, setDeepResearchResponseLanguage] = useState(() =>
    getDefaultResponseLanguage(),
  )

  const resetDeepResearchForm = useCallback(() => {
    setDeepResearchStep(1)
    setDeepResearchQuestion('')
    setDeepResearchScope('')
    setDeepResearchScopeAuto(true)
    setDeepResearchOutput('')
    setDeepResearchOutputAuto(true)
    setDeepResearchType('general')
    setDeepResearchConcurrency(3)
    setDeepResearchResponseLanguage(getDefaultResponseLanguage())
  }, [getDefaultResponseLanguage])

  const openDeepResearchGuide = useCallback(() => {
    resetDeepResearchForm()
    setIsOpen(true)
  }, [resetDeepResearchForm])

  const closeDeepResearchGuide = useCallback(() => {
    setIsOpen(false)
    resetDeepResearchForm()
  }, [resetDeepResearchForm])

  const buildDeepResearchPrompt = useCallback(() => {
    // The downstream Deep Research page receives one initial user message, so
    // the guide converts structured fields into a compact prompt block here.
    const autoLabel = t('homeView.auto')
    const scopeValue =
      deepResearchScopeAuto || !deepResearchScope.trim() ? autoLabel : deepResearchScope.trim()
    const outputValue =
      deepResearchOutputAuto || !deepResearchOutput.trim() ? autoLabel : deepResearchOutput.trim()
    const responseLanguageLabel =
      deepResearchResponseLanguage === 'zh-CN'
        ? t('homeView.deepResearchResponseLanguageChinese')
        : t('homeView.deepResearchResponseLanguageEnglish')
    const responseLanguageInstruction =
      deepResearchResponseLanguage === 'zh-CN' ? '请使用中文回复。' : 'Please respond in English.'

    return [
      `${t('homeView.deepResearchQuestionLabel')}: ${deepResearchQuestion.trim()}`,
      `${t('homeView.deepResearchScopeLabel')}: ${scopeValue}`,
      `${t('homeView.deepResearchOutputLabel')}: ${outputValue}`,
      `${t('homeView.deepResearchResponseLanguageLabel')}: ${responseLanguageLabel}`,
      responseLanguageInstruction,
    ].join('\n')
  }, [
    deepResearchOutput,
    deepResearchOutputAuto,
    deepResearchQuestion,
    deepResearchResponseLanguage,
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
      // Deep Research conversations live in the dedicated system space and use
      // the dedicated research agent, falling back only for provider metadata.
      const { data: conversation, error } = await createConversation({
        space_id: deepResearchSpace.id,
        title: 'Deep Research',
        api_provider: deepResearchAgent.provider || defaultAgent?.provider || '',
      })

      if (error || !conversation) {
        console.error('Failed to create deep research conversation:', error)
        return
      }

      // This event is how list views and route detection know this conversation
      // belongs to the Deep Research workflow instead of normal chat.
      addConversationEvent(conversation.id, 'deep_research', { enabled: true }).catch(err =>
        console.error('Failed to record deep research event:', err),
      )
      notifyConversationsChanged({ scopes: ['deepResearch'] })

      // Router state bootstraps DeepResearchConversationView with the first
      // message and fixed toggles, so no extra setup screen is needed there.
      const chatState = {
        initialMessage: buildDeepResearchPrompt(),
        initialAttachments: [],
        initialToggles: {
          search: true,
          thinking: false,
          deepResearch: true,
          concurrencyLimit: deepResearchConcurrency,
          related: false,
        },
        initialSpaceSelection: {
          mode: 'manual',
          space: deepResearchSpace,
        },
        initialAgentSelection: deepResearchAgent,
        initialIsAgentAutoMode: false,
        researchType: deepResearchType,
        responseLanguage: deepResearchResponseLanguage,
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
    deepResearchQuestion,
    deepResearchResponseLanguage,
    deepResearchSpace,
    deepResearchType,
    deepResearchConcurrency,
    defaultAgent,
    navigate,
  ])

  // keydown event listener for Escape key to close the guide
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

  // Prevent background page scroll while the guide is open.
  useScrollLock(isOpen)

  const contextValue = useMemo(  
    () => ({
      isOpen,
      openDeepResearchGuide,
      closeDeepResearchGuide,
    }),
    [isOpen, openDeepResearchGuide, closeDeepResearchGuide],
  )

  // Shared by both desktop portal and mobile drawer so the actual form logic
  // stays in one JSX tree.
  const guideContent = (
    <div
      className={clsx(
        'flex min-h-0 flex-col',
        isMobile ? 'h-full' : 'max-h-[90vh] w-full sm:max-h-[85vh]',
      )}
    >
      {!isMobile && (
        <div className="flex shrink-0 justify-center py-2 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-zinc-700" />
        </div>
      )}

      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-5 dark:border-zinc-800/60">
        <div className="flex items-center gap-3 text-gray-900 dark:text-gray-100">
          <div className="bg-primary-500 shadow-primary-500/20 rounded-2xl p-2.5 text-white shadow-lg">
            <Microscope size={22} strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="text-lg font-extrabold tracking-tight">
              {t('homeView.deepResearchModalTitle')}
            </h3>
            <p className="mt-1 text-[10px] leading-none font-bold tracking-widest text-gray-400 uppercase">
              Advanced Mode
            </p>
          </div>
        </div>
        <button
          onClick={closeDeepResearchGuide}
          className="glass-elite-chip -mr-2 rounded-full p-2 text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-300 dark:hover:text-white"
        >
          <X size={20} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:py-6">
        <div className="mb-10 flex items-center gap-2">
          {/* Visual progress indicator for the three-step guide. */}
          {[1, 2, 3].map(step => (
            <div key={step} className="flex-1">
              <div
                className={clsx(
                  'h-1.5 rounded-full transition-all duration-500',
                  step <= deepResearchStep
                    ? 'bg-primary-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]'
                    : 'bg-gray-100 dark:bg-zinc-800',
                )}
              />
            </div>
          ))}
        </div>

        <div className="space-y-6">
          {/* Step 1 decides the research task type and report language. */}
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
                autoFocus={!isMobile}
                className="focus:ring-primary-500/30 focus:border-primary-500 min-h-[140px] w-full resize-none rounded-2xl border border-gray-200 bg-white/5 px-4 py-4 text-sm leading-relaxed placeholder-gray-400 backdrop-blur-xl transition-all outline-none focus:ring-4 dark:border-zinc-700/50 dark:bg-zinc-900/40 dark:placeholder-gray-500"
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
                      'glass-elite-soft flex-1 rounded-2xl border-2 px-5 py-4 text-left transition-all',
                      deepResearchType === 'general'
                        ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/20'
                        : 'border-transparent hover:border-gray-200 dark:hover:border-zinc-700',
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
                      'glass-elite-soft flex-1 rounded-2xl border-2 px-5 py-4 text-left transition-all',
                      deepResearchType === 'academic'
                        ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/20'
                        : 'border-transparent hover:border-gray-200 dark:hover:border-zinc-700',
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

              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  {t('homeView.deepResearchResponseLanguageTitle')}
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDeepResearchResponseLanguage('zh-CN')}
                    className={clsx(
                      'glass-elite-soft flex-1 rounded-2xl border-2 px-5 py-3 text-left transition-all',
                      deepResearchResponseLanguage === 'zh-CN'
                        ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/20'
                        : 'border-transparent hover:border-gray-200 dark:hover:border-zinc-700',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={clsx(
                          'mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all',
                          deepResearchResponseLanguage === 'zh-CN'
                            ? 'border-primary-500 bg-primary-500'
                            : 'border-gray-300 dark:border-zinc-600',
                        )}
                      >
                        {deepResearchResponseLanguage === 'zh-CN' && (
                          <div className="h-2 w-2 rounded-full bg-white" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                          {t('homeView.deepResearchResponseLanguageChinese')}
                        </div>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeepResearchResponseLanguage('en')}
                    className={clsx(
                      'glass-elite-soft flex-1 rounded-2xl border-2 px-5 py-3 text-left transition-all',
                      deepResearchResponseLanguage === 'en'
                        ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/20'
                        : 'border-transparent hover:border-gray-200 dark:hover:border-zinc-700',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={clsx(
                          'mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all',
                          deepResearchResponseLanguage === 'en'
                            ? 'border-primary-500 bg-primary-500'
                            : 'border-gray-300 dark:border-zinc-600',
                        )}
                      >
                        {deepResearchResponseLanguage === 'en' && (
                          <div className="h-2 w-2 rounded-full bg-white" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                          {t('homeView.deepResearchResponseLanguageEnglish')}
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Parallel execution only: keep concurrency control */}
              <div className="space-y-4 border-t border-gray-100 pt-4 dark:border-zinc-800">
                <div className="animate-in fade-in slide-in-from-top-1">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {t('homeView.concurrencyLimit')}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {t('homeView.concurrencyLimitHint')}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center overflow-hidden rounded-xl border border-gray-200 bg-white/40 backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-800/60">
                      <button
                        type="button"
                        onClick={() => setDeepResearchConcurrency(c => Math.max(1, c - 1))}
                        className="flex h-9 w-9 items-center justify-center text-gray-500 transition-colors hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/5"
                      >
                        <span className="text-lg font-medium">-</span>
                      </button>
                      <div className="flex h-9 w-12 items-center justify-center border-x border-gray-200 px-2 text-sm font-bold text-gray-900 dark:border-zinc-700 dark:text-gray-100">
                        {deepResearchConcurrency}
                      </div>
                      <button
                        type="button"
                        onClick={() => setDeepResearchConcurrency(c => Math.min(50, c + 1))}
                        className="flex h-9 w-9 items-center justify-center text-gray-500 transition-colors hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/5"
                      >
                        <span className="text-lg font-medium">+</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2 lets the user constrain the research scope, or delegate it to the model. */}
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
                className="focus:ring-primary-500/30 focus:border-primary-500 min-h-[140px] w-full resize-none rounded-2xl border border-gray-200 bg-white/5 px-4 py-4 text-sm leading-relaxed placeholder-gray-400 backdrop-blur-xl transition-all outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700/50 dark:bg-zinc-900/40 dark:placeholder-gray-500"
              />
            </div>
          )}

          {/* Step 3 describes the desired output shape, again supporting auto mode. */}
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
                className="focus:ring-primary-500/30 focus:border-primary-500 min-h-[140px] w-full resize-none rounded-2xl border border-gray-200 bg-white/5 px-4 py-4 text-sm leading-relaxed placeholder-gray-400 backdrop-blur-xl transition-all outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700/50 dark:bg-zinc-900/40 dark:placeholder-gray-500"
              />
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/20 px-6 py-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] sm:py-7 dark:border-white/10">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={closeDeepResearchGuide}
            className="px-4 py-2 text-sm font-bold text-gray-400 transition-colors hover:text-gray-600 sm:px-6 dark:text-gray-500 dark:hover:text-gray-300"
          >
            {t('common.cancel')}
          </button>
          <div className="flex items-center gap-3">
            {deepResearchStep > 1 && (
              <button
                type="button"
                onClick={() => setDeepResearchStep(step => Math.max(1, step - 1))}
                className="glass-elite-chip rounded-2xl px-4 py-2.5 text-sm font-bold text-gray-600 transition-all hover:text-gray-900 sm:px-6 dark:text-gray-300 dark:hover:text-white"
              >
                {t('homeView.deepResearchBack')}
              </button>
            )}
            {deepResearchStep < 3 ? (
              <>
                {/* The question is required because it is the only field that cannot be auto-filled. */}
                <button
                  type="button"
                  disabled={!deepResearchQuestion.trim()}
                  onClick={() => setDeepResearchStep(step => Math.min(3, step + 1))}
                  className="bg-primary-500 hover:bg-primary-600 shadow-primary-500/25 rounded-2xl px-5 py-2.5 text-sm font-bold text-white shadow-xl transition-all active:scale-95 disabled:opacity-50 disabled:shadow-none sm:px-8"
                >
                  {t('homeView.deepResearchNext')}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!deepResearchQuestion.trim()}
                onClick={handleStartDeepResearchGuide}
                className="bg-primary-500 hover:bg-primary-600 shadow-primary-500/40 flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold text-white shadow-2xl transition-all active:scale-95 disabled:opacity-50 disabled:shadow-none sm:px-8"
              >
                <Sparkles size={18} />
                {t('homeView.deepResearchStart')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  // Desktop uses a portal so the modal escapes parent stacking contexts.
  // Mobile uses a drawer for better touch ergonomics and safe-area handling.
  const portalContent = (
    <div className="fixed inset-0 z-9999 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={closeDeepResearchGuide}
      />
      <div
        className="animate-slide-up glass-elite-panel relative flex w-full max-w-2xl flex-col overflow-hidden rounded-[32px] shadow-2xl dark:bg-[#1E1E1E]/60"
        onClick={e => e.stopPropagation()}
      >
        {guideContent}
      </div>
    </div>
  )

  return (
    <DeepResearchGuideContext.Provider value={contextValue}>
      {children}
      {isOpen &&
        (isMobile ? (
          <Drawer open={isOpen} onOpenChange={open => !open && closeDeepResearchGuide()}>
            <DrawerContent className="h-[92dvh] max-h-[92dvh] overflow-hidden">
              {guideContent}
            </DrawerContent>
          </Drawer>
        ) : (
          createPortal(portalContent, document.body)
        ))}
    </DeepResearchGuideContext.Provider>
  )
}
