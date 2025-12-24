// Import Provider Icons
import GeminiIcon from '../assets/gemini-color.svg?url'
import OpenAIIcon from '../assets/openai.svg?url'
import SiliconCloudIcon from '../assets/siliconcloud-color.svg?url'
import DeepSeekIcon from '../assets/deepseek-color.svg?url'
import QwenIcon from '../assets/qwen-color.svg?url'
import KimiIcon from '../assets/kimi-color.svg?url'
import GLMIcon from '../assets/glm-color.svg?url'
import ChatGLMIcon from '../assets/chatglm-color.svg?url'
import ZhipuIcon from '../assets/zhipu-color.svg?url'

export const PROVIDER_ICONS = {
  gemini: GeminiIcon,
  openai_compatibility: OpenAIIcon,
  siliconflow: SiliconCloudIcon,
  glm: ZhipuIcon,
  kimi: KimiIcon,
}

export const getModelIcon = modelId => {
  if (!modelId) return null
  const lowerId = modelId.toLowerCase()
  if (lowerId.includes('gemini')) return GeminiIcon
  if (lowerId.includes('deepseek')) return DeepSeekIcon
  if (lowerId.includes('qwen')) return QwenIcon
  if (lowerId.includes('moonshot') || lowerId.includes('kimi')) return KimiIcon
  if (lowerId.includes('glm') || lowerId.includes('zhipu')) return ChatGLMIcon
  if (lowerId.includes('gpt') || lowerId.includes('o3-mini')) return OpenAIIcon
  // Fallback based on known prefixes if needed, or default to a generic icon
  return null
}
