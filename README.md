# Qurio - Multi-Provider AI Knowledge Workspace

![Bun](https://img.shields.io/badge/Bun-1.3+-000?logo=bun&logoColor=fff)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=000)
![TanStack Router](https://img.shields.io/badge/TanStack%20Router-v1-ff6b6b)
![RSBuild](https://img.shields.io/badge/RSBuild-fast-orange)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4-38bdf8?logo=tailwindcss&logoColor=fff)
![Supabase](https://img.shields.io/badge/Supabase-backend-3ecf8e?logo=supabase&logoColor=fff)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/havingautism/Qurio)

> Not another chat UI. Qurio is a research-grade cockpit for real work.

**Qurio** is a high-velocity AI knowledge workspace built for teams that demand more than basic chat. It supports generic OpenAI-compatible providers, Gemini, SiliconFlow, Kimi (Moonshot), MiniMax, GLM (Zhipu), NVIDIA NIM, and more. Highlights include **Deep Research** for complex tasks, **Custom Agents** for specialized workflows, rich tool orchestration (MCP + HTTP), and structured reasoning views with export-ready outputs. The stack is designed around **separation of concerns**: lightweight models for routing/planning, stronger models for answers, and structured storage for memory and documents.

**In one line:** plan, tool, and deliver from a single workspace without switching apps.

## Screenshots

<!--
Add screenshots by replacing the placeholders below.
Recommended size: 1600x900 or 1920x1080.
-->

### Home

![Home](./docs/screenshots/homeview.png)

### Conversation + Tool Calls

![Conversation + Tool Calls](./docs/screenshots/conversation-tools.png)

### Deep Research Workflow

![Deep Research Workflow](./docs/screenshots/deep-research.png)

### MCP Tool Groups

![MCP Tool Groups](./docs/screenshots/mcp_tools.png)

## Why Qurio

- **Multi-Provider Powerhouse**: Connect to almost any model (Gemini, OpenAI, Claude via compatible endpoints, SiliconFlow, Kimi, MiniMax, GLM, NIM, etc.) with dual model slots (Lite + Default).
- **Tool Orchestration Beyond LLM Chat**: Built-in MCP + HTTP tooling, tool grouping, and per-tool enable/disable controls so agents only see what you want them to use.
- **Deep Research, Not Just Search**: Dedicated research workflow that plans, executes, and reports with structured steps, citations, and export-ready outputs.
- **Agent System That Scales**: Per-agent prompts, model preferences, and toolsets with clean switching and workspace binding.
- **Document Intelligence**: Parse, embed, and retrieve across uploaded documents with hybrid search (vector + keyword) for grounded answers.
- **Long-Term Memory That Stays Useful**: Domain-indexed summaries with Lite routing so only relevant preferences/background get injected.
- **Premium UX**: Streaming, rich Markdown/Code rendering, inline images, reasoning visibility, and thoughtful UI for research/think/tool panels.
- **Production-Grade**: Light/Dark/System themes, secure API key handling, i18n (en/zh), responsive design, Supabase persistence.

## Design Philosophy

- **Route first, retrieve second**: Lite models decide if memory/docs are needed; only then inject relevant snippets.
- **Separation of models**: Fast models handle planning/routing; stronger models handle final answers.
- **Structured memory over keyword lists**: Domain-indexed summaries keep personalization usable and controllable.
- **Hybrid retrieval**: Vector + keyword search balances recall with precision for real-world docs.
- **Tool governance**: MCP groups, HTTP tools, and per-tool visibility keep agents safe and focused.

## Highlights

### 📱 Mobile PWA Support

- **Installable**: Add Qurio to your home screen on iOS/Android for an app-like experience.
- **Responsive UX**: Optimized layouts for mobile, tablets, and desktops with touch-friendly controls.
- **Seamless Sessions**: Stay signed in and continue where you left off with persistent conversations.

### 🔬 Academic Research Reports

- **Automated Research Pipeline**: Deep Research mode breaks down complex research goals into structured plans, conducts iterative web searches, and synthesizes comprehensive academic-style reports with proper citations.
- **Source Tracking**: All claims are backed by timestamped sources with direct links, ensuring research integrity and easy verification.
- **Export-Ready**: Generate polished reports in Markdown format, ready for academic or professional use.

### 🤖 Intelligent Agent System

- **Custom Agents**: Create specialized AI personas with unique system prompts, model preferences, and personality traits (tone, warmth, enthusiasm).
- **Automatic Agent Selection**: The system can intelligently select the best agent for your task based on context, or you can manually choose from your agent library.
- **Multi-Model Support**: Each agent can have dual model slots (Default + Lite) from different providers, optimizing for quality vs. speed.
- **Space-Agent Binding**: Assign specific agents to workspaces for consistent behavior across related conversations.

### 🧰 MCP + HTTP Tooling

- **MCP Tool Groups**: Connect external MCP servers (SSE or Streamable HTTP) and manage tools as groups.
- **Per-Tool Enable/Disable**: Keep tools saved while selectively hiding them from agents.
- **HTTP API Tools**: Define custom tools by URL, method, and JSON params; schemas are auto-generated from templates.
- **Interactive Forms**: Tools can request structured user input inline before execution.

### 🧾 Interactive Forms

- **Dynamic Form Generation**: AI agents can request structured input through beautifully rendered forms with various field types (text, number, select, textarea, etc.).
- **Real-time Validation**: Form inputs are validated before submission, ensuring data quality.
- **Seamless UX**: Forms appear inline in the conversation flow, maintaining context while collecting detailed information.

### Document Embeddings & Hybrid Search

- **Upload & Parse**: Add documents to a space; text is parsed and chunked automatically.
- **Hybrid Retrieval**: Combines embeddings with keyword search for stronger recall.
- **Context Controls**: Only selected documents are retrieved and injected per conversation.

### Long-Term Memory (Domain Routing)

- **Domain Index + Summary**: Memory is stored as domain cards with concise summaries.
- **Lite Gating**: A lightweight model decides if memory is needed and which domains to inject.
- **Selective Injection**: Only hit domains are appended, keeping prompts tight and relevant.

### 🌐 Extended Provider Support

Out-of-the-box support for:

- **Google Gemini** (Native SDK with Thinking mode)
- **SiliconFlow** (DeepSeek-R1, Qwen, etc.)
- **Kimi (Moonshot)**
- **MiniMax**
- **GLM (Zhipu AI)**
- **ModelScope**
- **NVIDIA NIM**
- **OpenAI & Compatibles** (Any standard endpoint)

### 🖼️ Automatic Image Search & Rendering

- **Zero-Config Search**: Powered by DuckDuckGo, agents can search for images to illustrate concepts without any API keys or extra deployment steps.
- **Premium Google Images**: Supports `SerpApi` for high-quality Google Image results; simply add `SERP_API_KEY` to your environment.
- **Markdown Rendering**: AI automatically inserts `![caption](url)` images into its responses where appropriate (e.g., explaining species, logos, or diagrams).
- **Default Enabled**: No buttons to toggle; the agent intelligently decides when a visual aid is helpful.

### 🧩 Production-Grade Features

- **Question Timeline**: Interactive history cards grouped by time (Today, Yesterday, Past 7 Days) with instant search.
- **Security & Privacy**: API keys stored securely in Supabase or kept in-memory (never in LocalStorage for sensitive keys).
- **Personalization**: Adjust font sizes, interface language (en/zh), AI response styles, and theme (Light/Dark/System).
- **Media Support**: Drag & drop images, paste screenshots, and render inline media with vision-capable models.

## Tech Stack

- **Frontend**: React 19, TanStack Router v1, Zustand (State), Tailwind CSS v4, Lucide Icons — componentized UI with predictable state.
- **Build**: RSBuild + Bun — fast dev loops and reproducible builds.
- **Data**: Supabase (PostgreSQL) — structured persistence for spaces, messages, documents, and long-term memory.
- **AI Integration**: Custom adapter layer that normalizes providers and enforces model routing (Lite vs Default).
- **Retrieval**: Embeddings + keyword hybrid search to reduce misses and hallucinations.
- **Rendering**: `react-markdown`, `remark-gfm`, `react-syntax-highlighter` for reliable output UX.

## Getting Started

1. **Prerequisites**
   - [Bun](https://bun.sh/) 1.3+
   - [Python](https://www.python.org/) 3.11+
   - [uv](https://docs.astral.sh/uv/) (Python package manager)
   - A [Supabase](https://supabase.com/) project (for persistence)
   - [Tavily](https://tavily.com/) API Key (essential for Web Search & Deep Research)

2. **Install**

   ```bash
   git clone <your-repo-url>
   cd qurio
   bun install
   cd backend-python
   uv sync
   cd ..
   ```

3. **Environment**
   Copy `.env.example` to `.env` and configure your keys. Key variables include:
   - `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_KEY`
   - `PUBLIC_TAVILY_API_KEY` (Required for Search/Deep Research)

   **Provider Keys (Optional depending on usage):**
   - `PUBLIC_GOOGLE_API_KEY`
   - `PUBLIC_OPENAI_API_KEY` & `PUBLIC_OPENAI_BASE_URL`
   - `PUBLIC_SILICONFLOW_API_KEY`
   - `PUBLIC_KIMI_API_KEY`
   - `PUBLIC_MINIMAX_API_KEY`
   - `PUBLIC_GLM_API_KEY`
   - `PUBLIC_MODELSCOPE_API_KEY`
   - `PUBLIC_NVIDIA_API_KEY`

4. **Database Setup**
   In your Supabase dashboard, open the SQL Editor and run the contents of `supabase/schema.sql`. This creates the necessary tables (spaces, conversations, messages, settings, etc.) and Row Level Security (RLS) policies.

5. **Run (Frontend + Python Backend)**

   ```bash
   # Web + Python backend
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

6. **Build**
   ```bash
   bun run build
   ```

7. **Build Windows Installer (.exe)**
   ```bash
   bun run build:electron
   ```

## Usage Tips

- **Settings**: Click the gear icon to set up providers. You can verify your Supabase connection and input API keys directly in the UI if you didn't set them in `.env`.
- **Deep Research**: Navigate to the "Deep Research" tab (Microscope icon) to start a comprehensive research task. This mode automatically browses the web and aggregates information.
- **Agents**: Use the "Agents" menu to create specialized personas. Assign a "Coding God" agent to use a high-reasoning model like `DeepSeek-R1` or `o1`, and a "Casual Chat" agent to use `Gemini Flash`.
- **Search**: The "Web Search" toggle uses Tavily to fetch real-time info. It's automatically invoked by Deep Research but can be toggled manually in normal chat.
- **Shortcuts**:
  - `Enter` to send, `Shift+Enter` for newline.
  - `Cmd/Ctrl + K` (if implemented) or UI buttons to switch agents/models quickly.
- **Styling**: Go to Settings -> Appearance to toggle Dark Mode or adjust Font Size.

## Project Structure

- `/src/lib/providers.js`: Core logic for adapting different AI APIs.
- `/src/components/chat`: Chat interface components (Input, Bubble, Header).
- `/src/views`: Top-level route views (Home, Conversation, DeepResearch, Spaces).
- `/supabase`: SQL migrations and schema definitions.

## Contributing

Pull requests are welcome for improvements (UI polish, new providers, bug fixes). Please open an issue for major feature requests.

## License

**Non-commercial**: Provided for personal and educational use. See [LICENSE](./LICENSE).
