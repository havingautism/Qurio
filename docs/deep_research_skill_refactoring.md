# 基于 Skill 解耦深度研究 Prompt 的重构方案

## 1. 目标与背景

当前情况是 `services/deep_research.py` 内部硬编码了长篇的 Prompt（引用自 `prompts/deep_research_prompts.py`），这导致深度研究在提示词层面不够灵活，且使得 Agent 的指令过于沉重。

我们的**核心目标**是：将研究的“方法论（如何推演、如何引证）”与“执行引擎（Agno Workflow 并发调度、工具调用）”解耦。
通过引入类似于 GitHub 上的 [`academic-researcher`](https://github.com/Shubhamsaboo/awesome-llm-apps/blob/main/awesome_agent_skills/academic-researcher/SKILL.md) 和 [`deep-research`](https://github.com/Shubhamsaboo/awesome-llm-apps/blob/main/awesome_agent_skills/deep-research/SKILL.md) 技能，让系统动态加载这些“大脑设定”，从而大幅削减主程序的 Prompt 负担，并支持未来轻松扩展更多垂直领域的研究技能（如金融、法律研究等）。

## 2. 实施路径 (Proposed Changes)

我们将把这部分重构划分为以下三个步骤：

### 2.1 创建内置 Skill
在 `backend-python/src/_internal_skills/` 目录下创建两个内置技能库：

#### [NEW] `_internal_skills/academic-research/SKILL.md`
将原有的 `ACADEMIC_FINAL_REPORT_PROMPT` 和 `ACADEMIC_STEP_AGENT_PROMPT`（结合 GitHub 上的参考结构：Paper Analysis Framework、Citation Formats 等）提炼融合，形成规范的 markdown 描述。

#### [NEW] `_internal_skills/deep-research/SKILL.md`
将原有的 `GENERAL_FINAL_REPORT_PROMPT` 和 `GENERAL_STEP_AGENT_PROMPT` 提取出来，参考 GitHub 上的结构（Clarify -> Identify -> Gather -> Synthesize），形成规范的通用研究技能说明。

### 2.2 重构 Deep Research 服务逻辑
修改核心调度引擎，移除硬编码提示词，改为支持动态 Skill 包。

#### [MODIFY] `src/services/deep_research.py`
- **移除 Prompt 导入**：删除现有的 Prompt 依赖（`from ..prompts import ACADEMIC_STEP_AGENT_PROMPT...`）。
- **动态技能参数**：在 `_create_step_agent` 函数中，不再硬塞几百字的 Instructions，而是通过参数声明 `skill_ids=["academic-research"]`（如果 `research_type == "academic"`）或 `skill_ids=["deep-research"]`。
- **极简指令组装**：Agent 的 Instruction 仅保留 Step 上下文（例如：当前是什么任务、预期输出什么内容格式、前置的发现是什么），具体的框架由加载的 SKILL.md 自然控制。

#### [DELETE] `src/prompts/deep_research_prompts.py`
- 将原有的 Prompt 文件归档/删除，因为它已经被转移到内部 Skill 体系中。

### 2.3 适配 Agent Registry
确保这些为了“深度研究”特化加载的临时内部技能能够被正确解析和附加到模型上。

#### [MODIFY] `src/services/agent_registry.py`
- 当前代码 `_has_skills` 和读取 `_internal_skills` 时的逻辑已经存在，需要确保我们在调用 `build_agent` 时传入的特定 `skill_ids` 组合能正确绕过全局加载，或者确保 `academic-research` / `deep-research` 作为内部可选技能被合法识别。

## 3. 面临的挑战与需要确认的点

> **技能污染问题 (Skill Contamination)**
> 我们需要在 `deep_research.py` 中明确：当触发深度研究的某个 Step 时，它应该**只**加载与该研究相关的 Skill（例如只加载 `deep-research`），而不是将系统中用户勾选的所有其他不相关技能（如画图、翻译）也带入进来，否则会导致上下文污染。
> 
> 这意味着在 `services/deep_research.py` 中创建 Agent 时，传递的 `request` 参数需要**覆写/清空**来自前端的用户通用 `skill_ids`，强制将其替换为 `["academic-research"]` 或 `["deep-research"]`。

## 4. 验证计划

**自动化/快速验证**：
1. 本地启动服务并进入前端，触发一次包含多个子问题的“深度研究”。
2. 观察终端中 `build_agent` 的日志（针对 Step 1、Step 2），确认 Agent 加载了预期的 `SKILL.md`（而非原本的长文本 instruction）。
3. 检查生成的研究报告格式：是否有效采纳了新 Skill.md 中的格式要求和引用规范。

**手动验证**：
- 用户可以尝试运行一次具体的学术深研任务（比如请求两篇医疗相关论文的总结对比），确认大模型输出准确包含 "Paper Analysis Framework" 中定义的段落。

## 5. 架构优化沉淀 (Architecture Refinements - Post Implementation)

在初步完成代码迁移后，为了保证多智能体 (Multi-Agent) 协同的严谨性，我们追加了以下核心重构逻辑：

### 5.1 智能体职责隔离隔离 (Separation of Concerns)
为了防止在深研过程中出现“既收集资料又构思排版”导致的严重幻觉问题，我们严格将智能体切分为三层角色：
1. **规划端 (Plan Agent)**：负责将宏大命题拆解为 5 个子问题步进。
2. **搜索端 (Step Agent)**：**剥夺**其挂载深研 Skill 的权力（`enable_skills=False`），使其成为纯粹的方法论执行者，专心调用搜查工具挖掘网页数据。
3. **输出端 (Final Report Agent)**：收缴所有工具调用权（传入 `tools=[]`），**唯一**为其挂载深度研究/学术研究的 Skill，让它基于底层收集好的 Findings 执行跨越源头的宏观知识梳理与定式排版。

### 5.2 避免搜查幻觉 (Preventing Gathering Hallucinations)
发现挂载给最终报告 Agent 的 Skill 中含有诸如 `Gather Information` 或 `Conduct research` 等主动提示词，会导致模型被误导，试图自行触发搜索动作。
**修复方式**：已将所有 Skill 文件内相关主动动作描述转换为**被动整合（Passive Synthesis）**描述，如 `Synthesizing provided findings`、`Review Provided Findings`。确保报告员只处理上下文中的确定事实。

### 5.3 引用流转的强制送达 (Forced Citation Passing)
原先 Step Agent 只会向后文传递自己归纳的文字，而丢失了原始参考文献 URL。
**修复方式**：强行修改 `STEP_AGENT_PROMPT`，勒令每个子步骤结束后必须抽出一个 `## Sources Appendix`，并且加注“严禁捏造虚假 URL，没有工具调用时输出空行”。这保证了完整的真实 URL 数据链路能够送达最终报告 Agent 的数据喂入槽中。

### 5.4 严格的排版打断与兜底
在最终生成报告时，为了拔除模型固有的寒暄套话（如 "Here is the report..."）以及流水账式的机械罗列倾向。
**修复方式**：在 `deep_research.py` 喂给报告 Agent 的指令前，打入了具备排他性强度的指令：
> *"MUST completely reorganize the provided 'Findings to synthesize' by logical themes... DO NOT output any conversational filler... Start your response IMMEDIATELY with the first Markdown heading."*
