# Qurio - The AI Workstation for Research, Agents, and Real Execution

![Bun](https://img.shields.io/badge/Bun-1.3+-000?logo=bun&logoColor=fff)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=000)
![TanStack Router](https://img.shields.io/badge/TanStack%20Router-v1-ff6b6b)
![RSBuild](https://img.shields.io/badge/RSBuild-fast-orange)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4-38bdf8?logo=tailwindcss&logoColor=fff)
![Supabase](https://img.shields.io/badge/Supabase-backend-3ecf8e?logo=supabase&logoColor=fff)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/havingautism/Qurio)

> Qurio is not a chatbot skin. It is an operating surface for serious AI work.

**Qurio** is where chat turns into systems.

It combines multi-provider models, custom agents, arbitrary skills, MCP, HTTP tools, document retrieval, long-term memory, Deep Research, and Scrapbook into a single product. Instead of asking an LLM to "please remember this, maybe use this tool, maybe read this doc", you give it an actual operating environment.

You can route across Gemini, OpenAI-compatible providers, SiliconFlow, Kimi, MiniMax, GLM, NVIDIA NIM, ModelScope, and more. You can create agents with their own prompts, model pairings, tool permissions, visual identity, and reusable skills. You can import or create skills, attach MCP servers, wire in custom HTTP tools, save material into Scrapbook, run deep research workflows, inspect tool calls, and keep the whole thing grounded inside one workspace instead of scattering your workflow across five different products.

**Short version:** Qurio turns AI from "a place to ask questions" into "a place to run work."

## ✨ In Practice

Qurio is for the moments when plain chat starts to break down:

- You need an agent with its own tools, personality, and model strategy
- You need research with sources instead of confident guesswork
- You need documents, memory, and web results to show up in the same workflow
- You need tools that actually do things, not just get mentioned in a prompt
- You need reusable skills that can be attached to any agent instead of buried inside one giant prompt
- You need a place to throw links, notes, and references fast without losing them
- You want one interface for ideation, execution, retrieval, and follow-through

It is equally comfortable being a fast personal AI console, a research cockpit, or the control surface for more operational agent workflows.

## ⚔️ The Sharp Edge

Most AI products stop at "pick a model and chat."

Qurio pushes much further:

- **Any Agent can become a real operator** with a prompt, a model strategy, a bounded toolbelt, and attached skills
- **Any Skill can be mounted into Agent context** so behavior is modular, reusable, and not trapped inside one mega prompt
- **Any MCP or HTTP tool can become part of the workspace** and be exposed selectively through the UI
- **Scrapbook gives you a fast capture loop** for URLs, references, and raw material that should not vanish into chat history
- **Research, retrieval, memory, and action live together** instead of being split across separate apps and tabs

That combination is the product.

## 🖼️ Screenshots

### Home

![Home](./docs/screenshots/homeview.png)

### Conversation + Tool Calls

![Conversation + Tool Calls](./docs/screenshots/conversation-tools.png)

### Deep Research Workflow

![Deep Research Workflow](./docs/screenshots/deep-research.png)

### MCP Tool Groups

![MCP Tool Groups](./docs/screenshots/mcp_tools.png)

## 🚀 Why Qurio Hits Different

- **One workspace, many model brains**: Mix and match providers instead of getting locked into one stack.
- **Agents with actual operational boundaries**: Per-agent prompts, tools, skills, style, models, and workspace bindings.
- **Skills are first-class, not an afterthought**: Create them, import them, attach them, and reuse them across agents.
- **MCP is treated like infrastructure**: Grouped, manageable, and ready to become part of everyday workflows.
- **Scrapbook is a real product surface**: not a demo note pad, but a fast lane for saving links, references, and source material.
- **Research that behaves like a pipeline**: Plan, search, cite, synthesize, export.
- **Memory that is selective instead of bloated**: Inject only what matters instead of stuffing every prompt.
- **Tools that move beyond demos**: MCP servers, HTTP tools, web search, finance, image/video search, Wikipedia, arXiv, Hacker News, and more.
- **A UI built for power users**: Streaming, reasoning, citations, timeline, source panels, responsive layouts, and rich rendering.

## 🧠 What You Can Do

### 🔬 Deep Research

- Break a complex goal into steps, execute searches, gather sources, and assemble a structured report.
- Track source-backed claims with direct links and visible evidence.
- Run iterative research loops instead of one-shot "search and pray" prompts.
- Keep the whole process inspectable, from planning to evidence collection to final synthesis.
- Use it for market scans, technical investigations, academic research, product comparisons, and open-ended problem framing.

### 🤖 Custom Agents

- Create specialized agents with distinct prompts, identity, tone, and model strategy.
- Assign each agent a `Default` model for quality and a `Lite` model for routing, summaries, or planning.
- Bind agents to spaces so each workspace keeps a consistent operational style.
- Give one agent a strict analytical tone, another a warm support tone, and another a tool-heavy operator role without those behaviors bleeding into each other.
- Turn agents into durable workflow units instead of disposable chat presets.

### 🧩 Skills You Can Actually Reuse

- Create skills inside Qurio and attach them to any agent context.
- Import third-party skills from Git when you want to extend capability fast.
- Keep skill instructions, references, and scripts modular instead of stuffing every rule into one system prompt.
- Use skills to encode reusable behaviors, domain methods, operating checklists, or tool-usage discipline.

This is one of Qurio's most underrated advantages: capability can be packaged once and mounted many times.

### 🧰 Tooling and Execution

- Connect MCP servers over SSE or Streamable HTTP.
- Build custom HTTP tools from URLs and parameter templates.
- Enable or disable tools per agent so capabilities stay focused and safe.
- Use built-in tools for web/news search, Wikipedia, arXiv, Yahoo Finance, image search, video search, and Hacker News.
- Mix retrieval, search, scraping, and action tools in the same agent workflow instead of treating everything like a plain text completion.

### 🔌 MCP and Tool Ops

- Bring in remote MCP servers and manage them as grouped capabilities.
- Keep user tools, MCP tools, and built-in tools in one operational surface.
- Expose only the tools a given agent should see.
- Treat tool access like product design, not an all-or-nothing backend switch.

Qurio does not just "support tools." It gives them structure, visibility, and boundaries.

### 📚 Documents and Retrieval

- Upload documents, parse them into chunks, index them, and retrieve relevant context during chat.
- Combine embedding retrieval with keyword search for stronger recall in messy real-world corpora.
- Scope retrieval to selected files so context remains controllable.
- Use spaces and document selection to keep project context tight instead of flooding every conversation with irrelevant text.

### 🧷 Long-Term Memory

- Store durable user or workspace knowledge as structured memory summaries.
- Let lightweight routing decide when memory should be fetched.
- Keep prompts lean by injecting only relevant memory domains.
- Preserve useful personal or project context without turning every run into a giant, expensive prompt dump.

### 📌 Scrapbook

- Save URLs and source material quickly into a dedicated surface instead of losing them in chat scrollback.
- Generate summaries and titles around saved items.
- Re-open saved material as conversation context when you want to keep working from it.
- Treat captured links as reusable assets, not temporary clipboard clutter.

Scrapbook is one of the most product-defining parts of Qurio because it closes the loop between discovery, storage, and follow-up.

### 💬 Productivity UX

- Inspect tool calls and outputs without losing the conversation thread.
- Use structured message rendering with code, tables, citations, images, and sources.
- Switch between desktop and mobile without losing core capability.
- Run as a web app or desktop app workflow.
- Keep the interface readable during long sessions, with history, source views, and agent controls close at hand.

## 🧭 Product Principles

- **Execution over vibes**: The product is built to act, not just to answer.
- **Routing matters**: Fast models decide what to fetch and which expensive models should speak.
- **Grounding first**: Retrieval, memory, and tool outputs exist to make answers more trustworthy.
- **Agent boundaries are a feature**: An agent should not see every tool, every document, or every instruction by default.
- **Real workflows beat toy demos**: Research, planning, retrieval, and output structure are first-class citizens.

## 🌟 Feature Highlights

### 🌐 Multi-Provider by Default

- Google Gemini
- OpenAI and OpenAI-compatible endpoints
- SiliconFlow
- Kimi (Moonshot)
- MiniMax
- GLM (Zhipu)
- ModelScope
- NVIDIA NIM

Qurio is designed so provider choice feels like infrastructure, not a product fork. You can keep a fast model for routing, a stronger model for final answers, and still swap vendors as needs or pricing change.

### 🎛️ Agent Control Surface

- Identity, avatar, banner, tone, warmth, language, and advanced generation controls
- Global and per-agent model configuration
- Tool permissions and reusable skills
- Space-agent binding and automatic agent selection flows
- Enough structure to shape behavior intentionally, without turning configuration into a backend-only exercise

An agent in Qurio is not just a saved prompt. It is a configurable execution profile.

### 🧩 Skills as a Product Surface

- Internal skills can be mounted directly into agent context
- New skills can be authored from inside the app
- Skill references and scripts can be bundled with the skill itself
- Skill behavior remains portable across agents and workflows

This makes Qurio much more than a chat client with presets. It gives the system a real capability layer.

### 🔧 Tool Stack

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

The important part is not the raw number of tools. It is that tools can be surfaced, grouped, restricted, and attached to specific agents from the Qurio UI.

### 📎 Scrapbook + Memory Flywheel

- Capture interesting material fast
- Turn it into structured reference
- Pull it back into the right conversation later
- Let memory and retrieval keep compounding the value of saved work

That is the kind of loop that makes a workspace sticky.

### 🗂️ Knowledge and Memory

- Document upload, parsing, chunking, embedding, and retrieval
- Hybrid retrieval strategy
- Long-term memory with selective injection
- Research flows with source-aware output

This keeps answers closer to the user's actual material and makes the workspace more useful over time instead of resetting to zero every session.

### 🖥️ Polished Runtime Experience

- Streaming responses
- Visible tool activity
- Rich Markdown and code rendering
- Inline media
- Theme, language, and personalization settings
- Responsive UI for desktop and mobile

## 🏗️ Tech Stack

- **Frontend**: React 19, TanStack Router v1, Zustand, Tailwind CSS v4
- **Backend**: FastAPI + Agno
- **Data**: Supabase, SQLite, PostgreSQL, MySQL, MariaDB support paths
- **Runtime**: Bun + Python 3.11+
- **Retrieval**: Embeddings + keyword hybrid search
- **Integration Layer**: Multi-provider model adapters, tool registry, streaming SSE

## ⚡ Getting Started

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

## 🛠️ Usage Notes

- Configure providers in Settings before testing agents across multiple vendors.
- Use Deep Research when the task needs iteration, evidence, and structured synthesis.
- Use Spaces to isolate different projects, contexts, and document sets.
- Give specialized agents narrower tool access. Better boundaries produce better behavior.
- Keep a fast `Lite` model configured. It improves routing and lowers cost where full power is unnecessary.
- Start simple: one strong general agent, one research agent, one tool-heavy operator agent. That setup already covers most serious use.
- If you want to feel Qurio's real shape, try this stack: one research agent, one MCP-heavy operator, one writing agent, and Scrapbook as the shared capture layer.

## 🗃️ Project Structure

- `/src`: Frontend application
- `/src/components`: UI surfaces including chat, settings, agents, documents, and research
- `/src/lib`: Providers, backend client, search tools, agent utilities, and app state helpers
- `/backend-python/src`: FastAPI routes, Agno agent assembly, tool registry, memory, and research services

## 📄 License

**Non-commercial**. Provided for personal and educational use. See [LICENSE](./LICENSE).
