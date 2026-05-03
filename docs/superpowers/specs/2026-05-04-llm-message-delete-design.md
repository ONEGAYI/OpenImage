# LLM 会话历史消息逐条删除

> 日期：2026-05-04
> 状态：设计中

## 概述

为 LLM 聊天面板添加"从末尾逐条删除消息"功能，同时改造底层 token 存储为累计值快照模式，为未来渐进披露（只加载最近 N 条消息）提供 O(1) 的 token 总量查询基础。

## 1. 底层改造：token_count 累计值快照

### 1.1 语义变更

`llm_messages.token_count` 从"本条消息的 token 估算值"改为**"到本条消息为止的对话上下文累计 token 总量"**。

### 1.2 写入逻辑

| 场景 | token_count 值 |
|------|---------------|
| 保存 user 消息 | `prev_token_count + estimate(user_content)` |
| 保存 AI 消息（有 API usage） | 直接赋值 `prompt_tokens + completion_tokens` |
| 保存 AI 消息（无 usage，如中断） | `prev_token_count + estimate(ai_content)` |

**`prev_token_count` 获取方式**：在保存消息前，查询该会话最后一条未删除消息的 `token_count`（`SELECT token_count FROM llm_messages WHERE chat_session_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`）。无消息时为 0。

**关键约束**：API 返回的 `prompt_tokens` 已包含全部历史（system + 所有消息），`completion_tokens` 为本次输出，二者之和即为准确的累计值。因此有 API usage 时直接赋值，**不做增量累加**，避免重复计算。

AI 回复的准确值会自然校准之前 user 消息的估算偏差。

### 1.3 会话 total_tokens

`llm_chat_sessions.total_tokens` 始终等于最后一条未删除消息的 `token_count`（若无消息则为 0）。

### 1.4 数据迁移

现有数据需要一次性迁移。复用 `list_chat_sessions` 中已有的回填机制：按 `created_at ASC` 遍历每条消息，逐条计算累计值并更新 `token_count`。

### 1.5 受影响的现有代码

- `chat()` 端点：保存 AI 回复时，`token_count` 改为直接赋值 `prompt_tokens + completion_tokens`（有 usage 时）或 `user_msg_token_count + estimate(ai_content)`（无 usage 时）
- `save_interrupted_message()` 端点：`token_count = prev_token_count + estimate(content)`
- `list_chat_sessions()` 回填逻辑：适配累计值语义
- 前端 `onCompleted` 回调：`total_tokens` 由后端在 completed 事件中返回，前端直接赋值

## 2. 后端 API

### 2.1 新增端点

`DELETE /api/llm-chats/{chat_id}/messages/last`

删除指定会话的最后一条未删除消息，更新 token 统计。

**请求**：无 body

**响应**：
```json
{
  "ok": true,
  "deleted_message_id": "lm_xxx",
  "total_tokens": 1234
}
```

**逻辑**（单次事务）：
1. 查询最后一条未删除消息（`WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`）
2. 若无消息 → 返回 404
3. 软删除（设 `deleted_at = now`）
4. 查询新的最后一条未删除消息 → `total_tokens = new_last.token_count`（不存在则为 0）
5. `UPDATE llm_chat_sessions SET total_tokens = ?, updated_at = ? WHERE id = ?`
6. 返回结果

**为什么不复用现有 `DELETE /llm-messages/{id}`**：
- 现有端点是通用删除（接受任意 message_id），保留用于其他场景
- 新端点封装"只能删最后一条"的业务约束，后端强制执行
- 一次请求完成删除 + token 更新

### 2.2 保留的现有端点

- `DELETE /api/llm-messages/{message_id}` — 通用单条软删除（不更新 token）
- `POST /api/llm-messages/batch-delete` — 批量软删除
- `POST /api/llm-messages/{message_id}/undo-delete` — 撤销删除

## 3. 前端实现

### 3.1 Store 层

`llmChatStore.ts` 新增 `deleteLastMessage` action：

```
1. 调用 DELETE /llm-chats/{chatId}/messages/last
2. 从 messages 数组末尾移除一条
3. 用返回的 total_tokens 更新 chatSessions 中对应会话
```

### 3.2 API 层

`api.ts` 新增：
```typescript
export async function deleteLastMessage(chatId: string): Promise<{
  ok: boolean;
  deleted_message_id: string;
  total_tokens: number;
}>
```

### 3.3 UI 层 — 悬浮删除按钮

**位置**：
- user 消息：✕ 在气泡**左上方**（朝面板内部方向）
- assistant 消息：✕ 在消息组**右上方**（朝面板内部方向）

**assistant 消息的特殊处理**：AI 一轮回复可能包含 3 段视觉元素（ThinkingCard + 正文 + AiBlock），删除按钮用 `position: absolute` 悬浮在整个消息组外层 div 的右上角，覆盖所有子段。

**显示条件**：
- `isLast === true`（仅最后一条消息）
- `bufferingState === "idle"`（非流式生成中）
- `messages.length > 0`

**交互行为**（遵循项目 inline style + onMouseEnter/Leave 风格）：
- 组件内维护 `isHovered` 状态
- 默认 `opacity: 0` + `pointer-events: none`
- `onMouseEnter` 整个消息组时 → `opacity: 1` + `pointer-events: auto`
- `onMouseLeave` → 恢复隐藏
- 点击直接删除，无确认弹窗

**样式**：
- 20px 圆形，红色背景（`#e74c3c`）
- `position: absolute; top: -8px`
- user 消息 `right: unset; left: -8px`
- assistant 消息 `right: -8px; left: unset`

### 3.4 组件变更

**ChatMessage.tsx**：
- 新增 `isLast` prop
- 新增 `onDelete` 回调 prop
- 在最外层容器添加 `position: relative` + hover 状态管理
- 条件渲染删除按钮

**ChatPanel/index.tsx**：
- 遍历 messages 时传入 `isLast={index === messages.length - 1}`
- 传入 `onDelete={handleDeleteLast}`（调用 store 的 `deleteLastMessage`）

## 4. i18n

无需新增翻译键。删除按钮使用 ✕ 通用符号。

## 5. 不做的事

- 不支持删除中间消息（仅从末尾逐条删除）
- 不添加删除确认弹窗
- 不在前端显示 token 计数（本次不做，未来可通过底部工具栏或其他方式展示）
- 不修改现有的通用删除/批量删除/撤销删除端点
