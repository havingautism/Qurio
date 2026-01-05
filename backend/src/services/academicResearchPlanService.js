/**
 * Academic Research Plan generation service
 * Specialized version for academic/scholarly research with stricter methodological requirements
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOpenAI } from '@langchain/openai'
import {
  normalizeGeminiMessages,
  normalizeTextContent,
  safeJsonParse,
  toLangChainMessages,
} from './serviceUtils.js'

// Import base URLs and models from the main research plan service
const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1'
const SILICONFLOW_BASE = 'https://api.siliconflow.cn/v1'
const GLM_BASE = 'https://open.bigmodel.cn/api/paas/v4'
const MODELSCOPE_BASE = 'https://api-inference.modelscope.cn/v1'
const KIMI_BASE = 'https://api.moonshot.cn/v1'

const DEFAULT_MODELS = {
  gemini: 'gemini-2.0-flash-exp',
  openai: 'gpt-4o-mini',
  siliconflow: 'Qwen/Qwen2.5-7B-Instruct',
  glm: 'glm-4-flash',
  modelscope: 'AI-ModelScope/glm-4-9b-chat',
  kimi: 'moonshot-v1-8k',
}

// ============================================================================
// Model builders - Support all providers
// ============================================================================

const buildGeminiModel = ({ apiKey, model, temperature, top_k, top_p, streaming }) => {
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
  responseFormat,
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
  responseFormat,
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')

  const modelKwargs = {}
  if (responseFormat) modelKwargs.response_format = responseFormat
  modelKwargs.thinking = { type: 'disabled' }
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
  responseFormat,
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')

  const modelKwargs = {}
  if (responseFormat) modelKwargs.response_format = responseFormat
  modelKwargs.thinking = { type: 'disabled' }
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
  responseFormat,
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
  apiKey,
  baseUrl,
  model,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  responseFormat,
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')

  const resolvedBase = baseUrl || OPENAI_DEFAULT_BASE

  const modelKwargs = {}
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
// Academic Research Plan Prompt
// ============================================================================

export const buildAcademicResearchPlanMessages = userMessage => [
  {
    role: 'system',
    content: `You are an academic research planner. Produce a detailed, rigorous research plan in structured JSON for scholarly literature review and analysis.

## Input
User message contains:
- "question": academic research question or topic
- "scope": research scope (time period, geographic region, specific databases, etc.), or "Auto"
- "output": output format preference, or "Auto"

## Academic Research Question Types
Classify the question into one of these academic research types:

1. **literature_review** (4-6 steps)
   - Systematic review of existing scholarly literature on a topic
   - Steps: Define scope → Search literature → Screen sources → Extract data → Synthesize findings → Identify gaps
   
2. **methodology_analysis** (5-7 steps)
   - Critical analysis of research methods used in a field
   - Steps: Identify methods → Compare approaches → Evaluate strengths/limitations → Recommend best practices
   
3. **empirical_study_review** (6-8 steps)
   - Review of empirical research evidence
   - Steps: Define criteria → Search studies → Quality assessment → Data extraction → Meta-analysis → Interpret findings
   
4. **theoretical_framework** (4-6 steps)
   - Analysis of theoretical foundations and conceptual frameworks
   - Steps: Identify theories → Trace development → Compare frameworks → Synthesize → Propose applications
   
5. **state_of_the_art** (5-7 steps)
   - Survey of current research frontiers and recent developments
   - Steps: Define recent timeframe → Search latest publications → Categorize trends → Identify innovations → Project future directions

## Academic Planning Rules

1. **Mandatory Literature Search**
   - ALL academic research plans MUST include at least one literature search step
   - First step should typically be "Define scope and search strategy"
   - Set requires_search: true for literature gathering steps

2. **Evidence Quality Emphasis**
   - Steps must emphasize peer-reviewed sources
   - Include quality assessment criteria (study design, sample size, methodology)
   - Note the need to distinguish between primary research and reviews

3. **Critical Analysis Requirements**
   - Each step should involve critical evaluation, not just summarization
   - Include acceptance criteria for methodological rigor
   - Require noting limitations and conflicting findings

4. **Systematic Approach**
   - Steps must be sequential and build on previous findings
   - Include clear inclusion/exclusion criteria where relevant
   - Specify analysis methods (e.g., thematic analysis, meta-synthesis)

5. **Research Gap Identification**
   - Final steps should identify what is NOT known
   - Note areas needing further investigation
   - Suggest implications for future research

6. **Citation and Source Tracking**
   - All steps must emphasize proper citation
   - Require tracking of source types (journals, conferences, preprints)
   - Note publication years to assess currency of evidence

7. **Default Search Requirement**
   - Unless explicitly dealing with well-established theory, set requires_search to true
   - Academic research prioritizes evidence over assumptions

## Step Count Guidelines
- literature_review: 4-6 steps
- methodology_analysis: 5-7 steps
- empirical_study_review: 6-8 steps
- theoretical_framework: 4-6 steps
- state_of_the_art: 5-7 steps

## Deliverable Formats for Academic Research
paragraph, bullet_list, numbered_list, table, annotated_bibliography, comparative_analysis, thematic_synthesis

## Few-Shot Examples

### Example 1: Literature Review

Input:
{
  "question": "What are the effects of remote work on employee productivity?",
  "scope": "Peer-reviewed studies from 2015-2024",
  "output": "Auto"
}

Output:
{
  "research_type": "academic",
  "goal": "Conduct a systematic literature review on the relationship between remote work and employee productivity",
  "complexity": "medium",
  "question_type": "literature_review",
  "assumptions": [
    "Focus on quantitative and mixed-methods studies",
    "Include both fully remote and hybrid work arrangements",
    "Productivity measured through objective metrics or validated instruments"
  ],
  "plan": [
    {
      "step": 1,
      "thought": "Establish search strategy and inclusion criteria",
      "action": "Define search keywords, databases (Web of Science, Scopus, PubMed), and inclusion/exclusion criteria",
      "expected_output": "Documented search strategy with Boolean operators and eligibility criteria",
      "deliverable_format": "paragraph",
      "acceptance_criteria": [
        "Search terms cover remote work synonyms (telecommuting, work-from-home, distributed work)",
        "Inclusion criteria specify study designs, sample characteristics, and outcome measures",
        "Exclusion criteria clearly stated (e.g., opinion pieces, non-peer-reviewed)"
      ],
      "depth": "high",
      "requires_search": false
    },
    {
      "step": 2,
      "thought": "Systematically search and retrieve relevant literature",
      "action": "Execute search across academic databases and retrieve peer-reviewed studies on remote work and productivity",
      "expected_output": "List of potentially relevant studies with bibliographic information",
      "deliverable_format": "annotated_bibliography",
      "acceptance_criteria": [
        "Minimum 20-30 peer-reviewed articles identified",
        "Studies span the defined time period (2015-2024)",
        "Mix of quantitative, qualitative, and mixed-methods research"
      ],
      "depth": "high",
      "requires_search": true
    },
    {
      "step": 3,
      "thought": "Screen studies for quality and relevance",
      "action": "Apply inclusion/exclusion criteria and assess methodological quality",
      "expected_output": "Refined list of high-quality studies with quality ratings",
      "deliverable_format": "table",
      "acceptance_criteria": [
        "Each study rated on methodological rigor (sample size, controls, validity)",
        "Reasons for exclusion documented",
        "Final set includes diverse research designs"
      ],
      "depth": "high",
      "requires_search": false
    },
    {
      "step": 4,
      "thought": "Extract and organize key findings",
      "action": "Extract data on study characteristics, methods, and productivity outcomes",
      "expected_output": "Structured data extraction summarizing each study's findings",
      "deliverable_format": "comparative_analysis",
      "acceptance_criteria": [
        "Data includes sample size, work arrangement type, productivity measurement",
        "Findings categorized by outcome (positive, negative, no effect)",
        "Context variables noted (industry, job type, duration)"
      ],
      "depth": "high",
      "requires_search": false
    },
    {
      "step": 5,
      "thought": "Synthesize findings and identify patterns",
      "action": "Conduct thematic synthesis of productivity outcomes across studies",
      "expected_output": "Integrated analysis of themes, patterns, and moderating factors",
      "deliverable_format": "thematic_synthesis",
      "acceptance_criteria": [
        "Identifies consensus findings (e.g., task-dependent effects)",
        "Notes contradictory evidence and potential explanations",
        "Discusses moderators (autonomy, communication, managerial support)"
      ],
      "depth": "high",
      "requires_search": false
    },
    {
      "step": 6,
      "thought": "Identify research gaps and future directions",
      "action": "Assess what is NOT known and suggest areas for future research",
      "expected_output": "Critical evaluation of gaps in current evidence base",
      "deliverable_format": "bullet_list",
      "acceptance_criteria": [
        "Identifies methodological limitations across studies",
        "Notes underrepresented populations or contexts",
        "Suggests specific research questions for future investigation"
      ],
      "depth": "medium",
      "requires_search": false
    }
  ],
  "risks": [
    "Publication bias toward positive or negative findings",
    "Heterogeneity in productivity measurement across studies",
    "Rapid evolution of remote work practices may limit generalizability"
  ],
  "success_criteria": [
    "Comprehensive coverage of peer-reviewed evidence",
    "Critical analysis of methodological quality",
    "Clear identification of what is and is NOT known",
    "Actionable implications for practice and research"
  ]
}

### Example 2: State-of-the-Art Review

Input:
{
  "question": "What are the latest developments in transformer architectures for natural language processing?",
  "scope": "Publications from 2022-2024",
  "output": "Auto"
}

Output:
{
  "research_type": "academic",
  "goal": "Survey cutting-edge transformer architecture innovations in NLP (2022-2024)",
  "complexity": "complex",
  "question_type": "state_of_the_art",
  "assumptions": [
    "Focus on major conferences (NeurIPS, ICML, ACL, EMNLP) and top-tier journals",
    "Include both theoretical advances and empirical validations",
    "Emphasize architectures with demonstrated improvements over baselines"
  ],
  "plan": [
    {
      "step": 1,
      "thought": "Define recency criteria and search sources",
      "action": "Specify timeframe (2022-2024), target venues, and architecture types",
      "expected_output": "Search scope defining recent publication venues and architecture categories",
      "deliverable_format": "paragraph",
      "acceptance_criteria": [
        "Includes major ML/NLP conferences and journals",
        "Covers encoder, decoder, and encoder-decoder variants",
        "Considers efficiency innovations (sparse attention, linear transformers)"
      ],
      "depth": "medium",
      "requires_search": false
    },
    {
      "step": 2,
      "thought": "Search for latest transformer architecture papers",
      "action": "Retrieve recent publications on transformer innovations from academic databases and arXiv",
      "expected_output": "List of cutting-edge papers on transformer architectures",
      "deliverable_format": "annotated_bibliography",
      "acceptance_criteria": [
        "Minimum 15-20 recent papers (2022-2024)",
        "Mix of preprints and peer-reviewed publications",
        "Coverage of diverse innovation directions (efficiency, scale, multimodality)"
      ],
      "depth": "high",
      "requires_search": true
    },
    {
      "step": 3,
      "thought": "Categorize innovations by type",
      "action": "Group architectures by innovation focus (attention mechanisms, positional encodings, scaling, etc.)",
      "expected_output": "Taxonomy of recent transformer innovations",
      "deliverable_format": "table",
      "acceptance_criteria": [
        "Clear categories (e.g., Efficient Attention, Long Context, Multimodal)",
        "Each category has 3-5 representative examples",
        "Brief description of key innovation per example"
      ],
      "depth": "high",
      "requires_search": false
    },
    {
      "step": 4,
      "thought": "Analyze performance improvements and tradeoffs",
      "action": "Compare benchmark results, computational costs, and practical applicability",
      "expected_output": "Critical analysis of performance gains versus resource requirements",
      "deliverable_format": "comparative_analysis",
      "acceptance_criteria": [
        "Quantitative comparisons where available (accuracy, speed, memory)",
        "Discussion of tradeoffs (performance vs. efficiency)",
        "Notes on reproducibility and adoption in practice"
      ],
      "depth": "high",
      "requires_search": true
    },
    {
      "step": 5,
      "thought": "Identify emerging trends and future directions",
      "action": "Synthesize patterns across innovations and project future research trajectories",
      "expected_output": "Analysis of dominant trends and predicted future developments",
      "deliverable_format": "thematic_synthesis",
      "acceptance_criteria": [
        "Identifies 3-5 major trends (e.g., towards efficiency, multimodality)",
        "Notes convergence or divergence in research directions",
        "Speculates on next-generation architectures based on current trajectory"
      ],
      "depth": "high",
      "requires_search": false
    }
  ],
  "risks": [
    "Rapid pace of innovation may make review outdated quickly",
    "Preprint quality varies; rely on peer-reviewed sources when possible",
    "Benchmark gaming may inflate reported performance gains"
  ],
  "success_criteria": [
    "Comprehensive coverage of recent major innovations",
    "Critical evaluation of claims and empirical evidence",
    "Clear articulation of state-of-the-art and open challenges",
    "Forward-looking analysis of research directions"
  ]
}

## Output Schema
Return ONLY valid JSON, no markdown, no commentary:
{
  "research_type": "academic",
  "goal": "string - formal academic research objective",
  "complexity": "simple|medium|complex",
  "question_type": "literature_review|methodology_analysis|empirical_study_review|theoretical_framework|state_of_the_art",
  "assumptions": ["string - research scope assumptions, exclusions, focus areas"],
  "plan": [
    {
      "step": 1,
      "thought": "research rationale for this step",
      "action": "specific, executable academic research action",
      "expected_output": "scholarly deliverable with format and rigor specified",
      "deliverable_format": "paragraph|bullet_list|table|annotated_bibliography|comparative_analysis|thematic_synthesis",
      "acceptance_criteria": ["methodological requirement", "quality threshold", "coverage expectation"],
      "depth": "low|medium|high",
      "requires_search": true|false
    }
  ],
  "risks": ["potential methodological issues", "evidence limitations", "generalizability concerns"],
  "success_criteria": ["scholarly standard for completion", "quality benchmark"]
}`,
  },
  { role: 'user', content: userMessage },
]

// ============================================================================
// Request functions - Support all providers
// ============================================================================

const requestGemini = async ({ apiKey, model, messages, temperature, top_k, top_p, signal }) => {
  const modelInstance = buildGeminiModel({
    apiKey,
    model,
    temperature,
    top_k,
    top_p,
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
  responseFormat,
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
    responseFormat,
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
  responseFormat,
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
    responseFormat,
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
  responseFormat,
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
    responseFormat,
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
  responseFormat,
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
    responseFormat,
    streaming: false,
  })

  const langchainMessages = toLangChainMessages(messages || [])
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

const requestOpenAI = async ({
  apiKey,
  baseUrl,
  model,
  messages,
  temperature,
  top_k,
  top_p,
  frequency_penalty,
  presence_penalty,
  responseFormat,
  signal,
}) => {
  const modelInstance = buildOpenAIModel({
    apiKey,
    baseUrl,
    model,
    temperature,
    top_k,
    top_p,
    frequency_penalty,
    presence_penalty,
    responseFormat,
    streaming: false,
  })

  const langchainMessages = toLangChainMessages(messages || [])
  const response = await modelInstance.invoke(langchainMessages, { signal })

  return typeof response.content === 'string'
    ? response.content
    : normalizeTextContent(response.content)
}

/**
 * Generate an academic research plan using a lightweight model
 * Supports all providers: gemini, siliconflow, glm, modelscope, kimi, openai_compatibility
 */
export const generateAcademicResearchPlan = async (
  provider,
  userMessage,
  apiKey,
  baseUrl,
  model,
) => {
  console.log('[AcademicPlanService] Generating academic research plan...')
  const promptMessages = buildAcademicResearchPlanMessages(userMessage)
  const responseFormat = provider !== 'gemini' ? { type: 'json_object' } : undefined

  let content = undefined

  if (provider === 'gemini') {
    content = await requestGemini({ apiKey, model, messages: promptMessages })
  } else if (provider === 'siliconflow') {
    content = await requestSiliconFlow({ apiKey, model, messages: promptMessages, responseFormat })
  } else if (provider === 'glm') {
    content = await requestGLM({ apiKey, model, messages: promptMessages, responseFormat })
  } else if (provider === 'modelscope') {
    content = await requestModelScope({ apiKey, model, messages: promptMessages, responseFormat })
  } else if (provider === 'kimi') {
    content = await requestKimi({ apiKey, model, messages: promptMessages, responseFormat })
  } else {
    // openai_compatibility or default
    content = await requestOpenAI({
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
