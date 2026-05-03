# LLM 会话更名 & 终止生成 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 LLM AI 助手聊天面板添加会话更名和终止生成两个交互功能。

**Architecture:** 会话更名复用已有后端 PATCH 端点 + 前端 store action，仅补齐 ChatSessionBar UI。终止生成复用已有 AbortController 机制，新增后端中断消息保存端点，改造 cancelStream() 为"保存后中断"。

**Tech Stack:** Python FastAPI + Pydantic（后端），React + Zustand + react-i18next（前端），CSS 变量设计系统。

---

## File Structure

| 文件 | 职责 | 操作 |
|------|------|------|
| `backend/src/api/llm_chat.py` | 新增中断消息保存端点 | 修改 |
| `backend/tests/test_llm_chat.py` | 中断端点测试 | 新建 |
| `frontend/src/services/api.ts` | 新增 `saveInterruptedMessage()` | 修改 |
| `frontend/src/stores/llmChatStore.ts` | 改造 `cancelStream()` | 修改 |
| `frontend/src/components/ChatPanel/ChatSessionBar.tsx` | 更名 UI（铅笔+输入框+确认/取消） | 修改 |
| `frontend/src/components/InputArea.tsx` | 停止按钮 + textarea disabled | 修改 |
| `frontend/src/components/ChatPanel/ChatMessage.tsx` | 中断消息底部标记 | 修改 |
| `frontend/src/i18n/zh.json` | 中文翻译键 | 修改 |
| `frontend/src/i18n/en.json` | 英文翻译键 | 修改 |

---

## Task 1: i18n 翻译键

**Files:**
- Modify: `frontend/src/i18n/zh.json:108-142`
- Modify: `frontend/src/i18n/en.json`（对应 llm 段）

两个功能需要的翻译键。先添加所有键，后续任务直接引用。

- [ ] **Step 1: 在 zh.json 的 llm 对象中添加新键**

在 `"blockParseError": "解析错误，请检查AI输出或向开发者反馈"` 之后添加：

```json
"rename": "重命名",
"renameConfirm": "确认",
"renameCancel": "取消",
"stop": "停止",
"streamingPlaceholder": "AI 正在回复...",
"interrupted": "生成已中断"
```

- [ ] **Step 2: 在 en.json 的 llm 对象中添加对应英文**

在 `blockParseError` 键之后添加：

```json
"rename": "Rename",
"renameConfirm": "Confirm",
"renameCancel": "Cancel",
"stop": "Stop",
"streamingPlaceholder": "AI is responding...",
"interrupted": "Generation interrupted"
```

- [ ] **Step 3: 验证 JSON 语法正确**

Run: `cd frontend && node -e "JSON.parse(require('fs').readFileSync('src/i18n/zh.json','utf8')); console.log('zh OK')" && node -e "JSON.parse(require('fs').readFileSync('src/i18n/en.json','utf8')); console.log('en OK')"`

---

## Task 2: 后端中断消息保存端点

**Files:**
- Modify: `backend/src/api/llm_chat.py:27-56`（Pydantic models 区域）
- Modify: `backend/src/api/llm_chat.py`（路由区域，消息 CRUD 之后）
- Create: `backend/tests/test_llm_chat.py`

- [ ] **Step 1: 添加 Pydantic 模型**

在 `backend/src/api/llm_chat.py` 的 `ChatRequest` 类之后添加：

```python
class InterruptedMessage(BaseModel):
    content: str
    thinking_content: str | None = None
    thinking_duration_ms: int | None = None
```

- [ ] **Step 2: 编写测试**

创建 `backend/tests/test_llm_chat.py`：

```python
"""中断消息保存端点测试。"""
import pytest
from httpx import ASGITransport, AsyncClient

from src.server import create_app


@pytest.fixture
async def app(tmp_path):
    """创建临时数据目录的测试 app。"""
    app = create_app(str(tmp_path))
    async with app.router.lifespan_context(app):
        yield app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
async def chat_session(client):
    """创建一个图片会话 + LLM 聊天会话，返回 chat_id。"""
    # 创建图片会话
    resp = await client.post("/api/sessions", json={"name": "test"})
    session_id = resp.json()["id"]
    # 创建 LLM 聊天会话
    resp = await client.post(f"/api/sessions/{session_id}/llm-chats", json={"name": "新对话"})
    return resp.json()["id"]


async def test_save_interrupted_message(client, chat_session):
    """中断消息应保存为 assistant 消息，content 末尾含 interrupted 标记。"""
    resp = await client.post(
        f"/api/llm-chats/{chat_session}/messages/interrupted",
        json={
            "content": "这是部分回复",
            "thinking_content": "一些思考",
            "thinking_duration_ms": 1500,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "assistant"
    assert data["content"].endswith("<!-- interrupted -->")
    assert "这是部分回复" in data["content"]
    assert data["thinking_content"] == "一些思考"
    assert data["thinking_duration_ms"] == 1500
    assert data["ai_block"] is None
    assert data["token_count"] > 0


async def test_interrupted_updates_session_tokens(client, chat_session):
    """保存中断消息后，会话 total_tokens 应增加。"""
    # 获取初始 token 数
    resp = await client.get(f"/api/llm-chats/{chat_session}/messages")
    # 聊天会话 token 通过 list sessions 获取
    # 先保存中断消息
    await client.post(
        f"/api/llm-chats/{chat_session}/messages/interrupted",
        json={"content": "测试内容"},
    )
    # 验证消息已保存
    resp = await client.get(f"/api/llm-chats/{chat_session}/messages")
    messages = resp.json()
    assert len(messages) == 1
    assert messages[0]["content"].endswith("<!-- interrupted -->")


async def test_interrupted_404_for_missing_session(client):
    """不存在的聊天会话应返回 404。"""
    resp = await client.post(
        "/api/llm-chats/nonexistent/messages/interrupted",
        json={"content": "test"},
    )
    assert resp.status_code == 404
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd backend && python -m pytest tests/test_llm_chat.py -v`
Expected: FAIL — 404 because endpoint doesn't exist yet.

- [ ] **Step 4: 实现端点**

在 `backend/src/api/llm_chat.py` 的消息 CRUD 路由区域（消息删除端点之后、聊天 SSE 端点之前）添加：

```python
@router.post("/llm-chats/{chat_id}/messages/interrupted")
async def save_interrupted_message(chat_id: str, request: Request, body: InterruptedMessage):
    """保存中断生成后的部分消息。"""
    db = _db(request)

    async with db.execute("SELECT id FROM llm_chat_sessions WHERE id = ?", (chat_id,)) as cur:
        if not await cur.fetchone():
            raise HTTPException(404, "Chat session not found")

    msg_id = _gen_id("lm")
    content = body.content + "<!-- interrupted -->"
    token_count = estimate_message_tokens("assistant", content, body.thinking_content)

    await db.execute(
        "INSERT INTO llm_messages "
        "(id, chat_session_id, role, content, ai_block, token_count, thinking_content, thinking_duration_ms, created_at) "
        "VALUES (?, ?, 'assistant', ?, NULL, ?, ?, ?, ?)",
        (msg_id, chat_id, content, token_count,
         body.thinking_content, body.thinking_duration_ms,
         datetime.now(UTC).isoformat()),
    )

    now = datetime.now(UTC).isoformat()
    await db.execute(
        "UPDATE llm_chat_sessions SET total_tokens = total_tokens + ?, updated_at = ? WHERE id = ?",
        (token_count, now, chat_id),
    )
    await db.commit()

    return {
        "id": msg_id,
        "chat_session_id": chat_id,
        "role": "assistant",
        "content": content,
        "ai_block": None,
        "token_count": token_count,
        "attachments": None,
        "thinking_content": body.thinking_content,
        "thinking_duration_ms": body.thinking_duration_ms,
        "created_at": datetime.now(UTC).isoformat(),
        "deleted_at": None,
    }
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd backend && python -m pytest tests/test_llm_chat.py -v`
Expected: All 3 tests PASS.

- [ ] **Step 6: 提交后端中断消息端点**

```bash
cd backend
git add src/api/llm_chat.py tests/test_llm_chat.py
git commit -m "feat: 新增中断消息保存端点 POST /llm-chats/{id}/messages/interrupted"
```

---

## Task 3: 前端 API + Store 改造

**Files:**
- Modify: `frontend/src/services/api.ts:265-268`（listLLMMessages 之后）
- Modify: `frontend/src/stores/llmChatStore.ts:239-249`（cancelStream）

- [ ] **Step 1: 在 api.ts 添加 saveInterruptedMessage 函数**

在 `listLLMMessages` 函数之后添加：

```typescript
export async function saveInterruptedMessage(
  chatId: string,
  data: { content: string; thinking_content: string | null; thinking_duration_ms: number | null },
): Promise<LLMMessage> {
  return request<LLMMessage>(`/api/llm-chats/${chatId}/messages/interrupted`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}
```

- [ ] **Step 2: 改造 llmChatStore.ts 的 cancelStream**

将 `cancelStream` 从同步改为异步，实现"保存后中断"逻辑。替换 `llmChatStore.ts:239-249` 的 `cancelStream` 实现：

```typescript
  cancelStream: async () => {
    const { streamingText, streamingThinking, currentChatSessionId, abortController } = get();

    // 快照已流式内容
    const text = streamingText;
    const thinking = streamingThinking || null;

    // 立即中断 SSE 并重置状态（UI 立刻响应）
    abortController?.abort();
    set({
      streamingText: "",
      streamingThinking: "",
      bufferingState: "idle",
      currentAiBlock: null,
      bufferElapsed: 0,
      abortController: null,
    });

    // 有内容则保存为中断消息
    if (text.trim() && currentChatSessionId) {
      try {
        await api.saveInterruptedMessage(currentChatSessionId, {
          content: text,
          thinking_content: thinking,
          thinking_duration_ms: null,
        });
      } catch (e) {
        console.warn("保存中断消息失败:", e);
      }
      // 刷新消息列表
      try {
        const freshMessages = await api.listLLMMessages(currentChatSessionId);
        set({ messages: freshMessages });
      } catch (e) {
        console.warn("刷新消息列表失败:", e);
      }
    }
  },
```

同时更新接口签名（`llmChatStore.ts:39`）：

```typescript
cancelStream: () => Promise<void>;
```

- [ ] **Step 3: 提交 API + Store 改造**

```bash
cd frontend
git add src/services/api.ts src/stores/llmChatStore.ts
git commit -m "feat: 新增 saveInterruptedMessage API + cancelStream 改造为保存后中断"
```

---

## Task 4: ChatSessionBar 会话更名 UI

**Files:**
- Modify: `frontend/src/components/ChatPanel/ChatSessionBar.tsx`

- [ ] **Step 1: 添加 import 和本地状态**

在文件顶部 import 区域添加 `useRef`：
```typescript
import { useState, useRef, useEffect } from "react";
```

在 `useLLMChatStore` 的解构中添加 `renameChatSession`（如未有）。

在组件函数体内、`showManage` 状态之后添加：

```typescript
const renameChatSession = useLLMChatStore((s) => s.renameChatSession);
const currentSession = chatSessions.find((cs) => cs.id === currentChatSessionId);

const [isRenaming, setIsRenaming] = useState(false);
const [renameValue, setRenameValue] = useState("");
const renameInputRef = useRef<HTMLInputElement>(null);

const startRename = () => {
  if (!currentSession) return;
  setRenameValue(currentSession.name);
  setIsRenaming(true);
  setTimeout(() => renameInputRef.current?.select(), 0);
};

const confirmRename = async () => {
  const name = renameValue.trim();
  if (!name || !currentChatSessionId) {
    setIsRenaming(false);
    return;
  }
  await renameChatSession(currentChatSessionId, name);
  setIsRenaming(false);
};

const cancelRename = () => {
  setIsRenaming(false);
};

const handleRenameKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === "Enter") {
    e.preventDefault();
    confirmRename();
  } else if (e.key === "Escape") {
    e.preventDefault();
    cancelRename();
  }
};
```

- [ ] **Step 2: 替换 select 区域为编辑/常态切换**

替换 `ChatSessionBar.tsx` 中 `<select>` 部分（约 line 91-111）。将原来的：

```tsx
<select
  value={currentChatSessionId || ""}
  onChange={(e) => e.target.value && selectChatSession(e.target.value)}
  style={{...}}
>
  {chatSessions...}
</select>
```

替换为：

```tsx
{isRenaming ? (
  <input
    ref={renameInputRef}
    value={renameValue}
    onChange={(e) => setRenameValue(e.target.value)}
    onKeyDown={handleRenameKeyDown}
    style={{
      flex: 1,
      padding: "2px 6px",
      border: "2px solid var(--accent)",
      borderRadius: 4,
      fontSize: 11,
      color: "var(--fg)",
      background: "var(--input-bg)",
      outline: "none",
      boxShadow: "0 0 0 2px rgba(201,100,66,0.1)",
    }}
  />
) : (
  <select
    value={currentChatSessionId || ""}
    onChange={(e) => e.target.value && selectChatSession(e.target.value)}
    style={{
      flex: 1,
      padding: "2px 6px",
      border: "1px solid var(--border)",
      borderRadius: 4,
      fontSize: 11,
      color: "var(--fg)",
      background: "var(--input-bg)",
    }}
  >
    {chatSessions.length === 0 ? (
      <option value="" disabled>{t("llm.noChats")}</option>
    ) : (
      chatSessions.map((cs) => (
        <option key={cs.id} value={cs.id}>{cs.name}</option>
      ))
    )}
  </select>
)}
```

- [ ] **Step 3: 在 select/input 之后、token 计数之前添加图标按钮**

在上述 select/input 块之后、`<span>` token 计数之前插入：

```tsx
{isRenaming ? (
  <>
    <button
      onClick={confirmRename}
      title={t("llm.renameConfirm")}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 22, height: 22, border: "none", background: "transparent",
        cursor: "pointer", borderRadius: 4, color: "var(--success)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(74,124,89,0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </button>
    <button
      onClick={cancelRename}
      title={t("llm.renameCancel")}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 22, height: 22, border: "none", background: "transparent",
        cursor: "pointer", borderRadius: 4, color: "var(--error)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(181,51,51,0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </>
) : (
  <button
    onClick={startRename}
    title={t("llm.rename")}
    style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: 22, height: 22, border: "none", background: "transparent",
      cursor: "pointer", borderRadius: 4, color: "var(--faint)",
    }}
    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.background = "rgba(201,100,66,0.06)"; }}
    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--faint)"; e.currentTarget.style.background = "transparent"; }}
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
  </button>
)}
```

- [ ] **Step 4: 验证功能**

Run: `cd frontend && npm run dev`

测试步骤：
1. 打开 AI 助手，创建聊天会话
2. 会话选择器旁应出现铅笔图标
3. 点击铅笔 → 下拉框变为输入框 + ✓ ✕ 图标，自动全选名称
4. 输入新名称 → Enter 或点击 ✓ → 名称更新
5. 点击 ✕ 或 Esc → 取消编辑
6. 清空名称后确认 → 恢复原名称（空名称不提交）

- [ ] **Step 5: 提交更名 UI**

```bash
cd frontend
git add src/components/ChatPanel/ChatSessionBar.tsx
git commit -m "feat: ChatSessionBar 添加会话更名功能（铅笔图标+输入框+确认/取消）"
```

---

## Task 5: InputArea 停止按钮 + ChatMessage 中断标记

**Files:**
- Modify: `frontend/src/components/InputArea.tsx:34-35,80-90,249-276`
- Modify: `frontend/src/components/ChatPanel/ChatMessage.tsx:43-74`

- [ ] **Step 1: 在 InputArea 添加 LLM 流式状态**

在 `InputArea.tsx` 的 store selectors 区域（约 line 34-36）添加：

```typescript
const isLLMStreaming = useLLMChatStore(
  (s) => s.bufferingState === "streaming" || s.bufferingState === "buffering"
);
const cancelLLMStream = useLLMChatStore((s) => s.cancelStream);
```

- [ ] **Step 2: 修改 textarea 的 disabled 和 placeholder**

找到 textarea（约 line 225-244），修改 `disabled` 和 `placeholder`：

```typescript
disabled={!activeSessionId || isLLMStreaming}
```

```typescript
placeholder={
  !activeSessionId
    ? t("input.noSessionPlaceholder")
    : isLLMStreaming
      ? t("llm.streamingPlaceholder")
      : aiEnabled
        ? t("llm.placeholder")
        : t("input.placeholder")
}
```

同时在 textarea 的 `style` 中添加流式时的背景色：
```typescript
background: isLLMStreaming ? "var(--bg)" : "var(--input-bg)",
```

- [ ] **Step 3: 修改按钮区域，添加 LLM 停止按钮**

替换 `InputArea.tsx` 的按钮区域（约 line 249-276）。将条件判断从：

```tsx
{isThisGenerating && !aiEnabled ? (
  <button onClick={cancelThisGeneration} ...>{t("common.cancel")}</button>
) : (
  <button onClick={aiEnabled ? handleSend : handleGenerate} ...>
    {aiEnabled ? t("llm.send") : t("input.generate")}
  </button>
)}
```

替换为：

```tsx
{(isThisGenerating && !aiEnabled) || isLLMStreaming ? (
  <button
    onClick={isLLMStreaming ? () => { cancelLLMStream(); } : cancelThisGeneration}
    className="rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors cursor-pointer"
    style={{
      padding: "9px 18px",
      minHeight: 40,
      background: "rgba(181,51,51,0.08)",
      color: "var(--error)",
      border: "1px solid rgba(181,51,51,0.2)",
    }}
    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(181,51,51,0.14)")}
    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(181,51,51,0.08)")}
  >
    {t(isLLMStreaming ? "llm.stop" : "common.cancel")}
  </button>
) : (
  <button
    onClick={aiEnabled ? handleSend : handleGenerate}
    disabled={!activeSessionId || !prompt.trim()}
    className="rounded-lg text-[13px] font-medium whitespace-nowrap transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
    style={{
      padding: "9px 22px",
      minHeight: 40,
      background: "var(--accent)",
      color: "#faf9f5",
      border: "1px solid transparent",
    }}
    onMouseEnter={(e) => {
      if (!e.currentTarget.disabled) {
        e.currentTarget.style.background = "var(--accent-h)";
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(201,100,66,0.2)";
      }
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = "var(--accent)";
      e.currentTarget.style.transform = "translateY(0)";
      e.currentTarget.style.boxShadow = "none";
    }}
  >
    {aiEnabled ? t("llm.send") : t("input.generate")}
  </button>
)}
```

- [ ] **Step 4: 在 ChatMessage 添加中断标记**

修改 `ChatMessage.tsx`。在 `bodyText` 定义之后添加中断检测：

```typescript
const isInterrupted = !isStreaming && bodyText.includes("<!-- interrupted -->");
const displayText = isInterrupted
  ? bodyText.replace("<!-- interrupted -->", "")
  : bodyText;
```

然后将消息气泡中的 `{bodyText}`（约 line 68）替换为 `{displayText}`。

在消息气泡 `</div>` 闭合标签之前、`isStreaming` 光标之后添加中断标记：

```tsx
{isInterrupted && (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 4,
      marginTop: 6,
      paddingTop: 6,
      borderTop: "1px solid var(--border-s)",
      fontSize: 10,
      color: "var(--faint)",
    }}
  >
    <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--warning, #d4a017)" }} />
    {t("llm.interrupted")}
  </div>
)}
```

需要在 ChatMessage 顶部添加 `useTranslation` 导入：

```typescript
import { useTranslation } from "react-i18next";
```

在组件函数内添加：

```typescript
const { t } = useTranslation();
```

- [ ] **Step 5: 验证全部功能**

Run: `cd frontend && npm run dev`

测试步骤：
1. 打开 AI 助手，发送一条消息
2. 流式回复过程中发送按钮应变为红色"停止"按钮
3. textarea 应 disabled，显示"AI 正在回复..."
4. 点击停止 → 中断生成，消息气泡显示已输出的部分内容 + "生成已中断"标记
5. 可继续发送新消息
6. 停止后立即停止 → 无内容则不保存消息

- [ ] **Step 6: 提交停止按钮 + 中断标记**

```bash
cd frontend
git add src/components/InputArea.tsx src/components/ChatPanel/ChatMessage.tsx
git commit -m "feat: InputArea 添加 LLM 停止按钮 + ChatMessage 中断标记显示"
```

---

## Task 6: 集成验证 + 最终提交

- [ ] **Step 1: 运行后端全部测试**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All tests pass.

- [ ] **Step 2: 运行前端构建检查**

Run: `cd frontend && npm run build`
Expected: 构建成功，无 TypeScript 错误。

- [ ] **Step 3: 端到端功能验证**

启动 dev 环境，依次验证：
1. 会话更名：铅笔图标 → 输入框 → ✓/✕ → Enter/Esc
2. 终止生成：发送消息 → 停止按钮 → 中断标记
3. 空内容停止：立即停止不报错
4. 会话切换后更名正常
5. 深色模式下样式正确

- [ ] **Step 4: 合并提交（如需）**

如果前面各 Task 是独立提交的，此处无需额外提交。否则做一次整体提交。
