# Tools & Search Architecture

This document outlines the architecture for tools and search integration in the detailed backend.

## Overview

The `toolsService.js` handles tool definition, validation, and execution. It supports both **built-in tools** (Calculator, Time) and **LangChain integrations** (DuckDuckGo, Wikipedia).

## Search Tools Configuration

We use specific logic to handle search providers to ensure the user's selected provider is respected without interference from aliased tools.

### 1. Tool Definitions

- **Tavily Search:** Defined as `Tavily_web_search`. Used when `searchSource: "tavily"` or default. Requires `TAVILY_API_KEY`.
- **DuckDuckGo:** Defined as `DuckDuckGo_search`. Uses `@langchain/community/tools/duckduckgo_search`.
- **Wikipedia:** Defined as `Wikipedia_search`. Uses `@langchain/community/tools/wikipedia_query_run`.

### 2. Selection Logic (`streamChatService.js`)

When a user selects a specific search provider (e.g., "duckduckgo"):

1.  The `searchSource` parameter is passed to `streamChat`.
2.  The backend **explicitly filters out** conflicting search tools:
    - `web_search` (Generic alias)
    - `academic_search` (Tavily academic)
    - `Tavily_academic_search`
    - Other Tavily variants.
3.  The target tool (e.g., `DuckDuckGo_search`) is ensured to be present in the tool list.

### 3. Usage

Calls to `executeToolByName` invoke the corresponding LangChain tool or internal logic.

```javascript
// Example: DuckDuckGo Execution
const tool = new DuckDuckGoSearch({ maxResults: 5 })
const result = await tool.invoke(query)
```

## LangChain Integration

We use `@langchain/community` for standardized tool execution.

- **DuckDuckGo:** `DuckDuckGoSearch`
- **Wikipedia:** `WikipediaQueryRun`

Important: Ensure imports match the installed `@langchain/community` version structure (e.g., imports from specific tool paths if needed).
