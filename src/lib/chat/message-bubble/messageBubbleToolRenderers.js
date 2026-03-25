export function createToolLoadingCardRenderer({ React, DotLoader, t }) {
  return (key, { title, badge, kind = 'form' }) => {
    const isForm = kind === 'form'

    return React.createElement(
      'div',
      {
        key,
        className:
          'mb-4 overflow-hidden rounded-2xl border border-white/10 bg-black/10 opacity-100 transition-all duration-300 ease-[cubic-bezier(0.2,0.6,0.2,1)]',
      },
      React.createElement(
        'div',
        { className: 'flex items-center justify-between border-b border-white/8 px-3 py-2' },
        React.createElement(
          'div',
          { className: 'flex items-center gap-2' },
          React.createElement(
            'div',
            { className: 'bg-pr00/10 h-4 w-4 rounded-full border' },
            React.createElement('div', {
              className: 'bg-primary-500/35 bg-primary-500/35 animate- h-full w-full',
            }),
          ),
          React.createElement(
            'div',
            { className: 'truncate text-sm font-semibold text-zinc-200' },
            title,
          ),
        ),
        React.createElement(
          'span',
          {
            className:
              'rounded-full border border-white/10 bg-white/6 px-2 py-0.5 text-[11px] font-medium text-zinc-400',
          },
          badge,
        ),
      ),
      React.createElement(
        'div',
        { className: 'space-y-3 px-4 py-4' },
        React.createElement(
          'div',
          { className: 'flex items-center gap-2 text-xs font-medium text-zinc-400' },
          React.createElement(DotLoader, { size: 'sm' }),
          React.createElement(
            'span',
            null,
            isForm
              ? t('tools.interactiveForm', 'Interactive Form')
              : t('tools.renderHtmlWidget', 'HTML Widget'),
            t('messageBubble.toolStatusCalling', '调用中'),
          ),
        ),
        isForm
          ? React.createElement(
              'div',
              { className: 'rounded-2xl border border-white/8 bg-white/4 p-4' },
              React.createElement('div', {
                className: 'mb-4 h-4 w-30 animate-pulse rounded-full bg-white/8',
              }),
              React.createElement(
                'div',
                { className: 'space-y-3' },
                React.createElement(
                  'div',
                  { className: 'space-y-2' },
                  React.createElement('div', {
                    className: 'h-3 w-16 animate-pulse rounded-full bg-white/10',
                  }),
                  React.createElement('div', {
                    className: 'h-11 w-full animate-pulse rounded-xl bg-white/7',
                  }),
                ),
                React.createElement(
                  'div',
                  { className: 'space-y-2' },
                  React.createElement('div', {
                    className: 'h-3 w-20 animate-pulse rounded-full bg-white/10',
                  }),
                  React.createElement('div', {
                    className: 'h-11 w-full animate-pulse rounded-xl bg-white/7',
                  }),
                ),
                React.createElement('div', {
                  className: 'bg-primary-500/20 bg-primary-500/20 animat mt-4 h-10 w-28',
                }),
              ),
            )
          : React.createElement(
              'div',
              {
                className:
                  'rounded-2xl border border-white/8 bg-linear-to-b from-zinc-900/80 to-black/35 p-4',
              },
              React.createElement(
                'div',
                { className: 'mb-4 flex items-center justify-between' },
                React.createElement('div', {
                  className: 'h-4 w-32 animate-pulse rounded-full bg-white/10',
                }),
                React.createElement('div', {
                  className: 'h-5 w-14 animate-pulse rounded-full bg-white/8',
                }),
              ),
              React.createElement(
                'div',
                { className: 'space-y-3' },
                React.createElement('div', {
                  className: 'h-22 animate-pulse rounded-2xl bg-white/6',
                }),
                React.createElement(
                  'div',
                  { className: 'grid grid-cols-2 gap-3' },
                  React.createElement('div', {
                    className: 'h-16 animate-pulse rounded-xl bg-white/5',
                  }),
                  React.createElement('div', {
                    className: 'h-16 animate-pulse rounded-xl bg-white/5',
                  }),
                ),
              ),
            ),
      ),
    )
  }
}

export function createInteractiveFormItemRenderer({
  React,
  parseFormPayload,
  messages,
  messageIndex,
  handleFormSubmit,
  messageId,
  developerMode,
  setActiveToolDetail,
  InteractiveForm,
  isStreaming,
  getToolDisplayName,
  t,
  renderToolLoadingCard,
  consoleLike = console,
}) {
  return (item, formKey) => {
    const formData = parseFormPayload(item.arguments) || parseFormPayload(item.output)

    const nextMsg = messages[messageIndex + 1]
    const isInterrupted = nextMsg && nextMsg.role === 'user' && !nextMsg.hitlRunId
    const isSubmitted = item.status === 'done'
    const shouldDisableForm = isSubmitted || isInterrupted

    if (formData) {
      return React.createElement(
        'div',
        {
          key: formKey,
          className: 'opacity-100 transition-all duration-300 ease-[cubic-bezier(0.2,0.6,0.2,1)]',
        },
        React.createElement(InteractiveForm, {
          formData,
          onSubmit: handleFormSubmit,
          messageId,
          isSubmitted: shouldDisableForm,
          submittedValues: parseFormPayload(item.result) || parseFormPayload(item.output) || {},
          developerMode,
          onShowDetails: () => setActiveToolDetail(item),
        }),
      )
    }

    const shouldShowSkeleton =
      isStreaming ||
      item.status === 'calling' ||
      item.status === 'running' ||
      item.status !== 'done'

    if (shouldShowSkeleton) {
      return renderToolLoadingCard(`form-skeleton-${formKey}`, {
        title: getToolDisplayName(item) || t('tools.interactiveForm', 'Interactive Form'),
        badge: 'FORM',
        kind: 'form',
      })
    }

    consoleLike?.error?.('Failed to parse interactive form arguments:', item)
    return React.createElement(
      'div',
      {
        key: `form-error-${formKey}`,
        className:
          'rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300',
      },
      'Error displaying form',
    )
  }
}

export function createHtmlWidgetItemRenderer({
  React,
  parseHtmlWidgetPayload,
  isStreaming,
  getToolDisplayName,
  t,
  renderToolLoadingCard,
  HtmlWidgetCard,
}) {
  return (item, widgetKey) => {
    const payload = parseHtmlWidgetPayload(item.output) || parseHtmlWidgetPayload(item.result)
    const shouldShowSkeleton =
      !payload &&
      (isStreaming ||
        item.status === 'calling' ||
        item.status === 'running' ||
        item.status !== 'done')

    if (shouldShowSkeleton) {
      return renderToolLoadingCard(`html-widget-skeleton-${widgetKey}`, {
        title: getToolDisplayName(item) || t('tools.renderHtmlWidget', 'HTML Widget'),
        badge: 'HTML',
        kind: 'html',
      })
    }

    const resolvedPayload = payload || {
      type: 'html_widget_error',
      code: 'missing_payload',
      message: 'No widget payload found in tool result.',
    }

    if (resolvedPayload.type === 'html_widget_error') {
      return React.createElement(
        'div',
        {
          key: widgetKey,
          className: 'mb-4 rounded-2xl border border-red-300/40 bg-red-500/8 p-3 text-sm text-red-200',
        },
        React.createElement(
          'div',
          { className: 'font-semibold' },
          t('tools.renderHtmlWidget', 'HTML Widget'),
        ),
        React.createElement(
          'div',
          { className: 'mt-1' },
          t(
            'messageBubble.htmlWidgetFallback',
            'Unable to render HTML widget. Showing fallback info.',
          ),
        ),
        React.createElement(
          'div',
          { className: 'mt-1 opacity-80' },
          `${resolvedPayload.code}: ${resolvedPayload.message}`,
        ),
      )
    }

    const displayTitle =
      resolvedPayload.title ||
      getToolDisplayName(item) ||
      t('tools.renderHtmlWidget', 'HTML Widget')

    return React.createElement(HtmlWidgetCard, {
      key: widgetKey,
      widgetKey,
      widget: resolvedPayload,
      displayTitle,
      t,
    })
  }
}

export function createPptxFileItemRenderer({
  React,
  parsePptxPayload,
  isStreaming,
  getToolDisplayName,
  t,
  renderToolLoadingCard,
  PptxResultCard,
  resolveBackendDownloadUrl,
}) {
  return (item, pptxKey) => {
    const payload = parsePptxPayload(item.output) || parsePptxPayload(item.result)
    const shouldShowSkeleton =
      !payload &&
      (isStreaming ||
        item.status === 'calling' ||
        item.status === 'running' ||
        item.status !== 'done')

    if (shouldShowSkeleton) {
      return renderToolLoadingCard(`pptx-skeleton-${pptxKey}`, {
        title: getToolDisplayName(item) || t('tools.pptGenerator', 'PPT Generator'),
        badge: 'PPTX',
        kind: 'html',
      })
    }

    if (!payload) {
      return React.createElement(
        'div',
        {
          key: pptxKey,
          className: 'mb-4 rounded-2xl border border-red-300/40 bg-red-500/8 p-3 text-sm text-red-200',
        },
        React.createElement(
          'div',
          { className: 'font-semibold' },
          t('tools.pptGenerator', 'PPT Generator'),
        ),
        React.createElement(
          'div',
          { className: 'mt-1' },
          t('messageBubble.ppt.missingPayload', 'No PPTX payload found in the tool result.'),
        ),
      )
    }

    return React.createElement(PptxResultCard, {
      key: pptxKey,
      item,
      payload,
      displayTitle: getToolDisplayName(item) || t('tools.pptGenerator', 'PPT Generator'),
      resolveBackendDownloadUrl,
      t,
    })
  }
}
