/**
 * API for fetching available models from different providers
 */

// Fetch available models from Google Gemini
export const fetchGeminiModels = async apiKey => {
  if (!apiKey) {
    throw new Error('API Key is required')
  }

  try {
    // Add timeout to prevent hanging requests
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      },
    )

    clearTimeout(timeoutId)

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Invalid API key or insufficient permissions')
      }
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()

    // Filter for chat models that support generateContent
    const models = data.models
      .filter(
        model =>
          model.name.includes('gemini') &&
          model.supportedGenerationMethods?.includes('generateContent'),
      )
      .map(model => {
        // Extract model name from the full path
        const modelName = model.name.split('/').pop()
        return {
          value: modelName,
          label: modelName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          displayName: model.displayName || modelName,
        }
      })
      .sort((a, b) => {
        // Sort by version (newer versions first)
        const aNum = parseInt(a.label.match(/(\d+)/)?.[1] || '0')
        const bNum = parseInt(b.label.match(/(\d+)/)?.[1] || '0')
        return bNum - aNum
      })

    return models
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - please check your network connection')
    }
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error('Network error - unable to connect to Gemini API')
    }
    console.error('Error fetching Gemini models:', error)
    throw error
  }
}

// Fetch available models from SiliconFlow
export const fetchSiliconFlowModels = async (apiKey, baseUrl = 'https://api.siliconflow.cn/v1') => {
  if (!apiKey) {
    throw new Error('API Key is required')
  }

  try {
    // Add timeout to prevent hanging requests
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    // Only request chat models via sub_type query param per SiliconFlow docs
    const url = new URL(`${baseUrl.replace(/\/$/, '')}/models`)
    url.searchParams.set('sub_type', 'chat')

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()

    // Debug: log the total models received
    console.log(`SiliconFlow API returned ${data.data?.length || 0} total models`)

    // Filter for chat models - more inclusive filtering for SiliconFlow
    const models = data.data
      .filter(model => {
        // Only include models that are actually models
        if (model.object !== 'model') return false

        const id = model.id.toLowerCase()

        // Exclude non-chat models (e.g., embedding models, image generation models)
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

        // Include most models since SiliconFlow primarily serves chat models
        return true
      })
      .map(model => ({
        value: model.id,
        label: model.id,
        displayName: model.id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))

    // Debug: log the filtered models count
    console.log(`After filtering, ${models.length} models available for chat`)

    return models
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - please check your network connection')
    }
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error('Network error - unable to connect to SiliconFlow API')
    }
    console.error('Error fetching SiliconFlow models:', error)
    throw error
  }
}

// Get models for a specific provider
export const getModelsForProvider = async (provider, credentials) => {
  switch (provider) {
    case 'gemini':
      return await fetchGeminiModels(credentials.apiKey)
    case 'siliconflow':
      return await fetchSiliconFlowModels(credentials.apiKey, credentials.baseUrl)
    case 'openai_compatibility':
      // OpenAI compatible doesn't have a standard models endpoint
      // Return empty array to use fallback models
      return []
    default:
      return []
  }
}
