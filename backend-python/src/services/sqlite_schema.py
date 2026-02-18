"""
SQLite schema for local storage provider.

This is a pragmatic subset of the Supabase schema adapted for SQLite.
JSON/array fields are stored as TEXT (JSON-encoded).
"""

SCHEMA_STATEMENTS: list[str] = [
    """
    CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      emoji TEXT NOT NULL DEFAULT '',
      label TEXT NOT NULL,
      description TEXT,
      is_deep_research INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      is_default INTEGER NOT NULL DEFAULT 0,
      emoji TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      description TEXT,
      prompt TEXT,
      is_deep_research INTEGER NOT NULL DEFAULT 0,
      provider TEXT,
      default_model_provider TEXT,
      lite_model_provider TEXT,
      default_model_source TEXT NOT NULL DEFAULT 'list',
      lite_model_source TEXT NOT NULL DEFAULT 'list',
      use_global_model_settings INTEGER NOT NULL DEFAULT 1,
      lite_model TEXT,
      default_model TEXT,
      response_language TEXT,
      base_tone TEXT,
      traits TEXT,
      warmth TEXT,
      enthusiasm TEXT,
      headings TEXT,
      emojis TEXT,
      custom_instruction TEXT,
      temperature REAL,
      top_p REAL,
      frequency_penalty REAL,
      presence_penalty REAL,
      tool_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      space_id TEXT,
      last_agent_id TEXT,
      agent_selection_mode TEXT NOT NULL DEFAULT 'auto',
      title TEXT NOT NULL DEFAULT 'New Conversation',
      title_emojis TEXT NOT NULL DEFAULT '[]',
      api_provider TEXT NOT NULL DEFAULT 'gemini',
      is_search_enabled INTEGER NOT NULL DEFAULT 0,
      is_thinking_enabled INTEGER NOT NULL DEFAULT 0,
      is_favorited INTEGER NOT NULL DEFAULT 0,
      session_summary TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      agent_id TEXT,
      agent_name TEXT,
      agent_emoji TEXT,
      agent_is_default INTEGER NOT NULL DEFAULT 0,
      thinking_process TEXT,
      tool_calls TEXT,
      tool_call_history TEXT NOT NULL DEFAULT '[]',
      research_step_history TEXT NOT NULL DEFAULT '[]',
      related_questions TEXT,
      sources TEXT,
      document_sources TEXT DEFAULT '[]',
      grounding_supports TEXT,
      stream_blocks TEXT NOT NULL DEFAULT '[]',
      stream_schema_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS conversation_events (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT,
      created_at TEXT NOT NULL
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS space_documents (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      content_text TEXT NOT NULL,
      embedding_provider TEXT,
      embedding_model TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS conversation_documents (
      conversation_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (conversation_id, document_id)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS document_sections (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      external_section_id INTEGER NOT NULL,
      title_path TEXT NOT NULL DEFAULT '[]',
      level INTEGER DEFAULT 0,
      loc TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS document_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      section_id TEXT,
      title_path TEXT NOT NULL DEFAULT '[]',
      external_chunk_id TEXT,
      chunk_index INTEGER,
      content_type TEXT,
      text TEXT NOT NULL,
      token_count INTEGER,
      chunk_hash TEXT,
      loc TEXT,
      source_hint TEXT,
      embedding TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS idx_document_chunks_document_hash
      ON document_chunks(document_id, chunk_hash);
    """,
    """
    CREATE TABLE IF NOT EXISTS space_agents (
      space_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      PRIMARY KEY (space_id, agent_id)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS home_notes (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS home_shortcuts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      icon_type TEXT NOT NULL DEFAULT 'lucide',
      icon_name TEXT,
      icon_url TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS user_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS memory_domains (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      domain_key TEXT NOT NULL,
      aliases TEXT NOT NULL DEFAULT '[]',
      scope TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_domains_user_key
      ON memory_domains(user_id, domain_key);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_memory_domains_updated_at
      ON memory_domains(updated_at DESC);
    """,
    """
    CREATE TABLE IF NOT EXISTS memory_summaries (
      id TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      evidence TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_summaries_domain_id_unique
      ON memory_summaries(domain_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_memory_summaries_updated_at
      ON memory_summaries(updated_at DESC);
    """,
    """
    CREATE TABLE IF NOT EXISTS user_tools (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL DEFAULT 'http',
      config TEXT,
      input_schema TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS pending_form_runs (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL UNIQUE,
      conversation_id TEXT,
      requirements_data TEXT NOT NULL DEFAULT '[]',
      user_id TEXT,
      agent_model TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      submitted_at TEXT,
      expires_at TEXT NOT NULL,
      messages TEXT,
      created_at TEXT NOT NULL
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pending_form_runs_run_id
      ON pending_form_runs(run_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pending_form_runs_expires_at
      ON pending_form_runs(expires_at);
    """,
    """
    INSERT OR IGNORE INTO spaces (
      id, emoji, label, description, is_deep_research, created_at, updated_at
    ) VALUES
      ('space-life', 'HOME', 'Life', 'Daily planning and practical help.', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('space-dev', 'DEV', 'Code Development', 'Software development and debugging.', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('space-travel', 'TRIP', 'Travel', 'Trip planning and destination info.', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('space-entertainment', 'MEDIA', 'Movies & Music', 'Recommendations for films and music.', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('space-study', 'STUDY', 'Learning', 'Study plans and knowledge growth.', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('space-health', 'HEALTH', 'Health', 'Exercise, sleep, and nutrition guidance.', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('space-finance', 'MONEY', 'Finance', 'Budgeting, saving, and risk awareness.', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('space-writing', 'WRITE', 'Writing', 'Drafting, rewriting, and polish.', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('space-career', 'CAREER', 'Career', 'Resume, interview, and job strategy.', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    """,
    """
    INSERT OR IGNORE INTO agents (
      id, is_default, emoji, name, description, prompt, is_deep_research,
      base_tone, traits, warmth, enthusiasm, headings, emojis, tool_ids,
      created_at, updated_at
    ) VALUES
      (
        'agent-life-assistant', 0, 'HOME', 'Life Assistant',
        'Helps with routines, tasks, and daily decisions.',
        'You are a practical life assistant. Give actionable steps, ask for constraints, and keep responses concise and useful.',
        0, 'friendly', 'practical', 'gentle', 'medium', 'structured', 'light',
        '["local_time","web_search","calculator","interactive_form"]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ),
      (
        'agent-code-assistant', 0, 'DEV', 'Code Assistant',
        'Engineering-focused coding and debugging assistant.',
        'You are a senior coding assistant. Clarify requirements, provide correct runnable solutions, and include testing advice.',
        0, 'technical', 'concise', 'direct', 'low', 'structured', 'none',
        '["web_search","json_repair","extract_text","summarize_text"]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ),
      (
        'agent-travel-planner', 0, 'TRIP', 'Travel Planner',
        'Plans routes, schedules, and budgets for trips.',
        'You are a travel planner. Confirm origin, budget, duration, and preferences, then return a clear itinerary with options.',
        0, 'professional', 'detailed', 'supportive', 'medium', 'structured', 'light',
        '["web_search","search_news","search_wikipedia","local_time","interactive_form"]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ),
      (
        'agent-movie-music-curator', 0, 'MEDIA', 'Movie & Music Curator',
        'Curates movie and music recommendations by taste.',
        'You are a recommendation curator. Identify user taste and provide tiered suggestions with short reasons.',
        0, 'creative', 'detailed', 'friendly', 'medium', 'structured', 'expressive',
        '["web_search","search_news","search_wikipedia","duckduckgo_image_search","duckduckgo_video_search"]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ),
      (
        'agent-study-coach', 0, 'STUDY', 'Study Coach',
        'Builds learning plans and review strategies.',
        'You are a study coach. Create phased plans, daily tasks, and review loops based on goals and available time.',
        0, 'professional', 'structured', 'supportive', 'medium', 'structured', 'light',
        '["interactive_form","summarize_text","extract_text","web_search"]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ),
      (
        'agent-health-wellness', 0, 'HEALTH', 'Health Coach',
        'Supports healthy habits and lifestyle routines.',
        'You are a health coach. Focus on habit-level advice for sleep, exercise, and nutrition. Avoid diagnosis and suggest professional care when needed.',
        0, 'calm', 'practical', 'gentle', 'low', 'structured', 'none',
        '["interactive_form","local_time","calculator","web_search"]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ),
      (
        'agent-finance-planner', 0, 'MONEY', 'Finance Planner',
        'Helps with budget, savings, and spending decisions.',
        'You are a finance planner. Ask for cashflow context and provide conservative, practical allocation suggestions.',
        0, 'professional', 'analytical', 'neutral', 'low', 'structured', 'none',
        '["interactive_form","calculator","summarize_text","search_news"]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ),
      (
        'agent-writing-assistant', 0, 'WRITE', 'Writing Assistant',
        'Improves drafts, structure, and tone.',
        'You are a writing assistant. Clarify audience and style, then provide strong structure and polished alternatives.',
        0, 'friendly', 'detailed', 'gentle', 'medium', 'structured', 'light',
        '["interactive_form","summarize_text","extract_text","json_repair"]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ),
      (
        'agent-career-coach', 0, 'CAREER', 'Career Coach',
        'Supports resume quality and interview preparation.',
        'You are a career coach. Provide concrete resume edits, interview prep questions, and role-fit guidance.',
        0, 'professional', 'direct', 'supportive', 'medium', 'structured', 'light',
        '["interactive_form","web_search","summarize_text","extract_text"]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      );
    """,
    """
    INSERT OR IGNORE INTO space_agents (
      space_id, agent_id, sort_order, is_primary, created_at
    ) VALUES
      ('space-life', 'agent-life-assistant', 0, 1, CURRENT_TIMESTAMP),
      ('space-dev', 'agent-code-assistant', 0, 1, CURRENT_TIMESTAMP),
      ('space-travel', 'agent-travel-planner', 0, 1, CURRENT_TIMESTAMP),
      ('space-entertainment', 'agent-movie-music-curator', 0, 1, CURRENT_TIMESTAMP),
      ('space-study', 'agent-study-coach', 0, 1, CURRENT_TIMESTAMP),
      ('space-health', 'agent-health-wellness', 0, 1, CURRENT_TIMESTAMP),
      ('space-finance', 'agent-finance-planner', 0, 1, CURRENT_TIMESTAMP),
      ('space-writing', 'agent-writing-assistant', 0, 1, CURRENT_TIMESTAMP),
      ('space-career', 'agent-career-coach', 0, 1, CURRENT_TIMESTAMP);
    """,
]
