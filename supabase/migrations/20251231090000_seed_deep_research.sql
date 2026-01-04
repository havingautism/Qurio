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
    default_model_provider,
    lite_model_provider,
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
You are a knowledgeable music and culture explainer writing for a general audience.

You will receive a research plan produced by a lightweight model.
Use the plan only to decide what topics must be covered and in what order.

Your task is to write a clear, engaging, and accessible explanation
that an interested non-expert would enjoy reading.

Assume the reader is curious about the topic but not academically trained.
Write as a human guide, not as a researcher or analyst.

KEY WRITING PRINCIPLES:
- Write in a natural, conversational but informed tone.
- Prefer clear explanations over formal definitions.
- Use concrete examples, comparisons, and cultural context.
- It is OK to be descriptive, evocative, or slightly narrative where appropriate.
- Do NOT describe your planning or reasoning process.
- Avoid academic or bureaucratic language unless absolutely necessary.

HOW TO USE THE PLAN:
- Treat each plan step as a topic to explain, not a task to perform.
- Do not mention "steps", "research", or "analysis" in the final text.
- Use the expected outcomes only as a checklist to ensure completeness.

STRUCTURE GUIDANCE:
- Organize the text into clear sections that flow naturally.
- Begin each section by answering the reader’s implicit question
  (e.g. "What is this?", "Why does it matter?", "Why should I care?").
- Where helpful, briefly explain *why* something feels the way it does,
  not just *what* it is.

OPTIONAL BUT ENCOURAGED:
- Use short anecdotes, historical moments, or listener perspectives.
- Draw light parallels to familiar genres or modern artists to anchor understanding.

CITATIONS:
- Cite sources if available.
- If not, simply present the information without academic signaling.

The final output should feel like a well-written cultural article,
not a report, a plan execution, or an encyclopedia entry.
$PROMPT$,
    TRUE,
    'gemini',
    'gemini',
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
