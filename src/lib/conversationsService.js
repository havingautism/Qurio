import { getSupabaseClient } from "./supabase";

const table = "conversations";

export const listConversations = async (options = {}) => {
  const {
    limit = 10,
    cursor = null,
    sortBy = "created_at",
    ascending = false,
  } = options;
  const supabase = getSupabaseClient();
  if (!supabase)
    return {
      data: [],
      error: new Error("Supabase not configured"),
      nextCursor: null,
      hasMore: false,
    };

  // Build query with cursor support
  let query = supabase
    .from(table)
    .select("id,title,created_at,space_id,api_provider,is_favorited")
    .order(sortBy, { ascending })
    .limit(limit);

  // Apply cursor filter based on sort direction
  if (cursor) {
    if (sortBy === "created_at") {
      // For created_at sorting
      if (ascending) {
        query = query.gt("created_at", cursor);
      } else {
        query = query.lt("created_at", cursor);
      }
    } else if (sortBy === "title") {
      // For title sorting
      if (ascending) {
        query = query.gt("title", cursor);
      } else {
        query = query.lt("title", cursor);
      }
    }
  }

  const { data, error } = await query;

  // Determine next cursor and if there's more data
  const hasMore = data && data.length === limit;
  const nextCursor =
    hasMore && data.length > 0 ? data[data.length - 1][sortBy] : null;

  return {
    data: data || [],
    error,
    nextCursor,
    hasMore,
  };
};

export const listBookmarkedConversations = async (options = {}) => {
  const {
    limit = 10,
    cursor = null,
    sortBy = "created_at",
    ascending = false,
  } = options;
  const supabase = getSupabaseClient();
  if (!supabase)
    return {
      data: [],
      error: new Error("Supabase not configured"),
      nextCursor: null,
      hasMore: false,
    };

  // Build query with cursor support and is_favorited filter
  let query = supabase
    .from(table)
    .select("id,title,created_at,space_id,api_provider,is_favorited")
    .eq("is_favorited", true)
    .order(sortBy, { ascending })
    .limit(limit);

  // Apply cursor filter based on sort direction
  if (cursor) {
    if (sortBy === "created_at") {
      // For created_at sorting
      if (ascending) {
        query = query.gt("created_at", cursor);
      } else {
        query = query.lt("created_at", cursor);
      }
    } else if (sortBy === "title") {
      // For title sorting
      if (ascending) {
        query = query.gt("title", cursor);
      } else {
        query = query.lt("title", cursor);
      }
    }
  }

  const { data, error } = await query;

  // Determine next cursor and if there's more data
  const hasMore = data && data.length === limit;
  const nextCursor =
    hasMore && data.length > 0 ? data[data.length - 1][sortBy] : null;

  return {
    data: data || [],
    error,
    nextCursor,
    hasMore,
  };
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

export const listConversationsBySpace = async (spaceId, options = {}) => {
  const { limit = 10, cursor = null } = options;
  const supabase = getSupabaseClient();
  if (!supabase)
    return {
      data: [],
      error: new Error("Supabase not configured"),
      nextCursor: null,
      hasMore: false,
    };

  // Build query with cursor support
  // Uses composite index: idx_conversations_space_created (space_id, created_at DESC)
  let query = supabase
    .from(table)
    .select("id,title,created_at,space_id,is_favorited")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  // Apply cursor filter for pagination
  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;

  // Determine next cursor and if there's more data
  const hasMore = data && data.length === limit;
  const nextCursor =
    hasMore && data.length > 0 ? data[data.length - 1].created_at : null;

  return {
    data: data || [],
    error,
    nextCursor,
    hasMore,
  };
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
