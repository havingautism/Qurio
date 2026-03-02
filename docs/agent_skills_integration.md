# QURIO Agent Skills 集成指南

本文档记录了在 QURIO (Agno) 中集成 `Agent Skills` 的官方推荐与最佳实践方案。Skills 机制旨在为 Agent 提供结构化的垂直领域知识、运行脚本及参考文档，以替代极其冗长且难以维护的单个 System Prompt。

## 1. 核心集成目标

我们希望将大段、复杂的 Agent 提示词（例如深入研究、学术检索、详细代码审查等）拆分为可独立加载的**外部技能 (Skills)**。通过按需加载，实现：
1. **减少默认上下文**: Agent 仅在必要时查阅具体技能说明，节约 Token 消耗。
2. **渐进式探索**: 系统内建 `get_skill_instructions` 供大模型自主调用深入了解。
3. **结构化模块**: 将指令、脚本和格式文档物理分离（MD + Python），便由于增删改查及前端展示。

## 2. 目录结构规范

所有官方及自定义的 Agent Skill 均存放于后端专门的技能根目录：
`backend-python/skills/`

每个单独技能需要拥有独立的文件夹：

```text
backend-python/skills/
├── pirate-greeter/        # 示例：打招呼技能（MVP 探索用）
│   └── SKILL.md           # [必须] 包含名称、描述和详细指令
├── deep-research/         # 示例：将原有的长研究Prompt搬移至此
│   ├── SKILL.md
│   └── references/        # [可选] 研究相关的额外参考文档
│       └── metrics.md
└── code-analysis/         # 示例：代码分析技能
    ├── SKILL.md
    └── scripts/           # [可选] 可执行脚本
        └── parser.py 
```

⚠️ **注意命名规范**：Agno 明确要求 Skill 的名称必须全小写、且只能由字母、数字和连字符 `-` 组成。同时所在的文件夹名称必须和 YAML 里的 `name` 严格保持一致！

### 2.1 SKILL.md 编写标准

每个技能目录中必须要有一个 `SKILL.md`，它需要用 YAML 设置元数据，便于引擎（及我们后续前端 API）抓取：

```markdown
---
name: academic-researcher
description: 熟练掌握各类学术搜索库，并且能撰写严谨带引用格式报告的学术研究员。
---

# Instruction
当你被要求进行学术研究或者论文分析时，你**必须**：
1. 首先利用现有工具搜索 arxiv 及相关论文库。
2. ...（具体的行动指南和口吻要求）
```

## 3. 后端代码修改方案 (MVP 实现)

在实例化 Agent 的环节（例如在 `backend-python/src/services/stream_chat.py` 中向外提供的 Agent）：

```python
from agno.skills import Skills, LocalSkills
import os

# 定义基础技能路径
SKILLS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'skills')

# 修改 Agent 实例
app_agent = Agent(
    model=...,
    tools=[...],
    # 新增挂载 Skills！
    skills=Skills(
        loaders=[LocalSkills(SKILLS_DIR)]
    ),
    # ...
)
```

## 4. 集成与测试四个阶段

为了保证系统稳定性并顺利过渡，我们约定按以下顺序分阶段执行。

### 阶段一：最小可行测试闭环 (MVP) [✅ 已实现]
1. 在后端建立 `skills/` 与子实验性目录 `pirate-greeter/SKILL.md`。
2. 将特定的“夸张语气打招呼技巧”写入该文档。
3. 修改底层加载逻辑（`agent_registry.py`）将目录注入 Agent。
4. 前端直接发消息向 Agent 问候，验证它是否成功调用了 `get_skill_instructions` 工具获取并表现出了对应的技能特质。

### 阶段二：重构提示词 (Prompt Refactoring)
1. 梳理当前 QURIO 系统中的“巨型”系统提示词。
2. 例如把“深度网络调查”相关的限制和参考范式抽离成 `deep_research` 技能。
3. 瘦身 Agent 的默认 `description` 和 `instructions`。

### 阶段三：拓展前端全知视界 
1. 编写 FastAPI 路由，例如 `GET /api/skills`，自动遍历并解析 `skills/` 文件夹中 `SKILL.md` 的 FrontMatter（名称和描述）。
2. 在前端（空间/智能体设置中）增加一处列表，展示当前系统搭载和装配了哪些“可学习技能”。

### 阶段四：引入自动化 Scripts 与 References
1. 基于某些必须的运算类强逻辑，测试向部分复杂技能中引入可选的本地 `.py` 脚本库，以充分发掘功能边界。
