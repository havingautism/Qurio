# Agent Global Model Settings Migration (SQLite + Supabase)

## What changed

Added a new field on `agents`:

- `use_global_model_settings`
  - `true`: agent uses global `defaultModel` + `liteModel`
  - `false`: agent uses its own per-agent model settings

## Supabase migration

Run:

- `supabase/migrations/20260213120000_add_use_global_model_settings_to_agents.sql`

This migration is idempotent and includes:

1. Add column if missing
2. Backfill existing rows to `TRUE`
3. Set default `TRUE`
4. Set `NOT NULL`

## SQLite migration

For SQLite in this project, a separate manual migration is **usually not required**.

Reason:

- `backend-python/src/services/db_adapters.py` performs startup forward-migrations.
- It already checks `PRAGMA table_info(agents)` and auto-adds
  `use_global_model_settings INTEGER NOT NULL DEFAULT 1` when missing.

So as long as the backend process restarts with new code, local SQLite schema should be upgraded automatically.

