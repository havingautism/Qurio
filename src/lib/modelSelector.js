/**
 * Model selection utility functions
 * Provides intelligent model selection based on task types and user settings
 */

import { TASK_MAPPING, TASK_TYPES } from './taskConfig.js'

/**
 * Get the appropriate model for a given task based on user settings
 *
 * @param {string} taskName - The name of the task (e.g., 'generateTitle', 'streamChatCompletion')
 * @param {Object} settings - User settings object containing model preferences
 * @returns {string} The model name to use for this task
 */
export const getModelForTask = (taskName, settings) => {
  // Determine the task type from our mapping
  const taskType = TASK_MAPPING[taskName] || TASK_MAPPING['__fallback__']

  // Select the appropriate model based on task type
  switch (taskType) {
    case TASK_TYPES.LITE:
      return settings.liteModel
    case TASK_TYPES.DEFAULT:
      return settings.defaultModel
    default:
      // Defensive programming: always return defaultModel as last resort
      return settings.defaultModel
  }
}

/**
 * Check if a task is considered lightweight
 *
 * @param {string} taskName - The name of the task to check
 * @returns {boolean} True if this is a lightweight task
 */
export const isLiteTask = taskName => {
  return TASK_MAPPING[taskName] === TASK_TYPES.LITE
}

/**
 * Get all available task names for debugging and validation
 *
 * @returns {Array<string>} Array of task names
 */
export const getAllTaskNames = () => {
  return Object.keys(TASK_MAPPING).filter(task => task !== '__fallback__')
}
