# QURIO Skill Creator 集成方案

本文档记录 Skill Creator 功能的设计方案与实现细节。Skill Creator 允许用户通过自然语言描述，由 LLM Agent 自动生成完整的自定义 Skill（包含 SKILL.md + scripts/ + references/）。

> **参考来源**：设计方法论参考 [Anthropics skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator)，并结合 Agno 框架约束适配。

---

## 1. 设计理念：Agent 套娃

Skill Creator 本身就是一个 Agno Agent，配备 `FileTools`（沙箱锁定到目标 Skill 目录）+ `LocalSkills`（加载内置 skill-creator 知识）。用户描述 → Agent 凭借 Anthropics 方法论自主生成并写文件 → 刷新列表可用。

```
用户输入描述
  └─ POST /api/skills/generate
       ├─ 创建目录 .skills/<skill_id>/
       ├─ 启动 Skill Builder Agent
       │    ├─ 工具：FileTools(base_dir=".skills/<skill_id>/",
       │    │                  enable_save_file=True,
       │    │                  enable_delete_file=False)
       │    ├─ Skills：LocalSkills(dirs=["src/_internal_skills/skill-creator"])
       │    │           └─ Agent 通过 get_skill_instructions 加载 Anthropics 方法论
       │    ├─ System Prompt：约束只写 SKILL.md / scripts/*.py / references/*.md
       │    └─ 运行至完成（非流式）
       └─ 返回 { skill_id, files_created: [...] }
```

### 内置 Skill Hub 目录结构

```
backend-python/src/
└── _internal_skills/                  ← 跟随源代码打包，用户不可见、不可删
    └── skill-creator/
        └── SKILL.md                   ← Anthropics skill-creator 内容（适配 Agno 格式）
```

`.skills/`（用户的数据目录）与 `_internal_skills/`（代码内置目录）完全分离，互不干扰。

---

## 2. Anthropics Skill Creator 方法论参考

以下内容来自 [Anthropics skill-creator SKILL.md](https://github.com/anthropics/skills/tree/main/skills/skill-creator)，作为我们 Skill Builder Agent prompt 的设计依据。

### 2.1 技能文件结构（Anatomy of a Skill）

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
└── Bundled Resources (optional)
    ├── scripts/    - 可执行代码，用于确定性/重复性任务
    ├── references/ - 参考文档，按需加载进上下文
    └── assets/     - 输出用文件（模板、图标等）
```

> ⚠️ **Agno 约束**：Agno 官方文档明确只支持 `SKILL.md`、`scripts/`、`references/` 三类。`assets/` 目录在 Agno 框架中无对应工具访问，我们的 Skill Creator 默认不生成 `assets/`。

### 2.2 三级加载系统（Progressive Disclosure）

Agno Skills 采用按需加载，避免一次性注入全量上下文：

| 层级 | 内容 | 何时加载 |
|------|------|----------|
| 1. 元数据 | name + description（约 100 词） | 始终在上下文中 |
| 2. SKILL.md 正文 | 详细指令（建议 < 500 行） | 技能触发时加载 |
| 3. 附属资源 | scripts/ + references/ | Agent 主动调用时按需加载 |

**因此 description 极为关键**——它是触发机制，Agent 靠它决定是否调用技能。

### 2.3 Description 写作规范（重要！）

- Description 应同时包含"这个 skill 做什么"和"什么时候用它"
- **要略微"pushy"**：Claude 有偏向不触发技能的倾向（undertrigger），description 要明确告诉 agent 在哪些场景一定要用
- 示例（❌ 太保守 → ✅ 合适）：
  - ❌ `"如何写技术文档"`
  - ✅ `"如何写技术文档。当用户提到 README、API 文档、技术规格时，必须使用此技能，即使用户未明确说明。"`

### 2.4 Intent Capture 流程（用于我们的 AI 生成面板）

Anthropics 建议在生成前明确以下信息：

1. 这个 skill 要让 Agent 能做什么？
2. 什么情况下应该触发（用户会说什么词/场景）？
3. 期望的输出格式是什么？
4. 是否需要可执行脚本（scripts/）？
5. 是否需要参考文档（references/）？

我们的实现简化：用户输入一段自然语言描述，由 Agent 自行判断并回答上述问题，无需用户逐一填写。

### 2.5 Skill 写作风格规范

- 用**祈使句**（imperative form）写指令
- 解释"为什么"而非仅靠强制词（少用 MUST，多解释原因）
- 运用 theory of mind，让技能通用而非过度贴近特定示例
- 写完草稿后用"新鲜视角"重新审视并改进

---

## 3. 安全约束

- `base_dir` 锁定到 `.skills/<skill_id>/`，Agent 物理上无法写出此目录
- `enable_delete_file=False`：禁止删除文件
- System Prompt 明确限制只写三种路径：`SKILL.md`、`scripts/*.py`、`references/*.md`
- Skill ID 严格校验 `^[a-z0-9-]+$`，最长 64 字符

---

## 4. 接口设计

### `POST /api/skills/generate`

**请求：**
```json
{
  "prompt": "帮我创建一个让 Agent 每次回复都做三点总结的技能",
  "skill_id": "summary-three-points",   // 可选，不传则由 LLM 自动命名
  "provider": "openai",
  "api_key": "sk-...",
  "base_url": null,
  "model": null
}
```

**响应：**
```json
{
  "skill_id": "summary-three-points",
  "files_created": ["SKILL.md", "references/format-guide.md"]
}
```

---

## 5. Skill Builder Agent System Prompt

设计参考 Anthropics skill-creator 方法论，针对 Agno 框架约束精简：

```
You are a Skill architect for the Agno AI framework.
Your job is to create a complete, high-quality Skill package based on the user's description.

You have FileTools available. Your base directory is the skill's root folder.
ONLY create files using these paths:
  - SKILL.md (REQUIRED)
  - scripts/<filename>.py (optional, only if executable code genuinely helps)
  - references/<filename>.md (optional, only if supplementary reference adds value)

━━━ SKILL.md FORMAT ━━━
---
name: <skill-id>          # must exactly match the directory name
description: <trigger + purpose, max 200 chars, be slightly "pushy" about when to use>
---

# Instructions
<detailed, actionable markdown instructions>

━━━ QUALITY RULES ━━━
1. Description is the trigger mechanism — make it explicit about WHEN to use this skill.
   Claude tends to undertrigger, so be specific: "Use this whenever user mentions X, Y, or Z."
2. Use imperative form in instructions. Explain WHY, not just WHAT.
3. Keep SKILL.md under 500 lines. Use references/ for supplementary material.
4. Write scripts/ only for deterministic, repetitive, or computationally intensive tasks.
5. Do NOT create assets/ or any other directories.
6. After creating all files, call list_files to confirm, then stop.

━━━ USER'S SKILL REQUEST ━━━
{user_prompt}
```

---

## 6. 前端实现

### 新增状态（`SkillsWorkshopModal.jsx`）

```js
const [isAIMode, setIsAIMode] = useState(false)
const [aiPrompt, setAiPrompt] = useState('')
const [isGenerating, setIsGenerating] = useState(false)
const [aiResult, setAiResult] = useState(null)  // { skill_id, files_created }
```

### UI 流程

```
列表页
  ├─ [Create Skill] 按钮（现有，不变）
  └─ [✨ AI 生成] 按钮 → setIsAIMode(true)

AI 生成面板（isAIMode === true）
  ├─ textarea：输入描述（参考 Intent Capture 提示引导）
  ├─ [生成] 按钮 → POST /api/skills/generate → setAiResult(...)
  ├─ 生成成功展示：
  │    ├─ Skill ID + 已创建文件列表
  │    └─ [在编辑器中查看] 按钮 → handleEdit(result.skill_id)
  └─ [返回] 按钮 → setIsAIMode(false)
```

---

## 7. 翻译 Key（新增，`agents.skills` 命名空间）

```json
"aiGenerate": "AI 生成",
"aiGenerateTitle": "使用 AI 生成 Skill",
"aiGeneratePromptLabel": "描述你想要的 Skill",
"aiGeneratePromptPlaceholder": "例如：帮我做一个让 Agent 回复时总是做三点总结的技能",
"aiGenerateBtn": "开始生成",
"aiGenerating": "AI 生成中...",
"aiGenerateSuccess": "Skill 已生成",
"aiGenerateFiles": "已创建文件",
"aiGenerateOpenEditor": "在编辑器中查看",
"aiGenerateError": "生成失败，请重试",
"aiGenerateBack": "返回列表"
```

---

## 8. 技术依赖

- `agno.tools.file.FileTools`（Agno 内置）
- 复用 `agent_registry._build_model()` 构建模型实例
- 复用 `GET /api/skills` 接口刷新列表
