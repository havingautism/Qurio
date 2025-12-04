import { getSupabaseClient } from "./supabase";

const table = "conversations";

export const listConversations = async (limit = 50) => {
  const supabase = getSupabaseClient();
  if (!supabase)
    return { data: [], error: new Error("Supabase not configured") };

  const { data, error } = await supabase
    .from(table)
    .select(
      "id,title,created_at,space_id,api_provider,is_favorited"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  return { data: data || [], error };
};

export const getConversation = async (id) => {
  const supabase = getSupabaseClient();
  if (!supabase)
    return { data: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase
    .from(table)
    .select("id,title,created_at,space_id,api_provider,is_favorited")
    .eq("id", id)
    .single();
  return { data, error };
};

export const createConversation = async (payload) => {
  const supabase = getSupabaseClient();
  if (!supabase)
    return { data: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase
    .from(table)
    .insert([payload])
    .select()
    .single();
  return { data, error };
};

export const listConversationsBySpace = async (spaceId, limit = 50) => {
  const supabase = getSupabaseClient();
  if (!supabase)
    return { data: [], error: new Error("Supabase not configured") };
  const { data, error } = await supabase
    .from(table)
    .select("id,title,created_at,space_id,is_favorited")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return { data: data || [], error };
};

export const listMessages = async (conversationId) => {
  const supabase = getSupabaseClient();
  if (!supabase)
    return { data: [], error: new Error("Supabase not configured") };
  const { data, error } = await supabase
    .from("conversation_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return { data: data || [], error };
};

export const updateConversation = async (id, payload) => {
  const supabase = getSupabaseClient();
  if (!supabase)
    return { data: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase
    .from(table)
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  return { data, error };
};

export const addMessage = async (message) => {
  const supabase = getSupabaseClient();
  if (!supabase)
    return { data: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase
    .from("conversation_messages")
    .insert([message])
    .select()
    .single();
  return { data, error };
};

export const toggleFavorite = async (id, isFavorited) => {
  const supabase = getSupabaseClient();
  if (!supabase)
    return { data: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase
    .from(table)
    .update({ is_favorited: isFavorited })
    .eq("id", id)
    .select()
    .single();
  return { data, error };
};
