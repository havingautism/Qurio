# QURIO Agent Skills 集成指南

本文档记录了 QURIO (Agno) 中 `Agent Skills` 系统的完整实现现状与规范。Skills 机制为 Agent 提供结构化的垂直领域知识、可执行脚本及参考文档，替代冗长难维护的单体 System Prompt。

---

## 1. 核心目标

1. **减少默认上下文**：Agent 仅在必要时通过工具调用加载具体技能，节约 Token。
2. **渐进式探索**：内建 `get_skill_instructions` / `get_skill_script` / `get_skill_reference` 三个工具，供 Agent 自主按需调取。
3. **结构化模块**：指令、脚本、参考文档物理分离，便于管理和前端展示。

---

## 2. 目录结构规范

所有技能存放于：`backend-python/.skills/`（注意：以 `.` 开头的隐藏目录，与旧文档的 `skills/` 不同）

```text
backend-python/.skills/
├── pirate-greeter/
│   └── SKILL.md              # [必须] 包含 YAML frontmatter + 指令正文
├── deep-research/
│   ├── SKILL.md
│   └── references/           # [可选] 参考文档，Agent 可通过 get_skill_reference 读取
│       └── metrics.md
└── code-analysis/
    ├── SKILL.md
    └── scripts/              # [可选] Python 脚本，Agent 可通过 get_skill_script 执行
        └── parser.py
```

### SKILL.md 格式规范

```markdown
---
name: skill-id          # 必须与目录名完全一致，全小写字母/数字/连字符
description: 一句话描述  # 供 Agent 判断是否需要加载，不超过 1024 字符
---

# Instructions
...详细指令正文（Markdown）...
```

> ⚠️ **命名规范**：`name` 字段与目录名必须严格一致，且只能包含 `[a-z0-9-]`，最长 64 字符。

---

## 3. Agno 支持的三类 Skill 内容

| 目录 | 工具 | 说明 |
|------|------|------|
| `SKILL.md` | `get_skill_instructions` | 完整指令正文，按需加载 |
| `scripts/` | `get_skill_script` | Python 可执行脚本 |
| `references/` | `get_skill_reference` | Markdown 参考文档 |

> ⚠️ 其他任意目录（如 `assets/`）会被忽略，Agent 无法通过工具访问。

---

## 4. 后端实现现状

### 4.1 Agent 挂载（`agent_registry.py`）

`build_agent()` 中通过 `enable_skills` 和 `skill_ids` 参数按需加载指定技能：

```python
from agno.skills import LocalSkills

if getattr(request, "enable_skills", False):
    skills_dir = os.path.join(os.path.dirname(__file__), '..', '..', '.skills')
    requested_skills = getattr(request, "skill_ids", [])

    if requested_skills:
        paths = [
            os.path.join(skills_dir, skill_id)
            for skill_id in requested_skills
            if os.path.isdir(os.path.join(skills_dir, skill_id))
        ]
        if paths:
            skills = LocalSkills(dirs=paths)
    else:
        skills = LocalSkills(base_dir=skills_dir)
```

### 4.2 Skills CRUD API（`routes/skills.py`）

完整的 REST API，支持列表、创建、读取、更新、删除 skill 及其附属文件：

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/skills` | 列出所有 skill（解析 YAML frontmatter） |
| POST | `/api/skills` | 创建新 skill |
| GET | `/api/skills/{id}` | 获取 skill 详情（含 instructions） |
| PUT | `/api/skills/{id}` | 更新 skill |
| DELETE | `/api/skills/{id}` | 删除 skill |
| GET | `/api/skills/{id}/files` | 列出 skill 附属文件 |
| GET | `/api/skills/{id}/file?path=` | 读取单个文件内容 |
| PUT | `/api/skills/{id}/file` | 创建/更新文件 |
| DELETE | `/api/skills/{id}/file?path=` | 删除文件 |

---

## 5. 前端实现现状

### 5.1 Skills Workshop（`SkillsWorkshopModal.jsx`）

独立的 Skill 管理界面，功能包括：
- 列出所有 Skill（卡片展示 name + description）
- 手动创建/编辑 Skill（填写 id / name / description / instructions）
- 在编辑器内管理 `scripts/` 和 `references/` 文件（本地暂存 + 统一提交）
- 删除 Skill

### 5.2 Agent 挂载（`AgentModal.jsx` > Skills Tab）

- 展示所有可用 Skill 的列表（通过 `GET /api/skills`）
- 勾选后通过 `skill_ids` 字段随 Agent 配置一起保存
- 支持 `skills-changed` 全局事件刷新列表

---

## 6. 开发路线回顾

| 阶段 | 状态 | 内容 |
|------|------|------|
| 阶段一：MVP 验证 | ✅ 完成 | pirate-greeter 实验性技能，验证 Agno Skills 加载机制 |
| 阶段二：前端 CRUD | ✅ 完成 | Skills Workshop + API 完整实现 |
| 阶段三：Agent 挂载 | ✅ 完成 | AgentModal Skills Tab 勾选挂载 |
| 阶段四：AI 生成技能 | 🚧 进行中 | Skill Creator：Agent 套娃生成完整 Skill（见 skill_creator_integration.md） |
