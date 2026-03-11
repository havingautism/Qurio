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
      is_hidden INTEGER NOT NULL DEFAULT 0,
      emoji TEXT NOT NULL DEFAULT '',
      avatar_type TEXT NOT NULL DEFAULT 'emoji',
      avatar_image TEXT,
      avatar_shape TEXT NOT NULL DEFAULT 'circle',
      banner_mode TEXT NOT NULL DEFAULT 'none',
      banner_image TEXT,
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
      skill_ids TEXT NOT NULL DEFAULT '[]',
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
      scrapbook_id TEXT,
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
    CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts5(
      chunk_id UNINDEXED,
      document_id UNINDEXED,
      section_id UNINDEXED,
      title_text,
      body_text,
      source_hint,
      tokenize='unicode61'
    );
    """,
    """
    CREATE TRIGGER IF NOT EXISTS trg_document_chunks_fts_insert
    AFTER INSERT ON document_chunks
    BEGIN
      INSERT INTO document_chunks_fts (
        chunk_id, document_id, section_id, title_text, body_text, source_hint
      ) VALUES (
        NEW.id,
        NEW.document_id,
        COALESCE(NEW.section_id, ''),
        trim(replace(replace(replace(COALESCE(NEW.title_path, ''), '[', ' '), ']', ' '), '\"', ' ')),
        COALESCE(NEW.text, ''),
        COALESCE(NEW.source_hint, '')
      );
    END;
    """,
    """
    CREATE TRIGGER IF NOT EXISTS trg_document_chunks_fts_update
    AFTER UPDATE ON document_chunks
    BEGIN
      DELETE FROM document_chunks_fts WHERE chunk_id = OLD.id;
      INSERT INTO document_chunks_fts (
        chunk_id, document_id, section_id, title_text, body_text, source_hint
      ) VALUES (
        NEW.id,
        NEW.document_id,
        COALESCE(NEW.section_id, ''),
        trim(replace(replace(replace(COALESCE(NEW.title_path, ''), '[', ' '), ']', ' '), '\"', ' ')),
        COALESCE(NEW.text, ''),
        COALESCE(NEW.source_hint, '')
      );
    END;
    """,
    """
    CREATE TRIGGER IF NOT EXISTS trg_document_chunks_fts_delete
    AFTER DELETE ON document_chunks
    BEGIN
      DELETE FROM document_chunks_fts WHERE chunk_id = OLD.id;
    END;
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
    CREATE TABLE IF NOT EXISTS scrapbook (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      emoji TEXT,
      summary TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      source_url TEXT,
      platform TEXT NOT NULL DEFAULT 'manual',
      thumbnail TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_scrapbook_created_at
      ON scrapbook(created_at DESC);
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
      ('space-life', '🏠', 'Life', 'Daily planning and practical help.', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('space-dev', '💻', 'Code Development', 'Software development and debugging.', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('space-travel', '✈️', 'Travel', 'Trip planning and destination info.', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('space-entertainment', '🎬', 'Movies & Music', 'Recommendations for films and music.', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('space-study', '📚', 'Learning', 'Study plans and knowledge growth.', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('space-health', '💪', 'Health', 'Exercise, sleep, and nutrition guidance.', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('space-finance', '💰', 'Finance', 'Budgeting, saving, and risk awareness.', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('space-writing', '✍️', 'Writing', 'Drafting, rewriting, and polish.', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('space-career', '🚀', 'Career', 'Resume, interview, and job strategy.', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    """,
    """
    INSERT OR IGNORE INTO agents (
      id, is_default, is_hidden, emoji, name, description, prompt, is_deep_research,
      base_tone, traits, warmth, enthusiasm, headings, emojis, tool_ids, skill_ids,
      created_at, updated_at
    ) VALUES
      (
        '11111111-1111-1111-1111-111111111111', 1, 0, '',
        'Default Agent',
        'Fallback agent (non-editable).',
        '', 0, 'technical', 'default', 'default', 'default', 'default', 'default',
        '[]', '[]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ),
      (
        '22222222-2222-2222-2222-222222222222', 0, 0, '🔬',
        'Deep Research Agent',
        'Deep research agent (deep-research)',
        '', 1, 'academic', 'detailed', 'direct', 'low', 'detailed', 'none',
        '[]', '[]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ),
      (
        '33333333-3333-3333-3333-333333333333', 0, 0, '📒',
        'Scrapbook Agent',
        'Hidden system agent for Scrapbook generation settings.',
        '', 0, 'technical', 'default', 'default', 'default', 'default', 'default',
        '[]', '[]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ),
      (
        'agent-life-assistant', 0, 0, '🏠', 'Life Assistant',
        'Helps with routines, tasks, and daily decisions.',
        'You are a practical life assistant. Give actionable steps, ask for constraints, and keep responses concise and useful.',
        0, 'friendly', 'practical', 'gentle', 'medium', 'structured', 'light',
        '["local_time","web_search","calculator","interactive_form"]', '[]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ),
      (
        'agent-code-assistant', 0, 0, '💻', 'Code Assistant',
        'Engineering-focused coding and debugging assistant.',
        'You are a senior coding assistant. Clarify requirements, provide correct runnable solutions, and include testing advice.',
        0, 'technical', 'concise', 'direct', 'low', 'structured', 'none',
        '["web_search","json_repair","extract_text","summarize_text"]', '[]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ),
      (
        'agent-travel-planner', 0, 0, '✈️', 'Travel Planner',
        'Plans routes, schedules, and budgets for trips.',
        'You are a travel planner. Confirm origin, budget, duration, and preferences, then return a clear itinerary with options.',
        0, 'professional', 'detailed', 'supportive', 'medium', 'structured', 'light',
        '["web_search","search_news","search_wikipedia","local_time","interactive_form"]', '[]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ),
      (
        'agent-movie-music-curator', 0, 0, '🎬', 'Movie & Music Curator',
        'Curates movie and music recommendations by taste.',
        'You are a recommendation curator. Identify user taste and provide tiered suggestions with short reasons.',
        0, 'creative', 'detailed', 'friendly', 'medium', 'structured', 'expressive',
        '["web_search","search_news","search_wikipedia","duckduckgo_image_search","duckduckgo_video_search"]', '[]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ),
      (
        'agent-study-coach', 0, 0, '📚', 'Study Coach',
        'Builds learning plans and review strategies.',
        'You are a study coach. Create phased plans, daily tasks, and review loops based on goals and available time.',
        0, 'professional', 'structured', 'supportive', 'medium', 'structured', 'light',
        '["interactive_form","summarize_text","extract_text","web_search"]', '[]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ),
      (
        'agent-health-wellness', 0, 0, '💪', 'Health Coach',
        'Supports healthy habits and lifestyle routines.',
        'You are a health coach. Focus on habit-level advice for sleep, exercise, and nutrition. Avoid diagnosis and suggest professional care when needed.',
        0, 'calm', 'practical', 'gentle', 'low', 'structured', 'none',
        '["interactive_form","local_time","calculator","web_search"]', '[]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ),
      (
        'agent-finance-planner', 0, 0, '💰', 'Finance Planner',
        'Helps with budget, savings, and spending decisions.',
        'You are a finance planner. Ask for cashflow context and provide conservative, practical allocation suggestions.',
        0, 'professional', 'analytical', 'neutral', 'low', 'structured', 'none',
        '["interactive_form","calculator","summarize_text","search_news"]', '[]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ),
      (
        'agent-writing-assistant', 0, 0, '✍️', 'Writing Assistant',
        'Improves drafts, structure, and tone.',
        'You are a writing assistant. Clarify audience and style, then provide strong structure and polished alternatives.',
        0, 'friendly', 'detailed', 'gentle', 'medium', 'structured', 'light',
        '["interactive_form","summarize_text","extract_text","json_repair"]', '[]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ),
      (
        'agent-career-coach', 0, 0, '🚀', 'Career Coach',
        'Supports resume quality and interview preparation.',
        'You are a career coach. Provide concrete resume edits, interview prep questions, and role-fit guidance.',
        0, 'professional', 'direct', 'supportive', 'medium', 'structured', 'light',
        '["interactive_form","web_search","summarize_text","extract_text"]', '[]',
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
    """
    UPDATE spaces
    SET emoji = CASE emoji
      WHEN 'HOME' THEN '🏠'
      WHEN 'DEV' THEN '💻'
      WHEN 'TRIP' THEN '✈️'
      WHEN 'MEDIA' THEN '🎬'
      WHEN 'STUDY' THEN '📚'
      WHEN 'HEALTH' THEN '💪'
      WHEN 'MONEY' THEN '💰'
      WHEN 'WRITE' THEN '✍️'
      WHEN 'CAREER' THEN '🚀'
      ELSE emoji
    END
    WHERE emoji IN ('HOME', 'DEV', 'TRIP', 'MEDIA', 'STUDY', 'HEALTH', 'MONEY', 'WRITE', 'CAREER');
    """,
    """
    UPDATE agents
    SET emoji = CASE emoji
      WHEN 'HOME' THEN '🏠'
      WHEN 'DEV' THEN '💻'
      WHEN 'TRIP' THEN '✈️'
      WHEN 'MEDIA' THEN '🎬'
      WHEN 'STUDY' THEN '📚'
      WHEN 'HEALTH' THEN '💪'
      WHEN 'MONEY' THEN '💰'
      WHEN 'WRITE' THEN '✍️'
      WHEN 'CAREER' THEN '🚀'
      ELSE emoji
    END
    WHERE emoji IN ('HOME', 'DEV', 'TRIP', 'MEDIA', 'STUDY', 'HEALTH', 'MONEY', 'WRITE', 'CAREER');
    """,
    # Email notification tables (supports Gmail, Outlook, QQ, 163 via IMAP)
    """
    CREATE TABLE IF NOT EXISTS email_provider_configs (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'gmail',
      email TEXT NOT NULL,
      imap_password TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      poll_interval_minutes INTEGER NOT NULL DEFAULT 15,
      summary_provider TEXT,
      summary_model TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_email_provider_configs_email
      ON email_provider_configs(email);
    """,
    """
    CREATE TABLE IF NOT EXISTS email_notifications (
      id TEXT PRIMARY KEY,
      config_id TEXT,
      provider TEXT NOT NULL DEFAULT 'gmail',
      message_id TEXT NOT NULL UNIQUE,
      subject TEXT,
      sender TEXT,
      received_at TEXT,
      summary TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_email_notifications_is_read
      ON email_notifications(is_read);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_email_notifications_created_at
      ON email_notifications(created_at DESC);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_email_notifications_config_id
      ON email_notifications(config_id);
    """,
]
