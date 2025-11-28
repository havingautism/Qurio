# Perplexity Chat Startup

A React-based chat application with Supabase integration for data persistence.

## Features
- **Chat Interface**: A modern, responsive chat UI.
- **Supabase Integration**: Stores conversations and messages in Supabase.
- **Settings**: Configurable API keys and Supabase credentials.

## Setup

### Prerequisites
- Node.js
- Supabase Account

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

### Configuration
You can configure Supabase credentials in three ways (in order of priority):
1. **Environment Variables**: Create a `.env` file with:
   ```
   VITE_SUPABASE_URL=your_url
   VITE_SUPABASE_KEY=your_key
   ```
2. **LocalStorage**: The app will check `localStorage` for `supabaseUrl` and `supabaseKey`.
3. **Settings Modal**: Enter your credentials directly in the application settings.

## Development
Run the development server:
```bash
npm run dev
```
