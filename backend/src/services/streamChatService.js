/**
 * Stream Chat Service (Refactored)
 * Clean architecture with provider adapter pattern
 */

import { getProviderAdapter } from './providers/adapterFactory.js'
import { normalizeTextContent, safeJsonParse } from './serviceUtils.js'
import { TIME_KEYWORDS_REGEX } from './regexConstants.js'
import { executeToolByName, getToolDefinitionsByIds, isLocalToolName } from './toolsService.js'

// Debug flags
const debugStream = () => process.env.DEBUG_STREAM === '1'
const debugSources = () => process.env.DEBUG_SOURCES === '1'

/**
 * Apply context limit to messages
 */
const applyContextLimit = (messages, limit) => {
  if (!limit || limit <= 0 || !messages || messages.length <= limit) return messages
  const systemMessages = messages.filter(m => m?.role === 'system')
  const nonSystemMessages = messages.filter(m => m?.role !== 'system')
  const recent = nonSystemMessages.slice(-limit)
  return [...systemMessages, ...recent]
}

/**
 * Factory for handleTaggedText function
 */
/**
 * Factory for handleTaggedText function
 */
const handleTaggedTextFactory = ({ emitText, emitThought, enableTags = true }) => {
  let inThoughtBlock = false
  return text => {
    // If tag parsing is disabled, just emit everything as text
    if (!enableTags) {
      emitText(text)
      return
    }

    let remaining = text
    while (remaining) {
      if (!inThoughtBlock) {
        const matchIndex = remaining.search(/<think>|<thought>/i)
        if (matchIndex === -1) {
          emitText(remaining)
          return
        }
        emitText(remaining.slice(0, matchIndex))
        remaining = remaining.slice(matchIndex)
        const openMatch = remaining.match(/^<(think|thought)>/i)
        if (openMatch) {
          remaining = remaining.slice(openMatch[0].length)
          inThoughtBlock = true
        } else {
          emitText(remaining)
          return
        }
      } else {
        const matchIndex = remaining.search(/<\/think>|<\/thought>/i)
        if (matchIndex === -1) {
          emitThought(remaining)
          return
        }
        emitThought(remaining.slice(0, matchIndex))
        remaining = remaining.slice(matchIndex)
        const closeMatch = remaining.match(/^<\/(think|thought)>/i)
        if (closeMatch) {
          remaining = remaining.slice(closeMatch[0].length)
          inThoughtBlock = false
        } else {
          emitThought(remaining)
          return
        }
      }
    }
  }
}

// NOTE: Legacy provider-specific source collectors (GLM/Kimi) are unused in the refactor.
// Keeping them commented to avoid dead code until adapters emit provider-native sources again.
/*
const collectGLMSources = (webSearch, sourcesMap) => {
  if (!webSearch) return
  const results = webSearch.results || webSearch
  if (!Array.isArray(results)) return

  for (const item of results) {
    const refer = item?.refer || item?.id || item?.link
    if (!refer || sourcesMap.has(refer)) continue
    sourcesMap.set(refer, {
      id: refer,
      title: item?.title || refer,
      url: item?.link || '',
      snippet: item?.content?.substring(0, 200) || item?.snippet || '',
      icon: item?.icon || '',
      media: item?.media || '',
    })
  }
}

const collectKimiSources = (toolOutput, sourcesMap) => {
  if (!toolOutput) return
  const parsed = typeof toolOutput === 'string' ? safeJsonParse(toolOutput) : toolOutput
  if (!parsed) return

  const results =
    parsed?.results || parsed?.data || parsed?.items || (Array.isArray(parsed) ? parsed : [])
  if (!Array.isArray(results)) return

  for (const item of results) {
    const url = item?.url || item?.link || item?.href
    if (!url || sourcesMap.has(url)) continue
    sourcesMap.set(url, {
      id: String(sourcesMap.size + 1),
      title: item?.title || url,
      url,
      snippet: item?.snippet || item?.description || item?.content?.substring(0, 200) || '',
    })
  }
}
*/

/**
 * Collect Tavily web search sources
 */
const collectWebSearchSources = (result, sourcesMap) => {
  if (!result?.results || !Array.isArray(result.results)) return
  result.results.forEach(item => {
    const url = item.url
    if (url && !sourcesMap.has(url)) {
      sourcesMap.set(url, {
        title: item.title || 'Unknown Source',
        uri: url,
      })
    }
  })
}

const isTavilySearchToolName = name =>
  name === 'Tavily_web_search' ||
  name === 'Tavily_academic_search' ||
  name === 'web_search' ||
  name === 'academic_search'

// NOTE: Gemini grounding sources are not wired into the adapter path yet.
// Keeping commented until adapter exposes groundingMetadata.
/*
const collectGeminiSources = (groundingMetadata, geminiSources) => {
  const chunks = groundingMetadata?.groundingChunks
  if (!Array.isArray(chunks)) return
  if (!Array.isArray(geminiSources)) return
  if (geminiSources.length === chunks.length && geminiSources.length > 0) return
  geminiSources.length = 0
  for (const chunk of chunks) {
    const web = chunk?.web
    const url = web?.uri
    if (!url) continue
    geminiSources.push({ url, title: web?.title || url })
  }
}
*/

/**
 * Build tool call event
 */
const buildToolCallEvent = (toolCall, argsOverride) => ({
  type: 'tool_call',
  id: toolCall?.id || null,
  name: getToolCallName(toolCall),
  arguments:
    typeof argsOverride !== 'undefined'
      ? formatToolArgumentsFromValue(argsOverride)
      : formatToolArgumentsFromValue(getToolCallArguments(toolCall)),
  textIndex: toolCall?.textIndex,
})

/**
 * Build tool result event
 */
const buildToolResultEvent = (toolCall, error, durationMs, output) => ({
  type: 'tool_result',
  id: toolCall?.id || null,
  name: getToolCallName(toolCall),
  status: error ? 'error' : 'done',
  duration_ms: typeof durationMs === 'number' ? durationMs : undefined,
  output: typeof output !== 'undefined' ? output : undefined,
  error: error ? String(error.message || error) : undefined,
})

/**
 * Helper: Extract tool call name
 */
const getToolCallName = toolCall =>
  toolCall?.function?.name ||
  toolCall?.name ||
  toolCall?.tool?.name ||
  toolCall?.tool?.function?.name ||
  null

/**
 * Helper: Extract tool call arguments
 */
const getToolCallArguments = toolCall =>
  toolCall?.function?.arguments ||
  toolCall?.arguments ||
  toolCall?.args ||
  toolCall?.tool?.function?.arguments ||
  toolCall?.tool?.arguments ||
  toolCall?.tool?.args ||
  null

/**
 * Helper: Format tool arguments to JSON string
 */
const formatToolArgumentsFromValue = value => {
  if (!value) return ''
  if (typeof value === 'string') {
    const parsed = safeJsonParse(value)
    return parsed ? JSON.stringify(parsed) : value
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Helper: Update tool calls map
 */
const updateToolCallsMap = (toolCallsMap, newToolCalls) => {
  if (!Array.isArray(newToolCalls)) return
  for (const toolCall of newToolCalls) {
    if (!toolCall?.id) continue
    toolCallsMap.set(toolCall.id, toolCall)
  }
}

/**
 * Helper: Merge tool calls by index
 */
const mergeToolCallsByIndex = (toolCallsByIndex, newToolCalls, currentTextLength = 0) => {
  if (!Array.isArray(newToolCalls)) return

  for (const toolCall of newToolCalls) {
    const index = typeof toolCall?.index === 'number' ? toolCall.index : toolCallsByIndex.length
    const current = toolCallsByIndex[index] || {}
    const currentFunction = current.function || {}
    const nextFunction = toolCall?.function || {}
    const nextArguments = nextFunction.arguments || ''
    const mergedArguments = nextArguments
      ? `${currentFunction.arguments || ''}${nextArguments}`
      : currentFunction.arguments

    toolCallsByIndex[index] = {
      ...current,
      ...toolCall,
      // If this is a new tool call, capture the current text position for interleaving
      textIndex: current.textIndex !== undefined ? current.textIndex : currentTextLength,
      function: {
        ...currentFunction,
        ...nextFunction,
        ...(mergedArguments ? { arguments: mergedArguments } : {}),
      },
    }
  }
}

/**
 * Stream chat completion
 * Refactored version using provider adapter pattern
 */
export const streamChat = async function* (params) {
  if (debugStream()) {
    console.log('[streamChat] Starting with provider:', params.provider)
  }

  // Extract parameters
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
    top_p,
    frequency_penalty,
    presence_penalty,
    contextMessageLimit,
    stream = true,
    signal,
    toolIds = [],
    searchProvider,
    tavilyApiKey,
  } = params

  const toolConfig = { searchProvider, tavilyApiKey }

  // Apply context limit
  const trimmedMessages = applyContextLimit(messages, contextMessageLimit)

  // Check for time-related keywords in the last user message
  const lastUserMessage = trimmedMessages
    .slice()
    .reverse()
    .find(m => m.role === 'user')
  const timeKeywordsRegex = TIME_KEYWORDS_REGEX

  if (lastUserMessage?.content) {
    const isTimeMatch = timeKeywordsRegex.test(lastUserMessage.content)
    const isToolEnabled = Array.isArray(toolIds) && toolIds.includes('local_time')

    // console.log('[TimeInject] Checking:', {
    //   content: lastUserMessage.content,
    //   match: isTimeMatch,
    //   toolIds,
    //   enabled: isToolEnabled
    // })

    if (isTimeMatch && isToolEnabled) {
      try {
        console.log('[TimeInject] Injecting local time context...')
        const timeResult = await executeToolByName('local_time', {}, {})
        const timeContext = `\n\n[SYSTEM INJECTED CONTEXT]\nCurrent Local Time: ${timeResult.formatted} (${timeResult.timezone})`

        // Inject into the LAST USER message for better attention
        const lastUserIndex = trimmedMessages
          .map((m, i) => (m.role === 'user' ? i : -1))
          .reduce((a, b) => Math.max(a, b), -1)

        if (lastUserIndex !== -1) {
          trimmedMessages[lastUserIndex] = {
            ...trimmedMessages[lastUserIndex],
            content: trimmedMessages[lastUserIndex].content + timeContext,
          }
        }
      } catch (e) {
        console.warn('Failed to inject local time context:', e)
      }
    }
  }

  // Inject interactive_form guidance if tool is available
  // Inject interactive_form guidance (GLOBAL TOOL)

  let currentMessages = trimmedMessages
  console.log('currentMessages', currentMessages)

  // Get provider adapter
  const adapter = getProviderAdapter(provider)

  // Prepare tool definitions
  // Always include interactive_form as it is a global tool
  const agentToolDefinitions = provider === 'gemini' ? [] : getToolDefinitionsByIds(toolIds)
  const combinedTools = [...(Array.isArray(tools) ? tools : []), ...agentToolDefinitions].filter(
    Boolean,
  )

  // Deduplicate tools by name
  const normalizedTools = []
  const toolNames = new Set()
  for (const tool of combinedTools) {
    const name = tool?.function?.name
    if (name && toolNames.has(name)) continue
    if (name) toolNames.add(name)
    normalizedTools.push(tool)
  }

  // Inject interactive_form guidance if tool is available
  if (normalizedTools.some(t => t.function?.name === 'interactive_form')) {
    const formGuidance = `
[TOOL USE GUIDANCE]
When you need to collect structured information from the user (e.g. preferences, requirements, booking details), use the 'interactive_form' tool.
CRITICAL: DO NOT list questions in text or markdown. YOU MUST USE the 'interactive_form' tool to display fields.
Keep forms concise (3-6 fields).

[MANDATORY TEXT-FIRST RULE]
CRITICAL: You MUST output meaningful introductory text BEFORE calling 'interactive_form'.
- NEVER call 'interactive_form' as the very first thing in your response
- ALWAYS explain the context, acknowledge the user's request, or provide guidance BEFORE the form
- Minimum: Output at least 1-2 sentences before the form call
- Example: "I can help you with that. To provide the best recommendation, please share some details below:"

[SINGLE FORM PER RESPONSE]
CRITICAL: You may call 'interactive_form' ONLY ONCE per response. Do NOT call it multiple times in the same answer.
If you need to collect information, design ONE comprehensive form that gathers all necessary details at once.

[MULTI-TURN INTERACTIONS]
1. If the information from a submitted form is insufficient, you MAY present another 'interactive_form' in your NEXT response (after the user submits the first form).
2. LIMIT: Use at most 2-3 forms total across the entire conversation. Excessive questioning frustrates users.
3. INTERLEAVING: You can place the form anywhere in your response. Output introductory text FIRST (e.g., "I can help with that. Please provide some details below:"), then call 'interactive_form' once.
4. If the user has provided enough context through previous forms, proceed directly to the final answer without requesting more information.`

    const systemIndex = currentMessages.findIndex(m => m.role === 'system')
    if (systemIndex !== -1) {
      currentMessages[systemIndex] = {
        ...currentMessages[systemIndex],
        content: currentMessages[systemIndex].content + formGuidance,
      }
    } else {
      currentMessages.unshift({ role: 'system', content: formGuidance })
    }
  }

  // Inject citation prompt if Tavily_web_search is enabled
  if (
    normalizedTools.some(
      t => t.function?.name === 'Tavily_web_search' || t.function?.name === 'web_search',
    )
  ) {
    const citationPrompt =
      '\n\n[IMPORTANT] You have access to a "Tavily_web_search" tool. When you use this tool to answer a question, you MUST cite the search results in your answer using the format [1], [2], etc., corresponding to the index of the search result provided in the tool output. Do not fabricate citations.'

    const systemMessageIndex = currentMessages.findIndex(m => m.role === 'system')
    if (systemMessageIndex !== -1) {
      currentMessages[systemMessageIndex].content += citationPrompt
    } else {
      currentMessages.unshift({ role: 'system', content: citationPrompt })
    }
  }

  const effectiveToolChoice =
    toolChoice !== undefined ? toolChoice : normalizedTools.length > 0 ? 'auto' : undefined

  // Source collection
  const sourcesMap = new Map()
  // Initialize state accumulators and helpers (Function Scope)
  // This ensures they are available across loops and execution types
  let fullContent = ''
  let fullThought = ''
  const chunks = []

  // Emit helpers
  const emitText = text => {
    if (!text) return
    fullContent += text
    chunks.push({ type: 'text', content: text })
  }
  const emitThought = text => {
    if (!text) return
    fullThought += text
    chunks.push({ type: 'thought', content: text })
  }
  // For SiliconFlow/DeepSeek, we rely on native reasoning_content field.
  // We disable tag parsing to avoid confusion if the model outputs tags in the content
  const enableTagParsing = provider !== 'siliconflow'
  const handleTaggedText = handleTaggedTextFactory({
    emitText,
    emitThought,
    enableTags: enableTagParsing,
  })

  // Tool calling loop
  let loops = 0
  const maxLoops = 10

  while (loops < maxLoops) {
    loops += 1

    if (debugStream()) {
      console.log(`[streamChat] Loop ${loops}, messages count:`, currentMessages.length)
    }

    // Execute via adapter
    const execution = await adapter.execute(currentMessages, {
      apiKey,
      baseUrl,
      model,
      temperature,
      top_k,
      top_p,
      frequency_penalty,
      presence_penalty,
      tools: normalizedTools,
      toolChoice: effectiveToolChoice,
      responseFormat,
      thinking,
      stream,
      signal,
    })

    // Handle tool calls (non-streaming)
    if (execution.type === 'tool_calls') {
      const { toolCalls, thought } = execution

      // Emit thought if present (from non-streaming adapter execution)
      if (thought) {
        emitThought(String(thought))
        fullThought += thought
      }

      // Flush any accumulated chunks (especially thought) before tool execution
      if (chunks.length > 0) {
        yield* chunks
        chunks.length = 0 // Clear buffer
      }

      // Add assistant message with tool_calls
      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: '', tool_calls: toolCalls },
      ]

      // Execute each tool
      for (const toolCall of toolCalls) {
        const rawArgs = getToolCallArguments(toolCall)
        // ... rest of loop handled by existing code ...
        // We only need to output the beginning of the block to match
        const parsedArgs = typeof rawArgs === 'string' ? safeJsonParse(rawArgs) : rawArgs || {}
        yield buildToolCallEvent(toolCall, parsedArgs)
        const startedAt = Date.now()
        const toolName = toolCall.function.name

        if (!isLocalToolName(toolName)) {
          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolName,
            content: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
          })
          yield buildToolResultEvent(
            toolCall,
            new Error(`Unknown tool: ${toolName}`),
            Date.now() - startedAt,
          )
          continue
        }

        try {
          const result = await executeToolByName(toolName, parsedArgs || {}, toolConfig)
          if (isTavilySearchToolName(toolName)) {
            collectWebSearchSources(result, sourcesMap)
          }
          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolName,
            content: JSON.stringify(result),
          })
          yield buildToolResultEvent(toolCall, null, Date.now() - startedAt, result)
        } catch (error) {
          console.error(`Tool execution error (${toolName}):`, error)
          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolName,
            content: JSON.stringify({ error: `Tool execution failed: ${error.message}` }),
          })
          yield buildToolResultEvent(toolCall, error, Date.now() - startedAt)
        }
      }

      // Continue loop with tool results
      continue
    }

    // Handle non-streaming response (final answer from provider that forced non-streaming)
    if (execution.type === 'response' || execution.type === 'no_tool_calls') {
      const response = execution.response
      const content = adapter.getResponseContent
        ? adapter.getResponseContent(response)
        : response?.content || ''

      // Emit extracted thought if present
      const thought = execution.thought || response?.additional_kwargs?.reasoning_content || null

      if (thought) {
        emitThought(String(thought))
        fullThought += thought
      }

      if (content) {
        handleTaggedText(content)
      }

      // Flush chunks
      if (chunks.length > 0) {
        yield* chunks
        chunks.length = 0
      }

      // We got a final response, so we are done

      yield {
        type: 'done',
        content: fullContent,
        thought: fullThought || undefined,
        sources: sourcesMap.size ? Array.from(sourcesMap.values()) : undefined,
      }
      return
    }

    // Handle streaming response
    if (execution.type === 'stream') {
      const { modelInstance, messages: executionMessages } = execution

      const streamIterator = await adapter.createStreamIterator(
        modelInstance,
        currentMessages,
        signal,
      )

      // Restart tool accumulation for this new stream
      const toolCallsMap = new Map()
      const toolCallsByIndex = []

      let lastFinishReason = null

      // Process streaming chunks
      for await (const chunk of streamIterator) {
        const messageChunk = chunk?.message ?? chunk
        const contentValue = messageChunk?.content ?? chunk?.content

        // 1. Process reasoning/thinking content using adapter
        const reasoning = adapter.extractThinkingContent(messageChunk)
        if (reasoning) {
          emitThought(String(reasoning))
        }

        // 2. Process text content first so textIndex captures position AFTER this chunk's text
        let chunkText = normalizeTextContent(contentValue)
        if (!chunkText) {
          const rawDeltaContent =
            messageChunk?.additional_kwargs?.__raw_response?.choices?.[0]?.delta?.content
          if (typeof rawDeltaContent === 'string' && rawDeltaContent) {
            chunkText = rawDeltaContent
          }
        }
        if (chunkText) {
          handleTaggedText(chunkText)
        }

        // 3. Collect tool_calls from streaming chunks
        const toolCalls =
          messageChunk?.tool_calls ||
          messageChunk?.additional_kwargs?.tool_calls ||
          messageChunk?.additional_kwargs?.tool_calls
        if (Array.isArray(toolCalls)) {
          mergeToolCallsByIndex(toolCallsByIndex, toolCalls, fullContent.length)
          updateToolCallsMap(toolCallsMap, toolCalls)
        }

        // 4. Also check raw response for tool calls
        const rawToolCalls =
          messageChunk?.additional_kwargs?.__raw_response?.choices?.[0]?.delta?.tool_calls ||
          messageChunk?.additional_kwargs?.__raw_response?.choices?.[0]?.tool_calls
        if (Array.isArray(rawToolCalls)) {
          mergeToolCallsByIndex(toolCallsByIndex, rawToolCalls, fullContent.length)
          updateToolCallsMap(toolCallsMap, rawToolCalls)
        }

        // Yield accumulated chunks and track thought content
        while (chunks.length > 0) {
          yield chunks.shift()
        }

        // Check finish reason
        const finishReason =
          messageChunk?.additional_kwargs?.__raw_response?.choices?.[0]?.finish_reason ||
          chunk?.finish_reason ||
          null
        if (finishReason) {
          lastFinishReason = finishReason
        }
      }

      // Flush any buffered content
      handleTaggedText('')
      while (chunks.length > 0) {
        yield chunks.shift()
      }

      // Check if streaming ended with tool_calls
      if (lastFinishReason === 'tool_calls' && toolCallsByIndex.length > 0) {
        const assistantToolCalls = toolCallsByIndex
          .map(toolCall => {
            const toolName = getToolCallName(toolCall)
            const toolArgs = getToolCallArguments(toolCall)
            return {
              id: toolCall.id,
              type: toolCall.type || 'function',
              function: toolName
                ? { name: toolName, arguments: formatToolArgumentsFromValue(toolArgs) }
                : undefined,
              textIndex: toolCall.textIndex,
            }
          })
          .filter(toolCall => toolCall?.id && toolCall?.function?.name)

        if (assistantToolCalls.length > 0) {
          // Add assistant message with tool_calls
          // Note: content should be empty when tool_calls are present
          // to avoid sending thinking content back to the model
          currentMessages = [
            ...currentMessages,
            { role: 'assistant', content: '', tool_calls: assistantToolCalls },
          ]

          // Execute tools
          for (const toolCall of assistantToolCalls) {
            const rawArgs = getToolCallArguments(toolCall)
            const parsedArgs = typeof rawArgs === 'string' ? safeJsonParse(rawArgs) : rawArgs || {}
            yield buildToolCallEvent(toolCall, parsedArgs)
            const startedAt = Date.now()
            const toolName = toolCall.function.name

            if (!isLocalToolName(toolName)) {
              currentMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolName,
                content: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
              })
              yield buildToolResultEvent(
                toolCall,
                new Error(`Unknown tool: ${toolName}`),
                Date.now() - startedAt,
              )
              continue
            }

            try {
              const result = await executeToolByName(toolName, parsedArgs || {}, toolConfig)
              if (isTavilySearchToolName(toolName)) {
                collectWebSearchSources(result, sourcesMap)
              }
              currentMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolName,
                content: JSON.stringify(result),
              })
              yield buildToolResultEvent(toolCall, null, Date.now() - startedAt, result)
            } catch (error) {
              console.error(`Tool execution error (${toolName}):`, error)
              currentMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolName,
                content: JSON.stringify({ error: `Tool execution failed: ${error.message}` }),
              })
              yield buildToolResultEvent(toolCall, error, Date.now() - startedAt)
            }
          }

          // Continue loop with tool results
          continue
        }
      }

      // No more tool calls, streaming complete
      yield {
        type: 'done',
        content: fullContent,
        thought: fullThought || undefined,
        sources: sourcesMap.size ? Array.from(sourcesMap.values()) : undefined,
      }
      return
    }

    // Fallback: no tool calls and no stream (should not reach here)
    break
  }

  // Max loops reached
  yield {
    type: 'done',
    content: '',
    sources: sourcesMap.size ? Array.from(sourcesMap.values()) : undefined,
  }
}
