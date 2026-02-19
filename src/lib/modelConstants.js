// Shared model constants for AgentModal and SettingsModal

export const FALLBACK_MODEL_OPTIONS = {
  gemini: [
    { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash Exp' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { value: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash 8B' },
  ],
  openai_compatibility: [
    { value: 'gpt-4o', label: 'gpt-4o' },
    { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
  ],
  siliconflow: [
    { value: 'deepseek-ai/DeepSeek-V2.5', label: 'DeepSeek V2.5' },
    { value: 'deepseek-ai/DeepSeek-Coder-V2', label: 'DeepSeek Coder V2' },
  ],
  glm: [
    { value: 'glm-4', label: 'GLM-4' },
    { value: 'glm-4-flash', label: 'GLM-4 Flash' },
  ],
  deepseek: [
    { value: 'deepseek-chat', label: 'DeepSeek Chat' },
    { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
  ],
  volcengine: [
    { value: 'doubao-seed-1-6-thinking-250615', label: 'Doubao Seed 1.6 Thinking' },
    { value: 'doubao-1.5-pro-32k-250115', label: 'Doubao 1.5 Pro 32K' },
  ],
  nvidia: [
    { value: 'moonshotai/kimi-k2.5', label: 'kimi-k2.5' },
    { value: 'moonshotai/kimi-k2-thinking', label: 'kimi-k2-thinking' },
    { value: 'minimaxai/minimax-m2.1', label: 'minimax-m2.1' },
    { value: 'minimaxai/minimax-m2', label: 'minimax-m2' },
    { value: 'stepfun-ai/step-3.5-flash', label: 'step-3.5-flash' },
    { value: 'deepseek-ai/deepseek-v3.2', label: 'deepseek-v3.2' },
    { value: 'deepseek-ai/deepseek-v3.1-terminus', label: 'deepseek-v3.1-terminus' },
    { value: 'moonshotai/kimi-k2-instruct-0905', label: 'kimi-k2-instruct-0905' },
    { value: 'moonshotai/kimi-k2-instruct', label: 'kimi-k2-instruct' },
    { value: 'qwen/qwen3-next-80b-a3b-instruct', label: 'qwen3-next-80b-a3b-instruct' },
  ],
  minimax: [{ value: 'MiniMax-M2.1', label: 'MiniMax M2.1' }],
  modelscope: [],
  kimi: [
    { value: 'moonshot-v1-8k', label: 'Moonshot V1 8K' },
    { value: 'moonshot-v1-32k', label: 'Moonshot V1 32K' },
  ],
  __fallback__: [],
}

export const PROVIDER_KEYS = [
  'gemini',
  'openai_compatibility',
  'siliconflow',
  'nvidia',
  'minimax',
  'glm',
  'deepseek',
  'volcengine',
  'modelscope',
  'kimi',
]
