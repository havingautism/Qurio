# Perplexity Chat Startup

A React-based chat application with Supabase integration for data persistence.

## Features
- **Chat Interface**: A modern, responsive chat UI
- **Supabase Integration**: Stores conversations and messages in Supabase
- **Spaces**: Organize conversations into workspaces
- **Settings**: Configurable API keys and Supabase credentials

## Setup

### Prerequisites
- Node.js (v18+)
- A Supabase account ([sign up here](https://supabase.com))

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd perplexity_chat_startup
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create your Supabase project**
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Wait for the project to finish setting up

4. **Initialize the database**
   - Open your Supabase Dashboard
   - Go to **SQL Editor**
   - Copy the contents of `supabase/schema.sql`
   - Paste and click **Run**

5. **Configure your credentials**
   
   **Option A: Environment Variables (Recommended)**
   - Copy `.env.example` to `.env`
   - Fill in your Supabase URL and Anon Key from your project settings
   
   **Option B: In-App Settings**
   - Run the app and open Settings
   - Enter your Supabase URL and Anon Key
   - Click "Save Changes"

### Development

Run the development server:
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Database Schema

The application uses the following tables:
- **spaces**: Workspaces for organizing conversations
- **chat_sessions**: Individual conversations
- **messages**: Chat messages with AI responses

All tables use Row Level Security (RLS) based on `client-id` for data isolation.

## Configuration Priority

The app loads settings in this order:
1. Environment Variables (`.env` file)
2. LocalStorage (browser storage)
3. User input (Settings Modal)
