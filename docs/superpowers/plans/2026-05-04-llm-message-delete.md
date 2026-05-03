# LLM 会话历史消息逐条删除 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 改造 token 存储为累计值快照，并添加从末尾逐条删除消息的功能

**Architecture:** 后端 `llm_messages.token_count` 从"本条估算值"改为"到本条为止的累计 token 总量"。有 API usage 时直接赋值，无 usage 时用前一条累计值 + 估算。新增专用删除端点 `DELETE /llm-chats/{chat_id}/messages/last`，前端悬浮 ✕ 按钮 hover 显示。

**Tech Stack:** Python FastAPI + aiosqlite（后端），React + Zustand + TypeScript（前端）

---

## 文件变更清单

| 文件 | 操作 | 职责 |
|------|------|------|
| `backend/src/api/llm_chat.py:317-327` | 修改 | chat() 保存 user 消息时查询 prev_token_count |
| `backend/src/api/llm_chat.py:417-444` | 修改 | chat() 保存 AI 消息时用累计值，session 直接赋值 |
| `backend/src/api/llm_chat.py:258-299` | 修改 | save_interrupted_message() 用累计值 |
| `backend/src/api/llm_chat.py:86-116` | 修改 | list_chat_sessions() 回填逻辑适配累计值 |
| `backend/src/api/llm_chat.py` | 新增 | delete_last_message() 端点 |
| `backend/tests/test_llm_chat.py` | 修改 | 新增删除端点 + 累计值测试 |
| `frontend/src/services/api.ts` | 修改 | 新增 deleteLastMessage 函数 |
| `frontend/src/stores/llmChatStore.ts` | 修改 | 新增 deleteLastMessage action |
| `frontend/src/components/ChatPanel/ChatMessage.tsx` | 修改 | 新增 isLast/onDelete props，hover 删除按钮 |
| `frontend/src/components/ChatPanel/index.tsx` | 修改 | 传递 isLast 和 onDelete props |

---

### Task 1: chat() 端点 — user 消息 token 改为累计值

**Files:**
- Modify: `backend/src/api/llm_chat.py:317-327`

- [ ] **Step 1: 修改 user 消息保存逻辑**

将 `llm_chat.py` 第 317-327 行的 user 消息保存逻辑从：

```python
    # 保存用户消息（含 token_count）
    user_msg_id = _gen_id("lm")
    now = datetime.now(UTC).isoformat()
    attachments_json = json.dumps(body.attachments) if body.attachments else None
    user_token_count = estimate_tokens(body.content)
    await conn.execute(
        "INSERT INTO llm_messages (id, chat_session_id, role, content, token_count, attachments, created_at) "
        "VALUES (?, ?, 'user', ?, ?, ?, ?)",
        (user_msg_id, chat_id, body.content, user_token_count, attachments_json, now),
    )
    await conn.commit()
```

改为：

```python
    # 保存用户消息（token_count = 前一条累计值 + 本条估算值）
    user_msg_id = _gen_id("lm")
    now = datetime.now(UTC).isoformat()
    attachments_json = json.dumps(body.attachments) if body.attachments else None
    cursor = await conn.execute(
        "SELECT token_count FROM llm_messages WHERE chat_session_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",
        (chat_id,),
    )
    prev_row = await cursor.fetchone()
    prev_token_count = prev_row[0] if prev_row else 0
    user_token_count = prev_token_count + estimate_tokens(body.content)
    await conn.execute(
        "INSERT INTO llm_messages (id, chat_session_id, role, content, token_count, attachments, created_at) "
        "VALUES (?, ?, 'user', ?, ?, ?, ?)",
        (user_msg_id, chat_id, body.content, user_token_count, attachments_json, now),
    )
    await conn.commit()
```

**关键变更**：查询最后一条未删除消息的 `token_count` 作为 `prev_token_count`，user 消息的 `token_count = prev + estimate`。

- [ ] **Step 2: Commit**

```bash
git add backend/src/api/llm_chat.py
git commit -m "refactor: chat() user 消息 token_count 改为累计值

- 保存 user 消息前查询 prev_token_count（最后一条未删除消息）
- token_count = prev_token_count + estimate(user_content)
- 为后续 AI 消息直接赋值 API usage 做准备"
```

---

### Task 2: chat() 端点 — AI 消息 token 改为累计值 + session 直接赋值

**Files:**
- Modify: `backend/src/api/llm_chat.py:417-444`

- [ ] **Step 1: 修改 AI 消息保存 + session token 更新逻辑**

将 `llm_chat.py` 第 417-444 行从：

```python
            # 保存 AI 回复
            ai_msg_id = _gen_id("lm")
            # token_count 需涵盖全部输出：文本 + thinking + ai_block
            token_count = max(
                completion_tokens,
                estimate_message_tokens("assistant", full_text, thinking_content, ai_block_data),
            )
            ai_block_json = json.dumps(ai_block_data, ensure_ascii=False) if ai_block_data else None

            await conn.execute(
                "INSERT INTO llm_messages "
                "(id, chat_session_id, role, content, ai_block, token_count, thinking_content, thinking_duration_ms, created_at) "
                "VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?)",
                (ai_msg_id, chat_id, full_text, ai_block_json, token_count,
                 thinking_content or None, thinking_duration_ms or None,
                 datetime.now(UTC).isoformat()),
            )

            # 更新会话 token 统计（增量累加，优先 API usage 校准）
            total_add = max(
                prompt_tokens + completion_tokens,
                user_token_count + token_count,
            )
            now = datetime.now(UTC).isoformat()
            await conn.execute(
                "UPDATE llm_chat_sessions SET total_tokens = total_tokens + ?, updated_at = ? WHERE id = ?",
                (total_add, now, chat_id),
            )
```

改为：

```python
            # 保存 AI 回复（token_count = 累计值）
            ai_msg_id = _gen_id("lm")
            # 有 API usage 时直接赋值（已包含全部历史），无 usage 时用前一条累计值 + 估算
            if prompt_tokens + completion_tokens > 0:
                token_count = prompt_tokens + completion_tokens
            else:
                token_count = user_token_count + estimate_message_tokens(
                    "assistant", full_text, thinking_content, ai_block_data,
                )
            ai_block_json = json.dumps(ai_block_data, ensure_ascii=False) if ai_block_data else None

            await conn.execute(
                "INSERT INTO llm_messages "
                "(id, chat_session_id, role, content, ai_block, token_count, thinking_content, thinking_duration_ms, created_at) "
                "VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?)",
                (ai_msg_id, chat_id, full_text, ai_block_json, token_count,
                 thinking_content or None, thinking_duration_ms or None,
                 datetime.now(UTC).isoformat()),
            )

            # 更新会话 token 统计（直接赋值，不再增量累加）
            now = datetime.now(UTC).isoformat()
            await conn.execute(
                "UPDATE llm_chat_sessions SET total_tokens = ?, updated_at = ? WHERE id = ?",
                (token_count, now, chat_id),
            )
```

**关键变更**：
1. `token_count` 有 API usage 时直接用 `prompt_tokens + completion_tokens`（它是完整的上下文累计值）
2. 无 usage 时用 `user_token_count + estimate(ai_output)`（user_token_count 本身已是累计值）
3. session `total_tokens` 直接赋值 `token_count`，不再增量累加

- [ ] **Step 2: Commit**

```bash
git add backend/src/api/llm_chat.py
git commit -m "refactor: chat() AI 消息 token_count 改为累计值 + session 直接赋值

- 有 API usage 时直接赋值 prompt+completion（天然包含全部历史）
- 无 usage 时用 user 累计值 + AI 估算值
- session total_tokens 直接赋值，不再增量累加（避免重复计算）"
```

---

### Task 3: save_interrupted_message() 改为累计值

**Files:**
- Modify: `backend/src/api/llm_chat.py:258-299`

- [ ] **Step 1: 修改中断消息保存逻辑**

将 `llm_chat.py` 第 258-299 行从：

```python
@router.post("/llm-chats/{chat_id}/messages/interrupted")
async def save_interrupted_message(chat_id: str, request: Request, body: InterruptedMessage):
    """保存中断生成后的部分消息。"""
    db = _db(request)
    conn = db.connection()

    cursor = await conn.execute("SELECT id FROM llm_chat_sessions WHERE id = ?", (chat_id,))
    if not await cursor.fetchone():
        raise HTTPException(404, "Chat session not found")

    msg_id = _gen_id("lm")
    content = body.content + "<!-- interrupted -->"
    token_count = estimate_message_tokens("assistant", content, body.thinking_content)

    now = datetime.now(UTC).isoformat()
    await conn.execute(
        "INSERT INTO llm_messages "
        "(id, chat_session_id, role, content, ai_block, token_count, thinking_content, thinking_duration_ms, created_at) "
        "VALUES (?, ?, 'assistant', ?, NULL, ?, ?, ?, ?)",
        (msg_id, chat_id, content, token_count,
         body.thinking_content, body.thinking_duration_ms, now),
    )

    await conn.execute(
        "UPDATE llm_chat_sessions SET total_tokens = total_tokens + ?, updated_at = ? WHERE id = ?",
        (token_count, now, chat_id),
    )
    await conn.commit()

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
        "created_at": now,
        "deleted_at": None,
    }
```

改为：

```python
@router.post("/llm-chats/{chat_id}/messages/interrupted")
async def save_interrupted_message(chat_id: str, request: Request, body: InterruptedMessage):
    """保存中断生成后的部分消息。"""
    db = _db(request)
    conn = db.connection()

    cursor = await conn.execute("SELECT id FROM llm_chat_sessions WHERE id = ?", (chat_id,))
    if not await cursor.fetchone():
        raise HTTPException(404, "Chat session not found")

    # 查询前一条消息的累计 token_count
    cursor = await conn.execute(
        "SELECT token_count FROM llm_messages WHERE chat_session_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",
        (chat_id,),
    )
    prev_row = await cursor.fetchone()
    prev_token_count = prev_row[0] if prev_row else 0

    msg_id = _gen_id("lm")
    content = body.content + "<!-- interrupted -->"
    token_count = prev_token_count + estimate_message_tokens("assistant", content, body.thinking_content)

    now = datetime.now(UTC).isoformat()
    await conn.execute(
        "INSERT INTO llm_messages "
        "(id, chat_session_id, role, content, ai_block, token_count, thinking_content, thinking_duration_ms, created_at) "
        "VALUES (?, ?, 'assistant', ?, NULL, ?, ?, ?, ?)",
        (msg_id, chat_id, content, token_count,
         body.thinking_content, body.thinking_duration_ms, now),
    )

    # 直接赋值（token_count 已是累计值）
    await conn.execute(
        "UPDATE llm_chat_sessions SET total_tokens = ?, updated_at = ? WHERE id = ?",
        (token_count, now, chat_id),
    )
    await conn.commit()

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
        "created_at": now,
        "deleted_at": None,
    }
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/api/llm_chat.py
git commit -m "refactor: save_interrupted_message() token_count 改为累计值

- 查询 prev_token_count + 估算值作为累计 token
- session total_tokens 直接赋值而非增量累加"
```

---

### Task 4: list_chat_sessions() 回填逻辑适配累计值

**Files:**
- Modify: `backend/src/api/llm_chat.py:86-116`

- [ ] **Step 1: 重写回填逻辑**

将 `llm_chat.py` 第 86-116 行的回填逻辑从按消息独立估算改为累计值计算：

```python
    # 回填 token 数据异常的会话：按累计值语义重算 token_count
    needs_fix = []
    msg_fixes = []
    for r in results:
        cursor = await conn.execute(
            "SELECT id, role, content, thinking_content, ai_block, token_count "
            "FROM llm_messages WHERE chat_session_id = ? AND deleted_at IS NULL ORDER BY created_at ASC",
            (r["id"],),
        )
        msgs = await cursor.fetchall()
        cumulative = 0
        any_updated = False
        for msg in msgs:
            _, role, content, thinking, block, saved_tc = msg
            est = estimate_message_tokens(
                role=role, content=content,
                thinking_content=thinking,
                ai_block=json.loads(block) if block else None,
                saved_token_count=saved_tc,
            )
            cumulative += est
            if cumulative != saved_tc:
                msg_fixes.append((cumulative, msg[0]))
                any_updated = True
        if any_updated or r["total_tokens"] != cumulative:
            r["total_tokens"] = cumulative
            needs_fix.append((cumulative, r["id"]))
    if msg_fixes:
        await conn.executemany("UPDATE llm_messages SET token_count = ? WHERE id = ?", msg_fixes)
    if needs_fix:
        await conn.executemany("UPDATE llm_chat_sessions SET total_tokens = ? WHERE id = ?", needs_fix)
        await conn.commit()
```

**关键变更**：
1. `ORDER BY created_at ASC`（原来是 DESC 无排序，累计值必须按时间正序计算）
2. 逐条累加 `cumulative += est`，每条消息的 `token_count` 存累计值
3. 最后一条消息的累计值即为 `total_tokens`

- [ ] **Step 2: Commit**

```bash
git add backend/src/api/llm_chat.py
git commit -m "refactor: list_chat_sessions() 回填逻辑适配累计值语义

- 按 created_at ASC 正序遍历消息，逐条累加计算累计值
- 每条消息的 token_count 存累计值（非单条估算值）
- total_tokens = 最后一条消息的累计值"
```

---

### Task 5: 后端测试 — 验证累计值 + 回归

**Files:**
- Modify: `backend/tests/test_llm_chat.py`

- [ ] **Step 1: 更新现有测试 + 新增累计值验证**

在 `test_llm_chat.py` 末尾追加：

```python
async def test_interrupted_token_count_is_cumulative(client, chat_session):
    """中断消息的 token_count 应为累计值（prev + 本条估算）。"""
    # 第一条中断消息：prev=0，token_count = 0 + estimate
    resp1 = await client.post(
        f"/api/llm-chats/{chat_session}/messages/interrupted",
        json={"content": "第一条回复"},
    )
    tc1 = resp1.json()["token_count"]
    assert tc1 > 0

    # 第二条中断消息：token_count 应 > tc1（累计值递增）
    resp2 = await client.post(
        f"/api/llm-chats/{chat_session}/messages/interrupted",
        json={"content": "第二条回复"},
    )
    tc2 = resp2.json()["token_count"]
    assert tc2 > tc1, f"累计值应递增: tc2={tc2} <= tc1={tc1}"


async def test_delete_last_message(client, chat_session):
    """删除最后一条消息应返回正确的 total_tokens。"""
    # 保存两条消息
    await client.post(
        f"/api/llm-chats/{chat_session}/messages/interrupted",
        json={"content": "第一条"},
    )
    resp2 = await client.post(
        f"/api/llm-chats/{chat_session}/messages/interrupted",
        json={"content": "第二条"},
    )
    tc2 = resp2.json()["token_count"]

    # 删除最后一条
    resp = await client.delete(f"/api/llm-chats/{chat_session}/messages/last")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["deleted_message_id"] == resp2.json()["id"]
    # total_tokens 应等于第一条消息的 token_count（< tc2）
    assert data["total_tokens"] < tc2


async def test_delete_last_message_empty(client, chat_session):
    """空会话删除最后一条应返回 404。"""
    resp = await client.delete(f"/api/llm-chats/{chat_session}/messages/last")
    assert resp.status_code == 404
```

- [ ] **Step 2: 运行测试验证**

Run: `cd backend && python -m pytest tests/test_llm_chat.py -v`
Expected: 新增的 test_interrupted_token_count_is_cumulative 和 test_delete_last_message 应 FAIL（端点还未实现），test_delete_last_message_empty 应 FAIL。

test_save_interrupted_message 和 test_interrupted_updates_session_tokens 应该 PASS（逻辑变更但断言兼容）。

- [ ] **Step 3: Commit 测试文件**

```bash
git add backend/tests/test_llm_chat.py
git commit -m "test: 新增累计值验证 + 删除端点测试用例

- test_interrupted_token_count_is_cumulative: 验证 token_count 递增
- test_delete_last_message: 验证删除最后一条返回正确 total_tokens
- test_delete_last_message_empty: 验证空会话删除返回 404"
```

---

### Task 6: 新增 delete_last_message 端点

**Files:**
- Modify: `backend/src/api/llm_chat.py`（在消息 CRUD 区域后，SSE 聊天区域前）

- [ ] **Step 1: 添加新端点**

在 `llm_chat.py` 的 `undo_delete_message` 端点（第 246-255 行）之后，`save_interrupted_message` 端点之前，插入：

```python
@router.delete("/llm-chats/{chat_id}/messages/last")
async def delete_last_message(chat_id: str, request: Request):
    """删除指定会话的最后一条未删除消息，更新 token 统计。"""
    db = _db(request)
    conn = db.connection()

    # 查询最后一条未删除消息
    cursor = await conn.execute(
        "SELECT id, token_count FROM llm_messages "
        "WHERE chat_session_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",
        (chat_id,),
    )
    last_msg = await cursor.fetchone()
    if not last_msg:
        raise HTTPException(404, "没有可删除的消息")

    # 软删除
    now = datetime.now(UTC).isoformat()
    await conn.execute(
        "UPDATE llm_messages SET deleted_at = ? WHERE id = ?",
        (now, last_msg[0]),
    )

    # 查询新的最后一条未删除消息 → total_tokens
    cursor = await conn.execute(
        "SELECT token_count FROM llm_messages "
        "WHERE chat_session_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",
        (chat_id,),
    )
    new_last = await cursor.fetchone()
    total_tokens = new_last[0] if new_last else 0

    await conn.execute(
        "UPDATE llm_chat_sessions SET total_tokens = ?, updated_at = ? WHERE id = ?",
        (total_tokens, now, chat_id),
    )
    await conn.commit()

    return {"ok": True, "deleted_message_id": last_msg[0], "total_tokens": total_tokens}
```

- [ ] **Step 2: 运行测试验证**

Run: `cd backend && python -m pytest tests/test_llm_chat.py -v`
Expected: 所有测试 PASS，包括 Task 5 中新增的 3 个测试。

- [ ] **Step 3: 全量回归测试**

Run: `cd backend && python -m pytest tests/ -v`
Expected: 全部 PASS。

- [ ] **Step 4: Commit**

```bash
git add backend/src/api/llm_chat.py
git commit -m "feat: 新增 DELETE /llm-chats/{id}/messages/last 删除最后一条消息端点

- 只删除会话最后一条未删除消息（业务约束后端强制）
- 软删除 + 直接取前一条累计值作为新 total_tokens
- O(1) token 更新，无需 SUM 全部消息"
```

---

### Task 7: 前端 API 层 + Store 层

**Files:**
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/stores/llmChatStore.ts`

- [ ] **Step 1: api.ts 新增 deleteLastMessage**

在 `frontend/src/services/api.ts` 中，`undoDeleteLLMMessage` 函数（约第 297 行）之后添加：

```typescript
export async function deleteLastLLMMessage(chatId: string): Promise<{
  ok: boolean;
  deleted_message_id: string;
  total_tokens: number;
}> {
  return request(`/api/llm-chats/${chatId}/messages/last`, { method: "DELETE" });
}
```

- [ ] **Step 2: llmChatStore.ts 新增 deleteLastMessage action**

在 `frontend/src/stores/llmChatStore.ts` 中：

1. 在 `LLMChatState` interface（第 6 行起）的 Actions 区域添加：

```typescript
  deleteLastMessage: () => Promise<void>;
```

2. 在 store 实现中（`cancelStream` 之后，`}))` 闭合之前）添加：

```typescript
  deleteLastMessage: async () => {
    const { currentChatSessionId, messages } = get();
    if (!currentChatSessionId || messages.length === 0) return;

    const result = await api.deleteLastLLMMessage(currentChatSessionId);
    set((s) => ({
      messages: s.messages.slice(0, -1),
      chatSessions: s.chatSessions.map((cs) =>
        cs.id === currentChatSessionId
          ? { ...cs, total_tokens: result.total_tokens }
          : cs
      ),
    }));
  },
```

3. 在文件顶部确认 `import * as api from "../services/api";` 已存在。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/api.ts frontend/src/stores/llmChatStore.ts
git commit -m "feat: 前端 API + Store 层添加 deleteLastMessage

- api.ts: 新增 deleteLastLLMMessage 调用删除端点
- llmChatStore: deleteLastMessage action 移除末尾消息 + 更新 total_tokens"
```

---

### Task 8: 前端 ChatMessage 悬浮删除按钮

**Files:**
- Modify: `frontend/src/components/ChatPanel/ChatMessage.tsx`

- [ ] **Step 1: 添加 isLast/onDelete props 和删除按钮**

将 `ChatMessage.tsx` 完整替换为：

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AiBlock, LLMMessage } from "../../types";
import AiBlockRenderer from "./AiBlockRenderer";
import ThinkingCard from "./ThinkingCard";

const INTERRUPTED_MARKER = "<!-- interrupted -->";

interface Props {
  message: LLMMessage;
  streamingText?: string;
  currentAiBlock?: AiBlock | null;
  streamingThinking?: string;
  isLast?: boolean;
  onDelete?: () => void;
}

export default function ChatMessage({ message, streamingText, currentAiBlock, streamingThinking, isLast, onDelete }: Props) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
        <span
          style={{
            fontSize: 11,
            color: "var(--faint)",
            background: "var(--sand)",
            padding: "2px 10px",
            borderRadius: 10,
          }}
        >
          {message.content}
        </span>
      </div>
    );
  }

  const isStreaming = streamingText !== undefined;
  const aiBlock =
    isStreaming && currentAiBlock
      ? currentAiBlock
      : (() => { try { return message.ai_block ? JSON.parse(message.ai_block) : null; } catch { return null; } })();

  const thinkingContent = isStreaming ? streamingThinking : message.thinking_content;
  const thinkingDuration = isStreaming ? null : message.thinking_duration_ms;

  const bodyText = isStreaming ? streamingText : message.content;
  const isInterrupted = !isStreaming && bodyText.includes(INTERRUPTED_MARKER);
  const displayText = isInterrupted ? bodyText.replace(INTERRUPTED_MARKER, "") : bodyText;
  const showBody = isUser || !!(bodyText || "").trim();

  const showDelete = isLast && onDelete && !isStreaming;

  return (
    <div
      style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ position: "relative", maxWidth: "85%", display: "flex", flexDirection: "column", gap: 6 }}>
        {showDelete && (
          <div
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{
              position: "absolute",
              top: -8,
              ...(isUser ? { left: -8, right: "unset" } : { right: -8, left: "unset" }),
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "#e74c3c",
              color: "#fff",
              display: hovered ? "flex" : "none",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              cursor: "pointer",
              opacity: 0.6,
              zIndex: 2,
              boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
              transition: "opacity 0.15s, transform 0.15s",
              ...(hovered ? { opacity: 1, transform: "scale(1.1)" } : {}),
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = "1"; (e.currentTarget as HTMLDivElement).style.transform = "scale(1.15)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = "0.6"; (e.currentTarget as HTMLDivElement).style.transform = "scale(1)"; }}
          >
            ✕
          </div>
        )}
        {thinkingContent && (
          <ThinkingCard
            content={thinkingContent}
            durationMs={thinkingDuration}
            streaming={isStreaming}
          />
        )}
        {showBody && (
          <div
            style={{
              padding: "6px 10px",
              borderRadius: isUser ? "10px 10px 2px 10px" : "2px 10px 10px 10px",
              background: isUser ? "var(--accent)" : "var(--card-bg)",
              color: isUser ? "#fff" : "var(--fg)",
              border: isUser ? "none" : "1px solid var(--border)",
              lineHeight: 1.5,
              fontSize: 13,
            }}
          >
            {displayText}
            {isStreaming && (
              <span className="animate-pulse" style={{ marginLeft: 1 }}>▊</span>
            )}
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
          </div>
        )}
        {aiBlock && <AiBlockRenderer block={aiBlock} />}
      </div>
    </div>
  );
}
```

**关键变更**：
1. 新增 `useState(false)` 管理 hover 状态
2. `showDelete = isLast && onDelete && !isStreaming` 控制删除按钮可见性
3. 删除按钮 `display: hovered ? "flex" : "none"` — 仅 hover 时显示
4. user 消息 ✕ 在左上（`left: -8`），assistant 消息 ✕ 在右上（`right: -8`）
5. `onClick` 时 `e.stopPropagation()` 防止事件冒泡

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ChatPanel/ChatMessage.tsx
git commit -m "feat: ChatMessage 组件添加悬浮删除按钮

- 新增 isLast/onDelete props
- hover 时显示 ✕ 按钮（默认隐藏）
- user 消息左上角，assistant 消息右上角
- 流式生成中不显示删除按钮"
```

---

### Task 9: 前端 ChatPanel 集成

**Files:**
- Modify: `frontend/src/components/ChatPanel/index.tsx`

- [ ] **Step 1: 传递 isLast 和 onDelete props**

在 `ChatPanel/index.tsx` 中：

1. 从 store 解构 `deleteLastMessage`（约第 13 行附近）：

```typescript
  const deleteLastMessage = useLLMChatStore((s) => s.deleteLastMessage);
```

2. 将消息渲染部分（约第 109-111 行）：

```tsx
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
```

改为：

```tsx
        {messages.map((msg, index) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            isLast={index === messages.length - 1 && !isStreaming}
            onDelete={index === messages.length - 1 ? deleteLastMessage : undefined}
          />
        ))}
```

**注意**：`isLast` 在 `isStreaming` 时为 false，避免流式中显示删除按钮。

- [ ] **Step 2: 启动开发服务器验证**

Run: `cd frontend && npm run dev`

在浏览器中验证：
1. 打开聊天面板，发送几条消息
2. 确认最后一条消息 hover 时显示 ✕ 按钮
3. 确认前面的消息 hover 时不显示 ✕ 按钮
4. 点击 ✕ 按钮删除最后一条消息
5. 确认删除后倒数第二条变为新的最后一条，hover 显示 ✕

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ChatPanel/index.tsx
git commit -m "feat: ChatPanel 集成删除最后一条消息功能

- 传递 isLast 和 onDelete props 到 ChatMessage
- isStreaming 时不标记为最后一条（避免流式中显示删除按钮）"
```

---

## 自审 Checklist

1. **Spec 覆盖**：
   - ✅ token_count 累计值语义 — Task 1, 2, 3
   - ✅ 数据迁移（回填逻辑） — Task 4
   - ✅ 删除端点 — Task 6
   - ✅ 前端 API + Store — Task 7
   - ✅ 悬浮删除按钮 UI — Task 8
   - ✅ ChatPanel 集成 — Task 9

2. **占位符扫描**：无 TBD/TODO/类似 — ✅

3. **类型一致性**：
   - `deleteLastLLMMessage` 在 api.ts 定义，llmChatStore 中引用 — ✅
   - `deleteLastMessage` 在 store interface 和实现中一致 — ✅
   - ChatMessage 的 `isLast?: boolean` 和 `onDelete?: () => void` 与 ChatPanel 传参一致 — ✅
