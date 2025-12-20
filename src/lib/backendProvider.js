const getApiBasePath = () => {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
  return basePath ? basePath.replace(/\/$/, '') : ''
}

const buildApiUrl = path => `${getApiBasePath()}${path}`

const readSseStream = async (response, handlers) => {
  const { onChunk, onFinish, onError } = handlers
  if (!response.ok || !response.body) {
    const message = await response.text().catch(() => '')
    const error = new Error(message || `Request failed with ${response.status}`)
    onError?.(error)
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finished = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const chunk = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')

        const lines = chunk.split('\n')
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload) continue
          let event
          try {
            event = JSON.parse(payload)
          } catch (error) {
            onError?.(error)
            return
          }
          if (event.type === 'chunk') {
            onChunk?.(event.content)
          } else if (event.type === 'done') {
            finished = true
            onFinish?.({ content: event.content, toolCalls: event.toolCalls })
          } else if (event.type === 'error') {
            onError?.(new Error(event.message || 'Stream error'))
          }
        }
      }
    }
    if (!finished) {
      onError?.(new Error('Stream ended before completion'))
    }
  } catch (error) {
    onError?.(error)
  }
}

const postJson = async (url, payload, signal) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `Request failed with ${response.status}`)
  }
  return response.json()
}

const streamChatCompletion = async ({
  provider,
  apiKey,
  baseUrl,
  model,
  messages,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  temperature,
  top_k,
  contextMessageLimit,
  onChunk,
  onFinish,
  onError,
  signal,
}) => {
  const response = await fetch(buildApiUrl('/api/llm/stream'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      apiKey,
      baseUrl,
      model,
      messages,
      tools,
      toolChoice,
      responseFormat,
      thinking,
      temperature,
      top_k,
      contextMessageLimit,
    }),
    signal,
  })

  await readSseStream(response, { onChunk, onFinish, onError })
}

const generateTitle = async (provider, firstMessage, apiKey, baseUrl, model) => {
  const data = await postJson(
    buildApiUrl('/api/llm/task'),
    { task: 'generateTitle', provider, firstMessage, apiKey, baseUrl, model },
    undefined,
  )
  return data?.title || 'New Conversation'
}

const generateTitleAndSpace = async (provider, firstMessage, spaces, apiKey, baseUrl, model) => {
  const data = await postJson(
    buildApiUrl('/api/llm/task'),
    { task: 'generateTitleAndSpace', provider, firstMessage, spaces, apiKey, baseUrl, model },
    undefined,
  )
  return {
    title: data?.title || 'New Conversation',
    space: data?.space || null,
  }
}

const generateRelatedQuestions = async (provider, messages, apiKey, baseUrl, model) => {
  const data = await postJson(
    buildApiUrl('/api/llm/task'),
    { task: 'generateRelatedQuestions', provider, messages, apiKey, baseUrl, model },
    undefined,
  )
  return data?.questions || []
}

export const createBackendProvider = provider => ({
  streamChatCompletion: params => streamChatCompletion({ provider, ...params }),
  generateTitle: (firstMessage, apiKey, baseUrl, model) =>
    generateTitle(provider, firstMessage, apiKey, baseUrl, model),
  generateTitleAndSpace: (firstMessage, spaces, apiKey, baseUrl, model) =>
    generateTitleAndSpace(provider, firstMessage, spaces, apiKey, baseUrl, model),
  generateRelatedQuestions: (messages, apiKey, baseUrl, model) =>
    generateRelatedQuestions(provider, messages, apiKey, baseUrl, model),
})
