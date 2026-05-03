# LLM AI 助手集成设计规格

> 日期：2026-05-03
> 状态：已批准
> 范围：为 OpenImage 接入 LLM AI 助手，实现多轮对话式提示词优化

## 概述

在 InputArea 区域新增 AI 助手功能开关。开启后，用户输入不直接触发生图，而是进入与 LLM 的多轮对话模式。AI 通过结构化 JSON 协议输出提问表单和提示词建议卡片，用户在交互式界面中逐步完善需求，最终将选定的提示词交给生图流程。

## 设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| LLM 配置 | 独立于图片生成 API | 用户可能用不同提供商做聊天和生图 |
| 输出协议 | ` ```ai-block` 包裹 JSON | 比纯文本标记更可靠，JSON.parse 可明确报错 |
| 提问交互 | 表单化卡片（必填/选填） | 比自由文本回答更结构化，AI 能获取精确信息 |
| 图片处理 | 配置声明 + 自动回退 | 兼容不支持视觉的本地模型 |
| Token 统计 | API usage 优先 + 近似估算 | 尽量精确，无 usage 时兜底 |
| 历史存储 | 会话绑定多聊天会话 | 灵活管理不同创意方向的对话 |
| 删除策略 | 限时 48h 软删除 | 支持撤销，自动清理不永久占用空间 |
| 响应方式 | SSE 流式输出 | 实时反馈，用户体验更好 |
| 后端架构 | OpenAI 兼容协议统一 | 覆盖 Ollama/LM Studio/vLLM 等绝大多数场景 |

## 一、UI 布局

### 1.1 AI 助手开关

位置：InputArea 工具栏右侧（RatioSelector 之后）。

- 关闭态：灰色 toggle + "AI 助手" 文字
- 开启态：强调色 toggle + 高亮背景
- 切换时带有平滑过渡动画

### 1.2 聊天面板

位置：InputArea 上方。AI 开启时显示，关闭时隐藏。

**折叠态（默认）：**
- 高度约 1 行（~36px）
- 显示：当前聊天会话名称 + token 统计 + 最新 AI 回复摘要（单行截断）
- 操作按钮：管理、展开

**展开态：**
- 高度为 InputArea 所在区域的 50%（半屏）
- 顶部：ChatSessionBar（会话选择下拉 + token 统计 + 管理按钮 + 收起按钮）
- 中部：消息列表，可滚动，新消息自动滚到底
- 底部：无额外操作区

### 1.3 输入区行为变化

AI 开启后：
- placeholder 变为"和 AI 讨论你的创意..."
- 按钮文案从"生成"变为"发送"
- Enter 直接发送（不需要 Ctrl+Enter）
- 输入框聚焦时边框为强调色

### 1.4 建议卡片

AI 输出 `type: "suggestions"` 时渲染。垂直堆叠在聊天面板内的 AI 消息气泡中（每个方案一张卡片，上下排列）。

每个卡片：
- 标题（如"方案 1 · 推荐"）
- 提示词内容预览
- "采用生图"按钮 — 直接用该 prompt 触发生图流程
- "编辑后用"按钮 — 将 prompt 填入输入框，关闭 AI 助手
- 首个推荐方案用强调色边框突出

用户未选任何卡片而直接发送新消息时：
- 显示分隔标记"— N 个方案未选择，继续优化—"
- 之前的方案保留在聊天上下文中
- AI 基于新输入继续优化

## 二、AI 输出 JSON 协议

AI 在 `` ```ai-block `` 标记内输出结构化 JSON。后端负责解析验证，前端直接消费解析后的对象。

### 2.1 提问型响应

```json
{
  "type": "questions",
  "message": "为了给您最合适的建议，请补充几个细节：",
  "fields": [
    {
      "id": "style",
      "label": "您偏好什么风格？",
      "widget": "radio",
      "options": ["写实", "水彩", "油画", "国风"],
      "required": true
    },
    {
      "id": "composition",
      "label": "画面构图偏好？",
      "widget": "text",
      "placeholder": "如：远景全景、近景特写...",
      "required": true
    },
    {
      "id": "tone",
      "label": "色调倾向",
      "widget": "select",
      "options": ["暖橙", "冷蓝", "梦幻粉紫"],
      "required": false
    }
  ]
}
```

**支持的 widget 类型：**

| widget | 渲染为 | 适用场景 |
|--------|--------|----------|
| `text` | 单行文本输入框 | 自由文字描述 |
| `textarea` | 多行文本 | 较长描述 |
| `radio` | 单选按钮组 | 少量互斥选项 |
| `select` | 下拉选择 | 较多选项或可空 |
| `checkbox` | 多选复选框 | 可同时选多个 |

**表单交互：**
- 必填项标红星 `*`
- 选填项标注"（选填）"
- "提交回答"按钮，必填未填时校验拦截
- "跳过"按钮允许跳过 AI 提问

**表单提交流程：**
1. 用户填写表单字段并点击"提交回答"
2. 前端将表单值拼接为自然语言用户消息（如"风格：国风，构图：远景全景，色调：暖橙"）
3. 调用 `POST /api/llm-chats/{id}/chat`，`content` 为拼接后的文字，`form_response` 为原始字段值
4. 后端保存用户消息时，`content` 存拼接文字，`form_response` 存 JSON 以便回放
5. 后端将完整的聊天历史 + 新消息发送给 LLM，获取下一轮响应

**"跳过"行为：** 用户跳过提问时，发送一条"跳过了提问"的标记消息。AI 看到后会基于已有信息直接给出建议。

### 2.2 方案建议型响应

```json
{
  "type": "suggestions",
  "message": "结合您的要求，我准备了以下方案：",
  "items": [
    {
      "id": "s1",
      "title": "国风水墨日落",
      "prompt": "Traditional Chinese ink wash painting...",
      "recommended": true
    },
    {
      "id": "s2",
      "title": "宋代山水全景",
      "prompt": "Ethereal mountain valley panoramic view..."
    }
  ]
}
```

### 2.3 普通文字回复

AI 也可以在 `ai_block` 之外输出纯文字（不在 ```ai-block 标记内的内容），前端作为普通聊天气泡渲染。

## 三、SSE 事件流

### 3.1 端点

`POST /api/llm-chats/{id}/chat`

**请求体：**
```json
{
  "content": "用户输入内容",
  "attachments": [{"data": "base64...", "media_type": "image/jpeg"}],
  "form_response": {"style": "国风", "composition": "远景全景"}
}
```

`form_response` 用于提交提问表单的回答。当用户通过表单提交时，该字段包含各字段的回答值；当用户直接输入文字时，该字段省略。

### 3.2 SSE 事件类型

| 事件 | 数据格式 | 说明 |
|------|----------|------|
| `token` | `{"text": "..."}` | 流式文字片段 |
| `buffering` | `{"status": "parsing_ai_block", "elapsed_ms": 0}` | ai_block 缓冲开始 |
| `ai_block` | `{"type": "questions/suggestions", ...}` | 结构化 JSON 块（完整推送） |
| `usage` | `{"prompt_tokens": N, "completion_tokens": N}` | token 用量统计 |
| `completed` | `{"message_id": "...", "token_count": N}` | 消息完成 |
| `parse_warning` | `{"status": "json_parse_failed", "raw_text": "..."}` | JSON 解析失败（降级为纯文本） |
| `error` | `{"code": "...", "message": "..."}` | 错误 |

### 3.3 缓冲状态处理

后端检测到 `` ```ai-block `` 标记时：
1. 发送 `buffering` 事件通知前端
2. 暂停推送该标记内的 `token` 事件（静默收集）
3. 标记结束后尝试 `JSON.parse`
4. 成功 → 发送 `ai_block` 事件
5. 失败 → 发送 `parse_warning` 事件，附带原始文本

前端收到 `buffering` 事件后显示 BufferingIndicator（脉冲动画 + "正在生成方案建议..." + 计时器）。

## 四、数据模型

### 4.1 `llm_chat_sessions` 表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PK | UUID |
| `session_id` | TEXT | FK → sessions.id | 关联的图片会话 |
| `name` | TEXT | NOT NULL | 聊天会话名称 |
| `created_at` | TEXT | NOT NULL | ISO 时间戳 |
| `updated_at` | TEXT | NOT NULL | ISO 时间戳 |
| `total_tokens` | INTEGER | DEFAULT 0 | 累计 token 用量 |

### 4.2 `llm_messages` 表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PK | UUID |
| `chat_session_id` | TEXT | FK → llm_chat_sessions.id | 所属聊天会话 |
| `role` | TEXT | NOT NULL | `user` / `assistant` / `system` |
| `content` | TEXT | NOT NULL | 消息文本内容 |
| `ai_block` | TEXT | NULL | JSON 字符串，结构化输出 |
| `token_count` | INTEGER | DEFAULT 0 | 本条消息 token 数 |
| `attachments` | TEXT | NULL | JSON 数组，附件元数据 |
| `created_at` | TEXT | NOT NULL | ISO 时间戳 |
| `deleted_at` | TEXT | NULL | 软删除时间戳，NULL 表示未删除 |

**`content` 与 `ai_block` 分离**：AI 的文字回复存 `content`，结构化 JSON 存 `ai_block`。前端展示聊天记录用 `content`，渲染表单/卡片解析 `ai_block`。

**附件元数据格式：**
```json
[{"name": "photo.jpg", "type": "image/jpeg", "size": "245k", "data_included": false}]
```
- `data_included: false` — 不支持视觉时只传元数据
- `data_included: true` — 图片 base64 已包含在消息中

### 4.3 软删除策略

- 删除消息时设置 `deleted_at` 为当前时间
- 48 小时内可撤销（`POST /api/llm-messages/{id}/undo-delete`）
- 后端在会话加载时自动清理 `deleted_at` 超过 48 小时的记录
- 删除聊天会话时物理删除所有关联消息

### 4.4 会话命名

- 新建聊天会话时，名称默认为"新对话"
- AI 首次回复后，后端尝试用 LLM 生成简短标题（基于首条消息）
- 如果 LLM 不支持或失败，截取用户首条消息前 20 字符作为标题
- 用户可随时手动重命名

## 五、后端 API

### 5.1 LLM 聊天会话

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sessions/{id}/llm-chats` | 列出该图片会话的所有聊天会话 |
| POST | `/api/sessions/{id}/llm-chats` | 创建新聊天会话 |
| PATCH | `/api/llm-chats/{id}` | 重命名聊天会话 |
| DELETE | `/api/llm-chats/{id}` | 删除聊天会话及所有消息 |

### 5.2 LLM 消息

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/llm-chats/{id}/messages` | 获取消息列表（含 token 统计） |
| PATCH | `/api/llm-messages/{id}` | 编辑单条消息 |
| DELETE | `/api/llm-messages/{id}` | 软删除单条消息 |
| POST | `/api/llm-messages/batch-delete` | 批量软删除 |
| POST | `/api/llm-messages/{id}/undo-delete` | 撤销删除 |

### 5.3 LLM 聊天（SSE）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/llm-chats/{id}/chat` | SSE 流式聊天 |

### 5.4 LLM 设置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/llm-settings` | 获取 LLM 配置 |
| PATCH | `/api/llm-settings` | 更新 LLM 配置 |

**配置字段：**
```json
{
  "llm_api_key": "sk-...",
  "llm_base_url": "http://localhost:11434/v1",
  "llm_model_name": "llama3.1:8b",
  "llm_supports_vision": false,
  "llm_system_prompt": "你是一个专业的图片提示词助手..."
}
```

### 5.5 后端 LLM 客户端

使用 OpenAI 兼容协议（`/v1/chat/completions`），统一覆盖：
- OpenAI GPT-4o / GPT-4o-mini
- Ollama（本地 Llama、Qwen 等）
- LM Studio
- vLLM
- DeepSeek、Groq 等兼容服务

后端新增 `core/llm_client.py`：
- `LLMClient` 类，接受 base_url / api_key / model_name 配置
- `chat_stream()` 方法，返回异步生成器，逐 token 产出
- 自动检测 ai_block 标记并缓冲解析
- 视觉支持检测：配置声明 + 错误自动回退

### 5.6 消息构建

每轮发给 LLM 的消息结构：
```
[system prompt]           ← 固定在开头，用户可编辑
[历史消息...]              ← 从 llm_messages 表加载（排除已删除的）
  - user 消息：content + 附件（如支持视觉）
  - assistant 消息：content（ai_block 中的内容摘要附加在 content 后）
[当前用户输入]             ← 新输入 + 附件
```

**ai_block 回传 LLM 时的处理：**
- `type: "questions"` → 附加"之前询问了用户：{label列表}"
- `type: "suggestions"` → 附加"之前提供了以下方案：{title列表}"
- 这样 LLM 在后续对话中知道自己之前提问和给出过哪些建议

附件处理逻辑：
1. 检查 `llm_supports_vision` 配置
2. `true` → 将图片作为 `image_url` content block 传入
3. `false` → 仅传附件元数据文字描述
4. 如果 API 返回多模态不支持的错误 → 自动回退为文字描述重试

## 六、Token 统计

### 6.1 策略

优先使用 API `usage` 字段，无 usage 时用近似估算。

- **有 usage**：从 SSE `usage` 事件获取 `prompt_tokens` / `completion_tokens`，累加到 `llm_chat_sessions.total_tokens` 和 `llm_messages.token_count`
- **无 usage**：后端估算（1 token ≈ 4 字符 / 0.75 英文单词），对中文内容用更保守的估算

### 6.2 显示

- ChatSessionBar 显示当前聊天会话累计 token（如"≈1.2k tokens"）
- 输入区实时估算当前输入 + 历史的总 token 数
- 估算值标注"≈"前缀，明确告知为近似值

## 七、前端组件架构

### 7.1 新增 Store：`llmChatStore`

```typescript
interface LLMChatState {
  // 全局状态
  aiEnabled: boolean;
  currentChatSessionId: string | null;

  // 数据
  chatSessions: Record<string, LLMChatSession[]>;
  messages: Record<string, LLMMessage[]>;

  // 流式状态
  streamingText: string;
  bufferingState: 'idle' | 'streaming' | 'buffering' | 'ready';
  bufferElapsed: number;

  // token
  totalTokens: number;

  // UI 状态
  panelExpanded: boolean;
}
```

### 7.2 新增组件

| 组件 | 位置 | 职责 |
|------|------|------|
| `AiToggle` | InputArea 工具栏 | AI 助手开关 toggle |
| `ChatPanel` | InputArea 上方 | 聊天面板容器（折叠/展开/滚动） |
| `ChatMessage` | ChatPanel 内部 | 消息气泡（用户/AI/系统） |
| `AiBlockRenderer` | ChatMessage 内部 | 根据 ai_block 类型分发渲染 |
| `QuestionForm` | AiBlockRenderer 子组件 | 提问表单，必填校验，提交 |
| `SuggestionCards` | AiBlockRenderer 子组件 | 建议卡片组，采用/编辑按钮 |
| `BufferingIndicator` | ChatPanel 内部 | 缓冲态脉冲动画 + 计时 |
| `ChatSessionBar` | ChatPanel 顶部 | 会话选择/管理/新建 |
| `LLMSettingsSection` | SettingsDialog 内部 | LLM API 配置区域 |

### 7.3 InputArea 结构

```
InputArea
├── ChatPanel（AI 开启时显示）
│   ├── ChatSessionBar
│   ├── 消息列表（可滚动）
│   │   ├── ChatMessage（用户）
│   │   └── ChatMessage（AI）
│   │       └── AiBlockRenderer
│   │           ├── QuestionForm
│   │           └── SuggestionCards
│   ├── BufferingIndicator
│   └── 折叠态消息预览（单行）
├── 工具栏行
│   ├── 附加按钮
│   ├── 设置按钮
│   ├── RatioSelector
│   ├── 弹性空白
│   └── AiToggle
└── 输入行
    ├── textarea
    └── 发送/取消按钮
```

### 7.4 关键交互流

**采用生图：**
用户点击"采用生图" → prompt 填入 generationStore → 触发 startGeneration → AI 助手保持开启

**编辑后用：**
用户点击"编辑后用" → prompt 填入输入框 → 关闭 AI 助手 → 用户手动修改后点"生成"

**继续聊天：**
用户未选卡片直接发新消息 → 未选方案标记"已跳过" → 完整历史 + 新消息发给 LLM → AI 继续优化

## 八、文件结构变更

```
backend/src/
├── api/
│   ├── llm_chat.py           # 聊天会话 + 消息 CRUD + SSE 聊天
│   └── llm_settings.py       # LLM 配置 CRUD
├── core/
│   ├── llm_client.py         # LLM API 客户端（OpenAI 兼容）
│   └── llm_tokenizer.py      # Token 近似估算
└── database.py               # 新增 llm_chat_sessions + llm_messages 表

frontend/src/
├── components/
│   ├── AiToggle.tsx           # AI 助手开关
│   ├── ChatPanel/
│   │   ├── index.tsx          # 聊天面板容器
│   │   ├── ChatMessage.tsx    # 消息气泡
│   │   ├── ChatSessionBar.tsx # 会话管理栏
│   │   ├── AiBlockRenderer.tsx
│   │   ├── QuestionForm.tsx   # 提问表单
│   │   ├── SuggestionCards.tsx
│   │   └── BufferingIndicator.tsx
│   └── SettingsDialog.tsx     # 新增 LLMSettingsSection
├── stores/
│   └── llmChatStore.ts        # AI 聊天状态管理
├── services/
│   └── api.ts                 # 新增 LLM API 函数
├── types/
│   └── index.ts               # 新增 LLM 相关类型
└── i18n/
    ├── zh.json                # 新增翻译键
    └── en.json                # 新增翻译键
```

## 九、待后续设计

- 系统 prompt 模板设计（AI 的角色定义、输出格式规范、提问策略）
- AI 自动命名的具体 prompt
- 附件在聊天中的展示样式优化
- 聊天记录的导出/导入
- 多语言 prompt 适配
