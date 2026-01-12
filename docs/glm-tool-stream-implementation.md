# GLM Tool Stream Implementation | GLM 工具流式输出实现

## Overview | 概述

GLM-4.6 and GLM-4.7 support a tool streaming feature (`tool_stream`) that allows tool parameters to be streamed incrementally during generation, rather than waiting for the complete JSON to be generated before returning.

GLM-4.6 和 GLM-4.7 支持工具流式输出功能(`tool_stream`),允许工具参数在生成过程中增量流式返回,而不是等待完整的 JSON 生成后再返回。

## Design Purpose | 设计目的

The `tool_stream` parameter is designed to bring GLM's streaming tool call capabilities in line with other mainstream AI models. By default, GLM streams text content but returns tool parameters in one complete chunk. With `tool_stream` enabled, GLM achieves true streaming for both text and tool parameters.

`tool_stream` 参数旨在让 GLM 的流式工具调用能力与其他主流 AI 模型保持一致。默认情况下,GLM 会流式返回文本内容,但工具参数是一次性完整返回。启用 `tool_stream` 后,GLM 实现了文本和工具参数的真正流式返回。

### Capability Comparison Across Models | 跨模型能力对比

| Model 模型 | Native Streaming Tool Calls 原生流式工具调用 | Requires Special Parameter 需要特殊参数 |
|-------|---------------------------|---------------------------|
| **OpenAI GPT-4** | ✅ Yes 是 | No 否 |
| **Anthropic Claude** | ✅ Yes 是 | No 否 |
| **Google Gemini** | ✅ Yes 是 | No 否 |
| **GLM-4.6/4.7** | ⚠️ Requires `tool_stream=true` 需开启 | Yes 是 |

### GLM Default Behavior | GLM 默认行为

**Without `tool_stream` | 不开启 `tool_stream`:**
```
Text 文本: "Let me search for the weather..." [Streaming 流式] ✅
Tool params 工具参数: {"location":"Beijing","unit":"celsius"} [Single chunk 一次性返回] ❌
```

**With `tool_stream=true` | 开启 `tool_stream=true`:**
```
Text 文本: "Let me search for the weather..." [Streaming 流式] ✅
Tool params 工具参数: {"location":"Beijing","unit":"celsius"} [Streaming chunks 流式分块] ✅
```

> **Note | 说明:** `tool_stream` is GLM's way of achieving feature parity with industry-standard streaming tool call behavior.
> 
> `tool_stream` 是 GLM 为了达到行业标准流式工具调用行为而设计的功能补齐。

## Feature Comparison | 功能对比

### Streaming vs Non-Streaming | 流式 vs 非流式

| Aspect 方面 | Non-Streaming 非流式 | Streaming (no `tool_stream`) 流式(无 `tool_stream`) | Streaming (with `tool_stream`) 流式(启用 `tool_stream`) |
|--------|--------------|----------------------------|-------------------------------|
| **Text Content 文本内容** | One-time return 一次性返回 | Chunked streaming ✅ 分块流式 | Chunked streaming ✅ 分块流式 |
| **Tool Parameters 工具参数** | One-time return 一次性返回 | One-time return 一次性返回 | Chunked streaming ✅ 分块流式 |
| **User Experience 用户体验** | Wait for everything 等待全部完成 | See text first, then tool appears 先看到文本,然后工具出现 | Everything flows smoothly 一切流畅呈现 |

### Tool Parameter Streaming Detail | 工具参数流式详情

| Aspect 方面 | With `tool_stream: true` 启用 `tool_stream: true` | Without `tool_stream` 不启用 `tool_stream` |
|--------|-------------------------|----------------------|
| **Chunk Count 分块数量** | 12 chunks 12个分块 | 1 chunk 1个分块 |
| **Chunk Size 分块大小** | 1-5 characters per chunk 每块1-5字符 | 48-55 characters (complete JSON) 48-55字符(完整JSON) |
| **Parameter Generation 参数生成** | Streamed during generation 生成过程中流式输出 | Waits for complete JSON 等待完整JSON |
| **User Experience 用户体验** | Parameters appear to generate in real-time 参数实时生成显示 | Parameters appear all at once 参数一次性出现 |

## Example Comparison | 示例对比

### With `tool_stream` enabled | 启用 `tool_stream`:
```
[GLM RAW TOOL PARAM CHUNK #0] argChunkLength: 2, '{"'
[GLM RAW TOOL PARAM CHUNK #1] argChunkLength: 5, 'query'
[GLM RAW TOOL PARAM CHUNK #2] argChunkLength: 3, '":"'
[GLM RAW TOOL PARAM CHUNK #3] argChunkLength: 1, 'D'
[GLM RAW TOOL PARAM CHUNK #4] argChunkLength: 3, 'ota'
[GLM RAW TOOL PARAM CHUNK #5] argChunkLength: 1, '2'
...
```

### Without `tool_stream` | 不启用 `tool_stream`:
```
[GLM RAW TOOL PARAM CHUNK #0] argChunkLength: 48, '{"query":"Dota2 latest update patch notes 2025"}'
```

## Implementation Details | 实现细节

### Request Format | 请求格式
```json
{
  "model": "glm-4.7",
  "stream": true,
  "tools": [...],
  "tool_stream": true,
  "messages": [...]
}
```

**Important | 重要:** `tool_stream` must be at the top level of the request body, NOT nested inside `extra_body`.

**重要:** `tool_stream` 必须位于请求体的顶层,不能嵌套在 `extra_body` 内部。

### Supported Models | 支持的模型
- GLM-4.6
- GLM-4.7

### Code Location | 代码位置
- `backend/src/services/providers/GLMAdapter.js`

## Key Insights | 核心要点

1. **`tool_stream` controls parameter streaming behavior, not reasoning content | `tool_stream` 控制参数流式行为,而非推理内容**
   - Reasoning content (`reasoning_content`) is controlled by thinking mode
   - 推理内容(`reasoning_content`)由思考模式控制
   - `tool_stream` specifically affects how tool parameters are streamed
   - `tool_stream` 专门影响工具参数的流式返回方式

2. **LangChain Integration | LangChain 集成**
   - `tool_stream` must be placed at top level of `modelKwargs`, not in `extra_body`
   - `tool_stream` 必须放在 `modelKwargs` 的顶层,而不是 `extra_body` 中
   - Use `ChatOpenAI` with `__includeRawResponse: true` to access raw chunks
   - 使用 `ChatOpenAI` 并设置 `__includeRawResponse: true` 来访问原始分块

3. **Testing Method | 测试方法**
   - Monitor `rawDelta.tool_calls` in streaming chunks
   - 监控流式分块中的 `rawDelta.tool_calls`
   - Compare chunk sizes and counts with/without `tool_stream`
   - 对比启用/不启用 `tool_stream` 时的分块大小和数量

## References | 参考资料

- [GLM Tool Streaming Documentation | GLM 工具流式输出文档](https://docs.bigmodel.cn/cn/guide/capabilities/stream-tool)
