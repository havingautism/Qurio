/**
 * Task configuration for model selection
 * Defines which tasks should use lite models vs default models
 */

// Task type constants for model selection
export const TASK_TYPES = {
  LITE: 'lite', // Lightweight tasks (title generation, related questions, etc.)
  DEFAULT: 'default', // Main conversation tasks
}

// Task mapping to model types
// Maps specific function names to the appropriate model type
export const TASK_MAPPING = {
  // Lightweight tasks - use liteModel
  generateTitle: TASK_TYPES.LITE,
  generateRelatedQuestions: TASK_TYPES.LITE,
  generateTitleAndSpace: TASK_TYPES.LITE,
  generateResearchPlan: TASK_TYPES.LITE,

  // Main conversation tasks - use defaultModel
  streamChatCompletion: TASK_TYPES.DEFAULT,

  // Safety fallback - any unmapped tasks use default model
  __fallback__: TASK_TYPES.DEFAULT,
}

// List of lightweight task names for validation and debugging
export const LITE_TASKS = Object.keys(TASK_MAPPING).filter(
  task => TASK_MAPPING[task] === TASK_TYPES.LITE,
)
