# Qurio Python Migration Plan (Jan 22, 2026)

## Goal
Migrate remaining Node.js LangChain endpoints to the Python (FastAPI + Agno) backend and align tool usage with Agno toolkits.

## Scope
- Daily tip
- Title
- Title + space
- Title + space + agent
- Agent selection for auto mode
- Related questions
- Research plan (sync + SSE)
- Deep research (SSE)
- MCP tools endpoints

## Steps
1. Map existing Node endpoints/services to Python routes and services.
2. Add shared LLM utilities for non-streaming calls and JSON parsing.
3. Port prompts/logic for each endpoint, using Agno adapter for model calls.
4. Implement deep research orchestration with step execution + final report streaming.
5. Add MCP tool manager and endpoints (placeholder until a Python MCP client is added).
6. Wire routes into FastAPI and verify imports.

## Status
- [x] Endpoint mapping
- [x] Shared LLM utilities
- [x] Daily tip / Title / Title + space / Title + space + agent / Agent auto / Related questions
- [x] Research plan (sync + stream)
- [x] Deep research stream
- [x] MCP routes (stub until MCP client available)

## Notes
- MCP routes are live but will return an error until a Python MCP client library is installed and wired in.
- Tavily academic search is implemented as a local tool; general web search uses Agno's Tavily toolkit.

