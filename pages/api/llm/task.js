import { buildChatMessages, getModelForProvider } from '../../../src/server/llm'

const safeJsonParse = text => {
  if (!text || typeof text !== 'string') return null
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

const normalizeRelatedQuestions = payload => {
  const sanitize = arr =>
    (arr || [])
      .map(q => {
        if (typeof q === 'string') return q.trim()
        if (q === null || q === undefined) return ''
        try {
          return String(q).trim()
        } catch {
          return ''
        }
      })
      .filter(Boolean)

  if (Array.isArray(payload)) return sanitize(payload)
  if (payload && typeof payload === 'object') {
    const candidates = [
      payload.questions,
      payload.follow_up_questions,
      payload.followUpQuestions,
      payload.followups,
      payload.followUps,
    ]
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return sanitize(candidate)
    }
    const firstArray = Object.values(payload).find(v => Array.isArray(v))
    if (firstArray) return sanitize(firstArray)
  }
  return []
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { task, provider, apiKey, baseUrl, model, firstMessage, messages, spaces } = req.body || {}

  const responseFormat =
    provider !== 'gemini' && task !== 'generateTitle' ? { type: 'json_object' } : undefined

  const chatModel = getModelForProvider({
    provider,
    apiKey,
    baseUrl,
    model,
    responseFormat,
  })

  if (task === 'generateTitle') {
    const chatMessages = buildChatMessages({
      messages: [
        {
          role: 'system',
          content:
            "Generate a short, concise title (max 5 words) for this conversation based on the user's first message. Do not use quotes.",
        },
        { role: 'user', content: firstMessage },
      ],
    })
    try {
      const response = await chatModel.invoke(chatMessages)
      res.status(200).json({ title: response?.content?.trim?.() || 'New Conversation' })
      return
    } catch (error) {
      console.error('generateTitle failed:', error)
      res.status(500).json({ title: 'New Conversation' })
      return
    }
  }

  if (task === 'generateTitleAndSpace') {
    const spaceLabels = (spaces || []).map(s => s.label).join(', ')
    const chatMessages = buildChatMessages({
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant.
1. Generate a short, concise title (max 5 words) for this conversation based on the user's first message.
2. Select the most appropriate space from the following list: [${spaceLabels}]. If none fit well, return null.
Return the result as a JSON object with keys "title" and "spaceLabel".`,
        },
        { role: 'user', content: firstMessage },
      ],
    })

    try {
      const response = await chatModel.invoke(chatMessages)
      const parsed = safeJsonParse(response?.content) || {}
      const title = parsed.title || 'New Conversation'
      const spaceLabel = parsed.spaceLabel
      const selectedSpace = (spaces || []).find(s => s.label === spaceLabel) || null

      res.status(200).json({ title, space: selectedSpace })
      return
    } catch (error) {
      console.error('generateTitleAndSpace failed:', error)
      res.status(500).json({ title: 'New Conversation', space: null })
      return
    }
  }

  if (task === 'generateRelatedQuestions') {
    const chatMessages = buildChatMessages({
      messages: [
        ...(messages || []),
        {
          role: 'user',
          content:
            'Based on our conversation, suggest 3 short, relevant follow-up questions I might ask. Return them as a JSON array of strings. Example: ["Question 1?", "Question 2?"]',
        },
      ],
    })
    try {
      const response = await chatModel.invoke(chatMessages)
      const parsed = safeJsonParse(response?.content)
      const questions = normalizeRelatedQuestions(parsed)
      res.status(200).json({ questions })
      return
    } catch (error) {
      console.error('generateRelatedQuestions failed:', error)
      res.status(500).json({ questions: [] })
      return
    }
  }

  res.status(400).json({ error: 'Unknown task' })
}
