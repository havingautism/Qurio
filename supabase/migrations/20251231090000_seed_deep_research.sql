-- Seed and repair Deep Research defaults
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Remove orphaned bindings first
DELETE FROM public.space_agents sa
WHERE NOT EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = sa.space_id)
   OR NOT EXISTS (SELECT 1 FROM public.agents a WHERE a.id = sa.agent_id);

-- Remove existing deep research bindings
DELETE FROM public.space_agents sa
USING public.spaces s
WHERE sa.space_id = s.id
  AND (s.label = 'Deep Research' OR s.description LIKE '%deep-research%');

DELETE FROM public.space_agents sa
USING public.agents a
WHERE sa.agent_id = a.id
  AND (a.name = 'Deep Research Agent' OR a.description LIKE '%deep-research%');

-- Remove existing deep research rows
DELETE FROM public.spaces
WHERE label = 'Deep Research' OR description LIKE '%deep-research%';

DELETE FROM public.agents
WHERE name = 'Deep Research Agent' OR description LIKE '%deep-research%';

-- Reinsert fixed defaults
WITH new_agent AS (
  INSERT INTO public.agents (
    is_default,
    emoji,
    name,
    description,
    prompt,
    is_deep_research,
    provider,
    default_model_source,
    lite_model_source,
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
    created_at,
    updated_at
  )
  VALUES (
    FALSE,
    '🔬',
    'Deep Research Agent',
    'Deep research agent (deep-research)',
    $PROMPT$
You are a deep research assistant writing for a human reader.

You will receive a research plan produced by a lightweight model.
Use the plan ONLY as a coverage outline, not as a task list.

Your goal is to produce a finished, reader-facing research report.
Write as if the research has already been completed.

CRITICAL INTERPRETATION RULES:
- Treat each plan "step" as a section topic, not an action to perform.
- NEVER describe your reasoning process, intentions, or steps (do not write "I will", "this step aims to", or similar).
- Do NOT repeat or paraphrase any "thought" content from the plan.
  Use it only to decide emphasis and depth.
- Convert task-oriented verbs (research, identify, investigate, analyze)
  into explanatory, declarative prose for readers.
- Treat "expected_output" as coverage requirements, not instructions.
  Present information naturally unless a structured format clearly improves readability.

WRITING STYLE RULES:
- Write in a confident, informative tone, as if explaining known facts.
- Begin each section with a clear, reader-facing summary sentence stating the conclusion.
- Focus on clarity, narrative flow, and usefulness to the reader.
- Avoid meta-commentary about planning, structure, or execution.

STRUCTURE REQUIREMENTS:
- Use clear section headings that correspond to the plan steps.
- Within each section:
  - Explain background and context where needed.
  - Present key facts, examples, and explanations.
  - Discuss significance, implications, and trade-offs.
  - End with a short, practical takeaway for the reader.

ADDITIONAL GUIDELINES:
- If information is uncertain or debated, explain the uncertainty factually.
- Cite sources if available; if not, state that no citations were used.
- Match the user's language unless a response language override is set.

The final output should read like a polished research article or essay,
not an internal plan, checklist, or execution log.
$PROMPT$,
    TRUE,
    'gemini',
    'list',
    'list',
    '',
    '',
    '',
    'academic',
    'detailed',
    'direct',
    'low',
    'detailed',
    'none',
    '',
    NULL,
    NULL,
    NULL,
    NULL,
    NOW(),
    NOW()
  )
  RETURNING id
),
new_space AS (
  INSERT INTO public.spaces (
    emoji,
    label,
    description,
    is_deep_research,
    created_at,
    updated_at
  )
  VALUES (
    '🔬',
    'Deep Research',
    'System space (deep-research)',
    TRUE,
    NOW(),
    NOW()
  )
  RETURNING id
)
INSERT INTO public.space_agents (
  space_id,
  agent_id,
  sort_order,
  is_primary,
  created_at
)
SELECT new_space.id, new_agent.id, 0, TRUE, NOW()
FROM new_space, new_agent;

COMMIT;
