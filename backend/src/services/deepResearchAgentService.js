/**
 * Deep research agent service (planner/executor)
 * Orchestrates tool-calling across a structured research plan and streams the final report.
 */

import { ChatOpenAI } from '@langchain/openai'
import { generateAcademicResearchPlan } from './academicResearchPlanService.js'
import { generateResearchPlan } from './researchPlanService.js'
import { normalizeTextContent, safeJsonParse, toLangChainMessages } from './serviceUtils.js'
import { executeToolByName, getToolDefinitionsByIds, isLocalToolName } from './toolsService.js'

const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1'
const SILICONFLOW_BASE = 'https://api.siliconflow.cn/v1'
const GLM_BASE = 'https://open.bigmodel.cn/api/paas/v4'
const MODELSCOPE_BASE = 'https://api-inference.modelscope.cn/v1'
const KIMI_BASE = 'https://api.moonshot.cn/v1'

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  siliconflow: 'Qwen/Qwen2.5-7B-Instruct',
  glm: 'glm-4-flash',
  modelscope: 'AI-ModelScope/glm-4-9b-chat',
  kimi: 'moonshot-v1-8k',
}

const resolveBaseUrl = (provider, baseUrl) => {
  if (provider === 'siliconflow') return SILICONFLOW_BASE
  if (provider === 'glm') return GLM_BASE
  if (provider === 'modelscope') return MODELSCOPE_BASE
  if (provider === 'kimi') return KIMI_BASE
  return baseUrl || OPENAI_DEFAULT_BASE
}

const buildModel = ({
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
  streaming,
}) => {
  if (!apiKey) throw new Error('Missing API key')
  const modelKwargs = {}
  if (responseFormat) modelKwargs.response_format = responseFormat
  if (top_k !== undefined) modelKwargs.top_k = top_k
  if (top_p !== undefined) modelKwargs.top_p = top_p
  if (frequency_penalty !== undefined) modelKwargs.frequency_penalty = frequency_penalty
  if (presence_penalty !== undefined) modelKwargs.presence_penalty = presence_penalty
  if (tools && tools.length > 0) modelKwargs.tools = tools
  if (toolChoice) modelKwargs.tool_choice = toolChoice
  if (streaming) {
    modelKwargs.stream_options = { include_usage: false }
  }

  return new ChatOpenAI({
    apiKey,
    modelName: model || DEFAULT_MODELS[provider] || DEFAULT_MODELS.openai,
    temperature,
    streaming,
    __includeRawResponse: true,
    modelKwargs,
    configuration: { baseURL: resolveBaseUrl(provider, baseUrl) },
  })
}

const getToolCallName = toolCall =>
  toolCall?.function?.name ||
  toolCall?.name ||
  toolCall?.tool?.name ||
  toolCall?.tool?.function?.name ||
  null

const getToolCallArguments = toolCall =>
  toolCall?.function?.arguments ||
  toolCall?.arguments ||
  toolCall?.args ||
  toolCall?.tool?.function?.arguments ||
  toolCall?.tool?.arguments ||
  toolCall?.tool?.args ||
  null

const formatToolArgumentsFromValue = value => {
  if (!value) return ''
  if (typeof value === 'string') {
    const parsed = safeJsonParse(value)
    return parsed ? JSON.stringify(parsed) : value
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const getToolCallsFromResponse = response => {
  const raw = response?.additional_kwargs?.__raw_response
  const choice = raw?.choices?.[0]
  const message = choice?.message
  return (
    message?.tool_calls || response?.additional_kwargs?.tool_calls || response?.tool_calls || null
  )
}

const getFinishReasonFromResponse = response => {
  const raw = response?.additional_kwargs?.__raw_response
  return raw?.choices?.[0]?.finish_reason || null
}

const getResponseContent = response => {
  const raw = response?.additional_kwargs?.__raw_response
  const message = raw?.choices?.[0]?.message
  return message?.content ?? response?.content
}

const buildToolCallEvent = (toolCall, argsOverride, meta = {}) => ({
  type: 'tool_call',
  id: toolCall?.id || null,
  name: getToolCallName(toolCall),
  arguments:
    typeof argsOverride !== 'undefined'
      ? formatToolArgumentsFromValue(argsOverride)
      : formatToolArgumentsFromValue(getToolCallArguments(toolCall)),
  ...(typeof meta.step === 'number' ? { step: meta.step } : {}),
  ...(typeof meta.total === 'number' ? { total: meta.total } : {}),
})

const buildToolResultEvent = (toolCall, error, durationMs, output, meta = {}) => ({
  type: 'tool_result',
  id: toolCall?.id || null,
  name: getToolCallName(toolCall),
  status: error ? 'error' : 'done',
  duration_ms: typeof durationMs === 'number' ? durationMs : undefined,
  output: typeof output !== 'undefined' ? output : undefined,
  error: error ? String(error.message || error) : undefined,
  ...(typeof meta.step === 'number' ? { step: meta.step } : {}),
  ...(typeof meta.total === 'number' ? { total: meta.total } : {}),
})

const buildResearchStepEvent = ({ stepIndex, totalSteps, title, status, durationMs, error }) => ({
  type: 'research_step',
  step: stepIndex + 1,
  total: totalSteps,
  title,
  status,
  duration_ms: typeof durationMs === 'number' ? durationMs : undefined,
  error: error ? String(error.message || error) : undefined,
})

const collectWebSearchSources = (result, sourcesMap) => {
  if (!result?.results || !Array.isArray(result.results)) return
  result.results.forEach(item => {
    const url = item.url
    if (url && !sourcesMap.has(url)) {
      sourcesMap.set(url, {
        title: item.title || 'Unknown Source',
        url,
        uri: url,
        snippet: item.content?.slice(0, 200) || '',
      })
    }
  })
}

const buildStepPrompt = ({
  planMeta,
  step,
  stepIndex,
  priorFindings,
  sourcesList,
  researchType = 'general',
}) => {
  const assumptions = Array.isArray(planMeta.assumptions) ? planMeta.assumptions : []
  const acceptance = Array.isArray(step.acceptance_criteria) ? step.acceptance_criteria : []
  const isAcademic = researchType === 'academic'

  // Base information that appears in both prompts
  const baseInfo = `Goal: ${planMeta.goal || 'N/A'}
Question type: ${planMeta.question_type || 'N/A'}
Step ${stepIndex + 1}: ${step.action || ''}
Expected output: ${step.expected_output || 'N/A'}
Deliverable format: ${step.deliverable_format || 'paragraph'}
Depth: ${step.depth || 'medium'}
Requires search: ${step.requires_search ? 'true' : 'false'}

Assumptions:
${assumptions.length ? assumptions.map(item => `- ${item}`).join('\n') : '- None'}

Acceptance criteria:
${acceptance.length ? acceptance.map(item => `- ${item}`).join('\n') : '- None'}

Prior findings:
${priorFindings.length ? priorFindings.map(item => `- ${item}`).join('\n') : '- None'}

Known sources (cite as [index]):
${sourcesList.length ? sourcesList.join('\n') : '- None'}`

  if (isAcademic) {
    return `You are executing an academic research plan step.

${baseInfo}

CRITICAL ACADEMIC REQUIREMENTS:

1. SOURCE QUALITY
   - Prioritize peer-reviewed journal articles and conference proceedings
   - For each source, note: publication venue, year, and whether it's peer-reviewed
   - Distinguish between primary research, reviews, and meta-analyses
   - Flag preprints or non-peer-reviewed sources explicitly

2. EVIDENCE AND CITATION
   - Cite ALL factual claims using [index] format
   - Never make unsourced claims about research findings or statistics
   - When multiple sources agree/disagree, cite all relevant ones
   - Note the strength of evidence (e.g., "based on large-scale RCT" vs "preliminary findings")

3. CRITICAL EVALUATION
   - Assess methodological rigor of cited studies
   - Note sample sizes, study designs, and potential limitations
   - Identify potential biases or confounding factors
   - Highlight any conflicting findings across studies

4. SCHOLARLY LANGUAGE
   - Use formal academic tone (third person, precise terminology)
   - Employ appropriate hedging language ("suggests", "indicates", "implies")
   - Avoid overgeneralizations or absolute claims
   - Define technical terms when first introduced

5. SYSTEMATIC APPROACH
   - Follow the step's acceptance criteria rigorously
   - If this is a search step, use broad, well-defined search terms
   - If this is an analysis step, organize findings thematically
   - Build logically on prior findings

Instructions:
- Use academic_search or web_search tools as needed to gather peer-reviewed evidence
- When citing sources, use [1], [2], etc. based on the known sources list
- Return a scholarly, well-structured output suitable for inclusion in an academic report
- Maintain objectivity and acknowledge uncertainty where appropriate`
  }

  // General research prompt (original)
  return `You are executing a structured research plan step.

${baseInfo}

Instructions:
- Use the available tools when needed to gather evidence.
- When citing sources, use [1], [2], etc. based on the known sources list.
- Return a concise step output that can be used by subsequent steps.`
}

const buildFinalReportPrompt = ({
  planMeta,
  question,
  findings,
  sourcesList,
  researchType = 'general',
}) => {
  const isAcademic = researchType === 'academic'

  // Base information
  const baseInfo = `Question: ${question || planMeta.goal || 'N/A'}
Plan goal: ${planMeta.goal || 'N/A'}
Question type: ${planMeta.question_type || 'N/A'}

Findings to synthesize:
${findings.length ? findings.map(item => `- ${item}`).join('\n') : '- None'}

Sources (cite as [index]):
${sourcesList.length ? sourcesList.join('\n') : '- None'}`

  if (isAcademic) {
    return `You are writing an academic research report based on a systematic literature review.

${baseInfo}

REPORT STRUCTURE:

Your report MUST follow this academic structure:

## 1. ABSTRACT (150-250 words)
   - Brief summary of research question, methods, key findings, and implications
   - Written last, but appears first

## 2. INTRODUCTION
   - Background and context for the research question
   - Significance and relevance of the topic
   - Clear statement of research objectives/questions
   - Scope and limitations of the review

## 3. METHODOLOGY (if applicable)
   - Search strategy (databases, keywords, timeframe)
   - Inclusion/exclusion criteria
   - Quality assessment approach
   - Data extraction and synthesis methods

## 4. LITERATURE REVIEW / FINDINGS
   Organize thematically (NOT source-by-source):
   - Group findings by major themes or subtopics
   - For each theme:
     * Synthesize what multiple sources say
     * Cite all relevant sources [1][2][3]
     * Note consensus and disagreements
     * Assess quality of evidence
   - Present conflicting findings objectively
   - Distinguish between well-established and preliminary findings

## 5. DISCUSSION
   - Interpret the synthesized findings
   - Compare with broader theoretical frameworks
   - Address research questions posed in introduction
   - Note implications for theory and practice
   - Acknowledge limitations of the evidence base:
     * Methodological limitations of cited studies
     * Gaps in coverage (populations, contexts, outcomes)
     * Potential publication bias
   - Discuss areas of uncertainty or ongoing debate

## 6. CONCLUSION
   - Summarize key findings and their significance
   - Highlight main contributions of this review
   - Suggest directions for future research
   - Provide actionable recommendations (if appropriate)

## 7. REFERENCES
   - List all sources cited, formatted consistently
   - Use [index] citations throughout the text

ACADEMIC WRITING STANDARDS:

- **Tone**: Formal, objective, third-person
- **Language**: Precise terminology, appropriate hedging
- **Citations**: Every factual claim must have a citation
- **Evidence hierarchy**: Note study designs and sample sizes
- **Critical thinking**: Evaluate rather than just summarize
- **Synthesis**: Integrate across sources, don't just list findings
- **Limitations**: Always acknowledge what is NOT known

QUALITY CHECKLIST:
- [ ] Every factual claim is cited
- [ ] Sources are critically evaluated, not just reported
- [ ] Conflicting evidence is presented fairly
- [ ] Limitations are explicitly discussed
- [ ] Implications for future research are clear
- [ ] Academic tone is maintained throughout

Produce a comprehensive, publication-quality academic report.`
  }

  // General research prompt (original)
  return `You are a deep research writer producing a final report.

${baseInfo}

Requirements:
- Evidence-driven and traceable: every factual claim must be backed by a citation.
- Include a short "Self-check" section at the end with 3-5 bullets.
- Use clear headings and complete the full report in one response.`
}

const buildSourcesList = sourcesMap =>
  Array.from(sourcesMap.values()).map((source, idx) => {
    const title = source.title || source.url || source.uri || `Source ${idx + 1}`
    const url = source.url || source.uri || ''
    return `[${idx + 1}] ${title} ${url}`.trim()
  })

const runToolCallingStep = async ({
  modelInstance,
  baseMessages,
  sourcesMap,
  signal,
  stepIndex,
  totalSteps,
  maxLoops = 4,
}) => {
  let currentMessages = [...baseMessages]
  let loops = 0
  const toolEvents = []
  while (loops < maxLoops) {
    loops += 1
    const response = await modelInstance.invoke(toLangChainMessages(currentMessages), {
      signal,
    })
    const finishReason = getFinishReasonFromResponse(response)
    const toolCalls = getToolCallsFromResponse(response)
    if (finishReason === 'tool_calls' && Array.isArray(toolCalls) && toolCalls.length > 0) {
      const assistantToolCalls = toolCalls
        .map(toolCall => {
          const toolName = getToolCallName(toolCall)
          const toolArgs = getToolCallArguments(toolCall)
          return {
            id: toolCall.id,
            type: toolCall.type,
            function: toolName
              ? { name: toolName, arguments: formatToolArgumentsFromValue(toolArgs) }
              : undefined,
          }
        })
        .filter(toolCall => toolCall?.id && toolCall?.function?.name)

      if (assistantToolCalls.length === 0) break

      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: '', tool_calls: assistantToolCalls },
      ]

      for (const toolCall of assistantToolCalls) {
        const rawArgs = getToolCallArguments(toolCall)
        const parsedArgs = typeof rawArgs === 'string' ? safeJsonParse(rawArgs) : rawArgs || {}
        toolEvents.push(
          buildToolCallEvent(toolCall, parsedArgs, {
            step: typeof stepIndex === 'number' ? stepIndex + 1 : undefined,
            total: totalSteps,
          }),
        )
        const startedAt = Date.now()
        const toolName = toolCall.function.name

        if (!isLocalToolName(toolName)) {
          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolName,
            content: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
          })
          toolEvents.push(
            buildToolResultEvent(
              toolCall,
              new Error(`Unknown tool: ${toolName}`),
              Date.now() - startedAt,
              undefined,
              {
                step: typeof stepIndex === 'number' ? stepIndex + 1 : undefined,
                total: totalSteps,
              },
            ),
          )
          continue
        }

        try {
          const result = await executeToolByName(toolName, parsedArgs || {})
          if (toolName === 'web_search') {
            collectWebSearchSources(result, sourcesMap)
          }
          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolName,
            content: JSON.stringify(result),
          })
          toolEvents.push(
            buildToolResultEvent(toolCall, null, Date.now() - startedAt, result, {
              step: typeof stepIndex === 'number' ? stepIndex + 1 : undefined,
              total: totalSteps,
            }),
          )
        } catch (error) {
          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolName,
            content: JSON.stringify({ error: `Tool execution failed: ${error.message}` }),
          })
          toolEvents.push(
            buildToolResultEvent(toolCall, error, Date.now() - startedAt, undefined, {
              step: typeof stepIndex === 'number' ? stepIndex + 1 : undefined,
              total: totalSteps,
            }),
          )
        }
      }
      continue
    }
    const content = getResponseContent(response)
    return { content: normalizeTextContent(content), toolEvents }
  }
  return { content: '', toolEvents }
}

const parsePlan = planText => {
  const parsed = safeJsonParse(planText || '')
  if (parsed && Array.isArray(parsed.plan)) return parsed
  return {
    goal: '',
    assumptions: [],
    question_type: 'analysis',
    plan: [
      {
        step: 1,
        action: 'Summarize the topic and gather key evidence.',
        expected_output: 'A concise summary with evidence.',
        deliverable_format: 'paragraph',
        acceptance_criteria: [],
        depth: 'medium',
        requires_search: true,
      },
    ],
  }
}

export const streamDeepResearch = async function* (params) {
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
    toolIds = [],
    plan,
    question,
    researchType = 'general', // New parameter: 'general' or 'academic'
    signal,
  } = params

  const trimmedMessages =
    typeof contextMessageLimit === 'number' && contextMessageLimit > 0
      ? messages.slice(-contextMessageLimit)
      : messages

  const agentToolDefinitions = getToolDefinitionsByIds(toolIds)

  // Add search tool based on research type
  const searchToolId = researchType === 'academic' ? 'academic_search' : 'web_search'
  const searchToolDefinition = getToolDefinitionsByIds([searchToolId])

  const combinedTools = [
    ...(Array.isArray(tools) ? tools : []),
    ...agentToolDefinitions,
    ...searchToolDefinition, // Add research-type-specific search tool
  ].filter(Boolean)

  console.log(`[DeepResearch] Starting streamDeepResearch. Type: ${researchType}`)
  console.log(`[DeepResearch] searchToolId: ${searchToolId}`)

  const normalizedTools = []
  const toolNames = new Set()
  const excludedSearchTool = researchType === 'academic' ? 'web_search' : null
  for (const tool of combinedTools) {
    const name = tool?.function?.name
    // Skip web_search in academic research (general research can use both search tools)
    if (excludedSearchTool && name === excludedSearchTool) continue
    if (name && toolNames.has(name)) continue
    if (name) toolNames.add(name)
    normalizedTools.push(tool)
  }

  console.log(
    `[DeepResearch] Normalized tools: ${normalizedTools.map(t => t?.function?.name).join(', ')}`,
  )

  const planContent =
    typeof plan === 'string' && plan.trim().length
      ? plan
      : await (researchType === 'academic' ? generateAcademicResearchPlan : generateResearchPlan)(
          provider,
          question || '',
          apiKey,
          baseUrl,
          model,
        )
  const planMeta = parsePlan(planContent)
  const steps = Array.isArray(planMeta.plan) ? planMeta.plan : []

  const sourcesMap = new Map()
  const findings = []

  const toolModel = buildModel({
    provider,
    apiKey,
    baseUrl,
    model,
    temperature,
    top_k,
    top_p,
    frequency_penalty,
    presence_penalty,
    tools: normalizedTools,
    toolChoice: toolChoice || (normalizedTools.length ? 'auto' : undefined),
    streaming: false,
  })

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i] || {}
    const stepTitle = step.action || 'Research'
    const stepStartedAt = Date.now()
    yield buildResearchStepEvent({
      stepIndex: i,
      totalSteps: steps.length,
      title: stepTitle,
      status: 'running',
    })

    const sourcesList = buildSourcesList(sourcesMap)
    const stepPrompt = buildStepPrompt({
      planMeta,
      step,
      stepIndex: i,
      priorFindings: findings,
      sourcesList,
      researchType, // Pass researchType to step prompt
    })

    const stepMessages = [
      { role: 'system', content: stepPrompt },
      ...trimmedMessages,
      { role: 'user', content: question || '' },
    ]

    try {
      const stepResult = await runToolCallingStep({
        modelInstance: toolModel,
        baseMessages: stepMessages,
        sourcesMap,
        signal,
        stepIndex: i,
        totalSteps: steps.length,
      })

      if (stepResult?.toolEvents?.length) {
        for (const event of stepResult.toolEvents) {
          yield event
        }
      }
      if (stepResult?.content) findings.push(stepResult.content)
      yield buildResearchStepEvent({
        stepIndex: i,
        totalSteps: steps.length,
        title: stepTitle,
        status: 'done',
        durationMs: Date.now() - stepStartedAt,
      })
    } catch (error) {
      yield buildResearchStepEvent({
        stepIndex: i,
        totalSteps: steps.length,
        title: stepTitle,
        status: 'error',
        durationMs: Date.now() - stepStartedAt,
        error,
      })
    }
  }

  const reportSourcesList = buildSourcesList(sourcesMap)
  const reportPrompt = buildFinalReportPrompt({
    planMeta,
    question,
    findings,
    sourcesList: reportSourcesList,
    researchType, // Pass researchType to report prompt
  })

  console.log(`[DeepResearch] Building final report prompt for type: ${researchType}`)

  const reportModel = buildModel({
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
    streaming: true,
  })

  const reportMessages = [
    { role: 'system', content: reportPrompt },
    ...trimmedMessages,
    { role: 'user', content: question || '' },
  ]

  const streamIterator = await reportModel.stream(toLangChainMessages(reportMessages), {
    signal,
  })

  let fullContent = ''
  for await (const chunk of streamIterator) {
    const messageChunk = chunk?.message ?? chunk
    const contentValue = messageChunk?.content ?? chunk?.content
    const chunkText = normalizeTextContent(contentValue)
    if (chunkText) {
      fullContent += chunkText
      yield { type: 'text', content: chunkText }
    }
  }

  yield {
    type: 'done',
    content: fullContent,
    sources: sourcesMap.size ? Array.from(sourcesMap.values()) : undefined,
  }
}
