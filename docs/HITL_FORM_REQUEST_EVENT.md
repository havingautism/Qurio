## HITL Form Request 事件处理 - 需要插入到 aiService.js

**位置：** 在 `chunk.type === 'tool_result'` 逻辑块之后，`chunk.type === 'thought'` 之前

**插入代码：**

```javascript
// Handle HITL form request event
if (chunk.type === 'form_request') {
  set(state => {
    const updated = [...state.messages]
    const lastMsgIndex = updated.length - 1
    if (lastMsgIndex < 0 || updated[lastMsgIndex].role !== 'ai')
      return { messages: updated }
    const lastMsg = { ...updated[lastMsgIndex] }
    
    // Store HITL metadata for form submission resumption
    lastMsg.hitlRunId = chunk.run_id
    lastMsg.hitlFormId = chunk.form_id
    lastMsg.hitlFormTitle = chunk.title
    lastMsg.hitlFormFields = chunk.fields
    
    // Add form as a tool call to maintain UI consistency
    const history = Array.isArray(lastMsg.toolCallHistory)
      ? [...lastMsg.toolCallHistory]
      : []
    
    // Check if form already exists (avoid duplicates)
    const existingFormIndex = history.findIndex(
      t => t.name === 'interactive_form' && t.status !== 'done'
    )
    
    if (existingFormIndex === -1) {
      const pendingThoughtLength = lastMsg.thinkingEnabled
        ? 0
        : (pendingThought || '').length
      const pendingTextLength = (pendingText || '').length
      const baseIndex =
        (lastMsg.content || '').length + pendingTextLength + pendingThoughtLength
      
      history.push({
        id: chunk.form_id || `form-${Date.now()}`,
        name: 'interactive_form',
        arguments: JSON.stringify({
          id: chunk.form_id,
          title: chunk.title,
          fields: chunk.fields
        }),
        status: 'calling', // Will be marked 'done' after submission
        textIndex: baseIndex,
        output: { fields: chunk.fields, title: chunk.title }
      })
    }
    
    lastMsg.toolCallHistory = history
    updated[lastMsgIndex] = lastMsg
    return { messages: updated }
  })
  return
}
```

**说明：**
1. 检测 `form_request` 事件类型
2. 保存 HITL 元数据（`run_id`, `form_id`, `title`, `fields`）到消息对象
3. 添加一个 `interactive_form` 工具调用到 `toolCallHistory`，用于 UI 显示
4. 避免重复添加表单

**下一步：**
修改 `submitInteractiveForm` 方法，使用新的 HITL 流程（发送 `runId` 和 `fieldValues`）
