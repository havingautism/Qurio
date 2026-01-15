/**
 * Provider metadata configuration
 * Maps provider IDs to their display labels and fallback characters
 */
export const PROVIDER_META = {
  gemini: {
    label: 'Google Gemini',
    id: 'gemini',
    fallback: 'G',
  },
  openai_compatibility: {
    label: 'OpenAI Compatible',
    id: 'openai_compatibility',
    fallback: 'O',
  },
  siliconflow: {
    label: 'SiliconFlow',
    id: 'siliconflow',
    fallback: 'S',
  },
  glm: {
    label: 'GLM',
    id: 'glm',
    fallback: 'G',
  },
  modelscope: {
    label: '魔塔社区',
    id: 'modelscope',
    fallback: 'M',
  },
  kimi: {
    label: 'Kimi',
    id: 'kimi',
    fallback: 'K',
  },
  nvidia: {
    label: 'NVIDIA NIM',
    id: 'nvidia',
    fallback: 'N',
  },
}

/**
 * Tool boundary character set for text processing
 */
export const TOOL_BOUNDARY_CHARS = new Set([
  ' ',
  '\n',
  '\t',
  '.',
  ',',
  '!',
  '?',
  ';',
  ':',
  '。',
  '！',
  '？',
  '；',
  '：',
])

/**
 * Tool punctuation character set
 */
export const TOOL_PUNCTUATION_CHARS = new Set(['.', ',', '!', '?', ';', ':', '。', '！', '？', '；', '：'])

/**
 * Default skeleton fade duration in milliseconds
 */
export const SKELETON_FADE_MS = 320

/**
 * Maximum forward search distance for tool index normalization
 */
export const MAX_FORWARD_SEARCH_DISTANCE = 80

/**
 * Default thinking status rotation interval in milliseconds
 */
export const THINKING_STATUS_INTERVAL = 1800

/**
 * Copy success timeout duration in milliseconds
 */
export const COPY_SUCCESS_TIMEOUT = 2000

/**
 * Mobile selection menu delay in milliseconds
 */
export const MOBILE_SELECTION_DELAY = 150

/**
 * Menu positioning constants
 */
export const MENU_POSITIONING = {
  mobileWidth: 160,
  desktopWidth: 150,
  mobileHeight: 38,
  desktopHeight: 40,
  mobileTopOffset: 8,
  desktopTopOffset: 10,
  edgePadding: 10,
}
