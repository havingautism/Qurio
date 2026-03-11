# Chat Bridge Agent Todo

## 目标

在 Qurio 内预置一个专门用于接入外部聊天平台的 Agent，用于连接 Discord、飞书等聊天软件，并在 Qurio 页面内完成工具、技能和默认行为的配置。

希望达到的效果：

- Qurio 默认内置一个 `Chat Bridge Agent`
- 能接收 Discord、飞书等平台发来的消息
- 支持普通聊天
- 支持命令式操作，例如 `/scrapbook <url>`
- 可以把链接、内容或消息转发到 Qurio 的 Scrapbook / 随手记
- 工具和技能都在 Qurio 页面里配置，不依赖手改代码

## 总体方案

建议拆成四层：

1. 渠道接入层
2. 命令解析层
3. Agent 调度层
4. 工具与技能配置层

这样做的原因是：

- 命令型操作更稳定，不必完全依赖模型理解
- 普通聊天仍然可以保留 Agent 的自然语言能力
- Discord、飞书、后续 Slack/Telegram 都能复用统一结构
- 工具和技能可以继续沿用 Qurio 现有配置体系

## 阶段一：先做最小可用版本

先只做一条最关键的链路：

1. 预置一个默认 Agent
2. 新增一个保存到 Scrapbook 的工具
3. 接入 Discord
4. 支持 `/scrapbook <url>` 和普通聊天

这是最值得先落地的 MVP。

## 具体步骤

### 1. 预置一个默认 Agent

新增一个系统级 Agent，例如：

- `agent-chat-bridge`
- 名称：`Chat Bridge Agent`
- 描述：负责外部聊天平台消息接入、命令执行、链接归档和普通聊天

默认建议启用：

- `interactive_form`
- `web_search`
- `search_news`
- `webpage_reader`
- `save_to_scrapbook`（新工具）

后续可选：

- `send_discord_message`
- `send_feishu_message`
- `summarize_text`

### 2. 新增 `save_to_scrapbook` 工具

这个工具建议作为本地工具或后端内部工具实现，而不是纯提示词模拟。

建议参数：

- `url`
- `title` 可选
- `note` 可选
- `space_id` 可选
- `tags` 可选

目标行为：

- 接收一个链接
- 自动写入 Qurio 的 Scrapbook / 随手记
- 返回保存结果和基础元信息

### 3. 设计统一的外部消息结构

不要让 Discord / 飞书直接进入 Agent。

先统一成内部结构，例如：

```json
{
  "platform": "discord",
  "channel_id": "123",
  "user_id": "456",
  "user_name": "alice",
  "text": "/scrapbook https://example.com",
  "attachments": []
}
```

飞书也走同一结构。

这样后续新增更多平台不会打散逻辑。

### 4. 新增 Discord 接入

后端新增 webhook 路由，例如：

- `/api/integrations/discord/webhook`

这个路由负责：

- 校验 Discord 请求来源
- 解析消息内容
- 转换成统一消息结构
- 交给命令解析层或 Agent 层
- 把结果回发到 Discord

### 5. 新增飞书接入

后端新增 webhook 路由，例如：

- `/api/integrations/feishu/webhook`

这个路由职责与 Discord 基本一致：

- 校验签名
- 解析消息
- 转换成统一消息结构
- 执行命令或调用 Agent
- 回发结果

建议飞书放在 Discord 打通后再接。

### 6. 先做命令解析器

对这类需求，不建议一开始就完全依赖 Agent 自己理解命令。

先支持固定命令：

- `/scrapbook <url>`
- `/ask <text>`
- `/summary <text>`

解析方式建议：

1. webhook 收到消息
2. 判断是否以 `/` 开头
3. 命中命令后直接调用对应工具或对应 Agent
4. 没命中则走普通聊天

这样稳定、可控、成本也更低。

### 7. 普通聊天交给 `Chat Bridge Agent`

如果不是命令消息，则进入普通对话模式。

建议流程：

1. webhook 收到文本
2. 转成标准 chat 请求
3. 指定使用 `Chat Bridge Agent`
4. 返回生成结果
5. 再由平台适配层发回 Discord / 飞书

### 8. 在 Qurio 设置页增加渠道配置

建议新增一个设置分组，例如：

- `Integrations`
- 或 `Channels`

至少支持配置：

- Discord Bot Token
- Discord Signing Secret
- 飞书 App ID / App Secret
- 飞书事件签名配置
- 默认绑定 Agent
- 默认 Space
- 是否启用命令模式
- 是否允许工具调用

这些应该通过 Qurio 页面配置，而不是依赖硬编码。

### 9. 在 Agent 设置页增加渠道绑定能力

每个 Agent 可选补充这些字段：

- 允许接入的平台列表
- 默认命令前缀
- 默认回发模式
- 是否允许自动保存到 Scrapbook
- 是否允许主动外发消息

这样 `Chat Bridge Agent` 可以是默认实现，后续也能支持更多专用接入 Agent。

### 10. 把规则写成 Skill，把动作做成 Tool

建议分工如下：

`Skill` 负责：

- 如何理解 Discord / 飞书消息
- `/scrapbook` 的意图说明
- 回复格式
- 平台语气和限制

`Tool` 负责：

- 保存到 Scrapbook
- 发送 Discord 消息
- 发送飞书消息
- 读取消息上下文

这样结构最清晰，后期也方便维护。

## 推荐实现顺序

1. 新建 `Chat Bridge Agent`
2. 实现 `save_to_scrapbook` 工具
3. 接入 Discord webhook
4. 实现 `/scrapbook <url>` 命令
5. 实现普通聊天回路
6. 在设置页加入 Discord 配置
7. 接入飞书 webhook
8. 在设置页加入飞书配置
9. 增加发送消息、摘要、转发等工具
10. 做渠道绑定和更完整的 Agent UI 配置

## MVP 验收标准

做到以下几点就算第一版完成：

- Qurio 默认存在 `Chat Bridge Agent`
- Discord 可以把消息发进 Qurio
- 普通聊天可正常回复
- `/scrapbook <url>` 可把链接保存进随手记
- Discord 的 token / secret / 默认 Agent 可以在 Qurio 页面里配置

## 第二阶段可扩展项

- 飞书卡片按钮
- Discord 按钮 / Slash Commands
- 自动摘要后保存 Scrapbook
- 消息转发到指定 Space
- 用户身份映射
- 渠道级权限控制
- 审计日志
- 多平台统一会话面板

## 注意点

- 外部平台接入一定要做签名校验
- 命令型操作优先走确定性逻辑，不要完全依赖模型
- 工具权限要收紧，不要让桥接 Agent 默认拿到全部能力
- 外部平台消息最好绑定到特定 Space / Agent，避免上下文混乱
- 如果后续支持多人协作，需要提前考虑平台用户和 Qurio 用户的映射关系

## 建议下一步

下一步最适合直接开始做的，是：

1. 先实现 `save_to_scrapbook`
2. 再预置 `Chat Bridge Agent`
3. 然后接 Discord webhook

只要这三步打通，整个方向就成立了。
