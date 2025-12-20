import { SILICONFLOW_BASE_URL } from '../../../src/lib/providerConstants'

const normalizeGeminiModels = data => {
  const models = (data?.models || [])
    .filter(
      model =>
        model.name?.includes('gemini') &&
        model.supportedGenerationMethods?.includes('generateContent'),
    )
    .map(model => {
      const modelName = model.name.split('/').pop()
      return {
        value: modelName,
        label: modelName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        displayName: model.displayName || modelName,
      }
    })
    .sort((a, b) => {
      const aNum = parseInt(a.label.match(/(\d+)/)?.[1] || '0', 10)
      const bNum = parseInt(b.label.match(/(\d+)/)?.[1] || '0', 10)
      return bNum - aNum
    })

  return models
}

const normalizeSiliconFlowModels = data => {
  const models = (data?.data || [])
    .filter(model => {
      if (model.object !== 'model') return false
      const id = model.id?.toLowerCase?.() || ''
      if (
        id.includes('embed') ||
        id.includes('embedding') ||
        id.includes('whisper') ||
        id.includes('tts') ||
        id.includes('stable-diffusion') ||
        id.includes('image') ||
        (id.includes('vision') && !id.includes('llava'))
      ) {
        return false
      }
      return true
    })
    .map(model => ({
      value: model.id,
      label: model.id,
      displayName: model.id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))

  return models
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { provider, apiKey, baseUrl } = req.body || {}

  try {
    if (provider === 'gemini') {
      if (!apiKey) throw new Error('API Key is required')
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        },
      )
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      res.status(200).json({ models: normalizeGeminiModels(data) })
      return
    }

    if (provider === 'siliconflow') {
      if (!apiKey) throw new Error('API Key is required')
      const resolvedBase = baseUrl || SILICONFLOW_BASE_URL
      const url = new URL(`${resolvedBase.replace(/\/$/, '')}/models`)
      url.searchParams.set('sub_type', 'chat')
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      res.status(200).json({ models: normalizeSiliconFlowModels(data) })
      return
    }

    res.status(200).json({ models: [] })
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Request failed' })
  }
}
