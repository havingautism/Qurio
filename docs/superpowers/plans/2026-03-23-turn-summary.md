# Turn Summary Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a lite-model turn summary on each completed assistant message and show it in the question timeline, without changing the existing streaming/chat rendering flow.

**Architecture:** Add a nullable `turn_summary` text column to conversation messages across SQLite, Supabase, and frontend mapping. Generate the summary after a completed assistant response using the existing lite summary model config, with source text derived from the final visible answer (normal chat uses `content`; expert route mode uses the final member response content). Store the summary on the assistant message row, then render it in the timeline sidebar as a secondary line under the user question.

**Tech Stack:** React, Zustand, FastAPI, Agno, existing backend `generate_*` route pattern, SQLite/Supabase schema migration.

---

## Chunk 1: Persistence Schema

**Files:**
- Modify: `backend-python/src/services/sqlite_schema.py`
- Modify: `backend-python/src/services/db_adapters.py`
- Modify: `supabase/schema.sql`
- Modify: `supabase/init.sql`
- Modify: `src/assets/init-schema.sql`

- [ ] **Step 1: Add `turn_summary` to conversation_messages schema**
- [ ] **Step 2: Add SQLite forward migration for existing local DBs**
- [ ] **Step 3: Add Supabase migration-safe column definition**

## Chunk 2: Turn Summary Generation API

**Files:**
- Modify: `backend-python/src/services/generation.py`
- Add: `backend-python/src/routes/turn_summary.py`
- Modify: `backend-python/src/services/agent_os_app.py`
- Modify: `backend-python/src/routes/__init__.py`
- Add: `src/lib/backendClient.js`
- Modify: `src/lib/backendProviderForBackend.js`

- [ ] **Step 1: Add a backend helper that summarizes one turn from question + final answer text**
- [ ] **Step 2: Add `/api/turn-summary` route**
- [ ] **Step 3: Add a frontend backend-client wrapper for the new route**

## Chunk 3: Message Mapping and Persistence

**Files:**
- Modify: `src/lib/chat/aiService.js`
- Modify: `src/lib/chatStore.js`
- Modify: `src/lib/conversationsService.js`
- Modify: `src/hooks/chat/useChatHistory.js`
- Add: `src/lib/chat/turnSummary.js`

- [ ] **Step 1: Add helper logic to derive the visible answer text for summary generation**
- [ ] **Step 2: Generate turn summary after assistant message persistence and update the saved row**
- [ ] **Step 3: Map `turn_summary` back into frontend message objects on history load**
- [ ] **Step 4: Keep expert / route / HITL fallback ordering stable**

## Chunk 4: Timeline UI

**Files:**
- Modify: `src/components/QuestionTimelineController.jsx`
- Modify: `src/components/QuestionTimelineSidebar.jsx`

- [ ] **Step 1: Attach assistant turn summaries to the matching user timeline item**
- [ ] **Step 2: Render the summary line in both mobile and desktop timeline cards**
- [ ] **Step 3: Preserve the existing question-only fallback when no summary exists**

## Chunk 5: Verification

**Files:**
- None

- [ ] **Step 1: Run backend schema and unit checks**
- [ ] **Step 2: Run frontend build**
- [ ] **Step 3: Manually verify normal chat, expert route, and HITL history rendering**

