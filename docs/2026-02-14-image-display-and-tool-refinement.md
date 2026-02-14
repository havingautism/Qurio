# 图片展示与工具调用优化总结 (2026-02-14)

本文档总结了近期对图片交互系统及工具调用展示进行的视觉与功能优化，涵盖了从后端集成到前端表现的全方位改动。

## 1. 图片搜索功能集成 (Image Search Integration)

作为本次优化的基础，我们完成了后端图片搜索能力的深度集成与标准化：

- **多引擎支持**：
    - **DuckDuckGo**：基于 `duckduckgo_search` 库实现了自定义 `DuckDuckGoImageTools`。
    - **Google**：通过 `SerpApiTools` 整合了 Google 图片搜索能力。
- **标准化数据流**：后端工具输出已标准化为包含 `title` (标题)、`image` (图片直链)、`url` (源网页链接) 和 `source` (来源名称) 的统一格式。
- **Agent 指令增强**：在 `agent_registry` 中为 AI 注入了专项系统提示词，引导其在解释复杂概念（如图表、照片、Logo）时主动调用图片搜索功能，并强制使用 Markdown 语法进行嵌套渲染。
- **强制启用机制**：在 Agent 构建逻辑中，图片搜索能力被设置为默认策略，确保 AI 能随时根据语境提供视觉辅助。

## 2. 工具调用展示优化 (Tool Call Refinement)

为了统一搜索类工具的视觉语言，我们将“图片搜索”类型的工具调用样式与标准“网络搜索”进行了高度对齐：

- **视觉统一化**：图片搜索工具不再直接显示原始函数名（如 `duckduckgo_image_search`），而是统一显示为友好的 **“图片搜索” (Image Search)**。
- **信息透传**：
    - **后端图标**：在工具标签左侧动态显示对应搜索后端的图标（如 Google G 图标或 DuckDuckGo 鸟图标）。
    - **内容预览**：实时解析并显示搜索查询内容（带引号的 Query），使用户一眼识别 AI 的搜索意图。
- **多语言适配**：全面支持中英文翻译。

## 3. 沉浸式图片画廊 (Premium Image Gallery)

我们为图片实现了一套极简且高端的全屏画廊系统：

- **极简美学**：使用 `backdrop-blur-xl`（特大背景模糊）配合半透明蒙层，提供沉浸式体验。
- **智能元数据展示**：
    - 底部显示图片标题与来源，并带有柔和的渐变阴影。
    - 来源标签动态提取 URL 域名并搭配 Globe 图标，支持点击跳转。
- **交互细节**：支持全屏下通过左右方向键切换及 Esc 键快速退出，画廊内自动过滤失效图片。

## 4. 图片加载与错误处理 (Robust Error Handling)

针对 Web 图片的不确定性，引入了优雅的容错机制：

- **静默渐入 (Silent Fade-in)**：配合 500ms 淡入动画，消除加载时的突兀闪烁。
- **智能错误占位卡片**：
    - 当图片因 CORS 或链接失效无法显示时，以自定义卡片替换破碎图标，提示“图片加载出错了”。
    - 提供 **“尝试打开原图链接”** 入口。
- **域名动态解析**：错误状态下仍显示域名（如 `bbc.com`），提升专业感并帮助判断来源。

## 5. 技术健壮性与架构优化

- **语义化修复**：修复了 Markdown 渲染器中 `div` 嵌套在 `p` 标签内导致的水合错误 (Hydration Error)，改用 `inline-block span` 实现。
- **交互反馈**：引入 Inner-Zoom 模式（容器内缩放），配合 `shadow-lg` 反馈。
- **i18n 全覆盖**：所有新增字符均已整合进标准 i18n 流程。

---

> **涉及文件**：
> - `src/components/MessageBubble.jsx`
> - `src/lib/toolConstants.js`
> - `src/locales/zh-CN.json` / `en.json`
> - `backend-python/src/services/custom_tools.py`
> - `backend-python/src/services/agent_registry.py`
