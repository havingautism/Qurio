# Docs Index

Current reference docs live in `docs/`. Historical notes can be kept in `docs/archive/` locally, but that archive is intentionally excluded from git.

## Current Reference

- `docs/agno-backend.md` - Python backend architecture, runtime behavior, and service responsibilities.
- `docs/stream-blocks-migration.md` - `stream_blocks` schema and migration notes.
- `docs/custom-tool-flow.md` - lifecycle of custom HTTP tools.
- `docs/agent_skills_integration.md` - current agent skills model and loading conventions.
- `docs/document-selection-sending.md` - chat-time document context binding flow.
- `docs/document-retrieval-updates.md` - retrieval improvements and indexing behavior.
- `docs/knowledge-base-data-structure.md` - knowledge base data structures and data flow.
- `docs/long-term-memory-domains.md` - long-term memory domain model.

## Archive

`docs/archive/` is for local-only historical material: old implementation writeups, phased migrations, feature notes, and design drafts that should not remain in the main docs surface.

## Notes

- Prefer files in `docs/` when you need the current system view.
- Check `docs/archive/` only for historical context, and do not rely on it as the source of truth.
