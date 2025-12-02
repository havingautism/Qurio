/**
 * Centralized Settings Management
 *
 * Handles loading and saving of application configuration including:
 * - Supabase credentials
 * - OpenAI compatibility settings
 */

/**
 * Load settings from various sources (Env -> LocalStorage -> Args)
 * @param {Object} [overrides={}] - Optional overrides
 * @returns {Object} The consolidated settings object
 */
export const loadSettings = (overrides = {}) => {
  // Supabase Env Vars
  const envSupabaseUrl =
    import.meta.env.PUBLIC_SUPABASE_URL 
  const envSupabaseKey =
    import.meta.env.PUBLIC_SUPABASE_KEY 

  // OpenAI Env Vars
  const envOpenAIKey =
    import.meta.env.PUBLIC_OPENAI_API_KEY
  const envOpenAIBaseUrl =
    import.meta.env.PUBLIC_OPENAI_BASE_URL 

  // LocalStorage
  const localSupabaseUrl = localStorage.getItem("supabaseUrl");
  const localSupabaseKey = localStorage.getItem("supabaseKey");
  const localOpenAIKey = localStorage.getItem("OpenAICompatibilityKey");
  const localOpenAIUrl = localStorage.getItem("OpenAICompatibilityUrl");

  // Model configuration
  const localLiteModel = localStorage.getItem("liteModel");
  const localDefaultModel = localStorage.getItem("defaultModel");

  return {
    // Supabase
    supabaseUrl:
      envSupabaseUrl ||
      import.meta.env.VITE_SUPABASE_URL ||
      localSupabaseUrl ||
      overrides.supabaseUrl ||
      "",
    supabaseKey:
      envSupabaseKey ||
      import.meta.env.VITE_SUPABASE_KEY ||
      localSupabaseKey ||
      overrides.supabaseKey ||
      "",

    // OpenAI
    OpenAICompatibilityKey:
      envOpenAIKey ||
      import.meta.env.VITE_OPENAI_API_KEY ||
      localOpenAIKey ||
      overrides.OpenAICompatibilityKey ||
      "",
    OpenAICompatibilityUrl:
      envOpenAIBaseUrl ||
      import.meta.env.VITE_OPENAI_BASE_URL ||
      localOpenAIUrl ||
      overrides.OpenAICompatibilityUrl ||
      "",
    
    // API Provider
    apiProvider: localStorage.getItem("apiProvider") || overrides.apiProvider || "gemini",
    googleApiKey:
      import.meta.env.PUBLIC_GOOGLE_API_KEY ||
      import.meta.env.VITE_GOOGLE_API_KEY ||
      localStorage.getItem("googleApiKey") ||
      overrides.googleApiKey ||
      "",

    // Model configuration
    liteModel: localLiteModel || overrides.liteModel || "gemini-2.5-flash",
    defaultModel: localDefaultModel || overrides.defaultModel || "gemini-2.5-flash",

    ...overrides,
  };
};

/**
 * Save user settings to LocalStorage
 *
 * @param {Object} settings - The settings object.
 */
export const saveSettings = async (settings) => {
  if (settings.supabaseUrl !== undefined) {
    localStorage.setItem("supabaseUrl", settings.supabaseUrl);
  }
  if (settings.supabaseKey !== undefined) {
    localStorage.setItem("supabaseKey", settings.supabaseKey);
  }
  if (settings.OpenAICompatibilityKey !== undefined) {
    localStorage.setItem(
      "OpenAICompatibilityKey",
      settings.OpenAICompatibilityKey
    );
  }
  if (settings.OpenAICompatibilityUrl !== undefined) {
    localStorage.setItem(
      "OpenAICompatibilityUrl",
      settings.OpenAICompatibilityUrl
    );
  }
  if (settings.apiProvider !== undefined) {
    localStorage.setItem("apiProvider", settings.apiProvider);
  }
  if (settings.googleApiKey !== undefined) {
    localStorage.setItem("googleApiKey", settings.googleApiKey);
  }
  // Save model configuration
  if (settings.liteModel !== undefined) {
    localStorage.setItem("liteModel", settings.liteModel);
  }
  if (settings.defaultModel !== undefined) {
    localStorage.setItem("defaultModel", settings.defaultModel);
  }

  window.dispatchEvent(new Event('settings-changed'));
  console.log("Settings saved:", settings);
};
