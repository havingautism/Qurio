import React from 'react'

export function buildHeadingId(messageIndex, localIndex) {
  return `heading-${messageIndex}-${localIndex}`
}

export function createHeadingRenderer({
  Tag,
  className,
  withAnchors,
  getNextHeadingId,
  parseChildrenWithEmojis,
}) {
  const Heading = ({ children, ...props }) => {
    const headingId = withAnchors ? getNextHeadingId() : undefined
    return React.createElement(
      Tag,
      {
        className,
        ...(headingId ? { id: headingId, 'data-heading-id': headingId } : {}),
        ...props,
      },
      parseChildrenWithEmojis(children),
    )
  }

  Heading.displayName = `Heading${Tag}`
  return Heading
}

export async function copyTextToClipboard(
  text,
  {
    navigatorLike = typeof navigator !== 'undefined' ? navigator : null,
    documentLike = typeof document !== 'undefined' ? document : null,
    consoleLike = console,
  } = {},
) {
  try {
    if (navigatorLike?.clipboard?.writeText) {
      await navigatorLike.clipboard.writeText(text)
    } else if (documentLike?.createElement) {
      const textarea = documentLike.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      documentLike.body.appendChild(textarea)
      textarea.select()
      documentLike.execCommand('copy')
      documentLike.body.removeChild(textarea)
    }
    consoleLike?.log?.('Text copied to clipboard')
  } catch (err) {
    consoleLike?.error?.('Failed to copy text: ', err)
  }
}

export function createCodeBlockRenderer({
  ReactSyntaxHighlighter,
  isDark,
  oneDark,
  oneLight,
  StreamdownComponent,
  mermaidOptions,
  copyToClipboard,
}) {
  const CodeBlock = ({ inline, className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || '')
    const language = match ? match[1].toLowerCase() : ''
    const langLabel = match ? match[1].toUpperCase() : 'CODE'
    const rawCodeText = String(children)
    const codeText = rawCodeText.replace(/\n$/, '')
    const isBlock =
      !inline && (language || rawCodeText.includes('\n') || className?.includes('language-'))

    if (isBlock && language === 'mermaid') {
      return React.createElement(
        'div',
        { className: 'mb-4' },
        React.createElement(
          StreamdownComponent,
          { mode: 'static', mermaid: mermaidOptions, controls: { mermaid: true } },
          `\`\`\`mermaid\n${codeText}\n\`\`\``,
        ),
      )
    }

    if (isBlock) {
      return React.createElement(
        'div',
        {
          className:
            'group bg-user-bubble/20 relative mb-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-zinc-700 dark:bg-zinc-800/40',
        },
        React.createElement(
          'div',
          {
            className:
              'bg-user-bubble/50 flex items-center justify-between border-b border-gray-200 px-4 py-2 text-[11px] font-semibold text-gray-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-gray-300',
          },
          React.createElement('span', null, langLabel),
          React.createElement(
            'button',
            {
              onClick: () => copyToClipboard(codeText),
              className:
                'rounded-md bg-gray-200 px-2 py-1 text-[11px] text-gray-700 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 dark:bg-zinc-700 dark:text-gray-200',
            },
            'Copy',
          ),
        ),
        React.createElement(
          ReactSyntaxHighlighter,
          {
            style: isDark ? oneDark : oneLight,
            language: language || 'text',
            PreTag: 'div',
            className: 'code-scrollbar font-code! text-sm text-shadow-none!',
            customStyle: {
              margin: 0,
              padding: '1rem',
              background: 'transparent',
              borderRadius: 'inherit',
              whiteSpace: 'pre',
              wordBreak: 'normal',
            },
            codeTagProps: {
              style: {
                backgroundColor: 'transparent',
                fontFamily: 'inherit',
                whiteSpace: 'inherit',
              },
            },
            ...props,
          },
          codeText,
        ),
      )
    }

    return React.createElement(
      'code',
      {
        className: `${className} bg-user-bubble rounded-md px-1.5 py-0.5 font-mono text-sm text-black dark:bg-zinc-800 dark:text-white`,
        ...props,
      },
      children,
    )
  }

  CodeBlock.displayName = 'MarkdownCodeBlock'
  return CodeBlock
}

export function createMarkdownLinkRenderer({
  InTableContext,
  sanitizeMarkdownUrl,
  CitationChip,
  documentCitationSources,
  isMobile,
  handleMobileSourceClick,
  t,
  parseChildrenWithEmojis,
  getVideoEmbedUrl,
  getVideoPlatform,
  videoMetadataRef,
  InlineVideoEmbed,
  YoutubeLogo,
  BilibiliLogo,
  clsx,
}) {
  const LinkRenderer = ({ href, children, ...props }) => {
    const isInTable = React.useContext(InTableContext)
    const safeHref = sanitizeMarkdownUrl(href)
    let citationIndices = null

    if (safeHref?.startsWith('citation:')) {
      citationIndices = safeHref
        .replace('citation:', '')
        .split(',')
        .map(Number)
        .filter(n => !Number.isNaN(n))
    } else if (safeHref?.startsWith('https://citation.local/')) {
      const path = safeHref.replace('https://citation.local/', '')
      citationIndices = path
        .split(',')
        .map(Number)
        .filter(n => !Number.isNaN(n))
    }

    if (citationIndices) {
      return React.createElement(CitationChip, {
        indices: citationIndices,
        sources: documentCitationSources,
        isMobile,
        onMobileClick: sources => handleMobileSourceClick(sources, t('sources.citationSources')),
        label: children,
      })
    }

    if (!safeHref) {
      return React.createElement('span', props, parseChildrenWithEmojis(children))
    }

    const embedUrl = getVideoEmbedUrl(safeHref)
    if (embedUrl) {
      const videoInfo = videoMetadataRef.current.find(v => v.url === safeHref)
      if (isInTable) {
        const platform = getVideoPlatform(safeHref)
        const platformMeta =
          platform === 'youtube'
            ? {
                label: 'YouTube',
                logo: YoutubeLogo,
                className: 'bg-red-600 text-white',
              }
            : platform === 'bilibili'
              ? {
                  label: 'Bilibili',
                  logo: BilibiliLogo,
                  className: 'bg-sky-500 text-white',
                }
              : {
                  label: '视频',
                  logo: null,
                  className: 'bg-rose-500 text-white',
                }

        return React.createElement(
          'a',
          {
            href: safeHref,
            target: '_blank',
            rel: 'noreferrer',
            className: clsx(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
              platformMeta.className,
            ),
            title: videoInfo?.title || platformMeta.label,
          },
          platformMeta.logo
            ? React.createElement('img', {
                src: platformMeta.logo,
                alt: platformMeta.label,
                className: 'h-3.5 w-3.5 shrink-0 rounded-sm bg-white/90 p-px',
                loading: 'lazy',
              })
            : null,
          React.createElement('span', null, platformMeta.label),
        )
      }

      return React.createElement(InlineVideoEmbed, {
        embedUrl,
        title: videoInfo?.title || 'Video',
      })
    }

    return React.createElement(
      'a',
      {
        href: safeHref,
        ...props,
        target: '_blank',
        rel: 'noreferrer',
        className:
          'hover:bg-primary-300/50 dark:hover:bg-primary-700/50 dark:bg-primary-900/50 bg-primary-200/50 text-primary-700 dark:text-primary-300 mx-0.5 rounded-lg px-1 py-0.5 text-[12px]',
      },
      parseChildrenWithEmojis(children),
    )
  }

  LinkRenderer.displayName = 'MarkdownLinkRenderer'
  return LinkRenderer
}

export function createMarkdownComponents({
  React,
  CodeBlock,
  parseChildrenWithEmojis,
  createHeadingComponent,
  MarkdownLinkRenderer,
  sanitizeMarkdownUrl,
  MessageImage,
  openGallery,
  failedImageUrls,
  imageMetadataRef,
  handleImageError,
  InTableContext,
}) {
  return {
    code: ({ inline, className, children, ...props }) =>
      React.createElement(
        CodeBlock,
        {
          inline,
          className,
          ...props,
        },
        children,
      ),
    p: ({ children, ...props }) => React.createElement('p', { className: 'mb-4', ...props }, parseChildrenWithEmojis(children)),
    h1: createHeadingComponent('h1', 'text-2xl font-bold mb-4', false),
    h2: createHeadingComponent('h2', 'text-xl font-bold mb-4', false),
    h3: createHeadingComponent('h3', 'text-lg font-bold mb-4', false),
    ul: props => React.createElement('ul', { className: 'mb-4 list-disc space-y-1 pl-5', ...props }),
    ol: props => React.createElement('ol', { className: 'mb-4 list-decimal space-y-1 pl-5', ...props }),
    li: ({ children, ...props }) => React.createElement('li', { className: 'mb-1', ...props }, parseChildrenWithEmojis(children)),
    blockquote: ({ children, ...props }) =>
      React.createElement(
        'blockquote',
        {
          className:
            'mb-4 border-l-4 border-gray-300 pl-4 text-gray-600 italic dark:border-zinc-600 dark:text-gray-400 [&_p]:mb-0',
          ...props,
        },
        parseChildrenWithEmojis(children),
      ),
    table: props =>
      React.createElement(
        'div',
        {
          className:
            'table-scrollbar code-scrollbar mb-4 w-fit max-w-full overflow-x-auto rounded-lg border border-gray-200 dark:border-zinc-700',
        },
        React.createElement('table', {
          className: 'w-auto divide-y divide-gray-200 dark:divide-zinc-700',
          ...props,
        }),
      ),
    thead: props => React.createElement('thead', { className: 'bg-user-bubble dark:bg-zinc-800', ...props }),
    tbody: props =>
      React.createElement('tbody', {
        className:
          'bg-user-bubble/20 divide-y divide-gray-200 dark:divide-zinc-700 dark:bg-zinc-900',
        ...props,
      }),
    tr: props => React.createElement('tr', props),
    th: ({ children, ...props }) =>
      React.createElement(
        'th',
        {
          className:
            'px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400',
          ...props,
        },
        React.createElement(InTableContext.Provider, { value: true }, parseChildrenWithEmojis(children)),
      ),
    td: ({ children, ...props }) =>
      React.createElement(
        'td',
        {
          className: 'px-4 py-3 text-sm whitespace-nowrap text-gray-700 dark:text-gray-300',
          ...props,
        },
        React.createElement(InTableContext.Provider, { value: true }, parseChildrenWithEmojis(children)),
      ),
    a: MarkdownLinkRenderer,
    img: ({ src, alt }) => {
      const safeSrc = sanitizeMarkdownUrl(src, { allowDataImage: true })
      if (!safeSrc) return null
      return React.createElement(MessageImage, {
        src: safeSrc,
        alt,
        openGallery,
        isFailed: failedImageUrls.has(safeSrc),
        imageMetadataRef,
        onImageError: handleImageError,
      })
    },
    hr: () =>
      React.createElement(
        'div',
        { className: 'relative my-4' },
        React.createElement('div', {
          className: 'h-px bg-linear-to-r from-transparent via-gray-300 to-transparent dark:via-zinc-700',
        }),
        React.createElement(
          'div',
          {
            className: 'pointer-events-none absolute inset-0 flex items-center justify-center',
          },
          React.createElement('div', {
            className:
              'h-2.5 w-2.5 rounded-full bg-gray-200 shadow-sm ring-2 ring-white dark:bg-zinc-700 dark:ring-zinc-900',
          }),
        ),
      ),
  }
}

export function createMarkdownComponentsWithAnchors({
  markdownComponents,
  messageIndex,
  parseChildrenWithEmojis,
}) {
  let localHeadingCounter = 0
  const createLocalHeading = (Tag, className) => {
    const Heading = ({ children, ...props }) => {
      const id = buildHeadingId(messageIndex, localHeadingCounter++)
      return React.createElement(
        Tag,
        { className, id, 'data-heading-id': id, ...props },
        parseChildrenWithEmojis(children),
      )
    }
    Heading.displayName = `Heading${Tag}`
    return Heading
  }

  return {
    ...markdownComponents,
    h1: createLocalHeading('h1', 'text-2xl font-bold mb-4 mt-4'),
    h2: createLocalHeading('h2', 'text-xl font-bold mb-4'),
    h3: createLocalHeading('h3', 'text-lg font-bold mb-4'),
  }
}
