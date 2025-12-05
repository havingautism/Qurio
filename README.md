# Perplexity Chat Startup

一个基于 React 的聊天应用程序，集成了 Supabase 进行数据持久化。该应用使用 React Router 进行路由管理。

## 特性

- **聊天界面**: 现代化、响应式的聊天用户界面
- **消息复制**: 一键复制 AI 回复内容，包括来源和相关问题
- **Supabase 集成**: 在 Supabase 中存储对话和消息
- **空间管理**: 将对话组织到不同的工作空间中
- **设置配置**: 可配置的 API 密钥和 Supabase 凭据
- **主题切换**: 支持系统主题，可手动切换明暗模式
- **对话管理**: 收藏、删除和组织对话
- **代码语法高亮**: 美观的代码块，支持语法高亮
- **图片支持**: 在对话中上传和显示图片
- **React Router**: 使用 React Router v7 进行客户端路由管理，支持：
  - 声明式路由配置
  - 代码分割和懒加载
  - 路由级别的数据预加载
  - 浏览器历史记录管理

## 安装和设置

### 前置要求

- [Bun](https://bun.sh) v1.3+
- 一个 Supabase 账户 ([在此注册](https://supabase.com))

### 安装步骤

1. **克隆仓库**

   ```bash
   git clone <你的仓库地址>
   cd perplexity_chat_startup
   ```

2. **安装依赖**

   ```bash
   bun install
   ```

   这将安装包括 React Router v7 在内的所有必要依赖。

3. **创建 Supabase 项目**
   - 访问 [supabase.com](https://supabase.com)
   - 创建一个新项目
   - 等待项目设置完成

4. **初始化数据库**
   - 打开你的 Supabase Dashboard
   - 进入 **SQL Editor**
   - 复制 `supabase/schema.sql` 的内容
   - 粘贴并点击 **Run**

5. **配置你的凭据**

   **选项 A: 环境变量（推荐）**
   - 复制 `.env.example` 为 `.env`
   - 填写你的 Supabase URL 和 Anon Key（从项目设置中获取）

   **选项 B: 应用内设置**
   - 运行应用并打开设置
   - 输入你的 Supabase URL 和 Anon Key
   - 点击"保存更改"

### 开发

运行开发服务器：

```bash
bun run dev
```

在浏览器中打开 [http://localhost:5173](http://localhost:5173)。

## 路由结构

应用程序使用 React Router v7 实现以下路由结构：

- `/` - 主页视图（新聊天）
- `/new_chat` - 新建聊天页面
- `/conversation/:conversationId` - 特定对话视图
- `/spaces` - 空间列表视图
- `/space/:spaceId` - 特定空间视图
- `/library` - 对话库视图
- `/bookmarks` - 收藏的对话视图

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
