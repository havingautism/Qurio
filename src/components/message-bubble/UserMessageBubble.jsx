import React, { memo } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Pencil, RotateCcw, Trash2, X } from 'lucide-react'
import clsx from 'clsx'
import { splitTextWithUrls } from '../../lib/urlHighlight'
import { formatMessageDate } from '../../lib/dateUtils'
import DeepResearchGoalCard from '../message/DeepResearchGoalCard'

const UserMessageBubble = memo(function UserMessageBubble({
  message,
  messageId,
  bubbleRef,
  containerRef,
  handleMouseUp,
  handleTouchEnd,
  handleContextMenu,
  activeImageUrl,
  setActiveImageUrl,
  t,
  i18nLanguage,
  isMobile,
  isDeepResearchContext,
  contentToRender,
  quoteToRender,
  imagesToRender,
  canResendThisQuestion,
  isLoading,
  showConfirmation,
  onUserRegenerate,
  onEdit,
  copyToClipboard,
  setIsCopied,
  isCopied,
  onDelete,
}) {
  const contentText =
    typeof contentToRender === 'string' ? contentToRender : String(contentToRender ?? '')
  const highlightedParts = splitTextWithUrls(contentText)

  return (
    <div
      id={messageId}
      ref={el => {
        containerRef.current = el
        if (typeof bubbleRef === 'function') bubbleRef(el)
      }}
      className="group mt-2.5 flex w-full flex-col gap-1 px-3 sm:px-0"
      onMouseUp={handleMouseUp}
      onTouchEnd={handleTouchEnd}
      onContextMenu={handleContextMenu}
    >
      {activeImageUrl &&
        createPortal(
          <div
            className="fixed inset-0 z-10000 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setActiveImageUrl(null)}
          >
            <button
              onClick={() => setActiveImageUrl(null)}
              className="absolute top-4 right-4 rounded-full bg-black/70 p-2 text-white transition-colors hover:bg-black/80"
              aria-label="Close image preview"
            >
              <X size={18} />
            </button>
            <img
              src={activeImageUrl}
              alt="User uploaded preview"
              className="max-h-[90vh] max-w-[90vw] rounded-2xl shadow-2xl"
              onClick={event => event.stopPropagation()}
            />
          </div>,
          document.body,
        )}
      {message.created_at && (
        <div className="my-1 flex w-full justify-center text-xs text-gray-400 select-none dark:text-gray-500">
          {formatMessageDate(message.created_at, t, i18nLanguage)}
        </div>
      )}

      <div
        className={clsx(
          'mb-4 flex w-full items-center gap-2',
          isDeepResearchContext ? 'justify-center' : 'justify-end',
        )}
      >
        <div
          className={clsx(
            'flex flex-col gap-2',
            isDeepResearchContext
              ? 'w-full max-w-full items-center'
              : 'max-w-[85%] items-end sm:max-w-2xl',
          )}
        >
          {isDeepResearchContext ? (
            <DeepResearchGoalCard content={contentToRender} />
          ) : (
            <div className="relative w-fit max-w-full rounded-[28px] border border-primary-300/30 bg-primary-500/88 px-3.5 py-2.5 text-base text-white shadow-[0_10px_24px_-20px_rgba(15,23,42,0.28)] backdrop-blur-xl sm:max-w-2xl dark:border-primary-400/20 dark:bg-primary-900/58 dark:text-gray-100">
              {quoteToRender && (
                <div className="mb-2 rounded-[22px] border border-white/18 bg-white/16 p-3 text-sm dark:border-white/10 dark:bg-black/18">
                  <div className="mb-1 font-medium">{t('messageBubble.quoting')}</div>
                  <div className="line-clamp-2 italic">{quoteToRender.text}</div>
                </div>
              )}
              {imagesToRender.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {imagesToRender.map((img, idx) => (
                    <img
                      key={idx}
                      src={img?.url || img?.image_url?.url}
                      alt="User uploaded"
                      className="h-auto max-h-60 max-w-full cursor-zoom-in rounded-lg object-cover"
                      onClick={event => {
                        event.stopPropagation()
                        setActiveImageUrl(img?.url || img?.image_url?.url)
                      }}
                    />
                  ))}
                </div>
              )}
              <div
                className="message-content wrap-break-word whitespace-pre-wrap"
                style={{
                  WebkitTouchCallout: isMobile ? 'none' : 'default',
                  WebkitUserSelect: isMobile ? 'text' : 'auto',
                  KhtmlUserSelect: isMobile ? 'text' : 'auto',
                  MozUserSelect: isMobile ? 'text' : 'auto',
                  MsUserSelect: isMobile ? 'text' : 'auto',
                  userSelect: isMobile ? 'text' : 'auto',
                }}
              >
                {highlightedParts.map((part, index) =>
                  part.type === 'url' ? (
                    <span
                      key={`url-${index}`}
                      className="rounded-sm bg-white/18 px-1 text-white underline decoration-white/70"
                    >
                      {part.value}
                    </span>
                  ) : (
                    <span key={`text-${index}`}>{part.value}</span>
                  ),
                )}
              </div>
            </div>
          )}

          {!isDeepResearchContext && (
            <div className="flex items-center gap-1 px-1">
              <div className="flex items-center gap-1">
                {canResendThisQuestion && (
                  <button
                    disabled={isLoading}
                    onClick={() => {
                      if (isLoading) return
                      showConfirmation({
                        title: t('confirmation.resendTitle'),
                        message: t('confirmation.resendMessage'),
                        confirmText: t('common.confirm'),
                        onConfirm: onUserRegenerate,
                      })
                    }}
                    className="group/icon flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-gray-500 transition-all duration-200 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white dark:hover:bg-zinc-800 dark:hover:text-gray-200"
                    title={t('messageBubble.regenerate')}
                  >
                    <RotateCcw size={14} />
                    <span className="hidden max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap opacity-0 transition-all duration-300 ease-in-out group-hover/icon:max-w-[70px] group-hover/icon:opacity-100 sm:block">
                      {t('messageBubble.regenerate')}
                    </span>
                  </button>
                )}
                {onEdit && (
                  <button
                    disabled={isLoading}
                    onClick={() => onEdit()}
                    className="group/icon flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-gray-500 transition-all duration-200 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white dark:hover:bg-zinc-800 dark:hover:text-gray-200"
                    title={t('messageBubble.edit')}
                  >
                    <Pencil size={14} />
                    <span className="hidden max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap opacity-0 transition-all duration-300 ease-in-out group-hover/icon:max-w-[50px] group-hover/icon:opacity-100 sm:block">
                      {t('messageBubble.edit')}
                    </span>
                  </button>
                )}
                <button
                  onClick={() => {
                    copyToClipboard(contentToRender)
                    setIsCopied(true)
                  }}
                  className="group/icon flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-gray-500 transition-all duration-200 hover:bg-gray-100 hover:text-gray-700 dark:text-white dark:hover:bg-zinc-800 dark:hover:text-gray-200"
                  title={t('messageBubble.copy')}
                >
                  {isCopied ? (
                    <>
                      <Check size={14} className="text-emerald-500" />
                      <span className="hidden max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap text-emerald-500 opacity-0 transition-all duration-300 ease-in-out group-hover/icon:max-w-[60px] group-hover/icon:opacity-100 sm:block">
                        {t('message.copied')}
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span className="hidden max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap opacity-0 transition-all duration-300 ease-in-out group-hover/icon:max-w-[50px] group-hover/icon:opacity-100 sm:block">
                        {t('message.copy')}
                      </span>
                    </>
                  )}
                </button>
                <button
                  disabled={isLoading}
                  onClick={() => {
                    if (isLoading) return
                    if (!onDelete) return
                    showConfirmation({
                      title: t('confirmation.deleteMessageTitle'),
                      message: t('confirmation.deleteUserMessage'),
                      confirmText: t('confirmation.delete'),
                      isDangerous: true,
                      onConfirm: onDelete,
                    })
                  }}
                  className="group/icon flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-gray-500 transition-all duration-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  title={t('common.delete')}
                >
                  <Trash2 size={14} />
                  <span className="hidden max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap opacity-0 transition-all duration-300 ease-in-out group-hover/icon:max-w-[60px] group-hover/icon:opacity-100 sm:block">
                    {t('common.delete')}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

UserMessageBubble.displayName = 'UserMessageBubble'

export default UserMessageBubble
