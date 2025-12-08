# Filo - Multi-Provider AI Chat Workspace

An opinionated AI chat experience built with React 19, TanStack Router v1, RSBuild on Bun, and Supabase for persistence. Plug in Google Gemini, SiliconFlow, or any OpenAI-compatible endpoint, stream responses with reasoning, organize conversations into spaces, and enjoy a polished UI with dark/light themes, inline images, and keyboard-friendly controls.

## Highlights
- Chat-first UX: fast streaming replies, optional reasoning/thinking output, tool call support, rich markdown with code highlighting, and one-tap copy for AI messages.
- Multi-provider ready: Gemini, SiliconFlow, and generic OpenAI-compatible providers with dual model slots (Lite + Default) and live model fetching (SiliconFlow lists chat sub-type models only).
- Organized knowledge: spaces to group threads, a library view for recent conversations, bookmarks for quick recall, and a pin-able sidebar for focus.
- Configurable context: custom system prompt, adjustable context window, and per-provider model IDs (including custom inputs and base URLs).
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
   cd perplexity_chat
   bun install
   ```

3. **Environment**  
   Copy `.env.example` to `.env` and fill in:
   - `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_KEY`
   - `PUBLIC_GOOGLE_API_KEY` (Gemini)
   - `PUBLIC_SILICONFLOW_API_KEY` and optional `PUBLIC_SILICONFLOW_BASE_URL`
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
- Use the **Model** section to fetch the latest models for Gemini/SiliconFlow (SiliconFlow is filtered to chat-only) or type a custom model ID/base URL for any OpenAI-compatible endpoint.
- **Lite model** powers titles/related questions/space suggestions; **Default model** powers main chat responses.
- Create and edit **Spaces**, move threads between them, and star favorites in **Bookmarks**. Browse recent conversations in **Library**.
- Attach **images** directly in the chat input; copy AI responses with one click; toggle themes via the cycle control (light -> dark -> system).

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
