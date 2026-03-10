ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
DECLARE
  default_target CONSTANT UUID := '11111111-1111-1111-1111-111111111111';
  deep_target CONSTANT UUID := '22222222-2222-2222-2222-222222222222';
  scrapbook_target CONSTANT UUID := '33333333-3333-3333-3333-333333333333';
  default_source UUID;
  deep_source UUID;
BEGIN
  SELECT id INTO default_source
  FROM public.agents
  WHERE is_default = TRUE AND id <> default_target
  ORDER BY created_at ASC
  LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM public.agents WHERE id = default_target) AND default_source IS NOT NULL THEN
    INSERT INTO public.agents (
      id,
      is_default,
      is_hidden,
      emoji,
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
      created_at,
      updated_at
    )
    SELECT
      default_target,
      is_default,
      FALSE,
      emoji,
      name,
      description,
      prompt,
      FALSE,
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
      created_at,
      updated_at
    FROM public.agents
    WHERE id = default_source;

    UPDATE public.conversations SET last_agent_id = default_target WHERE last_agent_id = default_source;
    UPDATE public.conversation_messages SET agent_id = default_target WHERE agent_id = default_source;
    UPDATE public.space_agents SET agent_id = default_target WHERE agent_id = default_source;
    DELETE FROM public.agents WHERE id = default_source;
  END IF;

  INSERT INTO public.agents (
    id, is_default, is_hidden, emoji, name, description, prompt, is_deep_research
  )
  SELECT
    default_target, TRUE, FALSE, '', 'Default Agent', 'Fallback agent (non-editable).', '', FALSE
  WHERE NOT EXISTS (SELECT 1 FROM public.agents WHERE id = default_target);

  UPDATE public.agents
  SET is_default = TRUE,
      is_hidden = FALSE,
      is_deep_research = FALSE,
      name = 'Default Agent',
      description = 'Fallback agent (non-editable).'
  WHERE id = default_target;

  UPDATE public.agents
  SET is_default = FALSE
  WHERE id <> default_target AND is_default = TRUE;

  SELECT id INTO deep_source
  FROM public.agents
  WHERE is_deep_research = TRUE AND id <> deep_target
  ORDER BY created_at ASC
  LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM public.agents WHERE id = deep_target) AND deep_source IS NOT NULL THEN
    INSERT INTO public.agents (
      id,
      is_default,
      is_hidden,
      emoji,
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
      created_at,
      updated_at
    )
    SELECT
      deep_target,
      FALSE,
      FALSE,
      emoji,
      name,
      description,
      prompt,
      TRUE,
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
      created_at,
      updated_at
    FROM public.agents
    WHERE id = deep_source;

    UPDATE public.conversations SET last_agent_id = deep_target WHERE last_agent_id = deep_source;
    UPDATE public.conversation_messages SET agent_id = deep_target WHERE agent_id = deep_source;
    UPDATE public.space_agents SET agent_id = deep_target WHERE agent_id = deep_source;
    DELETE FROM public.agents WHERE id = deep_source;
  END IF;

  INSERT INTO public.agents (
    id, is_default, is_hidden, emoji, name, description, prompt, is_deep_research
  )
  SELECT
    deep_target, FALSE, FALSE, '🔬', 'Deep Research Agent', 'Deep research agent (deep-research)', '', TRUE
  WHERE NOT EXISTS (SELECT 1 FROM public.agents WHERE id = deep_target);

  UPDATE public.agents
  SET is_default = FALSE,
      is_hidden = FALSE,
      is_deep_research = TRUE,
      emoji = '🔬',
      name = 'Deep Research Agent',
      description = 'Deep research agent (deep-research)'
  WHERE id = deep_target;

  UPDATE public.agents
  SET is_deep_research = FALSE
  WHERE id <> deep_target AND is_deep_research = TRUE;

  INSERT INTO public.agents (
    id,
    is_default,
    is_hidden,
    emoji,
    name,
    description,
    prompt,
    is_deep_research,
    use_global_model_settings
  )
  SELECT
    scrapbook_target,
    FALSE,
    TRUE,
    '📒',
    'Scrapbook Agent',
    'Hidden system agent for Scrapbook generation settings.',
    '',
    FALSE,
    TRUE
  WHERE NOT EXISTS (SELECT 1 FROM public.agents WHERE id = scrapbook_target);

  UPDATE public.agents
  SET is_hidden = TRUE,
      is_default = FALSE,
      is_deep_research = FALSE,
      emoji = '📒',
      name = 'Scrapbook Agent',
      description = 'Hidden system agent for Scrapbook generation settings.'
  WHERE id = scrapbook_target;
END $$;
