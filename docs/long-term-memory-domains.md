# 长期记忆：领域目录 + 领域摘要（设计与逻辑）

本方案把长期记忆拆成两层：**领域目录（memory_domains）** + **领域摘要（memory_summaries）**。  
目标是让 Lite model 只做“路由判断”，只注入命中的摘要，减少 token 与干扰，同时保持结构化记忆可更新。

## 一、数据结构

### 1) memory_domains（领域目录表）
- 用途：做“路由目录”，描述“这个领域是什么”
- 字段（要点）  
  - `domain_key`：领域标识，如 `music` / `programming`  
  - `aliases`：同义词或别名（用于命中）  
  - `scope`：领域边界一句话  
  - `updated_at`：变更时间

### 2) memory_summaries（领域摘要表）
- 用途：做“可注入摘要”，用于实际回答  
- 字段（要点）  
  - `domain_id`：所属领域  
  - `summary`：短摘要（事实化、可注入）  
  - `evidence`：可选，用户原话或证据  
  - `updated_at`：更新时间

> 特点：单域单摘要，更新即覆盖。

## 二、运行流程

### Step 1：路由粗判（Lite model）
输入：用户问题 + 最近对话 + 领域目录（仅目录，不含摘要）  
输出：  
```json
{"need_memory": boolean, "hit_domains": ["music", "programming"]}
```

判定目的：只决定“是否需要长期记忆”和“哪些领域相关”。

### Step 2：选择并注入摘要
只取命中的领域摘要，构造“用户画像块”注入给主模型：

```
# User profile memory (preferences & background):
- music: 喜欢 K-pop，偏好节奏感强的女团歌曲
- programming: 主力使用 React + TypeScript，偏好函数式风格

Note: Treat this as user preferences/background, not external factual sources.
```

## 三、判定规则建议

### 1) 路由触发（need_memory）
建议规则（Lite 或规则混合）：
- 问题含“我/我的/我们/我的项目/我喜欢/继续之前” → **true**
- 纯客观知识/通用定义 → **false**

### 2) 命中领域（hit_domains）
匹配顺序建议：
1. `domain_key` 精确/包含匹配  
2. `aliases` 同义词匹配  
3. 若无命中 → 不注入

## 四、写入/更新策略

### 1) 领域归类
Lite model 输出归属领域（可多选），或建议新建 domain。当前实现中，自我介绍更新会自动触发领域抽取。

### 2) 摘要合并
用“新信息”更新摘要，要求：
- 短、结构化、可注入  
- 不写临时情绪/时间线  
- “推断”尽量不写

## 五、安全与可控

- 单域单摘要，更新即覆盖  
- 注入时明确标注“这是偏好/背景，不是外部事实”  
- 仅注入命中摘要，避免无关干扰  

## 六、实践建议

- 初期领域数量 8~15 个以内  
- `aliases` 以用户常用词为主  
- 摘要控制在几十到一两百字内
