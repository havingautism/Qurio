import { create, all } from 'mathjs'
import { jsonrepair } from 'jsonrepair'
import { z } from 'zod'

const math = create(all, {})

const TOOL_DEFINITIONS = [
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
    description: 'Get current local time for a timezone.',
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
]

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

export const listTools = () =>
  TOOL_DEFINITIONS.map(tool => ({
    id: tool.id,
    name: tool.name,
    category: tool.category,
    description: tool.description,
    parameters: tool.parameters,
  }))

export const getToolDefinitionsByIds = toolIds => {
  if (!Array.isArray(toolIds) || toolIds.length === 0) return []
  const idSet = new Set(toolIds.map(String))
  return TOOL_DEFINITIONS.filter(tool => idSet.has(tool.id)).map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

export const isLocalToolName = toolName =>
  TOOL_DEFINITIONS.some(tool => tool.name === toolName || tool.id === toolName)

export const executeToolByName = async (toolName, args = {}) => {
  const schema = toolSchemas[toolName]
  if (!schema) {
    throw new Error(`Unknown tool: ${toolName}`)
  }
  const parsed = schema.safeParse(args || {})
  if (!parsed.success) {
    const details = parsed.error.issues.map(issue => issue.message).join('; ')
    throw new Error(`Invalid tool arguments: ${details}`)
  }

  const params = parsed.data
  switch (toolName) {
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
    default:
      throw new Error(`Unknown tool: ${toolName}`)
  }
}
