/**
 * Retry Service - Error classification and retry logic for research steps
 *
 * This service provides:
 * - Error classification (permanent vs temporary)
 * - Retry policy decisions
 * - Exponential backoff calculation
 * - Test mode for simulating failures
 *
 * Evolution path:
 * - Current: Rule-based retry decisions
 * - Future: Lite LLM makes retry/continue/rollback decisions
 */

// ============================================================================
// Error Classification Matrix
// ============================================================================

/**
 * Error type definitions and their retry policies
 *
 * permanent: Never retry (auth errors, invalid input, etc.)
 * temporary: Retry with backoff (network, timeout, rate limit, etc.)
 * unknown: Conservative retry (retry once)
 */
const ERROR_CLASSIFICATION = {
  // Permanent errors - DO NOT retry
  permanent: {
    patterns: [
      /invalid.*apikey/i,
      /invalid.*key/i,
      /authentication/i,
      /unauthorized/i,
      /permission.*denied/i,
      /forbidden/i,
      /401/,
      /403/,
    ],
    retriable: false,
    maxRetries: 0,
    reason: 'permanent',
  },

  // Temporary network errors - SHOULD retry
  network: {
    patterns: [
      /ECONNRESET/i,
      /ENOTFOUND/i,
      /ECONNREFUSED/i,
      /EPIPE/i,
      /network.*error/i,
      /fetch.*failed/i,
      /connection.*reset/i,
    ],
    retriable: true,
    maxRetries: 3,
    priority: 'high',
    reason: 'network',
  },

  // Timeout errors - SHOULD retry
  timeout: {
    patterns: [/ETIMEDOUT/i, /timeout/i, /timed.*out/i],
    retriable: true,
    maxRetries: 2,
    priority: 'medium',
    reason: 'timeout',
  },

  // Rate limiting - SHOULD retry with longer delay
  rate_limit: {
    patterns: [/rate.*limit/i, /429/i, /too.*many.*requests/i],
    retriable: true,
    maxRetries: 3,
    priority: 'high',
    longDelay: true,
    reason: 'rate_limit',
  },

  // Search/API failures - SHOULD retry
  search_failed: {
    patterns: [/search.*failed/i, /no.*results/i, /empty.*result/i, /api.*error/i],
    retriable: true,
    maxRetries: 2,
    priority: 'medium',
    reason: 'search_failed',
  },

  // Server errors - SHOULD retry
  server_error: {
    patterns: [/500/i, /502/i, /503/i, /504/i, /service.*unavailable/i],
    retriable: true,
    maxRetries: 2,
    priority: 'medium',
    reason: 'server_error',
  },
}

// ============================================================================
// Retry Policy Configuration
// ============================================================================

/**
 * Default retry policy
 *
 * maxRetries: Maximum number of retry attempts (excluding initial attempt)
 * baseDelay: Initial delay in milliseconds
 * maxDelay: Maximum delay cap
 * backoffMultiplier: Exponential backoff multiplier (2 = doubling)
 */
const DEFAULT_RETRY_POLICY = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 8000, // 8 seconds
  backoffMultiplier: 2,
}

/**
 * Special policies for specific error types
 */
const ERROR_SPECIFIC_POLICIES = {
  rate_limit: {
    maxRetries: 3,
    baseDelay: 5000, // 5 seconds - longer for rate limits
    maxDelay: 30000, // 30 seconds
    backoffMultiplier: 2,
  },
  timeout: {
    maxRetries: 2,
    baseDelay: 2000, // 2 seconds
    maxDelay: 6000, // 6 seconds
    backoffMultiplier: 1.5,
  },
}

// ============================================================================
// Error Classification Functions
// ============================================================================

/**
 * Classify an error into a type category
 *
 * @param {Error} error - The error to classify
 * @returns {Object} - Error classification with type, retriable, maxRetries, reason
 *
 * @example
 * const errorInfo = classifyError(new Error('ECONNRESET'))
 * // Returns: { type: 'network', retriable: true, maxRetries: 3, reason: 'network' }
 */
export const classifyError = (error) => {
  const errorMessage = error?.message || String(error)

  // Check permanent errors first (these have priority)
  const permanentPatterns = ERROR_CLASSIFICATION.permanent.patterns
  for (const pattern of permanentPatterns) {
    if (pattern.test(errorMessage)) {
      return {
        type: 'permanent',
        retriable: false,
        maxRetries: 0,
        reason: 'permanent',
        message: errorMessage,
      }
    }
  }

  // Check temporary error types
  const temporaryTypes = ['network', 'timeout', 'rate_limit', 'search_failed', 'server_error']
  for (const type of temporaryTypes) {
    const config = ERROR_CLASSIFICATION[type]
    if (!config) continue

    for (const pattern of config.patterns) {
      if (pattern.test(errorMessage)) {
        return {
          type,
          retriable: config.retriable,
          maxRetries: config.maxRetries,
          reason: config.reason,
          priority: config.priority,
          longDelay: config.longDelay,
          message: errorMessage,
        }
      }
    }
  }

  // Unknown error - conservative retry (once)
  return {
    type: 'unknown',
    retriable: true,
    maxRetries: 1,
    reason: 'unknown',
    message: errorMessage,
  }
}

// ============================================================================
// Retry Decision Functions
// ============================================================================

/**
 * Determine if a step should be retried based on error and attempt count
 *
 * @param {Object} errorInfo - Error classification from classifyError()
 * @param {Object} stepState - Current step state
 * @param {Object} policy - Retry policy to apply
 * @returns {Object} - Decision object with shouldRetry boolean and reason
 *
 * @example
 * const decision = shouldRetry(errorInfo, { attempts: 1 }, policy)
 * // Returns: { shouldRetry: true, reason: 'network_error' }
 */
export const shouldRetry = (errorInfo, stepState, policy = DEFAULT_RETRY_POLICY) => {
  // Non-retriable errors
  if (!errorInfo.retriable) {
    return {
      shouldRetry: false,
      reason: `non_retriable_${errorInfo.type}`,
    }
  }

  // Check if we've exceeded max retries
  // Note: stepState.attempts includes the initial attempt
  // So if attempts = 1 (initial failed), we can still retry maxRetries times
  const currentRetries = stepState.attempts - 1 // Subtract initial attempt
  const effectiveMaxRetries = errorInfo.maxRetries || policy.maxRetries

  if (currentRetries >= effectiveMaxRetries) {
    return {
      shouldRetry: false,
      reason: 'max_retries_exceeded',
    }
  }

  return {
    shouldRetry: true,
    reason: errorInfo.reason,
  }
}

// ============================================================================
// Backoff Calculation
// ============================================================================

/**
 * Calculate exponential backoff delay for next retry
 *
 * @param {number} attemptNumber - The attempt number (1-based)
 * @param {Object} policy - Retry policy
 * @returns {number} - Delay in milliseconds
 *
 * @example
 * calculateBackoff(1, DEFAULT_RETRY_POLICY) // Returns: 1000
 * calculateBackoff(2, DEFAULT_RETRY_POLICY) // Returns: 2000
 * calculateBackoff(3, DEFAULT_RETRY_POLICY) // Returns: 4000
 */
export const calculateBackoff = (attemptNumber, policy = DEFAULT_RETRY_POLICY) => {
  // attemptNumber is 1-based (first retry = 1)
  const delay = policy.baseDelay * Math.pow(policy.backoffMultiplier, attemptNumber - 1)
  return Math.min(delay, policy.maxDelay)
}

/**
 * Get retry policy for a specific error type
 *
 * @param {string} errorType - Error type from classifyError()
 * @returns {Object} - Retry policy for this error type
 */
export const getRetryPolicy = (errorType) => {
  return ERROR_SPECIFIC_POLICIES[errorType] || DEFAULT_RETRY_POLICY
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Promise-based delay function
 *
 * @param {number} ms - Delay in milliseconds
 * @returns {Promise<void>}
 *
 * @example
 * await delay(2000) // Waits 2 seconds
 */
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ============================================================================
// Test Mode Support
// ============================================================================

/**
 * Create a test error for simulating failures
 *
 * @param {string} errorType - Type of error to simulate
 * @returns {Error} - Test error object
 *
 * @example
 * throw createTestError('network')
 */
export const createTestError = (errorType = 'network') => {
  const testErrors = {
    network: new Error('ECONNRESET: Simulated network failure'),
    timeout: new Error('ETIMEDOUT: Simulated timeout'),
    api_error: new Error('API error: Simulated API failure'),
    empty_result: new Error('No results: Simulated empty search result'),
    rate_limit: new Error('429: Too many requests - rate limit exceeded'),
    invalid_auth: new Error('401: Invalid API key - authentication failed'),
  }

  return testErrors[errorType] || testErrors.network
}

/**
 * Determine if a failure should be injected based on test config
 *
 * @param {number} stepIndex - Current step index
 * @param {number} attemptNumber - Current attempt number (1-based, includes initial attempt)
 * @param {Object} testConfig - Test configuration object
 * @returns {boolean} - True if failure should be injected
 *
 * @example
 * // failAttempts: 1 = succeed on 1st retry (attempt 2)
 * shouldInjectFailure(1, 1, { failAtStep: 1, failAttempts: 1 }) // Returns: true (fail)
 * shouldInjectFailure(1, 2, { failAtStep: 1, failAttempts: 1 }) // Returns: false (succeed)
 *
 * // failAttempts: 2 = succeed on 2nd retry (attempt 3)
 * shouldInjectFailure(1, 1, { failAtStep: 1, failAttempts: 2 }) // Returns: true (fail)
 * shouldInjectFailure(1, 2, { failAtStep: 1, failAttempts: 2 }) // Returns: true (fail)
 * shouldInjectFailure(1, 3, { failAtStep: 1, failAttempts: 2 }) // Returns: false (succeed)
 */
export const shouldInjectFailure = (stepIndex, attemptNumber, testConfig) => {
  if (!testConfig?.enabled) return false

  // Check if this step should fail
  if (testConfig.failAtStep !== undefined && testConfig.failAtStep !== stepIndex) {
    return false
  }

  // Check if this attempt should fail
  // failAttempts = which retry attempt will succeed (1-based)
  // So if failAttempts = 2, attempt 1 fails, attempt 2 fails, attempt 3 succeeds (on 2nd retry)
  // In general: failAttempts = X means first X attempts fail, succeed on attempt X+1
  if (testConfig.failAttempts !== undefined) {
    return attemptNumber <= testConfig.failAttempts
  }

  // If no failAttempts specified, always fail
  return true
}

// ============================================================================
// Status Message Helpers (for UI)
// ============================================================================

/**
 * Generate user-friendly retry message
 *
 * @param {Object} params - Retry parameters
 * @param {number} params.attempt - Current attempt number (1-based)
 * @param {number} params.maxAttempts - Maximum number of attempts
 * @param {string} params.errorType - Type of error that occurred
 * @returns {string} - User-friendly message
 *
 * @example
 * getRetryMessage({ attempt: 1, maxAttempts: 3, errorType: 'network' })
 * // Returns: "Network issue, retrying (1/3)..."
 */
export const getRetryMessage = ({ attempt, maxAttempts, errorType }) => {
  const messages = {
    network: 'Network issue, retrying',
    timeout: 'Request timeout, retrying',
    rate_limit: 'API rate limited, waiting to retry',
    search_failed: 'Search failed, retrying',
    server_error: 'Service temporarily unavailable, retrying',
    unknown: 'Encountered an issue, retrying',
  }

  const baseMessage = messages[errorType] || messages.unknown
  return `${baseMessage} (${attempt}/${maxAttempts})...`
}

// ============================================================================
// Step ID Generation (Code-based, Stable & Predictable)
// ============================================================================

/**
 * Convert text to URL-safe slug format
 * - Convert to lowercase
 * - Replace spaces and special chars with hyphens
 * - Remove consecutive hyphens
 * - Trim hyphens from ends
 *
 * @param {string} text - Text to slugify
 * @returns {string} - Slugified text
 *
 * @example
 * slugify('Search for Background Info')
 * // Returns: 'search-for-background-info'
 *
 * slugify('Define search strategy')
 * // Returns: 'define-search-strategy'
 */
const slugify = (text) => {
  if (!text) return 'unknown'

  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars except word, space, hyphen
    .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, '') // Trim hyphens from start and end
}

/**
 * Generate a stable, predictable step ID
 *
 * Format: `step_{index}_{slugified_action}`
 *
 * This ID is:
 * - Stable: Same action always produces same slug
 * - Predictable: Can be generated deterministically
 * - Human-readable: Contains action description
 * - Sortable: Prefix with index maintains order
 *
 * @param {number} index - Step index (0-based)
 * @param {string} action - Step action description
 * @returns {string} - Generated step ID
 *
 * @example
 * generateStepId(0, 'Search for background information')
 * // Returns: 'step_0_search-for-background-information'
 *
 * generateStepId(1, 'Analyze key findings')
 * // Returns: 'step_1_analyze-key-findings'
 *
 * generateStepId(2, 'Summarize conclusions')
 * // Returns: 'step_2_summarize-conclusions'
 */
export const generateStepId = (index, action) => {
  const slug = slugify(action || 'unknown')
  return `step_${index}_${slug}`
}

/**
 * Ensure all steps in a plan have stable IDs
 * If steps already have IDs, keep them. Otherwise, generate new ones.
 *
 * @param {Array} steps - Array of step objects
 * @returns {Array} - Steps with guaranteed IDs
 *
 * @example
 * const steps = [
 *   { action: 'Search background' },
 *   { id: 'custom_id', action: 'Analyze' }
 * ]
 * ensureStepIds(steps)
 * // Returns:
 * // [
 * //   { id: 'step_0_search-background', action: 'Search background' },
 * //   { id: 'custom_id', action: 'Analyze' }
 * // ]
 */
export const ensureStepIds = (steps) => {
  if (!Array.isArray(steps)) return []

  return steps.map((step, index) => {
    // Keep existing ID if present
    if (step.id) return step

    // Generate new ID for steps without one
    const newId = generateStepId(index, step.action || step.thought || '')
    return { ...step, id: newId }
  })
}
