import { useMemo } from 'react'
import { Streamdown } from 'streamdown'
import remarkGfm from 'remark-gfm'
import { parseChildrenWithEmojis } from '../lib/emojiParser'
import { getProvider } from '../lib/providers'
import { PROVIDER_ICONS, getModelIcon } from '../lib/modelIcons'

const PROVIDER_META = {
  gemini: {
    label: 'Google Gemini',
    logo: PROVIDER_ICONS.gemini,
    fallback: 'G',
  },
  openai_compatibility: {
    label: 'OpenAI Compatible',
    logo: PROVIDER_ICONS.openai_compatibility,
    fallback: 'O',
  },
  siliconflow: {
    label: 'SiliconFlow',
    logo: PROVIDER_ICONS.siliconflow,
    fallback: 'S',
  },
  glm: {
    label: 'GLM',
    logo: PROVIDER_ICONS.glm,
    fallback: 'G',
  },
  kimi: {
    label: 'Kimi',
    logo: PROVIDER_ICONS.kimi,
    fallback: 'K',
  },
}

export const SHARE_STYLE = `
  .share-page {
    min-height: 100vh;
    background: #0b0e14;
    color: #e5e7eb;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans SC", sans-serif;
    display: flex;
    flex-direction: column;
  }
  .share-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 28px;
    border-bottom: 1px solid #1f2430;
    background: #0e121a;
  }
  .share-actions {
    display: flex;
    gap: 12px;
  }
  .share-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 10px;
    border: 1px solid #2a2f3a;
    background: #151a24;
    color: #e5e7eb;
    font-weight: 600;
    cursor: pointer;
  }
  .share-btn.primary {
    background: #2563eb;
    border-color: #2563eb;
    color: #ffffff;
  }
  .share-canvas-wrap {
    flex: 1;
    display: flex;
    justify-content: center;
    padding: 36px 24px 48px;
  }
  .share-page.embed {
    background: transparent;
    min-height: auto;
  }
  .share-page.embed .share-canvas-wrap {
    padding: 0;
  }
  .share-page.embed .share-canvas {
    width: 100%;
    border-radius: 0;
    border: none;
    box-shadow: none;
  }
  .share-canvas {
    width: 1120px;
    max-width: 100%;
    background: #0f131c;
    border: 1px solid #262b36;
    border-radius: 22px;
    padding: 36px;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
  }
  .share-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 28px;
  }
  .share-title {
    font-size: 26px;
    font-weight: 700;
  }
  .share-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    color: #a3acc0;
    font-size: 13px;
  }
  .share-meta--right {
    justify-content: flex-end;
  }
  .share-model {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .share-avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: #1b202c;
    border: 1px solid #2a2f3a;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .share-avatar img {
    width: 70%;
    height: 70%;
    object-fit: contain;
  }
  .share-role {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 999px;
    background: #1b202c;
    border: 1px solid #2a2f3a;
    font-size: 12px;
    color: #cbd5e1;
  }
  .share-content {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
  }
  .share-card {
    background: #141926;
    border: 1px solid #2a2f3a;
    border-radius: 18px;
    padding: 24px;
  }
  .share-doc {
    font-size: 16px;
    line-height: 1.7;
    color: #e5e7eb;
  }
  .share-doc h1,
  .share-doc h2,
  .share-doc h3 {
    color: #f8fafc;
    margin: 16px 0 10px;
    font-weight: 700;
  }
  .share-doc p {
    margin: 10px 0;
  }
  .share-doc ul,
  .share-doc ol {
    padding-left: 20px;
    margin: 10px 0;
  }
  .share-doc code {
    background: #1d2330;
    padding: 2px 6px;
    border-radius: 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 14px;
  }
  .share-doc pre {
    background: #111722;
    padding: 14px;
    border-radius: 12px;
    overflow: auto;
  }
  .share-doc pre code {
    background: none;
    padding: 0;
  }
  .share-doc a {
    color: #7dd3fc;
    text-decoration: none;
  }
  .share-doc .align-text-bottom {
    width: 1.1em;
    height: 1.1em;
    display: inline-flex;
    vertical-align: -0.1em;
  }
  .share-doc .align-text-bottom img {
    width: 100%;
    height: 100%;
  }
  .share-citation {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    padding: 2px 6px;
    border-radius: 999px;
    background: #1e293b;
    color: #cbd5f5;
    font-size: 11px;
    font-weight: 600;
    margin: 0 2px;
  }
  .share-sources {
    margin-top: 18px;
  }
  .share-source {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid #1f2430;
  }
  .share-source:last-child {
    border-bottom: none;
  }
  .share-source-index {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: #1e293b;
    color: #e2e8f0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
  }
  .share-source-title {
    font-size: 13px;
    color: #e2e8f0;
  }
  .share-source-host {
    font-size: 11px;
    color: #94a3b8;
  }
  .share-footer {
    margin-top: 22px;
    font-size: 12px;
    color: #94a3b8;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  @media (max-width: 640px) {
    .share-canvas {
      padding: 22px;
      border-radius: 18px;
    }
    .share-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }
    .share-meta {
      flex-wrap: wrap;
      gap: 8px;
    }
    .share-meta--right {
      width: 100%;
      justify-content: flex-start;
    }
    .share-avatar {
      width: 38px;
      height: 38px;
    }
    .share-title {
      font-size: 22px;
    }
    .share-card {
      padding: 18px;
      border-radius: 16px;
    }
    .share-doc {
      font-size: 15px;
    }
  }
  .align-text-bottom {
    vertical-align: -0.125em;
  }
  .w-full {
    width: 100%;
  }
  .h-full {
    height: 100%;
  }
  .object-contain {
    object-fit: contain;
  }
`

const getHostname = url => {
  try {
    const hostname = new URL(url).hostname
    return hostname.replace(/^www\./, '')
  } catch (e) {
    return 'Source'
  }
}

const formatContentWithSources = (content, sources = []) => {
  if (typeof content !== 'string' || !Array.isArray(sources) || sources.length === 0) {
    return content
  }

  const citationRegex = /\[(\d+)\](?:\s*\[(\d+)\])*/g

  return content.replace(citationRegex, match => {
    const indices = match.match(/\d+/g).map(n => Number(n) - 1)
    if (indices.length === 0) return match
    const primaryIdx = indices[0]
    const primarySource = sources[primaryIdx]
    if (!primarySource) return match
    if (indices.length > 1) {
      return ` [+${indices.length}](citation:${indices.join(',')}) `
    }
    return ` [${primaryIdx + 1}](citation:${primaryIdx}) `
  })
}

const applyGroundingSupports = (content, groundingSupports = [], sources = []) => {
  if (
    typeof content !== 'string' ||
    !Array.isArray(groundingSupports) ||
    groundingSupports.length === 0 ||
    !Array.isArray(sources) ||
    sources.length === 0
  ) {
    return content
  }
  if (/\[\d+\]/.test(content)) return content

  const markersByText = new Map()
  for (const support of groundingSupports) {
    const segmentText = support?.segment?.text
    if (!segmentText || typeof segmentText !== 'string') continue
    const chunkIndices = Array.isArray(support?.groundingChunkIndices)
      ? support.groundingChunkIndices
      : []
    const sourceIndices = chunkIndices
      .filter(idx => Number.isInteger(idx) && idx >= 0 && idx < sources.length)
      .map(idx => idx)
    if (sourceIndices.length === 0) continue
    const set = markersByText.get(segmentText) || new Set()
    for (const idx of sourceIndices) set.add(idx)
    markersByText.set(segmentText, set)
  }

  if (markersByText.size === 0) return content

  let updated = content
  const supports = Array.from(markersByText.entries())
    .map(([text, indices]) => ({
      text,
      indices: Array.from(indices).sort((a, b) => a - b),
    }))
    .sort((a, b) => b.text.length - a.text.length)

  for (const support of supports) {
    const marker = ` ${support.indices.map(idx => `[${idx + 1}]`).join('')}`
    let searchFrom = 0
    while (true) {
      const matchIndex = updated.indexOf(support.text, searchFrom)
      if (matchIndex === -1) break
      const insertAt = matchIndex + support.text.length
      updated = updated.slice(0, insertAt) + marker + updated.slice(insertAt)
      searchFrom = insertAt + marker.length
    }
  }

  return updated
}

const normalizeMessageText = content => {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter(part => part?.type !== 'image_url')
      .map(part => {
        if (typeof part === 'string') return part
        if (part?.type === 'text') return part.text || ''
        if (part?.type === 'quote') return part.text || ''
        if (part?.text) return part.text
        return ''
      })
      .filter(Boolean)
      .join('\n\n')
  }
  if (content && typeof content === 'object' && Array.isArray(content.parts)) {
    return content.parts.map(p => (typeof p === 'string' ? p : p?.text || '')).join('')
  }
  return content ? String(content) : ''
}

const getImagesFromMessage = message => {
  if (!Array.isArray(message?.content)) return []
  return message.content
    .filter(part => part?.type === 'image_url')
    .map(part => part?.image_url?.url || part?.url)
    .filter(Boolean)
}

const ShareCanvas = ({ message, conversationTitle, captureRef, embed = false, language = 'en-US' }) => {
  const providerId = message?.provider || ''
  const providerMeta = PROVIDER_META[providerId] || {
    label: providerId || 'AI',
    logo: null,
    fallback: 'AI',
  }
  const resolvedModel = message?.model || 'default model'
  const isUser = message?.role === 'user'
  const images = useMemo(() => getImagesFromMessage(message), [message])

  const renderedContent = useMemo(() => {
    if (!message) return ''
    if (isUser) return normalizeMessageText(message.content)
    const provider = getProvider(providerId)
    const parsed = provider.parseMessage(message)
    const mainContent = parsed.content
    const contentWithSupports = applyGroundingSupports(
      mainContent,
      message.groundingSupports,
      message.sources,
    )
    return formatContentWithSources(contentWithSupports, message.sources)
  }, [message, isUser, providerId])

  const markdownComponents = useMemo(
    () => ({
      p: ({ children }) => <p>{parseChildrenWithEmojis(children)}</p>,
      li: ({ children }) => <li>{parseChildrenWithEmojis(children)}</li>,
      h1: ({ children }) => <h1>{parseChildrenWithEmojis(children)}</h1>,
      h2: ({ children }) => <h2>{parseChildrenWithEmojis(children)}</h2>,
      h3: ({ children }) => <h3>{parseChildrenWithEmojis(children)}</h3>,
      a: ({ href, children }) => {
        if (href && href.startsWith('citation:')) {
          const label = String(children).replace(/[\[\]]/g, '')
          return <span className="share-citation">{label}</span>
        }
        return (
          <a href={href} target="_blank" rel="noreferrer">
            {parseChildrenWithEmojis(children)}
          </a>
        )
      },
    }),
    [],
  )

  return (
    <div className={`share-page${embed ? ' embed' : ''}`}>
      <style data-share-style="true">{SHARE_STYLE}</style>
      <div className="share-canvas-wrap">
        <div ref={captureRef} className="share-canvas">
          <div className="share-header">
            <div>
              <div className="share-title">{conversationTitle || 'Qurio Chat'}</div>
              <div className="share-meta">
                <span className="share-role">{isUser ? 'User' : 'Assistant'}</span>
                <span>
                  {message?.created_at
                    ? new Date(message.created_at).toLocaleString(language)
                    : new Date().toLocaleString(language)}
                </span>
              </div>
            </div>
            <div className="share-meta share-meta--right">
              {!isUser && (
                <>
                  <div className="share-avatar">
                    {providerMeta.logo ? (
                      <img src={providerMeta.logo} alt={providerMeta.label} />
                    ) : (
                      <span>{providerMeta.fallback}</span>
                    )}
                  </div>
                  <div className="share-model">
                    <div style={{ fontWeight: 600 }}>{providerMeta.label}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {getModelIcon(resolvedModel) && (
                        <img
                          src={getModelIcon(resolvedModel)}
                          alt=""
                          style={{ width: 14, height: 14 }}
                        />
                      )}
                      <span>{resolvedModel}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="share-content">
            <div className="share-card">
              {images.length > 0 && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                  {images.map((url, index) => (
                    <img
                      key={`${url}-${index}`}
                      src={url}
                      alt="Attachment"
                      style={{
                        width: 220,
                        height: 'auto',
                        borderRadius: 12,
                        border: '1px solid #2a2f3a',
                        objectFit: 'cover',
                      }}
                    />
                  ))}
                </div>
              )}
              <div className="share-doc">
                <Streamdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {renderedContent}
                </Streamdown>
              </div>

              {!isUser && Array.isArray(message?.sources) && message.sources.length > 0 && (
                <div className="share-sources">
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    Sources
                  </div>
                  {message.sources.map((source, idx) => (
                    <div key={`${source.url}-${idx}`} className="share-source">
                      <div className="share-source-index">{idx + 1}</div>
                      <div>
                        <div className="share-source-title">{source.title || 'Source'}</div>
                        <div className="share-source-host">{getHostname(source.url)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="share-footer">
            <span>Qurio Chat Share</span>
            <span>{new Date().toLocaleDateString(language)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ShareCanvas
