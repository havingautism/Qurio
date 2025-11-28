/**
 * Supabase Service Stub
 *
 * This file will handle all interactions with Supabase for data persistence.
 * It assumes a schema for:
 * - Users (handled by Auth)
 * - Settings (API keys, preferences)
 * - Spaces
 * - Conversations (Threads)
 * - Messages
 */

import { createClient } from "@supabase/supabase-js";
import { loadSettings } from "./settings";

export { loadSettings, saveSettings } from "./settings";

/**
 * Initialize Supabase client
 * @param {string} supabaseUrl
 * @param {string} supabaseKey
 */
export const initSupabase = (supabaseUrl, supabaseKey) => {
  const settings = loadSettings({ supabaseUrl, supabaseKey });

  if (settings.supabaseUrl && settings.supabaseKey) {
    return createClient(settings.supabaseUrl, settings.supabaseKey);
  }
  return null;
};

/**
 * Save a new message to the database.
 *
 * @param {string} conversationId - The ID of the conversation.
 * @param {Object} message - The message object (role, content, etc.).
 */
export const saveMessage = async (conversationId, message) => {
  // TODO: Insert message into 'messages' table linked to conversationId
  console.log("Saving message:", message, "to conversation:", conversationId);
};

/**
 * Fetch conversation history.
 *
 * @param {string} conversationId - The ID of the conversation.
 * @returns {Promise<Array>} List of messages.
 */
export const getHistory = async (conversationId) => {
  // TODO: Select * from 'messages' where conversation_id = conversationId
  return [];
};

/**
 * Create a new conversation (thread).
 *
 * @param {string} title - The title of the conversation.
 * @param {string} spaceId - Optional space ID to link to.
 * @returns {Promise<string>} The new conversation ID.
 */
export const createConversation = async (title, spaceId) => {
  // TODO: Insert into 'conversations' table
  return "new_conversation_id";
};
