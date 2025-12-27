# Supabase Data Model (Design Draft)

The UI is organized around spaces, chat sessions, and per-message controls (search/thinking toggles, provider selection). This document mirrors the intended tables so the SQL schema can stay in sync with the app code.

## 1. `spaces`

| Column        | Type        | Notes               |
| ------------- | ----------- | ------------------- |
| `id`          | uuid        | Primary key         |
| `emoji`       | text        | Space icon          |
| `label`       | text        | Display name        |
| `description` | text        | Optional summary    |
| `created_at`  | timestamptz |                     |
| `updated_at`  | timestamptz |                     |

## 2. `agents`

Stores reusable agent presets. These can be bound to multiple spaces later.

| Column               | Type        | Notes                               |
| -------------------- | ----------- | ----------------------------------- |
| `id`                 | uuid        | Primary key                         |
| `is_default`         | boolean     | Non-deletable default agent         |
| `emoji`              | text        | Agent avatar emoji                  |
| `name`               | text        | Display name                        |
| `description`        | text        | Optional summary                    |
| `prompt`             | text        | System prompt template              |
| `provider`           | text        | Default provider for the agent      |
| `default_model_source` | text      | `list` or `custom`                  |
| `lite_model_source`    | text      | `list` or `custom`                  |
| `lite_model`         | text        | Optional lightweight model override |
| `default_model`      | text        | Default model id                    |
| `response_language`  | text        | LLM answer language preset          |
| `base_tone`          | text        | Style base tone                     |
| `traits`             | text        | Style traits                        |
| `warmth`             | text        | Style warmth                        |
| `enthusiasm`         | text        | Style enthusiasm                    |
| `headings`           | text        | Style headings                      |
| `emojis`             | text        | Style emoji usage                   |
| `custom_instruction` | text        | Additional guidance                 |
| `temperature`        | float8      | Sampling temperature override       |
| `top_p`              | float8      | Top-p sampling override             |
| `frequency_penalty`  | float8      | Repetition penalty                  |
| `presence_penalty`   | float8      | Novelty penalty                     |
| `created_at`         | timestamptz |                                     |
| `updated_at`         | timestamptz |                                     |

## 3. `conversations`

Tracks each chat session and its relationship to spaces.

| Column                | Type        | Notes                                  |
| --------------------- | ----------- | -------------------------------------- |
| `id`                  | uuid        | Primary key                            |
| `space_id`            | uuid        | FK -> `spaces.id`, nullable for "None" |
| `last_agent_id`       | uuid        | FK -> `agents.id`, last agent used     |
| `title`               | text        | AI-generated or user-edited            |
| `api_provider`        | text        | e.g. `gemini`, `openai_compatibility`  |
| `is_search_enabled`   | boolean     | Snapshot from the UI toggle            |
| `is_thinking_enabled` | boolean     | Snapshot from the UI toggle            |
| `is_favorited`        | boolean     | Sidebar pin                            |
| `created_at`          | timestamptz |                                        |
| `updated_at`          | timestamptz |                                        |

## 4. `conversation_messages`

Stores the ordered transcript, including attachments, tool metadata, and (now) a dedicated thinking column.

| Column               | Type        | Notes                                                  |
| -------------------- | ----------- | ------------------------------------------------------ |
| `id`                 | uuid        | PK                                                     |
| `conversation_id`    | uuid        | FK -> `conversations.id`                               |
| `role`               | text        | `system`, `user`, `assistant`, `tool`                  |
| `content`            | jsonb       | Flexible payload (text blocks, attachments, citations) |
| `provider`           | text        | Provider used for this message (e.g., `gemini`)        |
| `model`              | text        | Model id used for this message                         |
| `agent_id`           | uuid        | Agent id used for this message                         |
| `agent_name`         | text        | Agent display name at send time                        |
| `agent_emoji`        | text        | Agent avatar emoji at send time                        |
| `agent_is_default`   | boolean     | Whether the agent was the default fallback             |
| `thinking_process`   | text        | Raw reasoning text stored separately from `content`    |
| `tool_calls`         | jsonb       | Optional structured tool-call info                     |
| `related_questions`  | jsonb       | Array of generated follow-ups for the assistant reply  |
| `sources`            | jsonb       | List of citations/links returned by the model          |
| `grounding_supports` | jsonb       | Segment-level grounding metadata                       |
| `created_at`         | timestamptz | Ingest order                                           |

## 5. `conversation_events`

Optional audit table capturing settings changes during a session.

| Column            | Type        | Notes                                         |
| ----------------- | ----------- | --------------------------------------------- |
| `id`              | uuid        | PK                                            |
| `conversation_id` | uuid        | FK                                            |
| `event_type`      | text        | e.g. `search_toggle`, `space_auto_assignment` |
| `payload`         | jsonb       | Details (old/new values, provider used)       |
| `created_at`      | timestamptz |                                               |

## 6. `attachments`

References uploads tied to messages (records image URLs, file metadata).

| Column       | Type        | Notes                            |
| ------------ | ----------- | -------------------------------- |
| `id`         | uuid        | PK                               |
| `message_id` | uuid        | FK -> `conversation_messages.id` |
| `type`       | text        | `image_url`, `file`, etc.        |
| `data`       | jsonb       | Contains URLs, mime info, etc.   |
| `created_at` | timestamptz |                                  |

## 7. `space_agents`

Join table for binding multiple agents to a space.

| Column       | Type        | Notes                                     |
| ------------ | ----------- | ----------------------------------------- |
| `space_id`   | uuid        | FK -> `spaces.id`                         |
| `agent_id`   | uuid        | FK -> `agents.id`                         |
| `sort_order` | integer     | Display order within the space            |
| `is_primary` | boolean     | Marks the primary agent for the space     |
| `created_at` | timestamptz |                                           |
