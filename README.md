# Qurio - The AI Workstation for Research, Agents, and Real Execution

![Bun](https://img.shields.io/badge/Bun-1.3+-000?logo=bun&logoColor=fff)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=000)
![TanStack Router](https://img.shields.io/badge/TanStack%20Router-v1-ff6b6b)
![RSBuild](https://img.shields.io/badge/RSBuild-fast-orange)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4-38bdf8?logo=tailwindcss&logoColor=fff)
![Supabase](https://img.shields.io/badge/Supabase-backend-3ecf8e?logo=supabase&logoColor=fff)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/havingautism/Qurio)

> Qurio is not a chatbot skin. It is a full-stack AI workstation for people who actually ship, research, decide, and build.

**Qurio** is a multi-provider AI knowledge workspace that combines chat, deep research, custom agents, memory, document retrieval, MCP, HTTP tools, and structured execution into one product. It is designed for users who are tired of bouncing between tabs, copy-pasting context, and losing state between "thinking" and "doing".

You can route across Gemini, OpenAI-compatible providers, SiliconFlow, Kimi, MiniMax, GLM, NVIDIA NIM, ModelScope, and more. You can create agents with their own prompts, tool permissions, model pairings, visual identity, and skills. You can run deep research pipelines, inspect tool calls, attach documents, query memory, and keep everything grounded in one workspace.

**Short version:** Qurio turns AI from "a place to ask questions" into "a place to get work done."

## Screenshots

### Home

![Home](./docs/screenshots/homeview.png)

### Conversation + Tool Calls

![Conversation + Tool Calls](./docs/screenshots/conversation-tools.png)

### Deep Research Workflow

![Deep Research Workflow](./docs/screenshots/deep-research.png)

### MCP Tool Groups

![MCP Tool Groups](./docs/screenshots/mcp_tools.png)

## Why Qurio Hits Different

- **One workspace, many model brains**: Mix and match providers instead of getting locked into one stack.
- **Agents with actual operational boundaries**: Per-agent prompts, tools, skills, style, models, and workspace bindings.
- **Research that behaves like a pipeline**: Plan, search, cite, synthesize, export.
- **Memory that is selective instead of bloated**: Inject only what matters instead of stuffing every prompt.
- **Tools that move beyond demos**: MCP servers, HTTP tools, web search, finance, image/video search, Wikipedia, arXiv, Hacker News, and more.
- **A UI built for power users**: Streaming, reasoning, citations, timeline, source panels, responsive layouts, and rich rendering.

## What You Can Do

### Deep Research

- Break a complex goal into steps, execute searches, gather sources, and assemble a structured report.
- Track source-backed claims with direct links and visible evidence.
- Run iterative research loops instead of one-shot "search and pray" prompts.

### Custom Agents

- Create specialized agents with distinct prompts, identity, tone, and model strategy.
- Assign each agent a `Default` model for quality and a `Lite` model for routing, summaries, or planning.
- Bind agents to spaces so each workspace keeps a consistent operational style.

### Tooling and Execution

- Connect MCP servers over SSE or Streamable HTTP.
- Build custom HTTP tools from URLs and parameter templates.
- Enable or disable tools per agent so capabilities stay focused and safe.
- Use built-in tools for web/news search, Wikipedia, arXiv, Yahoo Finance, image search, video search, and Hacker News.

### Documents and Retrieval

- Upload documents, parse them into chunks, index them, and retrieve relevant context during chat.
- Combine embedding retrieval with keyword search for stronger recall in messy real-world corpora.
- Scope retrieval to selected files so context remains controllable.

### Long-Term Memory

- Store durable user or workspace knowledge as structured memory summaries.
- Let lightweight routing decide when memory should be fetched.
- Keep prompts lean by injecting only relevant memory domains.

### Productivity UX

- Inspect tool calls and outputs without losing the conversation thread.
- Use structured message rendering with code, tables, citations, images, and sources.
- Switch between desktop and mobile without losing core capability.
- Run as a web app or desktop app workflow.

## Product Principles

- **Execution over vibes**: The product is built to act, not just to answer.
- **Routing matters**: Fast models decide what to fetch and which expensive models should speak.
- **Grounding first**: Retrieval, memory, and tool outputs exist to make answers more trustworthy.
- **Agent boundaries are a feature**: An agent should not see every tool, every document, or every instruction by default.
- **Real workflows beat toy demos**: Research, planning, retrieval, and output structure are first-class citizens.

## Feature Highlights

### Multi-Provider by Default

- Google Gemini
- OpenAI and OpenAI-compatible endpoints
- SiliconFlow
- Kimi (Moonshot)
- MiniMax
- GLM (Zhipu)
- ModelScope
- NVIDIA NIM

### Agent Control Surface

- Identity, avatar, banner, tone, warmth, language, and advanced generation controls
- Global and per-agent model configuration
- Tool permissions and reusable skills
- Space-agent binding and automatic agent selection flows

### Tool Stack

- MCP tools with grouped management
- Custom HTTP tools with auto-generated schemas
- Tavily search and extraction
- Web search and news search
- Exa category search
- Wikipedia and arXiv
- Yahoo Finance
- DuckDuckGo image and video search
- SerpApi-backed Google/Bing image search and YouTube search
- Hacker News toolkit
- Interactive forms for structured input collection

### Knowledge and Memory

- Document upload, parsing, chunking, embedding, and retrieval
- Hybrid retrieval strategy
- Long-term memory with selective injection
- Research flows with source-aware output

### Polished Runtime Experience

- Streaming responses
- Visible tool activity
- Rich Markdown and code rendering
- Inline media
- Theme, language, and personalization settings
- Responsive UI for desktop and mobile

## Tech Stack

- **Frontend**: React 19, TanStack Router v1, Zustand, Tailwind CSS v4
- **Backend**: FastAPI + Agno
- **Data**: Supabase, SQLite, PostgreSQL, MySQL, MariaDB support paths
- **Runtime**: Bun + Python 3.11+
- **Retrieval**: Embeddings + keyword hybrid search
- **Integration Layer**: Multi-provider model adapters, tool registry, streaming SSE

## Getting Started

1. **Prerequisites**
   - [Bun](https://bun.sh/) 1.3+
   - [Python](https://www.python.org/) 3.11+
   - [uv](https://docs.astral.sh/uv/)
   - A [Supabase](https://supabase.com/) project if you want hosted persistence

2. **Install**

```bash
git clone <your-repo-url>
cd Qurio
bun install
cd backend-python
uv sync
cd ..
```

3. **Configure environment**

- Copy `.env.example` to `.env`
- Add the keys you actually plan to use
- Typical variables include:
  - `PUBLIC_SUPABASE_URL`
  - `PUBLIC_SUPABASE_KEY`
  - `PUBLIC_TAVILY_API_KEY`
  - `PUBLIC_OPENAI_API_KEY`
  - `PUBLIC_OPENAI_BASE_URL`
  - `PUBLIC_GOOGLE_API_KEY`
  - `PUBLIC_SILICONFLOW_API_KEY`
  - `PUBLIC_KIMI_API_KEY`
  - `PUBLIC_MINIMAX_API_KEY`
  - `PUBLIC_GLM_API_KEY`
  - `PUBLIC_MODELSCOPE_API_KEY`
  - `PUBLIC_NVIDIA_API_KEY`

4. **Run**

```bash
# Frontend + Python backend
bun run dev:electron
```

Frontend: `http://localhost:3000`  
Backend: `http://127.0.0.1:3002`

```bash
# Frontend only
bun run dev:web

# Python backend only
bun run dev:py
```

5. **Build**

```bash
bun run build
```

6. **Build Windows installer**

```bash
bun run build:electron
```

## Usage Notes

- Configure providers in Settings before testing agents across multiple vendors.
- Use Deep Research when the task needs iteration, evidence, and structured synthesis.
- Use Spaces to isolate different projects, contexts, and document sets.
- Give specialized agents narrower tool access. Better boundaries produce better behavior.
- Keep a fast `Lite` model configured. It improves routing and lowers cost where full power is unnecessary.

## Project Structure

- `/src`: Frontend application
- `/src/components`: UI surfaces including chat, settings, agents, documents, and research
- `/src/lib`: Providers, backend client, search tools, agent utilities, and app state helpers
- `/backend-python/src`: FastAPI routes, Agno agent assembly, tool registry, memory, and research services

## License

**Non-commercial**. Provided for personal and educational use. See [LICENSE](./LICENSE).
