/**
 * Supabase Service (spaces-first)
 *
 * This module encapsulates Supabase access with a small, readable API for
 * spaces and chat artifacts. It assumes the schema defined in supabase/init.sql:
 * - spaces
 * - conversations
 * - conversation_messages
 * - conversation_events
 * - attachments
 *
 * NOTE: The app is local-first and single-user, so no user/owner columns are
 * modeled here. Credentials are read from settings (env/localStorage).
 */

import { createClient } from "@supabase/supabase-js";
import { loadSettings } from "./settings";
export { loadSettings, saveSettings } from "./settings";

let supabaseClient = null;

/**
 * Initialize Supabase client from explicit args or stored settings.
 */
export const initSupabase = (supabaseUrl, supabaseKey) => {
  const settings = loadSettings({ supabaseUrl, supabaseKey });
  if (!settings.supabaseUrl || !settings.supabaseKey) return null;

  supabaseClient = createClient(settings.supabaseUrl, settings.supabaseKey);
  return supabaseClient;
};

/**
 * Get a cached client; initialize from settings if needed.
 */
export const getSupabaseClient = () => {
  if (supabaseClient) return supabaseClient;
  const settings = loadSettings();
  if (!settings.supabaseUrl || !settings.supabaseKey) return null;
  supabaseClient = createClient(settings.supabaseUrl, settings.supabaseKey);
  return supabaseClient;
};

/**
 * Quick connectivity/table existence check.
 */
export const testConnection = async (supabaseUrl, supabaseKey) => {
  try {
    const supabase = initSupabase(supabaseUrl, supabaseKey);
    if (!supabase) {
      return {
        success: false,
        connection: false,
        message: "Unable to initialize Supabase client. Check credentials.",
        tables: {},
      };
    }

    const tables = ["spaces", "conversations", "conversation_messages"];
    const results = {};
    for (const table of tables) {
      const { error } = await supabase.from(table).select("id").limit(1);
      results[table] = !error;
    }

    const allTablesExist = Object.values(results).every(Boolean);
    const missing = Object.entries(results)
      .filter(([, ok]) => !ok)
      .map(([name]) => name);

    return {
      success: allTablesExist,
      connection: true,
      tables: results,
      message: allTablesExist
        ? "Connection successful; required tables are present."
        : `Connection OK, but missing tables: ${missing.join(", ")}. Run supabase/init.sql.`,
    };
  } catch (error) {
    return {
      success: false,
      connection: false,
      message: `Connection failed: ${error.message}`,
      tables: {},
    };
  }
};

// ---------------------------------------------------------------------------
// Spaces CRUD
// ---------------------------------------------------------------------------

const spacesTable = "spaces";

export const fetchSpaces = async () => {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: [], error: new Error("Supabase not configured") };

  const { data, error } = await supabase
    .from(spacesTable)
    .select("*")
    .order("created_at", { ascending: true });

  return { data: data || [], error };
};

export const createSpace = async ({ emoji = "", label, description = "", prompt = "" }) => {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  if (!label) return { data: null, error: new Error("Label is required") };

  const { data, error } = await supabase
    .from(spacesTable)
    .insert([{ emoji, label, description, prompt }])
    .select()
    .single();

  return { data, error };
};

export const updateSpace = async (id, { emoji, label, description, prompt }) => {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  if (!id) return { data: null, error: new Error("Space id is required") };

  const updatePayload = {};
  if (emoji !== undefined) updatePayload.emoji = emoji;
  if (label !== undefined) updatePayload.label = label;
  if (description !== undefined) updatePayload.description = description;
  if (prompt !== undefined) updatePayload.prompt = prompt;

  const { data, error } = await supabase
    .from(spacesTable)
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  return { data, error };
};

export const deleteSpace = async (id) => {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, error: new Error("Supabase not configured") };
  if (!id) return { success: false, error: new Error("Space id is required") };

  const { error } = await supabase.from(spacesTable).delete().eq("id", id);
  return { success: !error, error };
};

// ---------------------------------------------------------------------------
// Conversation stubs (to be fleshed out alongside UI wiring)
// ---------------------------------------------------------------------------

export const createConversation = async (payload) => {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase
    .from("conversations")
    .insert([payload])
    .select()
    .single();
  return { data, error };
};

export const saveMessage = async (message) => {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase
    .from("conversation_messages")
    .insert([message])
    .select()
    .single();
  return { data, error };
};

export const getHistory = async (conversationId) => {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: [], error: new Error("Supabase not configured") };
  const { data, error } = await supabase
    .from("conversation_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return { data: data || [], error };
};
