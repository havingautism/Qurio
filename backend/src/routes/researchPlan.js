/**
 * Research Plan generation route
 * POST /api/research-plan
 */

import express from 'express'
import {
  buildAcademicResearchPlanMessages,
  generateAcademicResearchPlan,
} from '../services/academicResearchPlanService.js'
import { buildResearchPlanMessages, generateResearchPlan } from '../services/researchPlanService.js'
import { streamChat } from '../services/streamChatService.js'
import { createSseStream, getSseConfig } from '../utils/sse.js'

const router = express.Router()

/**
 * POST /api/research-plan
 * Generate a structured deep research plan
 *
 * Request body:
 * {
 *   "provider": "gemini" | "openai" | "openai_compatibility" | "siliconflow" | "glm" | "modelscope" | "kimi",
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
    const { provider, message, apiKey, baseUrl, model, researchType = 'general' } = req.body

    if (!provider) {
      return res.status(400).json({ error: 'Missing required field: provider' })
    }
    if (!message) {
      return res.status(400).json({ error: 'Missing required field: message' })
    }
    if (!apiKey) {
      return res.status(400).json({ error: 'Missing required field: apiKey' })
    }

    const supportedProviders = [
      'gemini',
      'openai',
      'openai_compatibility',
      'siliconflow',
      'glm',
      'modelscope',
      'kimi',
      'nvidia',
    ]
    if (!supportedProviders.includes(provider)) {
      return res.status(400).json({
        error: `Unsupported provider: ${provider}. Supported: ${supportedProviders.join(', ')}`,
      })
    }

    console.log(`[API] generateResearchPlan: provider=${provider}, researchType=${researchType}`)

    // Use academic research plan service for academic research
    const planGenerator =
      researchType === 'academic' ? generateAcademicResearchPlan : generateResearchPlan

    console.log(
      `[API] Selected plan generator: ${researchType === 'academic' ? 'Academic' : 'General'}`,
    )

    const plan = await planGenerator(provider, message, apiKey, baseUrl, model)

    res.json({ plan })
  } catch (error) {
    console.error('[API] Research plan generation error:', error)
    res.status(500).json({
      error: 'Failed to generate research plan',
      message: error.message,
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
      researchType = 'general',
    } = req.body

    if (!provider || !message) {
      return res.status(400).json({ error: 'Missing required fields: provider, message' })
    }
    if (!apiKey) {
      return res.status(400).json({ error: 'Missing required field: apiKey' })
    }

    const supportedProviders = [
      'gemini',
      'openai',
      'openai_compatibility',
      'siliconflow',
      'glm',
      'modelscope',
      'kimi',
      'nvidia',
    ]
    if (!supportedProviders.includes(provider)) {
      return res.status(400).json({
        error: `Unsupported provider: ${provider}. Supported: ${supportedProviders.join(', ')}`,
      })
    }

    console.log(`[API] researchPlanStream: provider=${provider}, researchType=${researchType}`)

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
      thinking ??
      (provider === 'glm' || provider === 'modelscope' ? { type: 'disabled' } : undefined)

    // Select appropriate prompt builder based on research type
    // Import for buildAcademicResearchPlanMessages is needed if not already present
    // Since we can't easily add global imports here without potentially breaking things or duplicates,
    // we should rely on existing imports. Currently generateAcademicResearchPlan handles the whole flow non-streaming.
    // However, research-plan-stream uses streamChat service directly.
    // We need to conditionally use the academic prompt builder.

    // NOTE: We need to import buildAcademicResearchPlanMessages at the top of the file first.
    // For now, let's assume the import will be added in a separate step or we add it here if possible.
    // Actually, looking at the imports: import { generateAcademicResearchPlan } from '../services/academicResearchPlanService.js'
    // It doesn't export buildAcademicResearchPlanMessages. I need to update the import first.

    const isAcademic = researchType === 'academic'
    const promptBuilder = isAcademic ? buildAcademicResearchPlanMessages : buildResearchPlanMessages
    const promptMessages = promptBuilder(message)

    console.log(`[API] Streaming research plan with type: ${isAcademic ? 'Academic' : 'General'}`)
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
