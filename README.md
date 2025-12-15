# Qurio - Multi-Provider AI Knowledge Workspace

![Bun](https://img.shields.io/badge/Bun-1.3+-000?logo=bun&logoColor=fff)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=000)
![TanStack Router](https://img.shields.io/badge/TanStack%20Router-v1-ff6b6b)
![RSBuild](https://img.shields.io/badge/RSBuild-fast-orange)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4-38bdf8?logo=tailwindcss&logoColor=fff)
![Supabase](https://img.shields.io/badge/Supabase-backend-3ecf8e?logo=supabase&logoColor=fff)

**Qurio** is a fast, polished AI Knowledge workspace for multi-provider setups (Gemini, SiliconFlow, OpenAI-compatible and more to come). Stream reasoning, keep knowledge organized, and switch themes on the fly.

## Why Qurio
- Ready for multiple AI providers with dual model slots (Lite + Default) and live model fetching.
- Chat-first UX: reasoning view, inline images, rich Markdown with code blocks, one-tap copy.
- Organized knowledge: spaces, bookmarks, and a library view; pin-able sidebar for focus.
- Production-grade feel: light/dark/system themes, emoji picker, keyboard shortcuts, responsive layouts.
- Backend ready: Supabase persistence with RLS, plus GitHub Pages deployment baked in.

## Highlights
- Chat-first UX: fast streaming replies, optional reasoning/thinking output, tool call support, rich markdown with code highlighting, and one-tap copy for AI messages.
- Multi-provider ready: Gemini, SiliconFlow, and generic OpenAI-compatible providers with dual model slots (Lite + Default) and live model fetching (SiliconFlow lists chat sub-type models only).
- Organized knowledge: spaces to group threads, a library view for recent conversations, bookmarks for quick recall, and a pin-able sidebar for focus.
- Question Timeline: innovative collapsible sidebar that displays user questions as interactive cards with search functionality, time-based grouping (Today, Yesterday, dates), and one-click navigation to any question.
- Configurable context: custom system prompt, adjustable context window, and per-provider model IDs (including custom inputs and OpenAI-compatible base URLs; SiliconFlow uses a fixed endpoint).
- Media friendly: attach images directly in the chat input and render them inline in the transcript.
- Built-in persistence: Supabase stores spaces, chat sessions, and messages with RLS isolation; test your connection from the Settings modal.
- Polished interface: light/dark/system themes, emoji picker, and keyboard shortcuts (Enter to send, Shift+Enter for a new line).

## Tech Stack
- React 19 + TanStack Router v1 for routing and layouts.
- Zustand for lightweight state management.
- RSBuild + Bun for fast dev/build, linting with ESLint/Prettier.
- Styling via Tailwind CSS v4, styled-components, and Lucide icons.
- AI clients: Google Generative AI SDKs plus the OpenAI SDK targeting SiliconFlow/OpenAI-compatible endpoints.
- Data layer: Supabase schema and migrations in `supabase/`.
- Markdown/rendering: `react-markdown`, `remark-gfm`, and `react-syntax-highlighter`.

## Getting Started
1. **Prerequisites**  
   - Bun 1.3+  
   - A Supabase project (for persistence)

2. **Install**  
   ```bash
   git clone <your-repo-url>
   cd qurio
   bun install
   ```

3. **Environment**  
   Copy `.env.example` to `.env` and fill in:
   - `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_KEY`
   - `PUBLIC_GOOGLE_API_KEY` (Gemini)
   - `PUBLIC_SILICONFLOW_API_KEY` (base URL is fixed to `https://api.siliconflow.cn/v1/`)
   - `PUBLIC_OPENAI_API_KEY` and optional `PUBLIC_OPENAI_BASE_URL`

4. **Database**  
   In Supabase, open the SQL editor and run `supabase/schema.sql` (or `supabase/init.sql`) to create tables and RLS policies.

5. **Develop**  
   ```bash
   bun run dev
   ```
   Open the shown local URL (default `http://localhost:5173`).

6. **Build / Lint**  
   ```bash
   bun run build
   bun run lint
   ```

## Usage Tips
- Open **Settings** to pick your provider, drop in API keys, test the Supabase connection, set the system prompt, and tune the context window.
- Use the **Model** section to fetch the latest models for Gemini/SiliconFlow (SiliconFlow is filtered to chat-only) or type a custom model ID/base URL for OpenAI-compatible endpoints.
- **Lite model** powers titles/related questions/space suggestions; **Default model** powers main chat responses.
- Create and edit **Spaces**, move threads between them, and star favorites in **Bookmarks**. Browse recent conversations in **Library**.
- Attach **images** directly in the chat input; copy AI responses with one click; toggle themes via the cycle control (light -> dark -> system).
- Use the **Question Timeline** feature: Click the "View Timeline" button to open a collapsible sidebar that displays all your questions as cards. Search through questions, navigate by time groups (Today, Yesterday, specific dates), and click any card to jump directly to that question in the conversation.

## Usage & License
- **Non-commercial only**: This project is provided for personal/educational use. Commercial use, resale, or production deployment is not permitted without explicit permission from the maintainers.
  See [LICENSE](./LICENSE).

## Project Routes (TanStack Router)
- `/new_chat` - start a fresh conversation
- `/conversation/:conversationId` - continue an existing thread
- `/spaces` and `/space/:spaceId` - manage and browse workspaces
- `/library` - recent conversations
- `/bookmarks` - starred threads

## Scripts
- `bun run dev` - start the dev server
- `bun run build` - production build with RSBuild
- `bun run preview` - preview the production build
- `bun run lint` - lint the project

## CI/CD Pipeline

This project uses GitHub Actions to deploy the `main` branch to GitHub Pages.

- **Deploy to GitHub Pages** (`.github/workflows/ci-cd.yml`): On push to `main`, installs deps, builds with Bun/RSBuild, uploads the `dist` artifact, and deploys to GitHub Pages.

## Contributing
Pull requests are welcome for non-commercial improvements (bug fixes, docs, UI polish). Please open an issue first for major changes.
