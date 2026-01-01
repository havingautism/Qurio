/**
 * Stream Chat route
 * POST /api/stream-chat
 * Uses Server-Sent Events (SSE) for streaming responses
 */

import express from 'express'
import { streamChat } from '../services/streamChatService.js'

const router = express.Router()

/**
 * POST /api/stream-chat
 * Stream chat completion with support for multiple AI providers
 *
 * Request body:
 * {
 *   "provider": "gemini" | "openai" | "siliconflow" | "glm" | "modelscope" | "kimi",
 *   "apiKey": "API key for the provider",
 *   "baseUrl": "Custom base URL (optional)",
 *   "model": "model-name" (optional),
 *   "messages": [...],
 *   "tools": [...] (optional),
 *   "toolChoice": ... (optional),
 *   "responseFormat": {...} (optional),
 *   "thinking": {...} (optional),
 *   "temperature": 0.7 (optional),
 *   "top_k": 40 (optional),
 *   "top_p": 0.9 (optional),
 *   "frequency_penalty": 0 (optional),
 *   "presence_penalty": 0 (optional),
 *   "contextMessageLimit": 10 (optional)
 * }
 *
 * Response: Server-Sent Events stream
 * - data: {"type":"text","content":"..."}
 * - data: {"type":"thought","content":"..."}
 * - data: {"type":"done","content":"...","thought":"...","sources":[...],"toolCalls":[...]}
 * - data: {"type":"error","error":"..."}
 */
router.post('/stream-chat', async (req, res) => {
  try {
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
    } = req.body

    if (!provider) {
      return res.status(400).json({ error: 'Missing required field: provider' })
    }
    if (!apiKey) {
      return res.status(400).json({ error: 'Missing required field: apiKey' })
    }
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing required field: messages' })
    }

    const supportedProviders = ['gemini', 'openai', 'siliconflow', 'glm', 'modelscope', 'kimi']
    if (!supportedProviders.includes(provider)) {
      return res.status(400).json({
        error: `Unsupported provider: ${provider}. Supported: ${supportedProviders.join(', ')}`
      })
    }

    console.log(`[API] streamChat: provider=${provider}, messages=${messages.length}`)

    // Set SSE headers
    console.log('[API] Setting SSE headers...')
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    // Create abort controller for client disconnect
    const controller = new AbortController()
    req.on('close', () => {
      console.log('[API] Client disconnected')
      controller.abort()
    })

    // Stream response
    console.log('[API] Starting stream iteration...')
    let chunkCount = 0
    for await (const chunk of streamChat({
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
      signal: controller.signal,
    })) {
      chunkCount++
      if (chunkCount === 1 || chunk.type === 'done' || chunk.type === 'error') {
        console.log('[API] Sending chunk:', chunk.type, 'count:', chunkCount)
      }
      res.write(`data: ${JSON.stringify(chunk)}\n\n`)
    }

    console.log('[API] Stream completed, total chunks:', chunkCount)
    res.end()
  } catch (error) {
    console.error('[API] streamChat error:', error)
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to stream chat',
        message: error.message
      })
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`)
      res.end()
    }
  }
})

export default router
