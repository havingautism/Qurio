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

const safeJsonParse = text => {
  if (!text || typeof text !== 'string') return null
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

const normalizeRelatedQuestions = payload => {
  const sanitize = arr =>
    (arr || [])
      .map(q => {
        if (typeof q === 'string') return q.trim()
        if (q === null || q === undefined) return ''
        try {
          return String(q).trim()
        } catch {
          return ''
        }
      })
      .filter(Boolean)

  if (Array.isArray(payload)) return sanitize(payload)
  if (payload && typeof payload === 'object') {
    const candidates = [
      payload.questions,
      payload.follow_up_questions,
      payload.followUpQuestions,
      payload.followups,
      payload.followUps,
    ]
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return sanitize(candidate)
    }
    const firstArray = Object.values(payload).find(v => Array.isArray(v))
    if (firstArray) return sanitize(firstArray)
  }
  return []
}

const readJsonBody = async request => {
  try {
    return await request.json()
  } catch {
    return null
  }
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

const invokeOpenAICompat = async ({
  requestBody,
  context,
  messages,
  responseFormat,
}) => {
  const { provider, apiKey, baseUrl, model, temperature, top_k, tools, toolChoice, thinking } =
    requestBody

  const resolvedBase =
    provider === 'siliconflow'
      ? 'https://api.siliconflow.cn/v1'
      : baseUrl || context.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const resolvedKey =
    apiKey || context.env.OPENAI_API_KEY || context.env.NEXT_PUBLIC_OPENAI_API_KEY

  if (!resolvedKey) {
    throw new Error('Missing API key')
  }

  const payload = {
    model,
    messages: mapMessagesForOpenAI(messages),
    stream: false,
  }

  if (temperature !== undefined) payload.temperature = temperature
  if (tools && tools.length > 0) payload.tools = tools
  if (toolChoice) payload.tool_choice = toolChoice
  if (provider === 'siliconflow') {
    payload.response_format = responseFormat || { type: 'text' }
  } else if (responseFormat) {
    payload.response_format = responseFormat
  }

  if (thinking?.extra_body) {
    payload.extra_body = { ...(payload.extra_body || {}), ...thinking.extra_body }
  }
  if (provider === 'siliconflow' && thinking) {
    const budget = thinking.budget_tokens || thinking.budgetTokens
    if (budget) {
      payload.thinking_budget = budget
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
      payload.enable_thinking = true
    }
  }
  if (top_k !== undefined) {
    if (provider === 'siliconflow') {
      payload.top_k = top_k
    } else {
      payload.extra_body = { ...(payload.extra_body || {}), top_k }
    }
  }

  const response = await fetch(`${resolvedBase.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resolvedKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `Upstream error (${response.status})`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content ?? ''
  return typeof content === 'string' ? content : normalizeTextContent(content)
}

const invokeGemini = async ({ requestBody, context, messages }) => {
  const { apiKey, model, temperature, top_k, tools, thinking } = requestBody
  const resolvedKey = apiKey || context.env.GOOGLE_API_KEY || context.env.NEXT_PUBLIC_GOOGLE_API_KEY
  if (!resolvedKey) {
    throw new Error('Missing API key')
  }

  const payload = buildGeminiPayload({ messages, temperature, top_k, tools, thinking })

  const modelPath = model?.includes('/') ? model : `models/${model}`
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${resolvedKey}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `Upstream error (${response.status})`)
  }

  const data = await response.json()
  const parts = data?.candidates?.[0]?.content?.parts || []
  const content = parts.map(part => part?.text || '').join('')
  return content
}

export default async function handler(request, context) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = await readJsonBody(request)
  if (!body) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { task, provider, firstMessage, messages, spaces } = body
  const responseFormat =
    provider !== 'gemini' && task !== 'generateTitle' ? { type: 'json_object' } : undefined

  try {
    if (task === 'generateTitle') {
      const promptMessages = [
        {
          role: 'system',
          content:
            "Generate a short, concise title (max 5 words) for this conversation based on the user's first message. Do not use quotes.",
        },
        { role: 'user', content: firstMessage },
      ]
      const content =
        provider === 'gemini'
          ? await invokeGemini({ requestBody: body, context, messages: promptMessages })
          : await invokeOpenAICompat({
              requestBody: body,
              context,
              messages: promptMessages,
              responseFormat,
            })
      return new Response(JSON.stringify({ title: content?.trim?.() || 'New Conversation' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (task === 'generateTitleAndSpace') {
      const spaceLabels = (spaces || []).map(s => s.label).join(', ')
      const promptMessages = [
        {
          role: 'system',
          content: `You are a helpful assistant.
1. Generate a short, concise title (max 5 words) for this conversation based on the user's first message.
2. Select the most appropriate space from the following list: [${spaceLabels}]. If none fit well, return null.
Return the result as a JSON object with keys "title" and "spaceLabel".`,
        },
        { role: 'user', content: firstMessage },
      ]

      const content =
        provider === 'gemini'
          ? await invokeGemini({ requestBody: body, context, messages: promptMessages })
          : await invokeOpenAICompat({
              requestBody: body,
              context,
              messages: promptMessages,
              responseFormat,
            })

      const parsed = safeJsonParse(content) || {}
      const title = parsed.title || 'New Conversation'
      const spaceLabel = parsed.spaceLabel
      const selectedSpace = (spaces || []).find(s => s.label === spaceLabel) || null

      return new Response(JSON.stringify({ title, space: selectedSpace }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (task === 'generateRelatedQuestions') {
      const promptMessages = [
        ...(messages || []),
        {
          role: 'user',
          content:
            'Based on our conversation, suggest 3 short, relevant follow-up questions I might ask. Return them as a JSON array of strings. Example: ["Question 1?", "Question 2?"]',
        },
      ]

      const content =
        provider === 'gemini'
          ? await invokeGemini({ requestBody: body, context, messages: promptMessages })
          : await invokeOpenAICompat({
              requestBody: body,
              context,
              messages: promptMessages,
              responseFormat,
            })

      const parsed = safeJsonParse(content)
      const questions = normalizeRelatedQuestions(parsed)
      return new Response(JSON.stringify({ questions }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown task' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || 'Request failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
