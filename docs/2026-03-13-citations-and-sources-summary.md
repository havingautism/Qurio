# 2026-03-13 Citations 与 Sources 调整总结

## 背景

今天这轮调整的核心目标有两条：

1. 让网络搜索来源和文档检索来源在产品语义上彻底分开。
2. 让文档 citations 更可读、更可追溯，同时避免把不可靠的网络搜索结果伪装成句内精确引用。

当前共识是：

- 网络搜索来源不适合做正文内 citations。
- 文档检索来源可以保留正文 citations，但展示方式要更谨慎。
- “所有来源”应成为统一来源入口。

## 今日已完成

### 1. 网络搜索 citations 与文档 citations 分轨

- 正文内不再为网络搜索来源渲染 citations。
- 文档来源仍可在正文中以 citations 形式出现。
- “所有来源”继续同时承载网络搜索来源和文档来源。

这意味着：

- Web sources: 只进入来源面板，不进入正文。
- Document sources: 可进入正文 citation，也可进入来源面板。

### 2. “所有来源”改为统一入口

- 消息气泡下方旧的文档来源入口已移除。
- 来源入口统一收敛到右上角“所有来源”。

这样可以避免双入口造成的理解冲突：

- 右上角负责统一查看来源。
- 正文 citation 负责局部跳转和阅读辅助。

### 3. “所有来源”支持来源类型分离

- 来源面板已调整为分 tab 展示：
  - 网络搜索来源
  - 文档来源

这样做的原因是：

- 避免用户把两类来源误认为同一套 citation 体系。
- 更符合“文档 citation 可追溯、web sources 仅供参考”的产品语义。

### 4. 文档来源支持查看完整引用内容

- 文档来源项现在支持 `show full quote / hide full quote`。
- hover citation 视图和“所有来源”里的文档项，都能展开查看更完整的引用文本。
- 展开/收起按钮样式已改为主题色。

这样可以在保持 UI 简洁的同时，让用户按需查看完整引用内容。

### 5. 文档来源不再做语义归并

中间尝试过“把相似命中的文档来源归并成一个展示项”，后来已回退。

当前策略是：

- 一个原始文档命中 = 一个展示来源。
- 即使标题、小标题、snippet 看起来相似，也先保留独立性。

原因是：

- 不同章节、不同位置可能出现相同内容。
- 仅凭内容相似就归并，可能把两个真实不同的证据点误合并。

### 6. 文档 citations 匹配逻辑已收紧

为了缓解“正文里很多地方都出现相同的 `+5`，且点开内容也一样”的问题，已对前端推断式 citation 匹配做收紧：

- 改为 snippet-first 匹配。
- 降低 `title/titlePath` 对匹配结果的影响。
- 加入最小匹配门槛，过滤弱相关来源。
- 每段正文最多保留 top 3 个最强匹配来源。

这部分逻辑位于：

- `src/components/message/messageUtils.js`

配套测试位于：

- `src/components/message/messageUtils.test.js`

### 7. 文档来源展示时机延后

文档检索本身仍然在发送请求前执行，以便给模型提供上下文；但 UI 展示时机已延后。

现在的行为是：

- 文档来源不会在流式生成一开始就出现在“整理参考资料”和右上角“所有来源”里。
- 等回答结束后，再统一显示来源入口和来源列表。

这让文档来源的显示时机更接近网络搜索来源的用户感知。

## 当前系统行为总结

### 正文 citations 的实际来源机制

当前文档 citations 并不是模型在流式响应中结构化返回的“句子 -> 引用片段”映射。

而是前端在收到回答文本后，根据以下逻辑推断出来：

1. 将正文切成可引用的 segment。
2. 用每个 segment 去和本轮文档检索得到的 `documentSources` 做文本匹配。
3. 按 overlap + 检索分数排序。
4. 选出最强的若干项作为 citations。

因此，当前文档 citations 本质上是：

- 前端推断式 citation
- 不是模型显式返回的句级 grounding

### 网络搜索来源的当前定位

网络搜索来源当前保留为：

- “所有来源”中的来源列表
- 非正文内联 citation

这能显著降低“模型通过 prompt 自行标注 `[1][2][3]` 导致幻觉”的风险。

## 已确认的问题与现状

### 1. 正文 citations 仍然不是严格精准引用

即使匹配逻辑已经收紧，当前文档 citations 仍然是前端匹配结果，不是后端返回的结构化证据绑定。

所以它们更适合被理解为：

- “最相关文档片段提示”

而不是：

- “严格可验证的句级精确证据”

### 2. 当前 top 3 仍可能偏多

虽然相比“放开全部匹配来源”已经好了很多，但对正文阅读来说，`top 3` 仍可能偏多。

尤其在术语高度重复的文档中，仍可能出现：

- 不同句子的 citations 相似度很高
- 多处正文看起来绑定到接近同一组来源

### 3. 文档来源的章节区分能力仍不强

有些来源虽然来自不同章节或不同位置，但当前展示字段不足以让用户一眼区分：

- 文档名可能相同
- 小标题可能相同
- snippet 前半段可能相同

这会让用户感知为“看起来重复”，即使底层其实是两个不同原始命中。

## 待优化

### 1. 评估是否把正文 citations 从 top 3 调整为 top 2

这是当前最值得继续评估的一项。

可能的方向：

- 保留现有更严格的 snippet-first 匹配
- 但将每段正文最终展示的 citation 数从 `top 3` 改为 `top 2`

收益：

- 正文更干净
- 减少“每句话都挂太多来源”的噪音
- 更接近最初版本那种更克制的阅读感受

风险：

- 可能隐藏掉第三个其实也很重要的来源

### 2. 增强文档来源的位置信息展示

当前最缺的是“如何让两个看起来很像的来源在 UI 上可区分”。

可考虑补充：

- 页码
- chunk/node 的位置信息
- 章节层级更完整的 titlePath
- 在文档中的顺序号或锚点信息

如果这些信息在数据层可用，UI 上的“看起来重复”问题会明显缓解。

### 3. 进一步收紧 segment 切分与匹配阈值

如果后续仍然出现大量近似 citation，可继续优化：

- 更细地切分正文 segment
- 调高最小 overlap 阈值
- 对高频泛化词做降权
- 进一步降低 `title/titlePath` 的匹配权重

### 4. 统一来源展示完成态

虽然文档来源已经延后到回答完成后再显示，但仍建议继续检查：

- deep research 流程面板
- expert mode
- share canvas
- workflow summary

确认所有来源入口在不同消息模式下都遵循同一展示时机规则。

## 需要继续考虑的提升方向

### 1. 是否需要更严格的“可信 citation”定义

当前的文档 citations 仍属于前端推断。

如果以后要把 citations 提升为真正可信的“证据绑定”，需要更底层的结构化支持，例如：

- 检索阶段保存更精细的 chunk/span 信息
- 模型或后端返回句子与 source ids 的显式映射
- 不再只依赖前端 overlap 推断

这会是更长期的架构升级，不适合在仅靠展示层的前提下硬做。

### 2. 是否要对 web sources 做进一步兜底清洗

当前网络搜索来源虽然不再走正文 citation 渲染，但如果模型自身在正文里输出 `[1][2]` 这样的文本，仍可能造成误导。

后续可考虑：

- 在 prompt 层明确禁止 web inline citations
- 或对 web-search answer 做正文 citation token 清洗

### 3. 是否要让“所有来源”承担更多证据查看职责

当前“所有来源”已经是统一入口，但后续还可以增强为更强的证据查看器，例如：

- 文档来源默认摘要 + 可展开全文
- 支持更明确的位置标签
- 支持在文档中打开原位置

这样正文 citations 可以继续保持轻量，完整证据查看则交给来源面板承担。

## 建议的下一步

如果继续沿今天这条线优化，建议优先顺序如下：

1. 评估并试验将正文 citations 从 `top 3` 调整为 `top 2`
2. 为文档来源补充更细的位置区分信息
3. 检查 deep research / expert / share 场景下的来源展示完成态是否一致
4. 再决定是否需要更进一步的 citation 架构升级

## 涉及的核心文件

- `src/components/MessageBubble.jsx`
- `src/components/message/messageUtils.js`
- `src/components/message/messageUtils.test.js`
- `src/lib/documentCitationViewModel.js`
- `src/lib/documentCitationViewModel.test.js`
- `src/components/DesktopSourcesSheet.jsx`
- `src/components/MobileSourcesDrawer.jsx`
- `src/components/DesktopSourcesSection.jsx`
- `src/components/message/MessageActionBar.jsx`
- `src/locales/en.json`
- `src/locales/zh-CN.json`

