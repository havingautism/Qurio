const encoder = new TextEncoder()

const sendSse = async (writer, data) => {
  await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
}

const sendComment = async writer => {
  await writer.write(encoder.encode(': ping\n\n'))
}

const readJsonBody = async request => {
  try {
    return await request.json()
  } catch {
    return null
  }
}

const normalizeTextContent = content => {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part
        if (part?.type === 'text' && part.text) return part.text
        if (part?.text) return part.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (content && typeof content === 'object' && Array.isArray(content.parts)) {
    return content.parts.map(p => (typeof p === 'string' ? p : p?.text || '')).join('\n')
  }
  return content ? String(content) : ''
}

const applyContextLimitRaw = (messages, limit) => {
  const numericLimit = parseInt(limit, 10)
  if (!Array.isArray(messages) || !numericLimit || numericLimit < 1) return messages

  const systemMessages = messages.filter(m => m?.role === 'system')
  const nonSystemMessages = messages.filter(m => m?.role !== 'system')
  const trimmedNonSystem = nonSystemMessages.slice(-numericLimit)

  return [...systemMessages, ...trimmedNonSystem]
}

const mapMessagesForOpenAI = messages =>
  (messages || []).map(message => ({
    role: message.role === 'ai' ? 'assistant' : message.role,
    content: message.content,
    ...(message.tool_calls && { tool_calls: message.tool_calls }),
    ...(message.tool_call_id && { tool_call_id: message.tool_call_id }),
    ...(message.name && { name: message.name }),
  }))

const buildGeminiPayload = ({ messages, temperature, top_k, tools, thinking }) => {
  const systemTexts = (messages || [])
    .filter(m => m.role === 'system')
    .map(m => normalizeTextContent(m.content))
    .filter(Boolean)
  const systemInstruction = systemTexts.length
    ? { parts: [{ text: systemTexts.join('\n') }] }
    : undefined

  const contents = (messages || [])
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' || m.role === 'ai' ? 'model' : 'user',
      parts: [{ text: normalizeTextContent(m.content) }],
    }))

  const generationConfig = {}
  if (temperature !== undefined) generationConfig.temperature = temperature
  if (top_k !== undefined) generationConfig.topK = top_k
  if (thinking?.thinkingConfig) {
    generationConfig.thinkingConfig = thinking.thinkingConfig
  }

  const payload = { contents }
  if (systemInstruction) payload.systemInstruction = systemInstruction
  if (Object.keys(generationConfig).length) payload.generationConfig = generationConfig
  if (tools) payload.tools = tools
  return payload
}

const streamOpenAICompat = async ({ requestBody, context, writer }) => {
  const {
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
  } = requestBody

  const resolvedBase =
    provider === 'siliconflow'
      ? 'https://api.siliconflow.cn/v1'
      : baseUrl || context.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const resolvedKey =
    apiKey || context.env.OPENAI_API_KEY || context.env.NEXT_PUBLIC_OPENAI_API_KEY

  if (!resolvedKey) {
    await sendSse(writer, { type: 'error', message: 'Missing API key' })
    return
  }

  const trimmedMessages = applyContextLimitRaw(messages, contextMessageLimit)

  const payload = {
    model,
    messages: mapMessagesForOpenAI(trimmedMessages),
    stream: true,
  }

  if (temperature !== undefined) payload.temperature = temperature
  if (tools && tools.length > 0) payload.tools = tools
  if (toolChoice) payload.tool_choice = toolChoice
  if (responseFormat && provider !== 'siliconflow') payload.response_format = responseFormat

  if (thinking?.extra_body) {
    payload.extra_body = { ...(payload.extra_body || {}), ...thinking.extra_body }
  }
  if (provider === 'siliconflow' && thinking) {
    const budget = thinking.budget_tokens || thinking.budgetTokens
    if (budget) {
      payload.extra_body = { ...(payload.extra_body || {}), thinking_budget: budget }
    }
    const enableThinkingModels = new Set([
      'zai-org/GLM-4.6',
      'Qwen/Qwen3-8B',
      'Qwen/Qwen3-14B',
      'Qwen/Qwen3-32B',
      'wen/Qwen3-30B-A3B',
      'Qwen/Qwen3-235B-A22B',
      'tencent/Hunyuan-A13B-Instruct',
      'zai-org/GLM-4.5V',
      'deepseek-ai/DeepSeek-V3.1-Terminus',
      'Pro/deepseek-ai/DeepSeek-V3.1-Terminus',
      'deepseek-ai/DeepSeek-V3.2',
    ])
    if (enableThinkingModels.has(model)) {
      payload.extra_body = { ...(payload.extra_body || {}), enable_thinking: true }
    }
  }
  if (top_k !== undefined) {
    payload.extra_body = { ...(payload.extra_body || {}), top_k }
  }

  const upstream = await fetch(`${resolvedBase.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resolvedKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!upstream.ok || !upstream.body) {
    const errorText = await upstream.text().catch(() => '')
    await sendSse(writer, {
      type: 'error',
      message: errorText || `Upstream error (${upstream.status})`,
    })
    return
  }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullContent = ''
  const toolCallsMap = new Map()
  let inThoughtBlock = false

  const emitText = async text => {
    if (!text) return
    fullContent += text
    await sendSse(writer, { type: 'chunk', content: { type: 'text', content: text } })
  }

  const emitThought = async text => {
    if (!text) return
    await sendSse(writer, { type: 'chunk', content: { type: 'thought', content: text } })
  }

  const handleTaggedText = async text => {
    let remaining = text
    while (remaining) {
      if (!inThoughtBlock) {
        const matchIndex = remaining.search(/<think>|<thought>/i)
        if (matchIndex === -1) {
          await emitText(remaining)
          return
        }
        await emitText(remaining.slice(0, matchIndex))
        remaining = remaining.slice(matchIndex)
        const openMatch = remaining.match(/^<(think|thought)>/i)
        if (openMatch) {
          remaining = remaining.slice(openMatch[0].length)
          inThoughtBlock = true
        } else {
          await emitText(remaining)
          return
        }
      } else {
        const matchIndex = remaining.search(/<\/think>|<\/thought>/i)
        if (matchIndex === -1) {
          await emitThought(remaining)
          return
        }
        await emitThought(remaining.slice(0, matchIndex))
        remaining = remaining.slice(matchIndex)
        const closeMatch = remaining.match(/^<\/(think|thought)>/i)
        if (closeMatch) {
          remaining = remaining.slice(closeMatch[0].length)
          inThoughtBlock = false
        } else {
          await emitThought(remaining)
          return
        }
      }
    }
  }

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
        const payloadText = line.slice(5).trim()
        if (!payloadText) continue
        if (payloadText === '[DONE]') {
          await sendSse(writer, {
            type: 'done',
            content: fullContent,
            toolCalls: toolCallsMap.size ? Array.from(toolCallsMap.values()) : undefined,
          })
          return
        }

        let event
        try {
          event = JSON.parse(payloadText)
        } catch {
          continue
        }
        const choice = event?.choices?.[0]
        const delta = choice?.delta
        const reasoningContent = delta?.reasoning_content || delta?.reasoning
        if (reasoningContent) {
          await emitThought(reasoningContent)
        }
        if (delta?.content) {
          await handleTaggedText(delta.content)
        }
        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            const index = toolCall.index
            if (!toolCallsMap.has(index)) {
              toolCallsMap.set(index, {
                id: toolCall.id,
                type: toolCall.type,
                function: { name: '', arguments: '' },
              })
            }
            const currentToolCall = toolCallsMap.get(index)
            if (toolCall.id) currentToolCall.id = toolCall.id
            if (toolCall.type) currentToolCall.type = toolCall.type
            if (toolCall.function?.name) currentToolCall.function.name += toolCall.function.name
            if (toolCall.function?.arguments) {
              currentToolCall.function.arguments += toolCall.function.arguments
            }
          }
        }
      }
    }
  }

  await sendSse(writer, {
    type: 'done',
    content: fullContent,
    toolCalls: toolCallsMap.size ? Array.from(toolCallsMap.values()) : undefined,
  })
}

const streamGemini = async ({ requestBody, context, writer }) => {
  const {
    apiKey,
    model,
    messages,
    tools,
    thinking,
    temperature,
    top_k,
    responseFormat,
  } = requestBody

  const resolvedKey = apiKey || context.env.GOOGLE_API_KEY || context.env.NEXT_PUBLIC_GOOGLE_API_KEY
  if (!resolvedKey) {
    await sendSse(writer, { type: 'error', message: 'Missing API key' })
    return
  }

  const payload = buildGeminiPayload({
    messages: applyContextLimitRaw(messages, requestBody.contextMessageLimit),
    temperature,
    top_k,
    tools,
    thinking,
    responseFormat,
  })

  const modelPath = model?.includes('/') ? model : `models/${model}`
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:streamGenerateContent?alt=sse&key=${resolvedKey}`
  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!upstream.ok || !upstream.body) {
    const errorText = await upstream.text().catch(() => '')
    await sendSse(writer, {
      type: 'error',
      message: errorText || `Upstream error (${upstream.status})`,
    })
    return
  }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullContent = ''
  let inThoughtBlock = false

  const emitText = async text => {
    if (!text) return
    fullContent += text
    await sendSse(writer, { type: 'chunk', content: { type: 'text', content: text } })
  }

  const emitThought = async text => {
    if (!text) return
    await sendSse(writer, { type: 'chunk', content: { type: 'thought', content: text } })
  }

  const handleTaggedText = async text => {
    let remaining = text
    while (remaining) {
      if (!inThoughtBlock) {
        const matchIndex = remaining.search(/<think>|<thought>/i)
        if (matchIndex === -1) {
          await emitText(remaining)
          return
        }
        await emitText(remaining.slice(0, matchIndex))
        remaining = remaining.slice(matchIndex)
        const openMatch = remaining.match(/^<(think|thought)>/i)
        if (openMatch) {
          remaining = remaining.slice(openMatch[0].length)
          inThoughtBlock = true
        } else {
          await emitText(remaining)
          return
        }
      } else {
        const matchIndex = remaining.search(/<\/think>|<\/thought>/i)
        if (matchIndex === -1) {
          await emitThought(remaining)
          return
        }
        await emitThought(remaining.slice(0, matchIndex))
        remaining = remaining.slice(matchIndex)
        const closeMatch = remaining.match(/^<\/(think|thought)>/i)
        if (closeMatch) {
          remaining = remaining.slice(closeMatch[0].length)
          inThoughtBlock = false
        } else {
          await emitThought(remaining)
          return
        }
      }
    }
  }

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
        const payloadText = line.slice(5).trim()
        if (!payloadText) continue
        let event
        try {
          event = JSON.parse(payloadText)
        } catch {
          continue
        }
        const parts = event?.candidates?.[0]?.content?.parts || []
        for (const part of parts) {
          const text = part?.text
          if (!text) continue
          await handleTaggedText(text)
        }
      }
    }
  }

  await sendSse(writer, { type: 'done', content: fullContent })
}

export default async function handler(request, context) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const requestBody = await readJsonBody(request)
  if (!requestBody) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()

  let heartbeatId = null
  const startHeartbeat = () => {
    heartbeatId = setInterval(() => {
      sendComment(writer).catch(() => {})
    }, 15000)
  }
  const stopHeartbeat = () => {
    if (heartbeatId) clearInterval(heartbeatId)
  }

  startHeartbeat()

  const response = new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })

  ;(async () => {
    try {
      if (requestBody.provider === 'gemini') {
        await streamGemini({ requestBody, context, writer })
      } else {
        await streamOpenAICompat({ requestBody, context, writer })
      }
    } catch (error) {
      await sendSse(writer, { type: 'error', message: error?.message || 'Stream error' })
    } finally {
      stopHeartbeat()
      writer.close()
    }
  })()

  return response
}
