# Supabase Data Model (Design Draft)

The current UI already structures data around spaces, chat sessions, and message controls (search/thinking toggles, provider selection). Below is a proposed schema that captures those requirements without diving into SQL implementation details.

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

| Column                | Type        | Notes                                 |
| --------------------- | ----------- | ------------------------------------- |
| `id`                  | uuid        | Primary key                           |
| `space_id`            | uuid        | FK → `spaces.id`, nullable ⇒ “None”   |
| `title`               | text        | AI-generated or user-edited           |
| `api_provider`        | text        | e.g. `gemini`, `openai_compatibility` |
| `is_search_enabled`   | boolean     | Snapshot from the UI toggle           |
| `is_thinking_enabled` | boolean     | Snapshot from the UI toggle           |
| `created_at`          | timestamptz |                                       |
| `updated_at`          | timestamptz |                                       |

## 3. `conversation_messages`

Stores the ordered transcript, including attachments and tool metadata.

| Column              | Type        | Notes                                                  |
| ------------------- | ----------- | ------------------------------------------------------ |
| `id`                | uuid        | PK                                                     |
| `conversation_id`   | uuid        | FK → `conversations.id`                                |
| `role`              | text        | `system`, `user`, `assistant`, `tool`                  |
| `content`           | jsonb       | Flexible payload (text blocks, attachments, citations) |
| `tool_calls`        | jsonb       | Optional structured tool-call info                     |
| `related_questions` | jsonb       | Array of generated follow-ups for the assistant reply  |
| `created_at`        | timestamptz | Ingest order                                           |

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

| Column       | Type        | Notes                           |
| ------------ | ----------- | ------------------------------- |
| `id`         | uuid        | PK                              |
| `message_id` | uuid        | FK → `conversation_messages.id` |
| `type`       | text        | `image_url`, `file`, etc.       |
| `data`       | jsonb       | Contains URLs, mime info, etc.  |
| `created_at` | timestamptz |                                 |

---

### Relationships in Context

1. **Spaces** encapsulate the prompt and metadata that guide a conversation when selected.
2. **Conversations** capture a snapshot of toggles/provider state per session and optionally reference the active space.
3. **Messages** store the transcript, including auto-generated follow-ups or tool results.
4. **Events** can log mid-session changes (toggle flips, auto-space assignments) for auditing.
5. **Attachments** remain normalized per message for easier media management.

This document only outlines the design. SQL definitions, triggers, row-level security, and Supabase-specific setup (storage buckets, etc.) can follow once the schema is approved.
