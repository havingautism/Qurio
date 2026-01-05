/**
 * Backend Provider Module
 * Uses Express backend for all provider operations.
 */

import {
  generateAgentForAutoViaBackend,
  generateDailyTipViaBackend,
  generateRelatedQuestionsViaBackend,
  generateResearchPlanViaBackend,
  generateTitleAndSpaceViaBackend,
  generateTitleSpaceAndAgentViaBackend,
  generateTitleViaBackend,
  streamChatViaBackend,
  streamDeepResearchViaBackend,
  streamResearchPlanViaBackend,
} from './backendClient.js'

const generateTitle = async (provider, firstMessage, apiKey, baseUrl, model) => {
  const result = await generateTitleViaBackend(provider, firstMessage, apiKey, baseUrl, model)
  return {
    title: result?.title || 'New Conversation',
    emojis: Array.isArray(result?.emojis) ? result.emojis : [],
  }
}

const generateResearchPlan = async (
  provider,
  userMessage,
  apiKey,
  baseUrl,
  model,
  researchType = 'general',
) => {
  const result = await generateResearchPlanViaBackend(
    provider,
    userMessage,
    apiKey,
    baseUrl,
    model,
    researchType,
  )
  return result?.plan || ''
}

const streamResearchPlan = async (
  provider,
  userMessage,
  apiKey,
  baseUrl,
  model,
  { onChunk, onFinish, onError, signal, researchType } = {},
) => {
  let fullContent = ''

  await streamResearchPlanViaBackend({
    provider,
    message: userMessage,
    apiKey,
    baseUrl,
    model,
    researchType, // Pass researchType
    onChunk: chunk => {
      const text = typeof chunk === 'string' ? chunk : chunk?.type === 'text' ? chunk.content : ''
      if (!text) return
      fullContent += text
      onChunk?.(text, fullContent)
    },
    onFinish: result => {
      if (result?.content) fullContent = result.content
      onFinish?.(fullContent)
    },
    onError,
    signal,
  })

  return fullContent
}

const generateDailyTip = async (provider, language, category, apiKey, baseUrl, model) => {
  const result = await generateDailyTipViaBackend(
    provider,
    language,
    category,
    apiKey,
    baseUrl,
    model,
  )
  return result?.tip || ''
}

const generateTitleAndSpace = async (provider, firstMessage, spaces, apiKey, baseUrl, model) => {
  const result = await generateTitleAndSpaceViaBackend(
    provider,
    firstMessage,
    spaces,
    apiKey,
    baseUrl,
    model,
  )
  const title = result?.title || 'New Conversation'
  const space = result?.space !== undefined ? result.space : null
  return {
    title,
    space,
    emojis: Array.isArray(result?.emojis) ? result.emojis : [],
  }
}

const generateTitleSpaceAndAgent = async (
  provider,
  firstMessage,
  spacesWithAgents,
  apiKey,
  baseUrl,
  model,
) => {
  const result = await generateTitleSpaceAndAgentViaBackend(
    provider,
    firstMessage,
    spacesWithAgents,
    apiKey,
    baseUrl,
    model,
  )
  return {
    title: result?.title || 'New Conversation',
    spaceLabel: result?.spaceLabel || null,
    agentName: result?.agentName || null,
    emojis: Array.isArray(result?.emojis) ? result.emojis : [],
  }
}

const generateAgentForAuto = async (
  provider,
  userMessage,
  currentSpace,
  apiKey,
  baseUrl,
  model,
) => {
  const result = await generateAgentForAutoViaBackend(
    provider,
    userMessage,
    currentSpace,
    apiKey,
    baseUrl,
    model,
  )
  return {
    agentName: result?.agentName !== undefined ? result.agentName : null,
  }
}

const generateRelatedQuestions = async (provider, messages, apiKey, baseUrl, model) => {
  const result = await generateRelatedQuestionsViaBackend(
    provider,
    messages,
    apiKey,
    baseUrl,
    model,
  )
  return result?.questions || []
}

export const createBackendProvider = provider => ({
  streamChatCompletion: params => streamChatViaBackend({ provider, ...params }),
  streamDeepResearch: params => streamDeepResearchViaBackend({ provider, ...params }),
  generateTitle: (firstMessage, apiKey, baseUrl, model) =>
    generateTitle(provider, firstMessage, apiKey, baseUrl, model),
  generateResearchPlan: (userMessage, apiKey, baseUrl, model, researchType) =>
    generateResearchPlan(provider, userMessage, apiKey, baseUrl, model, researchType),
  streamResearchPlan: (userMessage, apiKey, baseUrl, model, callbacks) =>
    streamResearchPlan(provider, userMessage, apiKey, baseUrl, model, callbacks),
  generateDailyTip: (language, category, apiKey, baseUrl, model) =>
    generateDailyTip(provider, language, category, apiKey, baseUrl, model),
  generateTitleAndSpace: (firstMessage, spaces, apiKey, baseUrl, model) =>
    generateTitleAndSpace(provider, firstMessage, spaces, apiKey, baseUrl, model),
  generateTitleSpaceAndAgent: (firstMessage, spacesWithAgents, apiKey, baseUrl, model) =>
    generateTitleSpaceAndAgent(provider, firstMessage, spacesWithAgents, apiKey, baseUrl, model),
  generateAgentForAuto: (userMessage, currentSpace, apiKey, baseUrl, model) =>
    generateAgentForAuto(provider, userMessage, currentSpace, apiKey, baseUrl, model),
  generateRelatedQuestions: (messages, apiKey, baseUrl, model) =>
    generateRelatedQuestions(provider, messages, apiKey, baseUrl, model),
})
