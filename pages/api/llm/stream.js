import OpenAI from 'openai'
import {
  applyContextLimitRaw,
  buildChatMessages,
  extractChunkText,
  getModelForProvider,
} from '../../../src/server/llm'

const createOpenAIClient = ({ apiKey, baseUrl }) => {
  return new OpenAI({
    apiKey,
    baseURL: baseUrl,
  })
}

const sendSse = (res, data) => {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

const formatLangchainMessages = messages =>
  (messages || []).map(message => ({
    role: message?._getType?.() === 'ai' ? 'assistant' : message?._getType?.(),
    content: message?.content,
    additional_kwargs: message?.additional_kwargs,
    tool_call_id: message?.tool_call_id,
  }))

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

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
  } = req.body || {}

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const streamMode = process.env.LLM_STREAM_MODE || 'langchain'

  try {
    if (provider !== 'gemini' && streamMode === 'native') {
      const resolvedBase =
        provider === 'siliconflow'
          ? 'https://api.siliconflow.cn/v1'
          : baseUrl || 'https://api.openai.com/v1'
      const resolvedKey = apiKey || process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY
      const client = createOpenAIClient({ apiKey: resolvedKey, baseUrl: resolvedBase })
      const trimmedMessages = applyContextLimitRaw(messages, contextMessageLimit)

      const options = {
        model,
        messages: trimmedMessages,
        stream: true,
      }

      if (temperature !== undefined) options.temperature = temperature
      if (tools && tools.length > 0) options.tools = tools
      if (toolChoice) options.tool_choice = toolChoice
      if (responseFormat) options.response_format = responseFormat

      if (thinking?.extra_body) {
        options.extra_body = { ...(options.extra_body || {}), ...thinking.extra_body }
      }
      if (top_k !== undefined) {
        options.extra_body = { ...(options.extra_body || {}), top_k }
      }

      const responseStream = await client.chat.completions.create(options)

      let fullContent = ''
      const toolCallsMap = new Map()

      for await (const chunk of responseStream) {
        const choice = chunk.choices?.[0]
        const delta = choice?.delta
        if (!delta) continue

        if (delta.content) {
          fullContent += delta.content
          sendSse(res, { type: 'chunk', content: delta.content })
        }

        if (delta.tool_calls) {
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

      const finalToolCalls = Array.from(toolCallsMap.values())
      sendSse(res, {
        type: 'done',
        content: fullContent,
        toolCalls: finalToolCalls.length ? finalToolCalls : undefined,
      })
      res.end()
      return
    }

    const chatModel = getModelForProvider({
      provider,
      apiKey,
      baseUrl,
      model,
      temperature,
      top_k,
      tools,
      toolChoice,
      responseFormat,
      thinking,
    })

    const chatMessages = buildChatMessages({ messages, contextMessageLimit })

    if (process.env.LLM_DEBUG_REQUESTS === '1') {
      const invocation =
        typeof chatModel?.invocationParams === 'function' ? chatModel.invocationParams() : {}
      console.log(
        JSON.stringify(
          {
            provider,
            model,
            temperature,
            top_k,
            toolChoice,
            responseFormat,
            thinking,
            invocationParams: invocation,
            messages: formatLangchainMessages(chatMessages),
          },
          null,
          2,
        ),
      )
    }

    const responseStream = await chatModel.stream(chatMessages)

    let fullContent = ''
    const toolCallsMap = new Map()

    for await (const chunk of responseStream) {
      const rawResponse = chunk?.message?.additional_kwargs?.__raw_response
      const reasoningContent = rawResponse?.choices?.[0]?.delta?.reasoning_content
      if (reasoningContent) {
        sendSse(res, { type: 'chunk', content: { type: 'thought', content: reasoningContent } })
      }

      const text = extractChunkText(chunk)
      if (text) {
        fullContent += text
        sendSse(res, { type: 'chunk', content: { type: 'text', content: text } })
      }

      const toolCalls =
        chunk?.additional_kwargs?.tool_calls ||
        chunk?.tool_calls ||
        chunk?.message?.additional_kwargs?.tool_calls
      if (toolCalls) {
        for (const toolCall of toolCalls) {
          const index = toolCall.index ?? toolCallsMap.size
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

    const finalToolCalls = Array.from(toolCallsMap.values())
    sendSse(res, {
      type: 'done',
      content: fullContent,
      toolCalls: finalToolCalls.length ? finalToolCalls : undefined,
    })
    res.end()
  } catch (error) {
    sendSse(res, { type: 'error', message: error?.message || 'Stream error' })
    res.end()
  }
}
