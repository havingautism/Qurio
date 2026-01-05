/**
 * Deep Research chat route
 * POST /api/stream-deep-research
 * Uses Server-Sent Events (SSE) for streaming responses
 */

import express from 'express'
import { streamDeepResearch } from '../services/deepResearchAgentService.js'
import { createSseStream, getSseConfig } from '../utils/sse.js'

const router = express.Router()

router.post('/stream-deep-research', async (req, res) => {
  try {
    const {
      provider,
      apiKey,
      baseUrl,
      model,
      messages,
      tools,
      toolChoice,
      temperature,
      top_k,
      top_p,
      frequency_penalty,
      presence_penalty,
      contextMessageLimit,
      toolIds,
      plan,
      question,
      researchType, // 'general' or 'academic'
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

    const supportedProviders = ['openai', 'siliconflow', 'glm', 'modelscope', 'kimi']
    if (!supportedProviders.includes(provider)) {
      return res.status(400).json({
        error: `Unsupported provider: ${provider}. Supported: ${supportedProviders.join(', ')}`,
      })
    }

    const sse = createSseStream(res, getSseConfig())
    sse.writeComment('ok')

    const controller = new AbortController()
    req.on('aborted', () => {
      controller.abort()
    })
    res.on('close', () => {
      if (!res.writableEnded && !res.writableFinished) {
        controller.abort()
      }
    })

    for await (const chunk of streamDeepResearch({
      provider,
      apiKey,
      baseUrl,
      model,
      messages,
      tools,
      toolChoice,
      temperature,
      top_k,
      top_p,
      frequency_penalty,
      presence_penalty,
      contextMessageLimit,
      toolIds,
      plan,
      question,
      researchType, // Pass researchType to service
      signal: controller.signal,
    })) {
      sse.sendEvent(chunk)
    }

    sse.close()
  } catch (error) {
    console.error('[API] deepResearch error:', error)
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to stream deep research',
        message: error.message,
      })
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`)
      res.end()
    }
  }
})

export default router
