/**
 * Research Plan generation service
 */

import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import {
  normalizeGeminiMessages,
  normalizeTextContent,
  safeJsonParse,
  toLangChainMessages,
} from './serviceUtils.js'

// Default base URLs
const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1'
const SILICONFLOW_BASE = 'https://api.siliconflow.cn/v1'
const GLM_BASE = 'https://open.bigmodel.cn/api/paas/v4'
const MODELSCOPE_BASE = 'https://api-inference.modelscope.cn/v1'
const KIMI_BASE = 'https://api.moonshot.cn/v1'

// Default models
const DEFAULT_MODELS = {
  gemini: 'gemini-2.0-flash-exp',
  openai: 'gpt-4o-mini',
  siliconflow: 'Qwen/Qwen2.5-7B-Instruct',
  glm: 'glm-4-flash',
  modelscope: 'AI-ModelScope/glm-4-9b-chat',
  kimi: 'moonshot-v1-8k',
}

 

// ============================================================================
// Model builders
// ============================================================================

const buildGeminiModel = ({
  apiKey,
  model,
  temperature,
  top_k,
  top_p,
  tools,
  thinking,
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')

  return new ChatGoogleGenerativeAI({
    apiKey,
    model: model || DEFAULT_MODELS.gemini,
    temperature,
    topK: top_k,
    ...(top_p !== undefined ? { topP: top_p } : {}),
    streaming,
  })
}

const buildSiliconFlowModel = ({
  apiKey,
  model,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')

  const modelKwargs = {}
  modelKwargs.response_format = responseFormat || { type: 'text' }
  if (top_k !== undefined) modelKwargs.top_k = top_k
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS.siliconflow,
    temperature,
    streaming,
    modelKwargs,
    configuration: { baseURL: SILICONFLOW_BASE },
  })
}

const buildGLMModel = ({
  apiKey,
  model,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')

  const modelKwargs = {}
  if (responseFormat) modelKwargs.response_format = responseFormat
  modelKwargs.thinking = { type: thinking?.type || 'disabled' }
  if (top_k !== undefined) modelKwargs.top_k = top_k
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS.glm,
    temperature,
    streaming,
    modelKwargs,
    configuration: { baseURL: GLM_BASE },
  })
}

const buildModelScopeModel = ({
  apiKey,
  model,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')

  const modelKwargs = {}
  if (responseFormat) modelKwargs.response_format = responseFormat
  modelKwargs.thinking = { type: thinking?.type || 'disabled' }
  if (top_k !== undefined) modelKwargs.top_k = top_k
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS.modelscope,
    temperature,
    streaming,
    modelKwargs,
    configuration: { baseURL: MODELSCOPE_BASE },
  })
}

const buildKimiModel = ({
  apiKey,
  model,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')

  const modelKwargs = {}
  if (responseFormat) modelKwargs.response_format = responseFormat
  if (top_k !== undefined) modelKwargs.top_k = top_k
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS.kimi,
    temperature,
    streaming,
    modelKwargs,
    configuration: { baseURL: KIMI_BASE },
  })
}

const buildOpenAIModel = ({
  provider,
  apiKey,
  baseUrl,
  model,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')

  const resolvedBase = baseUrl || OPENAI_DEFAULT_BASE

  const modelKwargs = {}
  if (tools && tools.length > 0) modelKwargs.tools = tools
  if (toolChoice) modelKwargs.tool_choice = toolChoice
  if (responseFormat) modelKwargs.response_format = responseFormat
  if (top_k !== undefined) modelKwargs.top_k = top_k
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS.openai,
    temperature,
    streaming,
    modelKwargs,
    configuration: { baseURL: resolvedBase },
  })
}

// ============================================================================
// Request functions
// ============================================================================

const requestGemini = async ({ apiKey, model, messages, temperature, top_k, top_p, signal }) => {
  const modelInstance = buildGeminiModel({
    apiKey,
    model,
    temperature,
    top_k,
    top_p,
    tools: [],
    thinking: false,
    streaming: false,
  })

  const orderedMessages = normalizeGeminiMessages(messages || [])
  const langchainMessages = toLangChainMessages(orderedMessages)
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

const requestSiliconFlow = async ({
  apiKey,
  model,
  messages,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  signal,
}) => {
  const modelInstance = buildSiliconFlowModel({
    apiKey,
    model,
    temperature,
    top_k,
    top_p,
    frequency_penalty,
    presence_penalty,
    tools: [],
    toolChoice,
    responseFormat,
    thinking,
    streaming: false,
  })

  const langchainMessages = toLangChainMessages(messages || [])
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

const requestGLM = async ({
  apiKey,
  model,
  messages,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  signal,
}) => {
  const modelInstance = buildGLMModel({
    apiKey,
    model,
    temperature,
    top_k,
    top_p,
    frequency_penalty,
    presence_penalty,
    tools: [],
    toolChoice,
    responseFormat,
    thinking: {
      type: 'disabled',
    },
    streaming: false,
  })

  const langchainMessages = toLangChainMessages(messages || [])
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

const requestModelScope = async ({
  apiKey,
  model,
  messages,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  signal,
}) => {
  const modelInstance = buildModelScopeModel({
    apiKey,
    model,
    temperature,
    top_k,
    top_p,
    frequency_penalty,
    presence_penalty,
    tools: [],
    toolChoice,
    responseFormat,
    thinking: {
      type: 'disabled',
    },
    streaming: false,
  })

  const langchainMessages = toLangChainMessages(messages || [])
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

const requestKimi = async ({
  apiKey,
  model,
  messages,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  signal,
}) => {
  const modelInstance = buildKimiModel({
    apiKey,
    model,
    temperature,
    top_k,
    top_p,
    frequency_penalty,
    presence_penalty,
    tools: [],
    toolChoice,
    responseFormat,
    thinking: undefined,
    streaming: false,
  })

  const langchainMessages = toLangChainMessages(messages || [])
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

const requestOpenAICompat = async ({
  provider,
  apiKey,
  baseUrl,
  model,
  messages,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  tools,
  toolChoice,
  responseFormat,
  thinking,
  signal,
}) => {
  const modelInstance = buildOpenAIModel({
    provider,
    apiKey,
    baseUrl,
    model,
    temperature,
    top_k,
    top_p,
    frequency_penalty,
    presence_penalty,
    tools: [],
    toolChoice,
    responseFormat,
    thinking,
    streaming: false,
  })

  const langchainMessages = toLangChainMessages(messages || [])
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

export const buildResearchPlanMessages = userMessage => [
  {
    role: 'system',
    content: `You are a task planner. Produce a detailed, execution-ready research plan in structured JSON.

## Input
User message contains:
- "question": research question
- "scope": research scope, or "Auto"
- "output": output format preference, or "Auto"

## Planning Rules
1. Detect question type:
   - Definition: 2-3 steps, define → characteristics → applications
   - Comparison: 3-4 steps, differences → scenarios → trade-offs → decision
   - How-it-works: 4-5 steps, overview → deep dive → examples → edge cases
   - How-to: 4-6 steps, prerequisites → process → alternatives → pitfalls
   - Analysis: 5-7 steps, context → factors → evidence → implications → recommendations
   - History: 3-5 steps, timeline → milestones → causes → effects
2. Hybrid questions: assign 70-80% steps to primary type, 20-30% to secondary
3. Step count must match complexity:
   - simple: 2-3 steps
   - medium: 4-5 steps (default)
   - complex: 6-8 steps
4. If scope/output is "Auto", choose formats:
   - Definition: paragraph
   - Comparison: table + bullet_list
   - How-it-works: paragraph + code_example
   - How-to: numbered_list + checklist
   - Analysis: mix formats
   - History: paragraph or timeline
5. Depth:
   - low: 1-2 paragraphs (~100-200 words)
   - medium: 3-4 paragraphs (~300-500 words)
   - high: 5+ paragraphs (~600+ words)
6. Step 1 must list assumptions if needed; all steps use these assumptions
7. Steps must be sequential, each with a clear, unique purpose, and executable using previous outputs
8. For each step, determine if search is needed:
   - Add "requires_search": true if the step needs up-to-date data, benchmarks, or external verification
   - Add "requires_search": false if the step relies on stable knowledge, definitions, or established concepts
   - Examples:
     * "Define HTTP" → requires_search: false (stable concept)
     * "Compare latest AI framework benchmarks" → requires_search: true (current data needed)
     * "Explain React component lifecycle" → requires_search: false (stable knowledge)
     * "List current React job market trends" → requires_search: true (time-sensitive)

## Deliverable Formats
paragraph, bullet_list, numbered_list, table, checklist, code_example, pros_and_cons

## Few-Shot Examples

### Example 1: Definition Question
Input:
{
  "question": "What is React?",
  "scope": "Auto",
  "output": "Auto"
}

Output:
{
  "goal": "Explain React's core concepts, features, and typical applications",
  "complexity": "simple",
  "question_type": "definition",
  "assumptions": ["Reader has basic JavaScript knowledge", "Focus on React design philosophy, not API details"],
  "plan": [
    {
      "step": 1,
      "thought": "Establish a foundational understanding of React",
      "action": "Define React and its role in front-end development",
      "expected_output": "A paragraph clearly defining React and its core characteristics",
      "deliverable_format": "paragraph",
      "acceptance_criteria": ["Must mention component-based architecture", "Must mention virtual DOM"],
      "depth": "medium",
      "requires_search": false
    },
    {
      "step": 2,
      "thought": "Explain core mechanisms for comprehension",
      "action": "Describe components, props, state, and their interactions",
      "expected_output": "Paragraphs explaining each concept and their relationships",
      "deliverable_format": "paragraph",
      "acceptance_criteria": ["Each concept has examples", "Relationships are clearly explained"],
      "depth": "high",
      "requires_search": false
    },
    {
      "step": 3,
      "thought": "Show practical applications",
      "action": "List typical use cases and advantages",
      "expected_output": "5-7 bullet points of React use cases with brief explanation",
      "deliverable_format": "bullet_list",
      "acceptance_criteria": ["At least 5 scenarios", "Each scenario explains why React is suitable"],
      "depth": "low",
      "requires_search": false
    }
  ],
  "risks": ["Confusing React with React Native", "Technical details may be too deep"],
  "success_criteria": ["Reader can explain what React is and when to use it"]
}

### Example 2: Comparison Question
Input:
{
  "question": "Compare PostgreSQL and MongoDB",
  "scope": "Auto",
  "output": "Auto"
}

Output:
{
  "goal": "Compare PostgreSQL and MongoDB's design, use cases, and performance",
  "complexity": "medium",
  "question_type": "comparison",
  "assumptions": ["Focus on practical use, not internal implementation", "Reader knows basic database concepts"],
  "plan": [
    {
      "step": 1,
      "thought": "Clarify fundamental differences",
      "action": "Compare relational vs document database design philosophies",
      "expected_output": "A table highlighting key differences in data model, query language, transaction support",
      "deliverable_format": "table",
      "acceptance_criteria": ["At least 5 comparison dimensions", "Each difference explained"],
      "depth": "medium",
      "requires_search": false
    },
    {
      "step": 2,
      "thought": "Analyze typical usage scenarios",
      "action": "List PostgreSQL and MongoDB common applications",
      "expected_output": "Two bullet lists with at least 4 specific scenarios each",
      "deliverable_format": "bullet_list",
      "acceptance_criteria": ["Scenarios are concrete (e.g., 'e-commerce order system')"],
      "depth": "medium",
      "requires_search": false
    },
    {
      "step": 3,
      "thought": "Consider performance and scalability",
      "action": "Compare read/write, horizontal scaling, consistency aspects",
      "expected_output": "Paragraph describing performance differences with typical metrics",
      "deliverable_format": "paragraph",
      "acceptance_criteria": ["Include concrete numbers or scale", "Explain factors affecting performance"],
      "depth": "high",
      "requires_search": true
    },
    {
      "step": 4,
      "thought": "Support decision-making",
      "action": "Provide decision framework and common pitfalls",
      "expected_output": "Checklist with framework steps and 3-5 common mistakes",
      "deliverable_format": "checklist",
      "acceptance_criteria": ["Framework is actionable", "Mistakes are specific"],
      "depth": "medium",
      "requires_search": false
    }
  ],
  "risks": ["Over-simplifying comparison", "Technical details may be outdated"],
  "success_criteria": ["Reader can make informed database choice based on scenarios"]
}

## Output Schema
Return ONLY valid JSON, no markdown, no commentary:
{
  "goal": "string",
  "complexity": "simple|medium|complex",
  "question_type": "definition|comparison|how_it_works|how_to|analysis|history",
  "assumptions": ["string"],
  "plan": [
    {
      "step": 1,
      "thought": "short reasoning explaining purpose of this step",
      "action": "specific, executable action",
      "expected_output": "what this step produces, with format and detail",
      "deliverable_format": "paragraph|bullet_list|numbered_list|table|checklist|code_example|pros_and_cons",
      "acceptance_criteria": ["must include X", "must cover Y"],
      "depth": "low|medium|high",
      "requires_search": true|false
    }
  ],
  "risks": ["potential issues to avoid"],
  "success_criteria": ["how to tell if research succeeded"]
  }`,
  },
  { role: 'user', content: userMessage },
]

/**
 * Generate a structured deep research plan using a lightweight model
 */
export const generateResearchPlan = async (provider, userMessage, apiKey, baseUrl, model) => {
  const promptMessages = buildResearchPlanMessages(userMessage)

  const responseFormat = provider !== 'gemini' ? { type: 'json_object' } : undefined
  let content = undefined
  if (provider === 'gemini') {
    content = await requestGemini({ apiKey, model, messages: promptMessages })
  } else if (provider === 'siliconflow') {
    content = await requestSiliconFlow({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else if (provider === 'glm') {
    content = await requestGLM({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else if (provider === 'modelscope') {
    content = await requestModelScope({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else if (provider === 'kimi') {
    content = await requestKimi({
      apiKey,
      model,
      messages: promptMessages,
      responseFormat,
    })
  } else {
    content = await requestOpenAICompat({
      provider,
      apiKey,
      baseUrl,
      model,
      messages: promptMessages,
      responseFormat,
    })
  }

  const parsed = safeJsonParse(content)
  if (parsed) {
    try {
      return JSON.stringify(parsed, null, 2)
    } catch {
      return content?.trim?.() || ''
    }
  }
  return content?.trim?.() || ''
}
