# 图片与视频搜索功能集成总结 (2026-02-14)

本文档总结了近期对图片/视频搜索系统及工具调用展示进行的视觉与功能优化，涵盖了从后端集成到前端表现的全方位改动。

## 1. 图片搜索功能集成 (Image Search Integration)

### 1.1 后端工具实现

我们实现了两个自定义图片搜索工具类。**两者都不是 Agno SDK 内置工具**，而是基于 `agno.tools.Toolkit` 基类自行开发的独立实现：

| 工具类 | 搜索引擎 | API 依赖 | 文件位置 |
|--------|----------|----------|----------|
| `DuckDuckGoImageTools` | DuckDuckGo | **无需配置**，开箱即用 | `custom_tools.py` |
| `SerpApiImageTools` | Google / Bing / Yahoo 等 | 需要 `SERPAPI_API_KEY` | `custom_tools.py` |

**关于 SerpApi**：
- SerpApi 本身不是搜索引擎，而是一个**聚合 API 服务**
- 通过 SerpApi 可以访问多个搜索引擎：`google_images`、`bing_images`、`yahoo_images` 等
- 只需一个 API Key 即可使用多种搜索引擎能力

**实现特点**：
- 继承自 `agno.tools.Toolkit` 基类
- 统一的 JSON 输出格式：`{title, image, url, source}`
- `SerpApiImageTools` 提供三个方法：
  - `google_image_search` - Google 图片搜索
  - `bing_image_search` - Bing 图片搜索
  - `serpapi_image_search` - 通用方法，支持指定引擎参数

**Agno Toolkit 工具注册机制**：

工具方法通过两个步骤关联到 Toolkit：

1. **`@tool` 装饰器** - 标记方法为可被 AI 调用的工具，自动提取方法名、docstring 和参数 Schema
2. **`__init__` 中的 `tools` 列表** - 将方法注册到 Toolkit，告诉 Agent 有哪些工具可用

```python
class SerpApiImageTools(Toolkit):
    def __init__(self, api_key: str | None = None, include_tools: list[str] | None = None):
        super().__init__(
            name="SerpApiImageTools",
            tools=[self.google_image_search, self.bing_image_search, self.serpapi_image_search],
            include_tools=include_tools,
        )

    @tool
    async def google_image_search(self, query: str, max_results: int = 5) -> str:
        return await self._serpapi_search(query, engine="google_images", max_results=max_results)

    # 内部方法，无 @tool 装饰器，AI 无法直接调用
    async def _serpapi_search(self, query: str, engine: str, max_results: int) -> str:
        # 实际调用 SerpApi 的逻辑
        ...
```

### 1.2 SerpApi 配置

SerpApi 需要 API Key 才能使用，配置方式：

1. **环境变量**：设置 `PUBLIC_SERPAPI_API_KEY`
2. **Settings Modal**：在设置界面的 "SerpApi 配置" 部分输入 API Key

配置界面提供：
- 标题与描述说明
- API Key 输入框（支持从环境变量加载）
- 备注提示：目前用于图片搜索和 YouTube 视频搜索

### 1.3 Agent 集成逻辑

**工具注册**：在 `tool_registry.py` 中定义 `IMAGE_SEARCH_TOOLS` 元数据

**条件启用策略**：

| 工具 | 启用条件 | 说明 |
|------|----------|------|
| `DuckDuckGoImageTools` | **始终可用** | 零配置，开箱即用 |
| `SerpApiImageTools` | **需要 API Key** | 配置后才传递给 Agent |

```python
# agent_registry.py
if serpapi_include and request.serpapi_api_key:  # 只有配置了 key 才添加
    toolkits.append(SerpApiImageTools(api_key=request.serpapi_api_key, ...))
```

**指令注入**：引导 AI 在解释复杂概念时主动调用图片搜索，并使用 Markdown 语法渲染

## 2. 视频搜索功能集成 (Video Search Integration)

### 2.1 后端工具实现

视频搜索同样基于 `agno.tools.Toolkit` 实现了自定义工具：

| 工具类 | 搜索引擎 | API 依赖 | 文件位置 |
|--------|----------|----------|----------|
| `DuckDuckGoVideoTools` | DuckDuckGo (多来源) | **无需配置**，开箱即用 | `custom_tools.py` |
| `SerpApiTools` (Agno SDK) | YouTube | 需要 `SERPAPI_API_KEY` + `google-search-results` 包 | Agno SDK 内置 |

**DuckDuckGoVideoTools 实现特点**：
- 继承自 `agno.tools.Toolkit` 基类
- 使用 `duckduckgo_search` 库的 `DDGS().videos()` 方法
- JSON 输出格式：`{title, url, thumbnail, source, duration, published}`
- **多来源支持**：返回结果可能包含 YouTube、Vimeo、Dailymotion、Bilibili 等平台

**SerpApiTools (YouTube)**：
- 使用 Agno SDK 内置的 `SerpApiTools`
- 需要安装 `google-search-results` 包：`uv pip install google-search-results`
- 通过 `enable_search_youtube=True` 启用 YouTube 搜索

### 2.2 Agent 集成逻辑

**条件启用策略**：

| 工具 | 启用条件 | 说明 |
|------|----------|------|
| `DuckDuckGoVideoTools` | **始终可用** | 零配置，开箱即用 |
| `SerpApiTools (YouTube)` | **需要 API Key + 依赖包** | 配置后才传递给 Agent |

```python
# agent_registry.py
# DuckDuckGo Video Search - always available
if "duckduckgo_video_search" in include_set:
    toolkits.append(DuckDuckGoVideoTools(include_tools=["duckduckgo_video_search"]))

# YouTube Search via SerpApi - only add if API key is configured
if "search_youtube" in include_set and request.serpapi_api_key:
    toolkits.append(AgnoSerpApiTools(api_key=request.serpapi_api_key, enable_search_youtube=True))
```

**指令注入**：
```python
if "duckduckgo_video_search" in enabled_names or "search_youtube" in enabled_names:
    instructions_list.append(
        "When users ask about tutorials, demonstrations, or topics that benefit from video content, "
        "you should use the video search tools to find relevant videos. "
        "ALWAYS include video links in your response using markdown format with descriptive text."
    )
```

### 2.3 前端视频渲染

**渲染逻辑**：
1. 从 `toolCallHistory` 提取视频搜索结果到 `allVideoResults`
2. 在 markdown `a` 组件中检测链接是否来自视频搜索
3. 如果是 YouTube 链接，渲染为嵌入式 iframe

**YouTube iframe 渲染**：
```jsx
// 检测 YouTube URL 并转换为 embed URL
const getYouTubeEmbedUrl = (url) => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ]
  // 匹配后返回 https://www.youtube.com/embed/{id}
}

// 在 markdown a 组件中
if (videoResult && getYouTubeEmbedUrl(safeHref)) {
  return (
    <span className="my-3 block aspect-video w-full max-w-md overflow-hidden rounded-lg">
      <iframe src={embedUrl} allowFullScreen ... />
    </span>
  )
}
```

**使用 `<span>` 而非 `<div>`**：
- Markdown 链接 `[text](url)` 会被解析在 `<p>` 标签内
- `<div>` 不能嵌套在 `<p>` 中，会导致 HTML 水合错误
- 使用 `<span className="block">` 保持有效 HTML 结构

## 3. 工具调用展示优化 (Tool Call Refinement)

为了统一搜索类工具的视觉语言，我们将"图片搜索"和"视频搜索"类型的工具调用样式与标准"网络搜索"进行了高度对齐：

- **视觉统一化**：图片/视频搜索工具不再直接显示原始函数名，而是统一显示为友好的 **"图片搜索"** / **"视频搜索"**。
- **后端图标透传**：
    - 图片搜索：Google G 图标、DuckDuckGo 鸟图标、Bing 图标等
    - 视频搜索：YouTube 图标、DuckDuckGo 鸟图标
- **内容预览**：实时解析并显示搜索查询内容（带引号的 Query）
- **多语言适配**：全面支持中英文翻译

**工具常量配置** (`toolConstants.js`)：
```javascript
TOOL_TRANSLATION_KEYS = {
  duckduckgo_image_search: 'tools.imageSearch',
  google_image_search: 'tools.imageSearch',
  duckduckgo_video_search: 'tools.videoSearch',
  search_youtube: 'tools.videoSearch',
}

TOOL_ICONS = {
  duckduckgo_image_search: 'ImageIcon',
  duckduckgo_video_search: 'Video',
  search_youtube: 'Youtube',
}
```

## 4. 沉浸式图片画廊 (Premium Image Gallery)

我们为图片实现了一套极简且高端的全屏画廊系统：

- **极简美学**：使用 `backdrop-blur-xl`（特大背景模糊）配合半透明蒙层，提供沉浸式体验。
- **智能元数据展示**：
    - 底部显示图片标题与来源，并带有柔和的渐变阴影。
    - 来源标签动态提取 URL 域名并搭配 Globe 图标，支持点击跳转。
- **交互细节**：支持全屏下通过左右方向键切换及 Esc 键快速退出，画廊内自动过滤失效图片。

## 5. 图片加载与错误处理 (Robust Error Handling)

针对 Web 图片的不确定性，引入了优雅的容错机制：

- **静默渐入 (Silent Fade-in)**：配合 500ms 淡入动画，消除加载时的突兀闪烁。
- **智能错误占位卡片**：
    - 当图片因 CORS 或链接失效无法显示时，以自定义卡片替换破碎图标，提示"图片加载出错了"。
    - 提供 **"尝试打开原图链接"** 入口。
- **域名动态解析**：错误状态下仍显示域名（如 `bbc.com`），提升专业感并帮助判断来源。

## 6. 流式渲染优化 (Streaming Render Optimization)

### 6.1 问题描述

在流式渲染过程中，`MessageBubble` 组件会随着内容更新频繁重渲染，导致已加载的图片出现闪烁或重新加载。

**根本原因分析**：

```
toolCallHistory 变化 → allImageResults 变化 → openGallery 变化 → markdownComponents 重建
                                                              ↓
                                                    img 渲染函数被重新创建
                                                              ↓
                                                    MessageImage 被卸载重挂载
```

即使 `MessageImage` 用了 `memo`，但当 `markdownComponents` 变化时，React Markdown 会重新渲染整个组件树，导致图片组件被卸载并重新挂载。

### 6.2 解决方案

采用三层优化策略：

#### 1. 组件记忆化 (React.memo)

```jsx
const MessageImage = memo(({ src, alt, openGallery, onImageError, isFailed, imageMetadataRef }) => {
  // 从 ref 中读取 metadata，避免 props 变化
  const metadata = imageMetadataRef?.current?.find(r => r.src === src)
  // ...
})
```

#### 2. 使用 useRef 稳定依赖

**问题**：`allImageResults` 和 `messageImages` 在流式过程中会变化，导致 `markdownComponents` 重建。

**解决**：使用 `useRef` 存储数据，组件从 ref 中读取，避免触发依赖更新：

```jsx
// 用 ref 存储图片/视频元数据，避免触发 markdownComponents 重建
const imageMetadataRef = useRef([])
const videoMetadataRef = useRef([])

const allImageResults = useMemo(() => {
  const results = [...]
  // 更新 ref 而不是触发依赖
  imageMetadataRef.current = results
  return results
}, [toolCallHistory])

const allVideoResults = useMemo(() => {
  const results = [...]
  videoMetadataRef.current = results
  return results
}, [toolCallHistory])
```

#### 3. 移除不稳定依赖

`markdownComponents` 的依赖排除 `allImageResults` 和 `allVideoResults`，使用 ref 传递数据。

### 6.3 效果

```
之前：mainContent 变化 → messageImages 变化 → openGallery 变化 → markdownComponents 重建 → 图片闪烁

现在：mainContent 变化 → messageImages 变化（但 ref 更新，不触发重建）
                     → openGallery 引用稳定（空依赖）
                     → markdownComponents 不重建
                     → 图片组件保持挂载状态
```

- 流式内容更新时，已渲染的图片不会重新挂载
- 图片加载状态（`isLoaded`、`hasError`）在流式过程中保持稳定
- 彻底消除图片闪烁问题

## 7. 技术健壮性与架构优化

- **语义化修复**：修复了 Markdown 渲染器中 `div` 嵌套在 `p` 标签内导致的水合错误 (Hydration Error)，改用 `inline-block span` 实现。
- **交互反馈**：引入 Inner-Zoom 模式（容器内缩放），配合 `shadow-lg` 反馈。
- **i18n 全覆盖**：所有新增字符均已整合进标准 i18n 流程。

---

## 8. 待改进问题 (Known Issues & Future Improvements)

### 8.1 表格中的图片/视频渲染问题

**问题描述**：
当 AI 在 markdown 表格中返回图片或视频链接时，可能出现布局问题：

| 内容类型 | 表格中的表现 | 原因 |
|----------|-------------|------|
| 图片 `<img>` | **正常** | 行内元素，可自适应缩放 |
| 视频 `<iframe>` | **可能异常** | 块级元素，固定宽高比 (16:9)，最小宽度较大 |

**影响**：
- iframe 在表格单元格中可能撑破布局、显示变形或被挤压
- 用户体验不一致

**潜在解决方案**：
1. **React Context 检测表格**：在表格上下文中渲染缩略图+链接而非 iframe
2. **Agent 指令引导**：通过 prompt 引导模型不在表格中使用视频链接
3. **独立的视频展示区**：像工具调用卡片一样单独展示视频结果

### 8.2 视频平台支持限制

**当前状态**：
- 只有 **YouTube** 链接会渲染为嵌入式 iframe
- 其他平台（Vimeo、Bilibili、Dailymotion 等）显示为普通链接

**原因**：
- `getYouTubeEmbedUrl` 函数只实现了 YouTube URL 的解析和转换
- 不同平台的 embed URL 格式不同

**潜在改进**：
```javascript
// 可扩展支持更多平台
const getVideoEmbedUrl = (url) => {
  // YouTube
  if (url.match(/youtube\.com|youtu\.be/)) return getYouTubeEmbedUrl(url)
  // Vimeo
  if (url.match(/vimeo\.com/)) return getVimeoEmbedUrl(url)
  // Bilibili
  if (url.match(/bilibili\.com/)) return getBilibiliEmbedUrl(url)
  return null
}
```

**平台 embed URL 参考**：
| 平台 | Embed URL 格式 |
|------|---------------|
| YouTube | `youtube.com/embed/{id}` |
| Vimeo | `player.vimeo.com/video/{id}` |
| Bilibili | `player.bilibili.com/player.html?bvid={id}` |
| Dailymotion | `dailymotion.com/embed/video/{id}` |

### 8.3 视频渲染一致性

**问题描述**：
视频链接有时渲染为 iframe，有时渲染为普通链接，取决于：
1. 链接是否在 `videoMetadataRef` 中（是否来自视频搜索工具）
2. 链接是否是支持的平台（目前只有 YouTube）

**影响**：
- 用户可能困惑为何某些视频可以嵌入播放，某些只能跳转

---

> **涉及文件**：
> - `src/components/MessageBubble.jsx` - 图片/视频渲染组件与 memo 优化
> - `src/lib/toolConstants.js` - 工具常量定义
> - `src/locales/zh-CN.json` / `en.json` - 国际化翻译
> - `backend-python/src/services/custom_tools.py` - 图片/视频搜索工具实现
> - `backend-python/src/services/tool_registry.py` - 工具元数据注册
> - `backend-python/src/services/agent_registry.py` - Agent 构建与工具注入
