import { jsonrepair } from 'jsonrepair'
import { all, create } from 'mathjs'
import { z } from 'zod'
import { ACADEMIC_DOMAINS } from './academicDomains.js'

const math = create(all, {})

const TOOL_ALIASES = {
  web_search: 'Tavily_web_search',
  academic_search: 'Tavily_academic_search',
}

const resolveToolName = toolName => TOOL_ALIASES[toolName] || toolName

const resolveTavilyApiKey = toolConfig => {
  const envKey = process.env.TAVILY_API_KEY || process.env.PUBLIC_TAVILY_API_KEY
  if (envKey) return envKey
  if (toolConfig?.tavilyApiKey) return toolConfig.tavilyApiKey
  if (toolConfig?.searchProvider === 'tavily' && toolConfig?.searchApiKey) {
    return toolConfig.searchApiKey
  }
  return ''
}

const GLOBAL_TOOLS = [
  {
    id: 'Tavily_web_search',
    name: 'Tavily_web_search',
    category: 'search',
    description: 'Search the web for current information using Tavily API.',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'Search query.',
        },
        max_results: {
          type: 'integer',
          description: 'Maximum number of results to return (default 5).',
        },
      },
    },
  },
]

const AGENT_TOOLS = [
  {
    id: 'calculator',
    name: 'calculator',
    category: 'math',
    description: 'Evaluate a math expression safely.',
    parameters: {
      type: 'object',
      required: ['expression'],
      properties: {
        expression: {
          type: 'string',
          description: 'Math expression, e.g. "(2+3)*4/5".',
        },
      },
    },
  },
  {
    id: 'local_time',
    name: 'local_time',
    category: 'time',
    description: 'Get current local date and time for a timezone.',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'IANA timezone, e.g. "Asia/Shanghai".',
        },
        locale: {
          type: 'string',
          description: 'Locale for formatting, e.g. "zh-CN".',
        },
      },
    },
  },
  {
    id: 'summarize_text',
    name: 'summarize_text',
    category: 'text',
    description: 'Summarize text by extracting leading sentences.',
    parameters: {
      type: 'object',
      required: ['text'],
      properties: {
        text: {
          type: 'string',
          description: 'Text to summarize.',
        },
        max_sentences: {
          type: 'integer',
          description: 'Maximum number of sentences to return.',
        },
        max_chars: {
          type: 'integer',
          description: 'Maximum length of summary in characters.',
        },
      },
    },
  },
  {
    id: 'extract_text',
    name: 'extract_text',
    category: 'text',
    description: 'Extract relevant sentences by query keyword.',
    parameters: {
      type: 'object',
      required: ['text'],
      properties: {
        text: {
          type: 'string',
          description: 'Text to extract from.',
        },
        query: {
          type: 'string',
          description: 'Keyword or phrase to match.',
        },
        max_sentences: {
          type: 'integer',
          description: 'Maximum number of sentences to return.',
        },
      },
    },
  },
  {
    id: 'json_repair',
    name: 'json_repair',
    category: 'json',
    description: 'Validate and repair JSON text.',
    parameters: {
      type: 'object',
      required: ['text'],
      properties: {
        text: {
          type: 'string',
          description: 'JSON string to validate or repair.',
        },
      },
    },
  },
  {
    id: 'webpage_reader',
    name: 'webpage_reader',
    category: 'web',
    description: 'Fetch webpage content and return JSON.',
    parameters: {
      type: 'object',
      required: ['url'],
      properties: {
        url: {
          type: 'string',
          description: 'Target webpage URL (e.g., https://example.com).',
        },
      },
    },
  },
  {
    id: 'Tavily_academic_search',
    name: 'Tavily_academic_search',
    category: 'search',
    description:
      'Search academic journals, papers, and scholarly resources using Tavily API with advanced search depth. Results are limited to peer-reviewed sources, preprint servers, and trusted academic databases.',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'Academic search query (e.g., research topic, paper title, author name).',
        },
        max_results: {
          type: 'integer',
          description: 'Maximum number of academic results to return (default 5).',
        },
      },
    },
  },
  {
    id: 'interactive_form',
    name: 'interactive_form',
    category: 'interaction',
    description:
      'Display an interactive form to collect structured user input. Use this when you need specific information from the user in a structured format.',
    parameters: {
      type: 'object',
      required: ['id', 'title', 'fields'],
      properties: {
        id: {
          type: 'string',
          description: 'Unique identifier for this form',
        },
        title: {
          type: 'string',
          description: 'Form title displayed to user',
        },
        description: {
          type: 'string',
          description: 'Optional form description',
        },
        fields: {
          type: 'array',
          description: 'Form fields to collect',
          items: {
            type: 'object',
            required: ['name', 'label', 'type'],
            properties: {
              name: { type: 'string', description: 'Field identifier' },
              label: { type: 'string', description: 'Field label' },
              type: {
                type: 'string',
                enum: ['text', 'number', 'select', 'checkbox', 'range'],
                description: 'Field type',
              },
              required: { type: 'boolean', description: 'Is this field required' },
              options: {
                type: 'array',
                items: { type: 'string' },
                description: 'Options for select/checkbox fields',
              },
              default: { description: 'Default value' },
              min: { type: 'number', description: 'Min value for number/range' },
              max: { type: 'number', description: 'Max value for number/range' },
              step: { type: 'number', description: 'Step for number/range' },
            },
          },
        },
      },
    },
  },
]

// Combined list for execution and validation
const ALL_TOOLS = [...GLOBAL_TOOLS, ...AGENT_TOOLS]

const toolSchemas = {
  calculator: z.object({
    expression: z.string().min(1, 'expression is required'),
  }),
  local_time: z.object({
    timezone: z.string().min(1).optional(),
    locale: z.string().min(1).optional(),
  }),
  summarize_text: z.object({
    text: z.string().min(1, 'text is required'),
    max_sentences: z.number().int().positive().optional(),
    max_chars: z.number().int().positive().optional(),
  }),
  extract_text: z.object({
    text: z.string().min(1, 'text is required'),
    query: z.string().optional(),
    max_sentences: z.number().int().positive().optional(),
  }),
  json_repair: z.object({
    text: z.string().min(1, 'text is required'),
  }),
  webpage_reader: z.object({
    url: z.string().min(1, 'url is required'),
  }),
  Tavily_web_search: z.object({
    query: z.string().min(1, 'query is required'),
    max_results: z.number().int().positive().optional(),
  }),
  Tavily_academic_search: z.object({
    query: z.string().min(1, 'query is required'),
    max_results: z.number().int().positive().optional(),
  }),
  interactive_form: z.object({
    id: z.string().min(1, 'id is required'),
    title: z.string().min(1, 'title is required'),
    description: z.string().optional(),
    fields: z.array(z.any()).min(1, 'at least one field is required'),
  }),
}

const splitSentences = text => {
  if (!text) return []
  const parts = text.match(/[^。！？!?]+[。！？!?]?/g)
  return parts ? parts.map(item => item.trim()).filter(Boolean) : [text.trim()]
}

const safeEvaluate = expression => {
  if (!expression || typeof expression !== 'string') {
    throw new Error('Expression is required')
  }
  if (!/^[0-9+\-*/%^().,\sA-Za-z_]*$/.test(expression)) {
    throw new Error('Expression contains unsupported characters')
  }
  return math.evaluate(expression)
}

// Only expose Agent Tools to the configuration UI
export const listTools = () =>
  AGENT_TOOLS.map(tool => ({
    id: tool.id,
    name: tool.name,
    category: tool.category,
    description: tool.description,
    parameters: tool.parameters,
  }))

export const getToolDefinitionsByIds = toolIds => {
  if (!Array.isArray(toolIds) || toolIds.length === 0) return []
  const idSet = new Set(toolIds.map(id => resolveToolName(String(id))))
  // Agents can theoretically access global tools if manually added by ID, but listTools won't show them
  return ALL_TOOLS.filter(tool => idSet.has(tool.id)).map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

export const isLocalToolName = toolName =>
  ALL_TOOLS.some(tool => tool.name === resolveToolName(toolName) || tool.id === toolName)

export const executeToolByName = async (toolName, args = {}, toolConfig = {}) => {
  const resolvedToolName = resolveToolName(toolName)
  const schema = toolSchemas[resolvedToolName]
  if (!schema) {
    throw new Error(`Unknown tool: ${toolName}`)
  }
  const parsed = schema.safeParse(args || {})
  if (!parsed.success) {
    const details = parsed.error.issues.map(issue => issue.message).join('; ')
    throw new Error(`Invalid tool arguments: ${details}`)
  }

  const params = parsed.data
  switch (resolvedToolName) {
    case 'calculator': {
      const value = safeEvaluate(params.expression)
      return { result: value }
    }
    case 'local_time': {
      const timezone = params.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
      const locale = params.locale || 'en-US'
      const now = new Date()
      const formatted = new Intl.DateTimeFormat(locale, {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(now)
      return { timezone, formatted, iso: now.toISOString() }
    }
    case 'summarize_text': {
      const text = params.text || ''
      const maxSentences = Number(params.max_sentences) || 3
      const maxChars = Number(params.max_chars) || 600
      const sentences = splitSentences(text).slice(0, maxSentences)
      let summary = sentences.join(' ')
      if (summary.length > maxChars) summary = summary.slice(0, maxChars).trim()
      return { summary }
    }
    case 'extract_text': {
      const text = params.text || ''
      const query = (params.query || '').toLowerCase()
      const maxSentences = Number(params.max_sentences) || 5
      const sentences = splitSentences(text)
      const matches = query
        ? sentences.filter(sentence => sentence.toLowerCase().includes(query))
        : sentences
      return { extracted: matches.slice(0, maxSentences) }
    }
    case 'json_repair': {
      const text = params.text || ''
      try {
        const parsed = JSON.parse(text)
        return { valid: true, repaired: text, data: parsed }
      } catch (error) {
        try {
          const repaired = jsonrepair(text)
          const parsed = JSON.parse(repaired)
          return { valid: false, repaired, data: parsed }
        } catch (repairError) {
          return {
            valid: false,
            error: repairError?.message || 'Unable to repair JSON',
          }
        }
      }
    }
    case 'webpage_reader': {
      const inputUrl = params.url.trim()
      const normalized = inputUrl.replace(/^https?:\/\/r\.jina\.ai\//i, '')
      const requestUrl = `https://r.jina.ai/${normalized}`

      try {
        const response = await fetch(requestUrl, {
          headers: {
            Accept: 'text/plain',
          },
        })

        if (!response.ok) {
          throw new Error(`Jina AI reader error: ${response.statusText}`)
        }

        const content = await response.text()
        return {
          url: normalized,
          content,
          source: 'jina.ai',
        }
      } catch (error) {
        throw new Error(`Webpage read failed: ${error.message}`)
      }
    }
    case 'Tavily_web_search': {
      const query = params.query
      const maxResults = params.max_results || 5
      const apiKey = resolveTavilyApiKey(toolConfig)

      if (!apiKey) {
        throw new Error('Tavily API key not configured. Set TAVILY_API_KEY or add it in settings.')
      }

      try {
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            search_depth: 'basic',
            include_answer: true,
            max_results: maxResults,
          }),
        })

        if (!response.ok) {
          throw new Error(`Tavily API error: ${response.statusText}`)
        }

        const data = await response.json()

        // Return structured results
        return {
          answer: data.answer,
          results: data.results.map(r => ({
            title: r.title,
            url: r.url,
            content: r.content,
          })),
        }
      } catch (error) {
        throw new Error(`Search failed: ${error.message}`)
      }
    }
    case 'Tavily_academic_search': {
      const query = params.query
      const maxResults = params.max_results || 5
      const apiKey = resolveTavilyApiKey(toolConfig)

      if (!apiKey) {
        throw new Error('Tavily API key not configured. Set TAVILY_API_KEY or add it in settings.')
      }

      try {
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            search_depth: 'advanced', // Use advanced search for academic queries
            include_domains: ACADEMIC_DOMAINS,
            include_answer: true,
            max_results: maxResults,
          }),
        })

        if (!response.ok) {
          throw new Error(`Tavily API error: ${response.statusText}`)
        }

        const data = await response.json()

        // Return structured academic results
        return {
          answer: data.answer,
          results: data.results.map(r => ({
            title: r.title,
            url: r.url,
            content: r.content,
            score: r.score || null, // Relevance score if available
          })),
          query_type: 'academic',
        }
      } catch (error) {
        throw new Error(`Academic search failed: ${error.message}`)
      }
    }
    case 'interactive_form': {
      // This is a client-side interaction tool
      // We just pass the parameters through to the frontend
      return {
        ...params,
        kind: 'interactive_form', // Marker for frontend logic
      }
    }
    default:
      throw new Error(`Unknown tool: ${toolName}`)
  }
}
