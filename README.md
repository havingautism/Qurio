# Qurio

![Bun](https://img.shields.io/badge/Bun-1.3+-000?logo=bun&logoColor=fff)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=000)
![TanStack Router](https://img.shields.io/badge/TanStack%20Router-v1-ff6b6b)
![RSBuild](https://img.shields.io/badge/RSBuild-fast-orange)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4-38bdf8?logo=tailwindcss&logoColor=fff)
![Supabase](https://img.shields.io/badge/Supabase-backend-3ecf8e?logo=supabase&logoColor=fff)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/havingautism/Qurio)

> ⚙️ An AI workspace for people who need more than chat.

There is a point where chat stops being useful on its own.

It happens when one conversation is no longer enough. You need one agent to research, another to operate tools, a place to keep documents and memory in play, and a workflow that does not fall apart the moment the task becomes real.

Qurio is built for that point. It brings multi-provider models, custom agents, reusable skills, MCP servers, HTTP tools, retrieval, long-term memory, Deep Research, and Scrapbook into one operating surface.

🧭 The goal is simple: turn AI from something you ask into something you can run work through.

## 🚩 Why It Exists

Qurio is for workflows that outgrow ordinary chat:

- You want one agent to research, another to operate tools, and a third to write without collapsing them into one giant prompt.
- You need evidence, citations, and visible tool activity instead of polished guesswork.
- You want MCP, HTTP tools, search, documents, and memory in the same loop.
- You want reusable skills that can move across agents instead of living inside one brittle system prompt.
- You need a fast place to capture links, notes, and source material before they disappear into chat history.

This is not a chatbot skin. It is a workspace for running AI-assisted work with structure, boundaries, and follow-through.

## ✨ What Makes Qurio Different

- **Agents are execution profiles, not saved prompts.** Each agent can have its own prompt, identity, model pair, tool permissions, and attached skills.
- **Skills are first-class.** You can create them, import them, bundle references and scripts with them, and mount them across agents.
- **Tools have structure.** MCP servers, HTTP tools, and built-in tools can be grouped, surfaced, restricted, and inspected from the UI.
- **Research is treated as a workflow.** Plan, search, inspect sources, synthesize, and keep the evidence attached.
- **Memory and retrieval stay selective.** Pull in what matters instead of flooding every run with context.
- **Scrapbook closes the loop.** Save useful material quickly, then bring it back when it is time to continue.

## 🖼️ Screenshots

### 🏠 Home

![Home](./docs/screenshots/homeview.png)

### 💬 Conversation + Tool Calls

![Conversation + Tool Calls](./docs/screenshots/conversation-tools.png)

### 🔎 Deep Research Workflow

![Deep Research Workflow](./docs/screenshots/deep-research.png)

### 🧰 MCP Tool Groups

![MCP Tool Groups](./docs/screenshots/mcp_tools.png)

## 🧠 Core Capabilities

### 🔎 Deep Research

- Break a broad question into steps, run search loops, gather evidence, and produce a structured report.
- Keep source-backed claims visible instead of hiding them behind a final answer.
- Inspect the path from planning to evidence collection to synthesis.

### 🤖 Custom Agents

- Create agents with distinct prompts, tone, identity, model strategy, and tool access.
- Use a stronger `Default` model for final output and a cheaper `Lite` model for routing, summaries, or planning.
- Bind agents to spaces so each workspace keeps a clear operating style.

### 🧩 Skills

- Author skills inside Qurio or import them from Git.
- Package instructions, scripts, and references together.
- Reuse the same capability layer across multiple agents.

### 🧰 Tools and MCP

- Connect MCP servers over SSE or Streamable HTTP.
- Build custom HTTP tools from endpoint URLs and parameter templates.
- Combine built-in search, finance, image, video, Wikipedia, arXiv, and Hacker News tooling with your own tool stack.
- Expose only the tools an agent should see.

### 📚 Documents, Retrieval, and Memory

- Upload documents, chunk them, index them, and retrieve relevant context during chat.
- Use hybrid retrieval to improve recall in real-world material.
- Store long-term memory as structured summaries and inject it selectively.

### 📌 Scrapbook

- Save URLs and source material quickly.
- Generate summaries and titles around saved items.
- Bring saved material back into the next conversation instead of losing it in scrollback.

## 🧭 Product Principles

- **Execution over theatrics.** The product should help complete work, not just generate plausible text.
- **Boundaries matter.** Agents should not see every instruction, document, or tool by default.
- **Grounding comes first.** Retrieval, memory, and tool outputs exist to make answers more reliable.
- **Good routing saves money and time.** Fast models should decide what to fetch and when stronger models are worth it.
- **Real workflows beat demo flows.** Research, planning, capture, retrieval, and follow-through need to live in the same system.

## 🌐 Provider Support

Qurio is designed for mixed-model environments rather than single-vendor lock-in.

Current provider paths include:

- Google Gemini
- OpenAI and OpenAI-compatible endpoints
- SiliconFlow
- Kimi
- MiniMax
- GLM
- ModelScope
- NVIDIA NIM

The point is not just provider count. It is the ability to route differently for planning, retrieval, and final output without changing products.

## 🏗️ Tech Stack

- **Frontend:** React 19, TanStack Router v1, Zustand, Tailwind CSS v4
- **Backend:** FastAPI + Agno
- **Runtime:** Bun + Python 3.11+
- **Data:** Supabase, SQLite, PostgreSQL, MySQL, MariaDB support paths
- **Retrieval:** Embeddings + keyword hybrid search
- **Integration Layer:** Multi-provider model adapters, tool registry, streaming SSE

## ⚡ Getting Started

### ✅ Prerequisites

- [Bun](https://bun.sh/) 1.3+
- [Python](https://www.python.org/) 3.11+
- [uv](https://docs.astral.sh/uv/)
- A [Supabase](https://supabase.com/) project if you want hosted persistence

### 📦 Install

```bash
git clone <your-repo-url>
cd Qurio
bun install
cd backend-python
uv sync
cd ..
```

### 🔐 Configure Environment

- Copy `.env.example` to `.env`.
- Add only the keys you plan to use.
- Common variables include:
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

### ▶️ Run

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

### 🛠️ Build

```bash
bun run build
```

### 🪟 Build Windows Installer

```bash
bun run build:electron
```

## 📝 Usage Notes

- Configure providers in Settings before testing cross-vendor routing.
- Use Deep Research for tasks that need iteration, evidence, and structured synthesis.
- Keep agent tool access narrow. Better boundaries usually produce better behavior.
- Keep a fast `Lite` model configured to lower cost and improve routing.
- A practical starting setup is one general agent, one research agent, one tool-heavy operator, and Scrapbook as the shared capture layer.

## 🗂️ Project Structure

- `/src`: Frontend application
- `/src/components`: UI surfaces for chat, settings, agents, documents, and research
- `/src/lib`: Providers, backend client, search tools, agent utilities, and app state helpers
- `/backend-python/src`: FastAPI routes, Agno agent assembly, tool registry, memory, and research services

## 📄 License

**Non-commercial.** Provided for personal and educational use. See [LICENSE](./LICENSE).
