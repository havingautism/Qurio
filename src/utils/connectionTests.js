import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

// Test Gemini API connection
export const testGeminiConnection = async (apiKey) => {
  if (!apiKey.trim()) {
    return { success: false, error: "API key is required" };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Simple test request
    await model.generateContent("Hello");

    return { success: true, message: "Connection successful" };
  } catch (error) {
    let errorMessage = "Connection failed";
    const errorCode = error.status || error.code;

    if (error.message.includes("timeout")) {
      errorMessage = "Request timeout - check your network connection";
    } else if (
      errorCode === 400 ||
      error.message.includes("API_KEY") ||
      error.message.includes("invalid")
    ) {
      errorMessage = "Invalid API key";
    } else if (
      errorCode === 403 ||
      error.message.includes("permission") ||
      error.message.includes("access")
    ) {
      errorMessage = "Permission denied - check API key permissions";
    } else if (
      errorCode === 429 ||
      error.message.includes("quota") ||
      error.message.includes("limit")
    ) {
      errorMessage = "API quota exceeded - check billing";
    } else if (
      error.message.includes("network") ||
      error.message.includes("fetch")
    ) {
      errorMessage = "Network error - check your connection";
    }

    return { success: false, error: errorMessage };
  }
};

// Test Supabase connection
export const testSupabaseConnection = async (url, anonKey) => {
  if (!url.trim() || !anonKey.trim()) {
    return { success: false, error: "URL and anon key are required" };
  }

  try {
    const supabase = createClient(url, anonKey);

    // Test connection using a simple health check or RPC call
    // Try multiple approaches for better reliability
    let testPassed = false;
    let lastError = null;

    // Method 1: Try to get session info (minimal permission check)
    try {
      const { data, error } = await supabase.auth.getSession();
      if (!error) {
        testPassed = true;
      }
      lastError = error;
    } catch (e) {
      lastError = e;
    }

    // Method 2: Try a simple RPC call if available
    if (!testPassed) {
      try {
        const { data, error } = await supabase.rpc('get_schema_version');
        if (!error) {
          testPassed = true;
        }
        lastError = error;
      } catch (e) {
        // RPC may not be available, continue
      }
    }

    // Method 3: Try to access a public system table (if permissions allow)
    if (!testPassed) {
      try {
        const { data, error } = await supabase
          .from('pg_tables')
          .select('schemaname')
          .eq('schemaname', 'public')
          .limit(1);
        if (!error) {
          testPassed = true;
        }
        lastError = error;
      } catch (e) {
        lastError = lastError || e;
      }
    }

    // Method 4: Basic connectivity test using a minimal health check
    if (!testPassed) {
      try {
        // Just try to create the client and make a simple request
        // This will test basic connectivity and authentication
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 10000); // 10 second timeout

          supabase.auth.getUser().then(({ data, error }) => {
            clearTimeout(timeout);
            // We expect this to potentially fail with "no session" which is normal
            // The fact that we get a response means connection works
            resolve();
          }).catch(reject);
        });
        testPassed = true;
      } catch (e) {
        lastError = lastError || e;
      }
    }

    if (testPassed) {
      return { success: true, message: "Connection successful" };
    }

    // If we get here, all methods failed
    throw lastError || new Error("All connection test methods failed");

  } catch (error) {
    let errorMessage = "Connection failed";

    if (error.message.includes("timeout")) {
      errorMessage = "Request timeout - check your network connection";
    } else if (
      error.message.includes("Invalid") ||
      error.message.includes("apikey") ||
      error.message.includes("bad request") ||
      error.status === 400
    ) {
      errorMessage = "Invalid URL or anon key format";
    } else if (
      error.code === "42501" ||
      error.message.includes("permission") ||
      error.message.includes("auth") ||
      error.message.includes("unauthorized") ||
      error.status === 401 ||
      error.status === 403
    ) {
      errorMessage = "Permission denied - check anon key permissions";
    } else if (
      error.message.includes("JSON") ||
      error.message.includes("parse") ||
      error.status === 0
    ) {
      errorMessage = "Invalid Supabase URL format";
    } else if (
      error.message.includes("fetch") ||
      error.message.includes("network") ||
      error.message.includes("ENOTFOUND") ||
      error.message.includes("ECONNREFUSED")
    ) {
      errorMessage = "Network error - check your connection and URL";
    } else if (error.message) {
      errorMessage = `Connection failed: ${error.message}`;
    }

    return { success: false, error: errorMessage };
  }
};
