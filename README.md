# Perplexity Chat Startup

A React-based chat application with Supabase integration for data persistence.

## Features
- **Chat Interface**: A modern, responsive chat UI
- **Message Copy**: One-click copy functionality for AI responses including sources and related questions
- **Supabase Integration**: Stores conversations and messages in Supabase
- **Spaces**: Organize conversations into workspaces
- **Settings**: Configurable API keys and Supabase credentials
- **Dark/Light Theme**: System theme support with manual toggle options
- **Conversation Management**: Bookmark, delete, and organize conversations
- **Code Syntax Highlighting**: Beautiful code blocks with syntax highlighting
- **Image Support**: Upload and display images in conversations

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

## Usage

### Chat Features
- **Start Conversation**: Type your message and press Enter or click the arrow button
- **Copy Messages**: Click the "Copy" button on any AI response to copy the complete content
- **Image Upload**: Click the paperclip icon to upload images
- **Search Toggle**: Enable web search for real-time information
- **Thinking Mode**: View AI reasoning process before getting the final answer

### Organization
- **Spaces**: Create dedicated workspaces for different topics
- **Bookmarks**: Mark important conversations for quick access
- **Conversation History**: All conversations are automatically saved and organized by date

### Settings
- **API Provider**: Choose between different AI providers
- **Theme**: Light, dark, or system theme
- **Supabase Configuration**: Set up your database credentials

### Keyboard Shortcuts
- `Enter`: Send message
- `Shift + Enter`: New line in message input

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
