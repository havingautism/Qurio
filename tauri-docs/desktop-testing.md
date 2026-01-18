# 桌面端测试说明（Windows/macOS/Linux）

本文档用于本项目的桌面端（Tauri）开发测试流程。

## 前置条件

- 已安装 Rust 与 Tauri CLI（本项目依赖 `@tauri-apps/cli`）。
- 已安装 Bun。

## 安装依赖

```bash
bun install
```

如需后端独立开发（Web 端调试用）：

```bash
cd backend
bun install
```

## 桌面端开发测试（推荐）

```bash
bun run tauri:dev
```

该命令会调用 `beforeDevCommand`，先启动后端并等待端口就绪，再启动前端开发服务器。

## 桌面端构建与安装测试

```bash
bun run tauri:build
```

构建产物位置由 Tauri 默认输出规则决定，可在 `src-tauri/target` 或系统安装包目录中查看。

## 常用辅助命令

```bash
bun run lint
```

## 手工测试建议清单

- 应用可正常启动，首页渲染无白屏。
- 启动后端进程成功，API 请求正常返回。
- 关闭应用时，后端进程可正常退出（不残留后台进程）。
- 基础功能流程可用：聊天、文件导入、历史记录浏览等。
- 国际化切换（如有）和主题样式正常。

