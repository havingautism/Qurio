# 安卓移动端测试（Android Studio）

本文档用于在本项目中完成 Android 移动端调试与测试，确保 Android Studio 可直接运行。

## 前置条件

- 已安装 Android Studio（含 SDK、SDK Platform、SDK Build-Tools）。
- 已安装 JDK 17（Android Studio 内置或本机安装）。
- 已安装 Rust 与 Tauri CLI（本项目已在根目录依赖 `@tauri-apps/cli`）。
- 已安装 Bun。

## 一次性初始化

首次在本机生成 Android 项目：

```bash
bunx tauri android init
```

生成后的 Android 工程位于：

- `src-tauri/gen/android`

## Android Studio 运行（推荐）

1. 打开 Android Studio，选择 Open 项目。
2. 选择目录 `src-tauri/gen/android`。
3. 等待 Gradle Sync 完成。
4. 连接真机（启用 USB 调试）或启动模拟器。
5. 点击 Run 运行。

## CLI 调试命令（等效）

在项目根目录执行：

```bash
bunx tauri android dev
```

该命令会自动调用 `beforeDevCommand`（见 `src-tauri/tauri.conf.json`）。

## Tauri 环境变量来源（重要）

Tauri 调试时主要有两类环境变量来源：

1. 前端（WebView/前端构建）
   - 前端使用 `import.meta.env` 读取，要求变量以 `PUBLIC_` 开头。
   - 来源优先级通常为：命令行注入（如 `cross-env`） > `.env.local` > `.env`。
   - 本项目开发脚本在根目录 `package.json` 中设置了 `PUBLIC_BACKEND_URL` 等变量。
   - 参考文件：`.env.example` 与 `src/lib/publicEnv.js`。

2. 后端（Node 服务）
   - 后端由 `backend/src/server.js` 启动，使用 `dotenv` 读取 `backend/.env`（参考 `backend/.env.example`）。
   - Tauri 内部的 Rust 不会自动读取根目录 `.env`，除非你在 Rust 代码中显式加载。

## 后端地址与移动端访问

Android 设备无法访问宿主机的 `127.0.0.1`。

- 模拟器访问本机后端使用：`http://10.0.2.2:3001`
- 真机访问本机后端使用：`http://<你的局域网IP>:3001`

本项目默认 `dev:tauri` 使用 `http://127.0.0.1:3001`，如需移动端联调：

1. 临时修改根目录 `package.json` 的 `dev:tauri` 中的 `PUBLIC_BACKEND_URL`。
2. 或新增一个专用脚本，例如：

```bash
cross-env PUBLIC_BASE_PATH=/ PUBLIC_BACKEND_URL=http://10.0.2.2:3001 rsbuild dev
```

然后再运行：

```bash
bunx tauri android dev
```

## 构建 APK / AAB

```bash
bunx tauri android build
```

常见输出路径（以 Gradle 默认结构为准）：

- `src-tauri/gen/android/app/build/outputs/apk`
- `src-tauri/gen/android/app/build/outputs/bundle`

## 常见问题排查

- Android Studio 同步失败：检查 JDK 版本为 17。
- 设备无法访问后端：确认使用 `10.0.2.2` 或局域网 IP。
- 构建失败：确保 Android SDK 与 NDK 安装完整。
- 报错 `Java not found in PATH`：
  - 确认 `JAVA_HOME` 指向 Android Studio 自带 JDK（常见：`C:\Program Files\Android\Android Studio\jbr`）。
  - 在 `PATH` 中追加 `%JAVA_HOME%\bin`，重新打开终端后运行 `java -version` 验证。
  - 也可安装独立 JDK 17 并配置 `JAVA_HOME` 与 `PATH`。
