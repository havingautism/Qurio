// Import Provider Icons
import GeminiIcon from '../assets/gemini-color.svg'
import OpenAIIcon from '../assets/openai.svg'
import SiliconCloudIcon from '../assets/siliconcloud-color.svg'
import DeepSeekIcon from '../assets/deepseek-color.svg'
import QwenIcon from '../assets/qwen-color.svg'
import KimiIcon from '../assets/kimi-color.svg'

export const PROVIDER_ICONS = {
  gemini: GeminiIcon,
  openai_compatibility: OpenAIIcon,
  siliconflow: SiliconCloudIcon,
}

export const getModelIcon = (modelId) => {
  if (!modelId) return null
  const lowerId = modelId.toLowerCase()
  if (lowerId.includes('gemini')) return GeminiIcon
  if (lowerId.includes('deepseek')) return DeepSeekIcon
  if (lowerId.includes('qwen')) return QwenIcon
  if (lowerId.includes('moonshot') || lowerId.includes('kimi')) return KimiIcon
  if (lowerId.includes('gpt') || lowerId.includes('o3-mini')) return OpenAIIcon
  // Fallback based on known prefixes if needed, or default to a generic icon
  return null
}
