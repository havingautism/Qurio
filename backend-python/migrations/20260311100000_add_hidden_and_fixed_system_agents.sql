BEGIN TRANSACTION;

UPDATE conversations
SET last_agent_id = '11111111-1111-1111-1111-111111111111'
WHERE last_agent_id = (
  SELECT id
  FROM agents
  WHERE is_default = 1
    AND id <> '11111111-1111-1111-1111-111111111111'
  ORDER BY created_at ASC
  LIMIT 1
);

UPDATE conversation_messages
SET agent_id = '11111111-1111-1111-1111-111111111111'
WHERE agent_id = (
  SELECT id
  FROM agents
  WHERE is_default = 1
    AND id <> '11111111-1111-1111-1111-111111111111'
  ORDER BY created_at ASC
  LIMIT 1
);

UPDATE space_agents
SET agent_id = '11111111-1111-1111-1111-111111111111'
WHERE agent_id = (
  SELECT id
  FROM agents
  WHERE is_default = 1
    AND id <> '11111111-1111-1111-1111-111111111111'
  ORDER BY created_at ASC
  LIMIT 1
);

UPDATE agents
SET id = '11111111-1111-1111-1111-111111111111'
WHERE id = (
  SELECT id
  FROM agents
  WHERE is_default = 1
    AND id <> '11111111-1111-1111-1111-111111111111'
  ORDER BY created_at ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1
  FROM agents
  WHERE id = '11111111-1111-1111-1111-111111111111'
);

INSERT INTO agents (
  id,
  is_default,
  is_hidden,
  emoji,
  avatar_type,
  avatar_image,
  avatar_shape,
  banner_mode,
  banner_image,
  name,
  description,
  prompt,
  is_deep_research,
  provider,
  default_model_provider,
  lite_model_provider,
  default_model_source,
  lite_model_source,
  use_global_model_settings,
  lite_model,
  default_model,
  response_language,
  base_tone,
  traits,
  warmth,
  enthusiasm,
  headings,
  emojis,
  custom_instruction,
  temperature,
  top_p,
  frequency_penalty,
  presence_penalty,
  tool_ids,
  skill_ids,
  created_at,
  updated_at
)
SELECT
  '11111111-1111-1111-1111-111111111111',
  1,
  0,
  '',
  'emoji',
  '',
  'circle',
  'none',
  '',
  'Default Agent',
  'Fallback agent (non-editable).',
  '',
  0,
  'gemini',
  'gemini',
  'gemini',
  'list',
  'list',
  1,
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  NULL,
  NULL,
  NULL,
  NULL,
  '[]',
  '[]',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (
  SELECT 1
  FROM agents
  WHERE id = '11111111-1111-1111-1111-111111111111'
);

UPDATE agents
SET is_default = 1,
    is_hidden = 0,
    is_deep_research = 0,
    name = 'Default Agent',
    description = 'Fallback agent (non-editable).'
WHERE id = '11111111-1111-1111-1111-111111111111';

UPDATE agents
SET is_default = 0
WHERE id <> '11111111-1111-1111-1111-111111111111'
  AND is_default = 1;

UPDATE conversations
SET last_agent_id = '22222222-2222-2222-2222-222222222222'
WHERE last_agent_id = (
  SELECT id
  FROM agents
  WHERE is_deep_research = 1
    AND id <> '22222222-2222-2222-2222-222222222222'
  ORDER BY created_at ASC
  LIMIT 1
);

UPDATE conversation_messages
SET agent_id = '22222222-2222-2222-2222-222222222222'
WHERE agent_id = (
  SELECT id
  FROM agents
  WHERE is_deep_research = 1
    AND id <> '22222222-2222-2222-2222-222222222222'
  ORDER BY created_at ASC
  LIMIT 1
);

UPDATE space_agents
SET agent_id = '22222222-2222-2222-2222-222222222222'
WHERE agent_id = (
  SELECT id
  FROM agents
  WHERE is_deep_research = 1
    AND id <> '22222222-2222-2222-2222-222222222222'
  ORDER BY created_at ASC
  LIMIT 1
);

UPDATE agents
SET id = '22222222-2222-2222-2222-222222222222'
WHERE id = (
  SELECT id
  FROM agents
  WHERE is_deep_research = 1
    AND id <> '22222222-2222-2222-2222-222222222222'
  ORDER BY created_at ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1
  FROM agents
  WHERE id = '22222222-2222-2222-2222-222222222222'
);

INSERT INTO agents (
  id,
  is_default,
  is_hidden,
  emoji,
  avatar_type,
  avatar_image,
  avatar_shape,
  banner_mode,
  banner_image,
  name,
  description,
  prompt,
  is_deep_research,
  provider,
  default_model_provider,
  lite_model_provider,
  default_model_source,
  lite_model_source,
  use_global_model_settings,
  lite_model,
  default_model,
  response_language,
  base_tone,
  traits,
  warmth,
  enthusiasm,
  headings,
  emojis,
  custom_instruction,
  temperature,
  top_p,
  frequency_penalty,
  presence_penalty,
  tool_ids,
  skill_ids,
  created_at,
  updated_at
)
SELECT
  '22222222-2222-2222-2222-222222222222',
  0,
  0,
  '🔬',
  'emoji',
  '',
  'circle',
  'none',
  '',
  'Deep Research Agent',
  'Deep research agent (deep-research)',
  '',
  1,
  'gemini',
  'gemini',
  'gemini',
  'list',
  'list',
  1,
  '',
  '',
  '',
  'academic',
  'analytical',
  'direct',
  'medium',
  'detailed',
  'none',
  '',
  NULL,
  NULL,
  NULL,
  NULL,
  '[]',
  '[]',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (
  SELECT 1
  FROM agents
  WHERE id = '22222222-2222-2222-2222-222222222222'
);

UPDATE agents
SET is_default = 0,
    is_hidden = 0,
    is_deep_research = 1,
    emoji = '🔬',
    name = 'Deep Research Agent',
    description = 'Deep research agent (deep-research)'
WHERE id = '22222222-2222-2222-2222-222222222222';

UPDATE agents
SET is_deep_research = 0
WHERE id <> '22222222-2222-2222-2222-222222222222'
  AND is_deep_research = 1;

INSERT INTO agents (
  id,
  is_default,
  is_hidden,
  emoji,
  avatar_type,
  avatar_image,
  avatar_shape,
  banner_mode,
  banner_image,
  name,
  description,
  prompt,
  is_deep_research,
  provider,
  default_model_provider,
  lite_model_provider,
  default_model_source,
  lite_model_source,
  use_global_model_settings,
  lite_model,
  default_model,
  response_language,
  base_tone,
  traits,
  warmth,
  enthusiasm,
  headings,
  emojis,
  custom_instruction,
  temperature,
  top_p,
  frequency_penalty,
  presence_penalty,
  tool_ids,
  skill_ids,
  created_at,
  updated_at
)
SELECT
  '33333333-3333-3333-3333-333333333333',
  0,
  0,
  '📒',
  'emoji',
  '',
  'circle',
  'none',
  '',
  'Scrapbook Agent',
  'Hidden system agent for Scrapbook generation settings.',
  '',
  0,
  'gemini',
  'gemini',
  'gemini',
  'list',
  'list',
  1,
  '',
  '',
  '',
  'technical',
  'default',
  'default',
  'default',
  'default',
  'default',
  '',
  NULL,
  NULL,
  NULL,
  NULL,
  '[]',
  '[]',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (
  SELECT 1
  FROM agents
  WHERE id = '33333333-3333-3333-3333-333333333333'
);

UPDATE agents
SET is_default = 0,
    is_hidden = 0,
    is_deep_research = 0,
    emoji = '📒',
    name = 'Scrapbook Agent',
    description = 'Hidden system agent for Scrapbook generation settings.'
WHERE id = '33333333-3333-3333-3333-333333333333';

COMMIT;
