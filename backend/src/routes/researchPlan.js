/**
 * Research Plan generation route
 * POST /api/research-plan
 */

import express from 'express'
import { generateResearchPlan, buildResearchPlanMessages } from '../services/researchPlanService.js'
import { streamChat } from '../services/streamChatService.js'
import { createSseStream, getSseConfig } from '../utils/sse.js'

const router = express.Router()

/**
 * POST /api/research-plan
 * Generate a structured deep research plan
 *
 * Request body:
 * {
 *   "provider": "gemini" | "openai" | "siliconflow" | "glm" | "modelscope" | "kimi",
 *   "message": "User message about research",
 *   "apiKey": "API key for the provider",
 *   "baseUrl": "Custom base URL (optional)",
 *   "model": "model-name" (optional)
 * }
 *
 * Response:
 * {
 *   "plan": "JSON string of the research plan"
 * }
 */
router.post('/research-plan', async (req, res) => {
  try {
    const { provider, message, apiKey, baseUrl, model } = req.body

    if (!provider || !message) {
      return res.status(400).json({ error: 'Missing required fields: provider, message' })
    }

    const supportedProviders = ['gemini', 'openai', 'siliconflow', 'glm', 'modelscope', 'kimi']
    if (!supportedProviders.includes(provider)) {
      return res.status(400).json({
        error: `Unsupported provider: ${provider}. Supported: ${supportedProviders.join(', ')}`
      })
    }

    console.log(`[API] generateResearchPlan: provider=${provider}`)

    const plan = await generateResearchPlan(provider, message, apiKey, baseUrl, model)

    res.json({ plan })
  } catch (error) {
    console.error('[API] generateResearchPlan error:', error)
    res.status(500).json({
      error: 'Failed to generate research plan',
      message: error.message
    })
  }
})

/**
 * POST /api/research-plan-stream
 * Stream a structured deep research plan via SSE
 */
router.post('/research-plan-stream', async (req, res) => {
  try {
    const {
      provider,
      message,
      apiKey,
      baseUrl,
      model,
      responseFormat,
      thinking,
      temperature,
      top_k,
      top_p,
      frequency_penalty,
      presence_penalty,
      contextMessageLimit,
    } = req.body

    if (!provider || !message) {
      return res.status(400).json({ error: 'Missing required fields: provider, message' })
    }
    if (!apiKey) {
      return res.status(400).json({ error: 'Missing required field: apiKey' })
    }

    const supportedProviders = ['gemini', 'openai', 'siliconflow', 'glm', 'modelscope', 'kimi']
    if (!supportedProviders.includes(provider)) {
      return res.status(400).json({
        error: `Unsupported provider: ${provider}. Supported: ${supportedProviders.join(', ')}`,
      })
    }

    const sse = createSseStream(res, getSseConfig())
    sse.writeComment('ok')

    const controller = new AbortController()
    req.on('aborted', () => controller.abort())
    res.on('close', () => {
      if (!res.writableEnded && !res.writableFinished) {
        controller.abort()
      }
    })

    const resolvedResponseFormat =
      responseFormat ?? (provider !== 'gemini' ? { type: 'json_object' } : undefined)
    const resolvedThinking =
      thinking ?? (provider === 'glm' || provider === 'modelscope' ? { type: 'disabled' } : undefined)

    const promptMessages = buildResearchPlanMessages(message)
    for await (const chunk of streamChat({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
      responseFormat: resolvedResponseFormat,
      thinking: resolvedThinking,
      temperature,
      top_k,
      top_p,
      frequency_penalty,
      presence_penalty,
      contextMessageLimit,
      signal: controller.signal,
    })) {
      sse.sendEvent(chunk)
    }

    sse.close()
  } catch (error) {
    console.error('[API] researchPlanStream error:', error)
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to stream research plan',
        message: error.message,
      })
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`)
      res.end()
    }
  }
})

export default router
