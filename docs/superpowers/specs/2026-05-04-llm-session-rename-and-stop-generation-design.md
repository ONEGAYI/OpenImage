# LLM 会话更名 & 终止生成 — 功能设计

> 日期：2026-05-04
> 状态：待审阅

## 概述

为 LLM AI 助手聊天面板新增两个交互功能：

1. **会话更名** — 用户可在 ChatSessionBar 中重命名当前聊天会话
2. **终止生成** — 用户可在 AI 流式生成回复时中断生成，并保留已输出的部分消息

两个功能均已有后端/前端基础设施，主要工作是补齐 UI 层和保存中断消息的后端逻辑。

## 现有基础设施

### 会话更名（已就绪）
- 后端：`PATCH /api/llm-chats/{chat_id}` 端点 + `ChatSessionRename` 模型
- 前端 API：`renameLLMChatSession(chatId, name)`
- 前端 Store：`renameChatSession(chatId, name)` action
- **缺失：UI 入口**

### 终止生成（部分就绪）
- 前端 Store：`abortController` 状态 + `cancelStream()` action
- 前端 API：`connectSSE()` 使用 `AbortController` + `signal`
- 后端：无中断消息保存能力
- **缺失：停止按钮 UI + 中断消息保存逻辑**

---

## 一、会话更名

### UI 设计

**位置：** `ChatSessionBar.tsx`

**常态：**
- 在现有 `<select>` 下拉框右侧新增一个铅笔图标按钮（22×22px，`var(--faint)` 色）
- hover 时图标变为 `var(--accent)` 色 + 微淡背景 `rgba(201,100,66,0.06)`

**编辑态：**
- 点击铅笔图标后：
  - `<select>` 下拉框替换为 `<input type="text">`（`flex: 1` 自适应宽度）
  - 输入框获得 2px `var(--accent)` 边框 + `box-shadow: 0 0 0 2px rgba(201,100,66,0.1)`
  - 自动全选现有名称文本（`input.select()`）
  - 铅笔图标消失，变为两个图标按钮：
    - ✓ 确认（`var(--success)` 色 `#4a7c59`）
    - ✕ 取消（`var(--error)` 色 `#b53333`）
- 键盘快捷键：Enter 确认 / Esc 取消
- 空名称不允许提交，恢复原名

### 状态管理

ChatSessionBar 组件内新增本地状态：
```typescript
const [isRenaming, setIsRenaming] = useState(false);
const [renameValue, setRenameValue] = useState("");
```

### 交互流程

```
点击铅笔 → isRenaming=true, renameValue=当前会话名, input.select()
→ Enter/点击✓ → 若非空 → renameChatSession(chatId, renameValue) → isRenaming=false
→ Esc/点击✕ → isRenaming=false（不保存）
```

### 涉及文件

| 文件 | 改动 |
|------|------|
| `frontend/src/components/ChatPanel/ChatSessionBar.tsx` | 添加编辑图标、编辑态 UI、重命名逻辑 |
| `frontend/src/i18n/zh.json` | 新增 `llm.rename`、`llm.renameConfirm`、`llm.renameCancel` 键 |
| `frontend/src/i18n/en.json` | 同上英文翻译 |

---

## 二、终止生成

### UI 设计

**位置：** `InputArea.tsx`

**按钮切换逻辑：**
- 复用已有的图片生成取消按钮模式（`InputArea.tsx:249-256`）
- 条件判断从 `isThisGenerating && !aiEnabled` 扩展为包含 LLM 流式状态

```typescript
// InputArea 从 llmChatStore 获取流式状态
const isLLMStreaming = useLLMChatStore(
  (s) => s.bufferingState === "streaming" || s.bufferingState === "buffering"
);

// 按钮切换条件
if ((isThisGenerating && !aiEnabled) || isLLMStreaming) → 显示停止按钮
else → 显示发送/生成按钮
```

**停止按钮样式（复用已有）：**
- `background: rgba(181,51,51,0.08)`
- `color: var(--error)`
- `border: 1px solid rgba(181,51,51,0.2)`
- `borderRadius: var(--radius-md)` (12px)
- hover: `background: rgba(181,51,51,0.14)`

**textarea 在流式时：**
- `disabled` 状态
- `placeholder: "AI 正在回复..."`（i18n 键 `llm.streamingPlaceholder`）
- 背景变灰 `var(--bg)`

### 中断消息保存

**核心变更：** 修改 `cancelStream()` 的行为，从"丢弃所有内容"改为"保存已流式内容后中断"。

#### 后端新增端点

```
POST /api/llm-chats/{chat_id}/messages/interrupted
Body: {
  "content": str,           # 已流式文本
  "thinking_content": str | None,  # 已流式思考内容
  "thinking_duration_ms": int | None
}
```

功能：
1. 保存为 `llm_messages` 记录，`role: "assistant"`
2. 自动计算并更新会话 `total_tokens`
3. 返回保存后的消息对象

#### 前端 `cancelStream()` 改造

```
cancelStream() →
  1. 收集已流式内容快照（streamingText, streamingThinking）到局部变量
  2. abortController.abort() — 中断 SSE 连接
  3. 若有内容 → POST /messages/interrupted → 保存消息
     保存失败时仅 console.warn，不阻塞后续重置
  4. 重置流式状态（streamingText/streamingThinking 清空等）
  5. 刷新消息列表（将中断消息加载到 messages 数组）
```

### 中断消息的 UI 标记

**位置：** `ChatMessage.tsx`

对中断消息添加底部标记（仅对 `interrupted: true` 的消息显示）：
- 分割线 `border-top: 1px solid var(--border-s)`
- 黄色圆点 + "生成已中断" 文字（`var(--faint)` 色，10px 字号）
- 圆点颜色：`var(--warning)` (#d4a017)

### 数据模型

`llm_messages` 表无需新增列。中断消息的标记方案：

后端端点在保存时将 `ai_block` 设为 `null`，在 `content` 末尾追加一个隐藏标记 `<!-- interrupted -->`。

前端 `ChatMessage` 通过 `message.content.includes("<!-- interrupted -->")` 检测中断消息，显示中断标记后从渲染内容中过滤掉该标记。此方案不影响现有 AiBlockRenderer 逻辑。

### 涉及文件

| 文件 | 改动 |
|------|------|
| `backend/src/api/llm_chat.py` | 新增 `POST /messages/interrupted` 端点 |
| `frontend/src/stores/llmChatStore.ts` | 改造 `cancelStream()` 为保存后中断 |
| `frontend/src/components/InputArea.tsx` | 添加 LLM 流式时的停止按钮 |
| `frontend/src/components/ChatPanel/ChatMessage.tsx` | 中断消息底部标记 |
| `frontend/src/services/api.ts` | 新增 `saveInterruptedMessage()` API 调用 |
| `frontend/src/types/index.ts` | 类型定义更新（如有需要） |
| `frontend/src/i18n/zh.json` | 新增 `llm.stop`、`llm.streamingPlaceholder`、`llm.interrupted` 键 |
| `frontend/src/i18n/en.json` | 同上英文翻译 |

---

## 不做的事

- 中断消息不支持"继续生成"（用户需发新消息继续对话）
- 管理面板中不添加重命名入口（仅通过铅笔图标）
- 不添加会话名称自动更名逻辑的修改（保持现有首消息自动命名）
