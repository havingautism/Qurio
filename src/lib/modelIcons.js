// Import Provider Icons
import GeminiIcon from '../assets/gemini-color.svg?url'
import OpenAIIcon from '../assets/openai.svg?url'
import SiliconCloudIcon from '../assets/siliconcloud-color.svg?url'
import DeepSeekIcon from '../assets/deepseek-color.svg?url'
import QwenIcon from '../assets/qwen-color.svg?url'
import KimiIcon from '../assets/kimi-icon.svg?url'
// import GLMIcon from '../assets/glm-color.svg?url'
import ChatGLMIcon from '../assets/chatglm-color.svg?url'
import ZhipuIcon from '../assets/zhipu-color.svg?url'

const DEFAULT_ICON_BG_CLASS = 'bg-white dark:bg-black'

export const PROVIDER_ICON_META = {
  gemini: { src: GeminiIcon, alt: 'Gemini', bgClassName: 'bg-white' },
  openai_compatibility: { src: OpenAIIcon, alt: 'OpenAI', bgClassName: 'bg-white' },
  siliconflow: { src: SiliconCloudIcon, alt: 'SiliconFlow', bgClassName: 'bg-white' },
  glm: { src: ZhipuIcon, alt: 'GLM', bgClassName: 'bg-black' },
  kimi: { src: KimiIcon, alt: 'Kimi', bgClassName: 'bg-black' },
}

export const PROVIDER_ICONS = Object.fromEntries(
  Object.entries(PROVIDER_ICON_META).map(([key, value]) => [key, value.src]),
)

export const renderProviderIcon = (provider, options = {}) => {
  const iconMeta = PROVIDER_ICON_META[provider]
  if (!iconMeta?.src) return null

  const { size = 16, alt, wrapperClassName = '', imgClassName = '' } = options
  const wrapperClasses = [
    'flex items-center justify-center rounded-full p-0.5 shrink-0',
    iconMeta.bgClassName,
    wrapperClassName,
  ]
    .filter(Boolean)
    .join(' ')
  const resolvedImgClassName =
    imgClassName || (size === 16 ? 'w-4 h-4 object-contain' : 'object-contain')

  return (
    <div className={wrapperClasses}>
      <img
        src={iconMeta.src}
        alt={alt || iconMeta.alt || provider}
        width={size}
        height={size}
        className={resolvedImgClassName}
        loading="lazy"
      />
    </div>
  )
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
