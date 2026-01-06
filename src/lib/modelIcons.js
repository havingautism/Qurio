// Import Provider Icons
import GeminiIcon from '../assets/gemini-color.svg?url'
import OpenAIIcon from '../assets/openai.svg?url'
import SiliconCloudIcon from '../assets/siliconcloud-color.svg?url'
import DeepSeekIcon from '../assets/deepseek-color.svg?url'
import QwenIcon from '../assets/qwen-color.svg?url'
import KimiIcon from '../assets/kimi-icon.svg?url'
import GoogleIcon from '../assets/google-color.svg?url'
import MoonshotIcon from '../assets/moonshot.svg?url'
import ChatGLMIcon from '../assets/chatglm-color.svg?url'
import ZhipuIcon from '../assets/zhipu-color.svg?url'
import ModelScopeIcon from '../assets/modelscope-color.svg?url'
import TavilyIcon from '../assets/tavily-color.svg?url'
import NvidiaIcon from '../assets/nvidia-color.svg?url'

const DEFAULT_ICON_BG_CLASS = 'bg-[#f6f6f6b8] dark:bg-[#0d0d0d]'

export const PROVIDER_ICON_META = {
  gemini: { src: GoogleIcon, alt: 'Gemini', bgClassName: DEFAULT_ICON_BG_CLASS },
  openai_compatibility: {
    src: OpenAIIcon,
    alt: 'OpenAI',
    bgClassName: DEFAULT_ICON_BG_CLASS,
    imgClassName: 'invert-0 dark:invert',
  },
  siliconflow: { src: SiliconCloudIcon, alt: 'SiliconFlow', bgClassName: DEFAULT_ICON_BG_CLASS },
  glm: { src: ZhipuIcon, alt: 'GLM', bgClassName: DEFAULT_ICON_BG_CLASS },
  modelscope: { src: ModelScopeIcon, alt: 'ModelScope', bgClassName: DEFAULT_ICON_BG_CLASS },
  kimi: {
    src: MoonshotIcon,
    alt: 'Moonshot',
    bgClassName: DEFAULT_ICON_BG_CLASS,
    imgClassName: 'invert-0 dark:invert',
  },
  tavily: { src: TavilyIcon, alt: 'Tavily', bgClassName: DEFAULT_ICON_BG_CLASS },
  nvidia: {
    src: NvidiaIcon,
    alt: 'NVIDIA',
    bgClassName: DEFAULT_ICON_BG_CLASS,
  },
}

export const PROVIDER_ICONS = Object.fromEntries(
  Object.entries(PROVIDER_ICON_META).map(([key, value]) => [key, value.src]),
)

const MONOCHROME_ICON_CLASS = 'invert-0 dark:invert'

export const renderProviderIcon = (provider, options = {}) => {
  const iconMeta = PROVIDER_ICON_META[provider]
  if (!iconMeta?.src) return null

  const { size = 16, alt, wrapperClassName = '', imgClassName = '', compact = false } = options
  const baseClasses = compact
    ? 'flex items-center justify-center rounded-full shrink-0 bg-transparent!'
    : 'flex items-center justify-center rounded-full p-2 shrink-0 shadow-inner'
  const wrapperClasses = [baseClasses, iconMeta.bgClassName, wrapperClassName]
    .filter(Boolean)
    .join(' ')
  const baseImgClassName = size === 16 ? 'w-4 h-4 object-contain' : 'object-contain'
  const resolvedImgClassName = [imgClassName || baseImgClassName, iconMeta.imgClassName]
    .filter(Boolean)
    .join(' ')

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

export const getModelIconClassName = modelId => {
  if (!modelId) return ''
  const lowerId = modelId.toLowerCase()
  if (lowerId.includes('moonshot') || lowerId.includes('kimi')) return MONOCHROME_ICON_CLASS
  if (lowerId.includes('gpt') || lowerId.includes('o3-mini')) return MONOCHROME_ICON_CLASS
  return ''
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
