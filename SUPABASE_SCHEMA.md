# Supabase Data Model (Design Draft)

The UI is organized around spaces, chat sessions, and per-message controls (search/thinking toggles, provider selection). This document mirrors the intended tables so the SQL schema can stay in sync with the app code.

## 1. `spaces`

| Column        | Type        | Notes                                                       |
| ------------- | ----------- | ----------------------------------------------------------- |
| `id`          | uuid        | Primary key                                                 |
| `emoji`       | text        | Space icon                                                  |
| `label`       | text        | Display name                                                |
| `description` | text        | Optional summary                                            |
| `prompt`      | text        | Guidance injected as system prompt when the space is active |
| `created_at`  | timestamptz |                                                             |
| `updated_at`  | timestamptz |                                                             |

## 2. `conversations`

Tracks each chat session and its relationship to spaces.

| Column                | Type        | Notes                                  |
| --------------------- | ----------- | -------------------------------------- |
| `id`                  | uuid        | Primary key                            |
| `space_id`            | uuid        | FK -> `spaces.id`, nullable for "None" |
| `title`               | text        | AI-generated or user-edited            |
| `api_provider`        | text        | e.g. `gemini`, `openai_compatibility`  |
| `is_search_enabled`   | boolean     | Snapshot from the UI toggle            |
| `is_thinking_enabled` | boolean     | Snapshot from the UI toggle            |
| `is_favorited`        | boolean     | Sidebar pin                            |
| `created_at`          | timestamptz |                                        |
| `updated_at`          | timestamptz |                                        |

## 3. `conversation_messages`

Stores the ordered transcript, including attachments, tool metadata, and (now) a dedicated thinking column.

| Column               | Type        | Notes                                                  |
| -------------------- | ----------- | ------------------------------------------------------ |
| `id`                 | uuid        | PK                                                     |
| `conversation_id`    | uuid        | FK -> `conversations.id`                               |
| `role`               | text        | `system`, `user`, `assistant`, `tool`                  |
| `content`            | jsonb       | Flexible payload (text blocks, attachments, citations) |
| `provider`           | text        | Provider used for this message (e.g., `gemini`)        |
| `model`              | text        | Model id used for this message                         |
| `thinking_process`   | text        | Raw reasoning text stored separately from `content`    |
| `tool_calls`         | jsonb       | Optional structured tool-call info                     |
| `related_questions`  | jsonb       | Array of generated follow-ups for the assistant reply  |
| `sources`            | jsonb       | List of citations/links returned by the model          |
| `grounding_supports` | jsonb       | Segment-level grounding metadata                       |
| `created_at`         | timestamptz | Ingest order                                           |

## 4. `conversation_events`

Optional audit table capturing settings changes during a session.

| Column            | Type        | Notes                                         |
| ----------------- | ----------- | --------------------------------------------- |
| `id`              | uuid        | PK                                            |
| `conversation_id` | uuid        | FK                                            |
| `event_type`      | text        | e.g. `search_toggle`, `space_auto_assignment` |
| `payload`         | jsonb       | Details (old/new values, provider used)       |
| `created_at`      | timestamptz |                                               |

## 5. `attachments`

References uploads tied to messages (records image URLs, file metadata).

| Column       | Type        | Notes                            |
| ------------ | ----------- | -------------------------------- |
| `id`         | uuid        | PK                               |
| `message_id` | uuid        | FK -> `conversation_messages.id` |
| `type`       | text        | `image_url`, `file`, etc.        |
| `data`       | jsonb       | Contains URLs, mime info, etc.   |
| `created_at` | timestamptz |                                  |
