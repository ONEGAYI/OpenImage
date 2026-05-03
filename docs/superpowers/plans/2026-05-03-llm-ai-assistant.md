# LLM AI 助手集成 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 OpenImage 接入 LLM AI 助手，实现多轮对话式提示词优化，支持云端 API 和本地模型。

**Architecture:** 后端使用 OpenAI 兼容协议（`/v1/chat/completions`）统一接入各种 LLM 提供商，通过 SSE 流式输出 token 和结构化 JSON 块（`ai_block`）。前端新增独立的 `llmChatStore` + 聊天面板组件组，通过 toggle 开关在"生图模式"和"AI 对话模式"间切换。AI 输出的提问表单和提示词建议通过 JSON 协议解析渲染为交互式卡片。

**Tech Stack:** Python FastAPI + aiosqlite（后端）、React + Zustand + TypeScript（前端）、SSE 流式通信、OpenAI 兼容协议

---

## 文件结构映射

### 后端新建文件

| 文件 | 职责 |
|------|------|
| `backend/src/core/llm_tokenizer.py` | Token 近似估算（字符 → token 数） |
| `backend/src/core/llm_client.py` | LLM API 客户端，OpenAI 兼容协议，SSE 流式 + ai_block 缓冲解析 |
| `backend/src/api/llm_settings.py` | LLM 设置 CRUD（独立于图片生成 API 配置） |
| `backend/src/api/llm_chat.py` | 聊天会话 CRUD + 消息 CRUD + SSE 聊天端点 |

### 后端修改文件

| 文件 | 变更 |
|------|------|
| `backend/src/core/database.py` | `_SCHEMA` 新增 `llm_chat_sessions` + `llm_messages` 表 |
| `backend/src/server.py` | lifespan 初始化 LLMClient + 注册两个新路由 |

### 前端新建文件

| 文件 | 职责 |
|------|------|
| `frontend/src/stores/llmChatStore.ts` | AI 聊天全局状态（开关、会话、消息、流式、token） |
| `frontend/src/components/ChatPanel/index.tsx` | 聊天面板容器（折叠/展开/滚动） |
| `frontend/src/components/ChatPanel/ChatMessage.tsx` | 消息气泡（用户/AI/系统三种角色） |
| `frontend/src/components/ChatPanel/ChatSessionBar.tsx` | 会话管理栏（选择/新建/重命名/token 统计） |
| `frontend/src/components/ChatPanel/AiBlockRenderer.tsx` | ai_block 类型分发（questions → 表单，suggestions → 卡片） |
| `frontend/src/components/ChatPanel/QuestionForm.tsx` | 提问表单（widget 渲染 + 必填校验 + 提交/跳过） |
| `frontend/src/components/ChatPanel/SuggestionCards.tsx` | 建议卡片组（采用生图/编辑后用按钮） |
| `frontend/src/components/ChatPanel/BufferingIndicator.tsx` | 缓冲态脉冲动画 + 计时器 |
| `frontend/src/components/AiToggle.tsx` | AI 助手开关 toggle 组件 |

### 前端修改文件

| 文件 | 变更 |
|------|------|
| `frontend/src/types/index.ts` | 新增 LLM 相关类型（~40 行） |
| `frontend/src/services/api.ts` | 新增 LLM API 函数（~120 行） |
| `frontend/src/components/InputArea.tsx` | 集成 AiToggle + ChatPanel，切换输入模式 |
| `frontend/src/components/SettingsDialog.tsx` | 新增 LLM 设置区域 |
| `frontend/src/i18n/zh.json` | 新增 `llm.*` 翻译键 |
| `frontend/src/i18n/en.json` | 新增 `llm.*` 翻译键 |

---

## Phase 1: 后端基础层

### Task 1: 数据库 Schema 扩展

**Files:**
- Modify: `backend/src/core/database.py`
- Test: `backend/tests/test_database.py`

- [ ] **Step 1: 编写数据库测试**

在 `backend/tests/test_database.py` 末尾追加：

```python
async def test_initialize_creates_llm_tables(db: Database):
    """初始化应创建 llm_chat_sessions 和 llm_messages 表"""
    conn = db.connection()
    tables = await conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    )
    names = {row[0] for row in await tables.fetchall()}
    assert "llm_chat_sessions" in names
    assert "llm_messages" in names


async def test_llm_chat_session_crud(db: Database):
    """llm_chat_sessions 应支持创建/查询/重命名/删除"""
    conn = db.connection()
    await conn.execute(
        "INSERT INTO llm_chat_sessions (id, session_id, name) VALUES (?, ?, ?)",
        ("lc_test1", "sess_test", "测试聊天"),
    )
    await conn.commit()
    cursor = await conn.execute("SELECT name FROM llm_chat_sessions WHERE id = ?", ("lc_test1",))
    row = await cursor.fetchone()
    assert row[0] == "测试聊天"
    await conn.execute("UPDATE llm_chat_sessions SET name = ? WHERE id = ?", ("新名称", "lc_test1"))
    await conn.commit()
    cursor = await conn.execute("SELECT name FROM llm_chat_sessions WHERE id = ?", ("lc_test1",))
    row = await cursor.fetchone()
    assert row[0] == "新名称"
    await conn.execute("DELETE FROM llm_chat_sessions WHERE id = ?", ("lc_test1",))
    await conn.commit()
    cursor = await conn.execute("SELECT COUNT(*) FROM llm_chat_sessions WHERE id = ?", ("lc_test1",))
    count = (await cursor.fetchone())[0]
    assert count == 0


async def test_llm_message_soft_delete(db: Database):
    """llm_messages 应支持软删除（设置 deleted_at）"""
    conn = db.connection()
    await conn.execute(
        "INSERT INTO llm_chat_sessions (id, session_id, name) VALUES (?, ?, ?)",
        ("lc_test2", "sess_test", "测试"),
    )
    await conn.execute(
        "INSERT INTO llm_messages (id, chat_session_id, role, content) VALUES (?, ?, ?, ?)",
        ("lm_test1", "lc_test2", "user", "你好"),
    )
    await conn.commit()
    await conn.execute(
        "UPDATE llm_messages SET deleted_at = datetime('now') WHERE id = ?", ("lm_test1",)
    )
    await conn.commit()
    cursor = await conn.execute(
        "SELECT COUNT(*) FROM llm_messages WHERE chat_session_id = ? AND deleted_at IS NULL",
        ("lc_test2",),
    )
    count = (await cursor.fetchone())[0]
    assert count == 0
    cursor = await conn.execute(
        "SELECT COUNT(*) FROM llm_messages WHERE chat_session_id = ?", ("lc_test2",)
    )
    count = (await cursor.fetchone())[0]
    assert count == 1
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && python -m pytest tests/test_database.py::test_initialize_creates_llm_tables tests/test_database.py::test_llm_chat_session_crud tests/test_database.py::test_llm_message_soft_delete -v`
Expected: FAIL — 表不存在

- [ ] **Step 3: 在 Database._SCHEMA 中新增两个表**

在 `backend/src/core/database.py` 的 `_SCHEMA` 字符串末尾（`settings` 表 CREATE 之后）追加：

```sql
CREATE TABLE IF NOT EXISTS llm_chat_sessions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    total_tokens INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS llm_messages (
    id TEXT PRIMARY KEY,
    chat_session_id TEXT NOT NULL REFERENCES llm_chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    ai_block TEXT,
    token_count INTEGER NOT NULL DEFAULT 0,
    attachments TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_llm_messages_session ON llm_messages(chat_session_id);
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && python -m pytest tests/test_database.py -v`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
cd backend
git add src/core/database.py tests/test_database.py
git commit -m "feat: 新增 llm_chat_sessions 和 llm_messages 数据库表

- llm_chat_sessions: 聊天会话，关联图片会话，累计 token 统计
- llm_messages: 消息记录，支持 ai_block JSON、附件元数据、软删除
- 新增对应测试：建表验证、CRUD、软删除"
```

---

### Task 2: Token 近似估算模块

**Files:**
- Create: `backend/src/core/llm_tokenizer.py`
- Test: `backend/tests/test_llm_tokenizer.py`

- [ ] **Step 1: 编写 token 估算测试**

创建 `backend/tests/test_llm_tokenizer.py`：

```python
from src.core.llm_tokenizer import estimate_tokens


def test_estimate_pure_ascii():
    """纯英文：约 4 字符 = 1 token"""
    tokens = estimate_tokens("Hello world this is a test")
    assert 5 <= tokens <= 10


def test_estimate_pure_chinese():
    """纯中文：每字符约 1-2 tokens"""
    tokens = estimate_tokens("你好世界测试")
    assert 5 <= tokens <= 12


def test_estimate_mixed():
    """中英混合"""
    tokens = estimate_tokens("Hello 你好 world 世界")
    assert tokens > 0


def test_estimate_empty():
    """空字符串返回 0"""
    assert estimate_tokens("") == 0


def test_estimate_long_text():
    """长文本估算合理性"""
    text = "这是一个比较长的文本，用来测试token估算在较长内容上的表现。" * 10
    tokens = estimate_tokens(text)
    assert tokens > 100
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && python -m pytest tests/test_llm_tokenizer.py -v`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 token 估算模块**

创建 `backend/src/core/llm_tokenizer.py`：

```python
"""Token 近似估算模块。

策略：
- 英文/ASCII：约 4 字符 ≈ 1 token
- 中文/CJK：每字符 ≈ 1.5 tokens
- 混合内容：分别计算后累加
"""
import re

_CJK_PATTERN = re.compile(r'[一-鿿　-〿＀-￯]')


def estimate_tokens(text: str) -> int:
    """估算文本的 token 数量。"""
    if not text:
        return 0

    cjk_chars = _CJK_PATTERN.findall(text)
    cjk_count = len(cjk_chars)

    non_cjk_text = _CJK_PATTERN.sub('', text)
    non_cjk_count = len(non_cjk_text)

    cjk_tokens = int(cjk_count * 1.5)
    non_cjk_tokens = max(1, non_cjk_count // 4) if non_cjk_count > 0 else 0

    return cjk_tokens + non_cjk_tokens
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && python -m pytest tests/test_llm_tokenizer.py -v`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
cd backend
git add src/core/llm_tokenizer.py tests/test_llm_tokenizer.py
git commit -m "feat: 新增 token 近似估算模块

- CJK 字符每字约 1.5 tokens，ASCII 每 4 字符约 1 token"
```

---

### Task 3: LLM 客户端（OpenAI 兼容协议）

**Files:**
- Create: `backend/src/core/llm_client.py`
- Test: `backend/tests/test_llm_client.py`

- [ ] **Step 1: 编写 LLM 客户端测试**

创建 `backend/tests/test_llm_client.py`：

```python
import pytest
import httpx
import respx
from src.core.llm_client import LLMClient, StreamEvent


@pytest.fixture
def client() -> LLMClient:
    return LLMClient(
        base_url="http://localhost:11434/v1",
        api_key="test-key",
        model_name="llama3.1:8b",
        supports_vision=False,
    )


def test_client_initialization(client: LLMClient):
    assert client.base_url == "http://localhost:11434/v1"
    assert client.model_name == "llama3.1:8b"
    assert client.supports_vision is False


def test_build_messages_basic(client: LLMClient):
    messages = client.build_messages(
        system_prompt="你是助手",
        history=[],
        user_content="你好",
        attachments=[],
    )
    assert len(messages) == 2
    assert messages[0]["role"] == "system"
    assert messages[0]["content"] == "你是助手"
    assert messages[1]["role"] == "user"
    assert messages[1]["content"] == "你好"


def test_build_messages_with_history(client: LLMClient):
    history = [
        {"role": "user", "content": "第一轮"},
        {"role": "assistant", "content": "回复一"},
    ]
    messages = client.build_messages(
        system_prompt="你是助手",
        history=history,
        user_content="第二轮",
        attachments=[],
    )
    assert len(messages) == 4
    assert messages[1]["content"] == "第一轮"
    assert messages[3]["content"] == "第二轮"


def test_build_messages_vision_disabled(client: LLMClient):
    attachments = [{"data": "base64data", "media_type": "image/jpeg"}]
    messages = client.build_messages(
        system_prompt="sys",
        history=[],
        user_content="看图",
        attachments=attachments,
    )
    user_msg = messages[-1]
    assert isinstance(user_msg["content"], str)
    assert "附件" in user_msg["content"]


def test_build_messages_vision_enabled():
    client = LLMClient(
        base_url="http://localhost:11434/v1",
        api_key="test",
        model_name="gpt-4o",
        supports_vision=True,
    )
    attachments = [{"data": "base64data", "media_type": "image/jpeg"}]
    messages = client.build_messages(
        system_prompt="sys",
        history=[],
        user_content="看图",
        attachments=attachments,
    )
    user_msg = messages[-1]
    assert isinstance(user_msg["content"], list)
    parts = user_msg["content"]
    assert any(p.get("type") == "text" for p in parts)
    assert any(p.get("type") == "image_url" for p in parts)


@respx.mock
@pytest.mark.asyncio
async def test_chat_stream_yields_tokens(client: LLMClient):
    sse_response = (
        'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n'
        'data: {"choices":[{"delta":{"content":"世界"}}]}\n\n'
        'data: [DONE]\n\n'
    )
    respx.post("http://localhost:11434/v1/chat/completions").mock(
        return_value=httpx.Response(
            200, text=sse_response,
            headers={"content-type": "text/event-stream"},
        )
    )

    events = []
    async for event in client.chat_stream([{"role": "user", "content": "hello"}]):
        events.append(event)

    token_events = [e for e in events if e.type == "token"]
    assert len(token_events) == 2
    assert token_events[0].data["text"] == "你好"
    assert token_events[1].data["text"] == "世界"


def test_extract_ai_block_json():
    client = LLMClient(base_url="", api_key="", model_name="")
    text = '结合您的要求：\n```ai-block\n{"type": "questions", "fields": []}\n```\n后续文字'
    result = client.extract_ai_block(text)
    assert result is not None
    assert result["type"] == "questions"


def test_extract_ai_block_none():
    client = LLMClient(base_url="", api_key="", model_name="")
    result = client.extract_ai_block("普通文字，没有标记")
    assert result is None


def test_from_settings():
    settings = {
        "llm_base_url": "http://localhost:11434/v1",
        "llm_api_key": "sk-test",
        "llm_model_name": "qwen2:7b",
        "llm_supports_vision": True,
        "llm_system_prompt": "你是提示词助手",
    }
    client = LLMClient.from_settings(settings)
    assert client.model_name == "qwen2:7b"
    assert client.supports_vision is True
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && python -m pytest tests/test_llm_client.py -v`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 LLM 客户端**

创建 `backend/src/core/llm_client.py`：

```python
"""LLM API 客户端 — OpenAI 兼容协议。

支持：OpenAI、Ollama、LM Studio、vLLM、DeepSeek、Groq 等。
"""
import json
import re
from dataclasses import dataclass, field
from typing import AsyncGenerator

import httpx


@dataclass
class StreamEvent:
    type: str  # "token" | "buffering" | "ai_block" | "usage" | "parse_warning" | "completed" | "error"
    data: dict = field(default_factory=dict)


class LLMClient:
    def __init__(
        self,
        base_url: str,
        api_key: str = "",
        model_name: str = "",
        supports_vision: bool = False,
        system_prompt: str = "",
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model_name = model_name
        self.supports_vision = supports_vision
        self.system_prompt = system_prompt

    def build_messages(
        self,
        system_prompt: str,
        history: list[dict],
        user_content: str,
        attachments: list[dict],
    ) -> list[dict]:
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history)

        if self.supports_vision and attachments:
            content_parts: list[dict] = [{"type": "text", "text": user_content}]
            for att in attachments:
                content_parts.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:{att['media_type']};base64,{att['data']}"},
                })
            messages.append({"role": "user", "content": content_parts})
        elif attachments:
            meta = ", ".join(f"附件({att.get('media_type', 'unknown')})" for att in attachments)
            messages.append({"role": "user", "content": f"{user_content}\n[{meta}]"})
        else:
            messages.append({"role": "user", "content": user_content})

        return messages

    async def chat_stream(self, messages: list[dict]) -> AsyncGenerator[StreamEvent, None]:
        url = f"{self.base_url}/chat/completions"
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        body = {"model": self.model_name, "messages": messages, "stream": True}

        full_text = ""
        ai_block_buffer = ""
        in_ai_block = False

        async with httpx.AsyncClient(timeout=120.0) as http_client:
            async with http_client.stream("POST", url, json=body, headers=headers) as resp:
                if resp.status_code != 200:
                    error_text = await resp.aread()
                    yield StreamEvent(
                        type="error",
                        data={"message": error_text.decode(), "code": resp.status_code},
                    )
                    return

                async for line in resp.aiter_lines():
                    line = line.strip()
                    if not line or not line.startswith("data: "):
                        continue
                    payload = line[6:]
                    if payload == "[DONE]":
                        break

                    try:
                        chunk = json.loads(payload)
                    except json.JSONDecodeError:
                        continue

                    if "usage" in chunk and chunk["usage"]:
                        usage = chunk["usage"]
                        yield StreamEvent(type="usage", data={
                            "prompt_tokens": usage.get("prompt_tokens", 0),
                            "completion_tokens": usage.get("completion_tokens", 0),
                        })

                    choices = chunk.get("choices", [])
                    if not choices:
                        continue
                    delta = choices[0].get("delta", {})
                    token_text = delta.get("content", "")
                    if not token_text:
                        continue

                    full_text += token_text

                    if "```ai-block" in token_text and not in_ai_block:
                        in_ai_block = True
                        before = token_text.split("```ai-block")[0]
                        if before:
                            yield StreamEvent(type="token", data={"text": before})
                        yield StreamEvent(
                            type="buffering",
                            data={"status": "parsing_ai_block", "elapsed_ms": 0},
                        )
                        continue

                    if in_ai_block:
                        ai_block_buffer += token_text
                        if "```" in token_text and len(ai_block_buffer) > 12:
                            in_ai_block = False
                            json_str = ai_block_buffer.split("```")[0].strip()
                            try:
                                ai_block_data = json.loads(json_str)
                                yield StreamEvent(type="ai_block", data=ai_block_data)
                            except json.JSONDecodeError:
                                yield StreamEvent(
                                    type="parse_warning",
                                    data={"status": "json_parse_failed", "raw_text": json_str},
                                )
                            ai_block_buffer = ""
                        continue

                    yield StreamEvent(type="token", data={"text": token_text})

        yield StreamEvent(type="completed", data={"full_text": full_text})

    @staticmethod
    def extract_ai_block(text: str) -> dict | None:
        pattern = r"```ai-block\s*\n(.*?)\n```"
        match = re.search(pattern, text, re.DOTALL)
        if not match:
            return None
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            return None

    @classmethod
    def from_settings(cls, settings: dict) -> "LLMClient":
        return cls(
            base_url=settings.get("llm_base_url", "http://localhost:11434/v1"),
            api_key=settings.get("llm_api_key", ""),
            model_name=settings.get("llm_model_name", "llama3.1:8b"),
            supports_vision=settings.get("llm_supports_vision", False),
            system_prompt=settings.get("llm_system_prompt", ""),
        )
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && python -m pytest tests/test_llm_client.py -v`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
cd backend
git add src/core/llm_client.py tests/test_llm_client.py
git commit -m "feat: 新增 LLM 客户端（OpenAI 兼容协议）

- build_messages: 多模态附件处理（vision 支持检测）
- chat_stream: SSE 流式调用，逐 token 产出 StreamEvent
- ai_block 缓冲：检测标记 → 静默收集 → JSON 解析 → 事件推送
- from_settings: 从配置字典构建客户端"
```

---

## Phase 2: 后端 API 层

### Task 4: LLM 设置 API

**Files:**
- Create: `backend/src/api/llm_settings.py`
- Modify: `backend/src/server.py`（注册路由 + 加载 LLM 设置）

- [ ] **Step 1: 实现 LLM 设置 API**

创建 `backend/src/api/llm_settings.py`：

```python
"""LLM 设置 API — 独立于图片生成 API 配置。"""
from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/llm-settings", tags=["llm-settings"])

LLM_SETTING_KEYS = [
    "llm_api_key",
    "llm_base_url",
    "llm_model_name",
    "llm_supports_vision",
    "llm_system_prompt",
]


class LLMSettingsUpdate(BaseModel):
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    llm_model_name: str | None = None
    llm_supports_vision: bool | None = None
    llm_system_prompt: str | None = None


def _db(request: Request):
    return request.app.state.db


def _llm_settings(request: Request) -> dict:
    return request.app.state.llm_settings


def _load_llm_settings(db) -> dict:
    """从数据库加载 LLM 设置到内存 dict。"""
    settings = {}
    for key in LLM_SETTING_KEYS:
        val = db.get_setting(key) if hasattr(db, '_conn') else None
        settings[key] = val
    return settings


@router.get("")
async def get_llm_settings(request: Request):
    db = _db(request)
    settings = {}
    for key in LLM_SETTING_KEYS:
        val = await db.get_setting(key)
        settings[key] = val

    # API key 脱敏
    api_key = settings.get("llm_api_key")
    response = {**settings}
    response["llm_api_key_set"] = bool(api_key)
    response["llm_api_key_preview"] = f"...{api_key[-4:]}" if api_key and len(api_key) > 4 else None
    if not api_key:
        response["llm_api_key"] = None

    return response


@router.patch("")
async def update_llm_settings(request: Request, body: LLMSettingsUpdate):
    db = _db(request)
    updates = body.model_dump(exclude_none=True)

    for key, value in updates.items():
        await db.set_setting(key, str(value) if not isinstance(value, str) else value)

    # 更新内存缓存
    app_settings = request.app.state.llm_settings
    for key, value in updates.items():
        app_settings[key] = str(value) if not isinstance(value, str) else value

    # 重建 LLM 客户端
    from src.core.llm_client import LLMClient
    request.app.state.llm_client = LLMClient.from_settings(app_settings)

    return await get_llm_settings(request)
```

- [ ] **Step 2: 在 server.py 中注册**

在 `backend/src/server.py` 中：
1. 在文件顶部 import 区追加：
```python
from src.api.llm_settings import router as llm_settings_api
from src.api.llm_chat import router as llm_chat_api
from src.core.llm_client import LLMClient
```

2. 在 `create_app` 的 lifespan startup 中，`app.state.client = ImageClient.from_settings(settings)` 之后追加：
```python
# LLM 设置
llm_settings = {}
for key in ["llm_api_key", "llm_base_url", "llm_model_name", "llm_supports_vision", "llm_system_prompt"]:
    val = await db.get_setting(key)
    llm_settings[key] = val
app.state.llm_settings = llm_settings
app.state.llm_client = LLMClient.from_settings(llm_settings)
```

3. 在路由注册区追加：
```python
app.include_router(llm_settings_api.router)
```

- [ ] **Step 3: 手动验证**

Run: `cd backend && python -c "from src.api.llm_settings import router; print('OK')"`
Expected: 输出 `OK`

- [ ] **Step 4: 提交**

```bash
git add backend/src/api/llm_settings.py backend/src/server.py
git commit -m "feat: 新增 LLM 设置 API

- GET /api/llm-settings: 读取 LLM 配置（API key 脱敏）
- PATCH /api/llm-settings: 更新配置，热重建 LLM 客户端
- 独立于图片生成 API 的配置管理"
```

---

### Task 5: 聊天会话 CRUD API

**Files:**
- Create: `backend/src/api/llm_chat.py`（先写会话 CRUD 部分）

- [ ] **Step 1: 实现聊天会话 CRUD**

创建 `backend/src/api/llm_chat.py`，先包含会话管理端点：

```python
"""LLM 聊天会话 + 消息 API。"""
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["llm-chat"])


def _db(request: Request):
    return request.app.state.db


def _gen_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# ── Pydantic Models ──


class ChatSessionCreate(BaseModel):
    name: str = "新对话"


class ChatSessionRename(BaseModel):
    name: str


# ── 聊天会话 CRUD ──


@router.get("/sessions/{session_id}/llm-chats")
async def list_chat_sessions(session_id: str, request: Request):
    db = _db(request)
    conn = db.connection()
    cursor = await conn.execute(
        "SELECT id, session_id, name, created_at, updated_at, total_tokens "
        "FROM llm_chat_sessions WHERE session_id = ? ORDER BY updated_at DESC",
        (session_id,),
    )
    rows = await cursor.fetchall()
    return [
        {
            "id": r[0], "session_id": r[1], "name": r[2],
            "created_at": r[3], "updated_at": r[4], "total_tokens": r[5],
        }
        for r in rows
    ]


@router.post("/sessions/{session_id}/llm-chats")
async def create_chat_session(session_id: str, request: Request, body: ChatSessionCreate = None):
    db = _db(request)
    chat_id = _gen_id("lc")
    name = body.name if body else "新对话"
    now = datetime.utcnow().isoformat()

    conn = db.connection()
    await conn.execute(
        "INSERT INTO llm_chat_sessions (id, session_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (chat_id, session_id, name, now, now),
    )
    await conn.commit()

    return {
        "id": chat_id, "session_id": session_id, "name": name,
        "created_at": now, "updated_at": now, "total_tokens": 0,
    }


@router.patch("/llm-chats/{chat_id}")
async def rename_chat_session(chat_id: str, request: Request, body: ChatSessionRename):
    db = _db(request)
    conn = db.connection()
    now = datetime.utcnow().isoformat()
    await conn.execute(
        "UPDATE llm_chat_sessions SET name = ?, updated_at = ? WHERE id = ?",
        (body.name, now, chat_id),
    )
    await conn.commit()
    cursor = await conn.execute("SELECT * FROM llm_chat_sessions WHERE id = ?", (chat_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "聊天会话不存在")
    return {"id": row[0], "session_id": row[1], "name": row[2],
            "created_at": row[3], "updated_at": row[4], "total_tokens": row[5]}


@router.delete("/llm-chats/{chat_id}")
async def delete_chat_session(chat_id: str, request: Request):
    db = _db(request)
    conn = db.connection()
    await conn.execute("DELETE FROM llm_messages WHERE chat_session_id = ?", (chat_id,))
    await conn.execute("DELETE FROM llm_chat_sessions WHERE id = ?", (chat_id,))
    await conn.commit()
    return {"ok": True}
```

- [ ] **Step 2: 在 server.py 注册路由**

在 Task 4 的 import 中已包含 `from src.api.llm_chat import router as llm_chat_api`，在路由注册区追加：

```python
app.include_router(llm_chat_api.router)
```

- [ ] **Step 3: 提交**

```bash
git add backend/src/api/llm_chat.py backend/src/server.py
git commit -m "feat: 新增 LLM 聊天会话 CRUD API

- GET /api/sessions/{id}/llm-chats: 列出聊天会话
- POST /api/sessions/{id}/llm-chats: 创建聊天会话
- PATCH /api/llm-chats/{id}: 重命名
- DELETE /api/llm-chats/{id}: 删除（级联删除消息）"
```

---

### Task 6: 消息 CRUD API（含软删除）

**Files:**
- Modify: `backend/src/api/llm_chat.py`（追加消息端点）

- [ ] **Step 1: 追加消息 CRUD 端点**

在 `backend/src/api/llm_chat.py` 末尾追加：

```python
# ── Pydantic Models ──


class MessageEdit(BaseModel):
    content: str


class BatchDelete(BaseModel):
    message_ids: list[str]


# ── 消息 CRUD ──


@router.get("/llm-chats/{chat_id}/messages")
async def list_messages(chat_id: str, request: Request):
    db = _db(request)
    conn = db.connection()

    # 清理超过 48h 的软删除记录
    cutoff = (datetime.utcnow() - timedelta(hours=48)).isoformat()
    await conn.execute(
        "DELETE FROM llm_messages WHERE chat_session_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?",
        (chat_id, cutoff),
    )
    await conn.commit()

    cursor = await conn.execute(
        "SELECT id, chat_session_id, role, content, ai_block, token_count, attachments, created_at, deleted_at "
        "FROM llm_messages WHERE chat_session_id = ? AND deleted_at IS NULL ORDER BY created_at ASC",
        (chat_id,),
    )
    rows = await cursor.fetchall()
    return [
        {
            "id": r[0], "chat_session_id": r[1], "role": r[2], "content": r[3],
            "ai_block": r[4], "token_count": r[5], "attachments": r[6],
            "created_at": r[7], "deleted_at": r[8],
        }
        for r in rows
    ]


@router.patch("/llm-messages/{message_id}")
async def edit_message(message_id: str, request: Request, body: MessageEdit):
    db = _db(request)
    conn = db.connection()
    await conn.execute(
        "UPDATE llm_messages SET content = ? WHERE id = ?",
        (body.content, message_id),
    )
    await conn.commit()
    cursor = await conn.execute("SELECT * FROM llm_messages WHERE id = ?", (message_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "消息不存在")
    return {"id": row[0], "content": row[3]}


@router.delete("/llm-messages/{message_id}")
async def delete_message(message_id: str, request: Request):
    db = _db(request)
    conn = db.connection()
    now = datetime.utcnow().isoformat()
    await conn.execute(
        "UPDATE llm_messages SET deleted_at = ? WHERE id = ?",
        (now, message_id),
    )
    await conn.commit()
    return {"ok": True, "deleted_at": now}


@router.post("/llm-messages/batch-delete")
async def batch_delete_messages(request: Request, body: BatchDelete):
    db = _db(request)
    conn = db.connection()
    now = datetime.utcnow().isoformat()
    placeholders = ",".join("?" for _ in body.message_ids)
    await conn.execute(
        f"UPDATE llm_messages SET deleted_at = ? WHERE id IN ({placeholders})",
        [now, *body.message_ids],
    )
    await conn.commit()
    return {"ok": True, "count": len(body.message_ids)}


@router.post("/llm-messages/{message_id}/undo-delete")
async def undo_delete_message(message_id: str, request: Request):
    db = _db(request)
    conn = db.connection()
    await conn.execute(
        "UPDATE llm_messages SET deleted_at = NULL WHERE id = ?",
        (message_id,),
    )
    await conn.commit()
    return {"ok": True}
```

- [ ] **Step 2: 提交**

```bash
git add backend/src/api/llm_chat.py
git commit -m "feat: 新增 LLM 消息 CRUD API（含软删除）

- GET /api/llm-chats/{id}/messages: 获取消息（自动清理 48h 软删除）
- PATCH /api/llm-messages/{id}: 编辑消息
- DELETE /api/llm-messages/{id}: 软删除
- POST /api/llm-messages/batch-delete: 批量软删除
- POST /api/llm-messages/{id}/undo-delete: 撤销删除"
```

---

### Task 7: SSE 聊天 API（核心）

**Files:**
- Modify: `backend/src/api/llm_chat.py`（追加 SSE 聊天端点）

- [ ] **Step 1: 追加 SSE 聊天端点**

在 `backend/src/api/llm_chat.py` 顶部追加 import：

```python
import json
from fastapi.responses import StreamingResponse
from src.core.llm_tokenizer import estimate_tokens
```

在文件末尾追加：

```python
# ── Pydantic Models ──


class ChatRequest(BaseModel):
    content: str
    attachments: list[dict] | None = None
    form_response: dict | None = None


# ── SSE 聊天 ──


@router.post("/llm-chats/{chat_id}/chat")
async def chat(chat_id: str, request: Request, body: ChatRequest):
    db = _db(request)
    conn = db.connection()
    llm_client = request.app.state.llm_client

    # 验证聊天会话存在
    cursor = await conn.execute("SELECT session_id FROM llm_chat_sessions WHERE id = ?", (chat_id,))
    session_row = await cursor.fetchone()
    if not session_row:
        raise HTTPException(404, "聊天会话不存在")

    # 保存用户消息
    user_msg_id = _gen_id("lm")
    now = datetime.utcnow().isoformat()
    attachments_json = json.dumps(body.attachments) if body.attachments else None
    # 如果是表单提交，content 已经是拼接后的自然语言
    await conn.execute(
        "INSERT INTO llm_messages (id, chat_session_id, role, content, attachments, created_at) "
        "VALUES (?, ?, 'user', ?, ?, ?)",
        (user_msg_id, chat_id, body.content, attachments_json, now),
    )
    await conn.commit()

    # 加载历史消息（排除已删除的）
    cursor = await conn.execute(
        "SELECT role, content, ai_block FROM llm_messages "
        "WHERE chat_session_id = ? AND deleted_at IS NULL ORDER BY created_at ASC",
        (chat_id,),
    )
    history_rows = await cursor.fetchall()

    # 构建历史消息（ai_block 摘要附加到 content）
    history = []
    for r in history_rows:
        msg = {"role": r[0], "content": r[1]}
        if r[2]:  # ai_block
            try:
                block = json.loads(r[2])
                if block.get("type") == "questions":
                    labels = ", ".join(f["label"] for f in block.get("fields", []))
                    msg["content"] += f"\n[之前询问了用户：{labels}]"
                elif block.get("type") == "suggestions":
                    titles = ", ".join(s["title"] for s in block.get("items", []))
                    msg["content"] += f"\n[之前提供了以下方案：{titles}]"
            except json.JSONDecodeError:
                pass
        history.append(msg)

    # 获取系统提示词
    system_prompt = request.app.state.llm_settings.get("llm_system_prompt", "")

    # 构建消息列表
    messages = llm_client.build_messages(
        system_prompt=system_prompt or "你是一个专业的图片提示词助手。",
        history=history[:-1],  # 排除刚保存的用户消息（build_messages 会添加）
        user_content=body.content,
        attachments=body.attachments or [],
    )

    async def event_generator():
        full_text = ""
        ai_block_data = None
        prompt_tokens = 0
        completion_tokens = 0

        try:
            async for event in llm_client.chat_stream(messages):
                if event.type == "token":
                    full_text += event.data["text"]
                    yield f"event: token\ndata: {json.dumps(event.data, ensure_ascii=False)}\n\n"

                elif event.type == "buffering":
                    yield f"event: buffering\ndata: {json.dumps(event.data, ensure_ascii=False)}\n\n"

                elif event.type == "ai_block":
                    ai_block_data = event.data
                    yield f"event: ai_block\ndata: {json.dumps(event.data, ensure_ascii=False)}\n\n"

                elif event.type == "parse_warning":
                    yield f"event: parse_warning\ndata: {json.dumps(event.data, ensure_ascii=False)}\n\n"

                elif event.type == "usage":
                    prompt_tokens = event.data.get("prompt_tokens", 0)
                    completion_tokens = event.data.get("completion_tokens", 0)
                    yield f"event: usage\ndata: {json.dumps(event.data, ensure_ascii=False)}\n\n"

                elif event.type == "error":
                    yield f"event: error\ndata: {json.dumps(event.data, ensure_ascii=False)}\n\n"
                    return

            # 保存 AI 回复
            ai_msg_id = _gen_id("lm")
            token_count = completion_tokens or estimate_tokens(full_text)
            ai_block_json = json.dumps(ai_block_data, ensure_ascii=False) if ai_block_data else None

            await conn.execute(
                "INSERT INTO llm_messages (id, chat_session_id, role, content, ai_block, token_count, created_at) "
                "VALUES (?, ?, 'assistant', ?, ?, ?, ?)",
                (ai_msg_id, chat_id, full_text, ai_block_json, token_count, datetime.utcnow().isoformat()),
            )

            # 更新会话 token 统计
            total_add = prompt_tokens + completion_tokens
            if total_add > 0:
                await conn.execute(
                    "UPDATE llm_chat_sessions SET total_tokens = total_tokens + ?, updated_at = ? WHERE id = ?",
                    (total_add, datetime.utcnow().isoformat(), chat_id),
                )
            else:
                await conn.execute(
                    "UPDATE llm_chat_sessions SET updated_at = ? WHERE id = ?",
                    (datetime.utcnow().isoformat(), chat_id),
                )
            await conn.commit()

            yield f'event: completed\ndata: {json.dumps({"message_id": ai_msg_id, "token_count": token_count}, ensure_ascii=False)}\n\n'

        except Exception as e:
            yield f'event: error\ndata: {json.dumps({"code": "stream_error", "message": str(e)}, ensure_ascii=False)}\n\n'

    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

- [ ] **Step 2: 提交**

```bash
git add backend/src/api/llm_chat.py
git commit -m "feat: 新增 SSE 聊天 API（核心流式端点）

- POST /api/llm-chats/{id}/chat: SSE 流式聊天
- 构建完整消息上下文（系统提示词 + 历史 + ai_block 摘要 + 用户输入）
- 保存 AI 回复到数据库，更新 token 统计
- 支持 ai_block 缓冲事件（buffering → ai_block/parse_warning）"
```

---

## Phase 3: 前端基础层

### Task 8: TypeScript 类型定义 + i18n 翻译键

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/i18n/zh.json`
- Modify: `frontend/src/i18n/en.json`

- [ ] **Step 1: 在 types/index.ts 末尾追加 LLM 类型**

```typescript
// ── LLM AI 助手 ──

export interface LLMChatSession {
  id: string;
  session_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  total_tokens: number;
}

export interface LLMMessage {
  id: string;
  chat_session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  ai_block: string | null;  // JSON string
  token_count: number;
  attachments: string | null;  // JSON string
  created_at: string;
  deleted_at: string | null;
}

export interface LLMSettings {
  llm_api_key_set: boolean;
  llm_api_key_preview: string | null;
  llm_api_key: string | null;
  llm_base_url: string | null;
  llm_model_name: string | null;
  llm_supports_vision: boolean | null;
  llm_system_prompt: string | null;
}

export interface LLMSettingsUpdate {
  llm_api_key?: string;
  llm_base_url?: string;
  llm_model_name?: string;
  llm_supports_vision?: boolean;
  llm_system_prompt?: string;
}

// ai_block 解析后的类型
export interface AiBlockQuestions {
  type: "questions";
  message: string;
  fields: QuestionField[];
}

export interface AiBlockSuggestions {
  type: "suggestions";
  message: string;
  items: SuggestionItem[];
}

export type AiBlock = AiBlockQuestions | AiBlockSuggestions;

export interface QuestionField {
  id: string;
  label: string;
  widget: "text" | "textarea" | "radio" | "select" | "checkbox";
  options?: string[];
  placeholder?: string;
  required: boolean;
}

export interface SuggestionItem {
  id: string;
  title: string;
  prompt: string;
  recommended?: boolean;
}

// SSE 事件类型
export interface LLMChatRequest {
  content: string;
  attachments?: Array<{ data: string; media_type: string }>;
  form_response?: Record<string, string>;
}
```

- [ ] **Step 2: 在 zh.json 末尾（最后一个 `}` 之前）追加翻译键**

```json
  "llm": {
    "toggle": "AI 助手",
    "placeholder": "和 AI 讨论你的创意...",
    "send": "发送",
    "newChat": "新对话",
    "manage": "管理",
    "collapse": "收起",
    "expand": "展开",
    "tokenCount": "≈{{count}} tokens",
    "submitAnswer": "提交回答",
    "skip": "跳过",
    "useForGeneration": "采用生图",
    "editAndUse": "编辑后用",
    "recommended": "推荐",
    "skippedSchemes": "{{count}} 个方案未选择，继续优化",
    "buffering": "正在生成方案建议...",
    "parseWarning": "结构化解析失败，已降级为文本展示",
    "required": "必填",
    "optional": "选填",
    "apiKey": "LLM API 密钥",
    "baseUrl": "LLM 基础 URL",
    "modelName": "LLM 模型名称",
    "visionSupport": "支持图像识别",
    "systemPrompt": "系统提示词",
    "settingsTitle": "LLM AI 助手设置"
  }
```

- [ ] **Step 3: 在 en.json 末尾追加对应英文翻译**

```json
  "llm": {
    "toggle": "AI Assistant",
    "placeholder": "Discuss your ideas with AI...",
    "send": "Send",
    "newChat": "New Chat",
    "manage": "Manage",
    "collapse": "Collapse",
    "expand": "Expand",
    "tokenCount": "≈{{count}} tokens",
    "submitAnswer": "Submit",
    "skip": "Skip",
    "useForGeneration": "Generate",
    "editAndUse": "Edit & Use",
    "recommended": "Recommended",
    "skippedSchemes": "{{count}} suggestions skipped, continuing",
    "buffering": "Generating suggestions...",
    "parseWarning": "Parse failed, showing as text",
    "required": "Required",
    "optional": "Optional",
    "apiKey": "LLM API Key",
    "baseUrl": "LLM Base URL",
    "modelName": "LLM Model Name",
    "visionSupport": "Vision Support",
    "systemPrompt": "System Prompt",
    "settingsTitle": "LLM AI Assistant Settings"
  }
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/types/index.ts frontend/src/i18n/zh.json frontend/src/i18n/en.json
git commit -m "feat: 新增 LLM AI 助手 TypeScript 类型定义和 i18n 翻译

- types: LLMChatSession, LLMMessage, AiBlock, QuestionField, SuggestionItem 等
- zh.json/en.json: llm.* 命名空间，覆盖开关、聊天、表单、卡片、设置"
```

---

### Task 9: LLM API 通信函数

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: 在 api.ts 末尾追加 LLM API 函数**

```typescript
// ── LLM AI 助手 API ──

export async function getLLMSettings(): Promise<LLMSettings> {
  return request<LLMSettings>("/api/llm-settings");
}

export async function updateLLMSettings(data: LLMSettingsUpdate): Promise<LLMSettings> {
  return request<LLMSettings>("/api/llm-settings", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function listLLMChatSessions(sessionId: string): Promise<LLMChatSession[]> {
  return request<LLMChatSession[]>(`/api/sessions/${sessionId}/llm-chats`);
}

export async function createLLMChatSession(sessionId: string, name?: string): Promise<LLMChatSession> {
  return request<LLMChatSession>(`/api/sessions/${sessionId}/llm-chats`, {
    method: "POST",
    body: JSON.stringify({ name: name || "新对话" }),
  });
}

export async function renameLLMChatSession(chatId: string, name: string): Promise<LLMChatSession> {
  return request<LLMChatSession>(`/api/llm-chats/${chatId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function deleteLLMChatSession(chatId: string): Promise<void> {
  await request(`/api/llm-chats/${chatId}`, { method: "DELETE" });
}

export async function listLLMMessages(chatId: string): Promise<LLMMessage[]> {
  return request<LLMMessage[]>(`/api/llm-chats/${chatId}/messages`);
}

export async function editLLMMessage(messageId: string, content: string): Promise<void> {
  await request(`/api/llm-messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ content }),
  });
}

export async function deleteLLMMessage(messageId: string): Promise<void> {
  await request(`/api/llm-messages/${messageId}`, { method: "DELETE" });
}

export async function batchDeleteLLMMessages(messageIds: string[]): Promise<void> {
  await request("/api/llm-messages/batch-delete", {
    method: "POST",
    body: JSON.stringify({ message_ids: messageIds }),
  });
}

export async function undoDeleteLLMMessage(messageId: string): Promise<void> {
  await request(`/api/llm-messages/${messageId}/undo-delete`, { method: "POST" });
}

// SSE 聊天事件 handler 类型
export interface LLMChatEventHandler {
  onToken: (text: string) => void;
  onBuffering: (data: { status: string; elapsed_ms: number }) => void;
  onAiBlock: (data: Record<string, unknown>) => void;
  onParseWarning: (data: { status: string; raw_text: string }) => void;
  onUsage: (data: { prompt_tokens: number; completion_tokens: number }) => void;
  onCompleted: (data: { message_id: string; token_count: number }) => void;
  onError: (data: { code: string; message: string }) => void;
}

export function sendLLMChat(
  chatId: string,
  body: LLMChatRequest,
  handler: LLMChatEventHandler,
): AbortController {
  const url = `${getBaseUrl()}/api/llm-chats/${chatId}/chat`;
  return connectSSE(url, body, {
    onEvent: (event, data) => {
      switch (event) {
        case "token":
          handler.onToken(data.text || "");
          break;
        case "buffering":
          handler.onBuffering(data);
          break;
        case "ai_block":
          handler.onAiBlock(data);
          break;
        case "parse_warning":
          handler.onParseWarning(data);
          break;
        case "usage":
          handler.onUsage(data);
          break;
        case "completed":
          handler.onCompleted(data);
          break;
        case "error":
          handler.onError(data);
          break;
      }
    },
  });
}
```

注意：`sendLLMChat` 使用已有的 `connectSSE` 函数，但需要确认 `connectSSE` 的 handler 签名。查看现有 `connectSSE` 的 `SSEEventHandler` 类型，它可能使用 `onEvent(event, data)` 模式或 `onPartial/onCompleted/onError` 模式。实现时需要适配。

- [ ] **Step 2: 提交**

```bash
git add frontend/src/services/api.ts
git commit -m "feat: 新增 LLM API 通信函数

- CRUD: 聊天会话、消息、设置的增删改查
- sendLLMChat: SSE 流式聊天，基于 connectSSE 封装
- LLMChatEventHandler: 7 种 SSE 事件的类型安全回调"
```

---

### Task 10: llmChatStore 状态管理

**Files:**
- Create: `frontend/src/stores/llmChatStore.ts`

- [ ] **Step 1: 实现 llmChatStore**

创建 `frontend/src/stores/llmChatStore.ts`：

```typescript
import { create } from "zustand";
import {
  LLMChatSession,
  LLMMessage,
  AiBlock,
  AiBlockQuestions,
  AiBlockSuggestions,
} from "../types";
import * as api from "../services/api";

interface LLMChatState {
  // 全局状态
  aiEnabled: boolean;
  currentChatSessionId: string | null;

  // 数据
  chatSessions: LLMChatSession[];
  messages: LLMMessage[];

  // 流式状态
  streamingText: string;
  bufferingState: "idle" | "streaming" | "buffering" | "ready";
  bufferElapsed: number;
  currentAiBlock: AiBlock | null;
  abortController: AbortController | null;

  // token
  totalTokens: number;

  // UI 状态
  panelExpanded: boolean;

  // Actions
  toggleAI: () => void;
  setPanelExpanded: (expanded: boolean) => void;
  loadChatSessions: (sessionId: string) => Promise<void>;
  createChatSession: (sessionId: string) => Promise<void>;
  selectChatSession: (chatId: string) => Promise<void>;
  renameChatSession: (chatId: string, name: string) => Promise<void>;
  deleteChatSession: (chatId: string, sessionId: string) => Promise<void>;
  sendMessage: (content: string, attachments?: Array<{ data: string; media_type: string }>, formResponse?: Record<string, string>) => void;
  cancelStream: () => void;
  resetStreamState: () => void;
}

export const useLLMChatStore = create<LLMChatState>((set, get) => ({
  aiEnabled: false,
  currentChatSessionId: null,
  chatSessions: [],
  messages: [],
  streamingText: "",
  bufferingState: "idle",
  bufferElapsed: 0,
  currentAiBlock: null,
  abortController: null,
  totalTokens: 0,
  panelExpanded: false,

  toggleAI: () => {
    set((s) => ({ aiEnabled: !s.aiEnabled }));
  },

  setPanelExpanded: (expanded) => set({ panelExpanded: expanded }),

  loadChatSessions: async (sessionId: string) => {
    const sessions = await api.listLLMChatSessions(sessionId);
    set({ chatSessions: sessions });
    // 自动选择最新的会话（如果有）
    if (sessions.length > 0 && !get().currentChatSessionId) {
      get().selectChatSession(sessions[0].id);
    }
  },

  createChatSession: async (sessionId: string) => {
    const session = await api.createLLMChatSession(sessionId);
    set((s) => ({
      chatSessions: [session, ...s.chatSessions],
      currentChatSessionId: session.id,
      messages: [],
      totalTokens: 0,
    }));
  },

  selectChatSession: async (chatId: string) => {
    const messages = await api.listLLMMessages(chatId);
    const session = get().chatSessions.find((s) => s.id === chatId);
    set({
      currentChatSessionId: chatId,
      messages,
      totalTokens: session?.total_tokens || 0,
    });
  },

  renameChatSession: async (chatId: string, name: string) => {
    await api.renameLLMChatSession(chatId, name);
    set((s) => ({
      chatSessions: s.chatSessions.map((cs) =>
        cs.id === chatId ? { ...cs, name } : cs
      ),
    }));
  },

  deleteChatSession: async (chatId: string, sessionId: string) => {
    await api.deleteLLMChatSession(chatId);
    await get().loadChatSessions(sessionId);
    if (get().currentChatSessionId === chatId) {
      set({ currentChatSessionId: null, messages: [], totalTokens: 0 });
    }
  },

  sendMessage: (content, attachments, formResponse) => {
    const { currentChatSessionId } = get();
    if (!currentChatSessionId) return;

    const ac = new AbortController();
    set({
      abortController: ac,
      streamingText: "",
      bufferingState: "streaming",
      currentAiBlock: null,
    });

    // 先在本地添加用户消息
    const tempUserMsg: LLMMessage = {
      id: `temp_${Date.now()}`,
      chat_session_id: currentChatSessionId,
      role: "user",
      content,
      ai_block: null,
      token_count: 0,
      attachments: attachments ? JSON.stringify(attachments) : null,
      created_at: new Date().toISOString(),
      deleted_at: null,
    };
    set((s) => ({ messages: [...s.messages, tempUserMsg] }));

    api.sendLLMChat(
      currentChatSessionId,
      { content, attachments, form_response: formResponse },
      {
        onToken: (text) => {
          set((s) => ({ streamingText: s.streamingText + text }));
        },
        onBuffering: () => {
          set({ bufferingState: "buffering" });
        },
        onAiBlock: (data) => {
          const block = data as unknown as AiBlock;
          set({ currentAiBlock: block, bufferingState: "ready" });
        },
        onParseWarning: () => {
          set({ bufferingState: "idle" });
        },
        onUsage: (data) => {
          set((s) => ({
            totalTokens: s.totalTokens + data.prompt_tokens + data.completion_tokens,
          }));
        },
        onCompleted: () => {
          // 刷新消息列表获取完整数据（含 message_id）
          const chatId = get().currentChatSessionId;
          if (chatId) {
            api.listLLMMessages(chatId).then((messages) => set({ messages }));
          }
          set({ streamingText: "", bufferingState: "idle", abortController: null });
        },
        onError: (data) => {
          // 添加错误消息
          const errMsg: LLMMessage = {
            id: `err_${Date.now()}`,
            chat_session_id: currentChatSessionId!,
            role: "system",
            content: `错误：${data.message}`,
            ai_block: null,
            token_count: 0,
            attachments: null,
            created_at: new Date().toISOString(),
            deleted_at: null,
          };
          set((s) => ({
            messages: [...s.messages, errMsg],
            streamingText: "",
            bufferingState: "idle",
            abortController: null,
          }));
        },
      },
    );
  },

  cancelStream: () => {
    get().abortController?.abort();
    set({ streamingText: "", bufferingState: "idle", abortController: null });
  },

  resetStreamState: () => {
    set({ streamingText: "", bufferingState: "idle", currentAiBlock: null, bufferElapsed: 0 });
  },
}));
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/stores/llmChatStore.ts
git commit -m "feat: 新增 llmChatStore 状态管理

- AI 开关、聊天会话、消息、流式状态、token 统计
- sendMessage: 发送消息并处理 7 种 SSE 事件
- 聊天会话 CRUD：加载、创建、选择、重命名、删除
- 流式状态机：idle → streaming → buffering → ready"
```

---

## Phase 4: 前端 UI 组件

### Task 11: AiToggle 开关组件

**Files:**
- Create: `frontend/src/components/AiToggle.tsx`

- [ ] **Step 1: 实现 AiToggle 组件**

创建 `frontend/src/components/AiToggle.tsx`：

```tsx
import { useTranslation } from "react-i18next";
import { useLLMChatStore } from "../stores/llmChatStore";

export default function AiToggle() {
  const { t } = useTranslation();
  const aiEnabled = useLLMChatStore((s) => s.aiEnabled);
  const toggleAI = useLLMChatStore((s) => s.toggleAI);

  return (
    <button
      onClick={toggleAI}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: "var(--radius-sm)",
        border: `1px solid ${aiEnabled ? "var(--accent)" : "var(--border)"}`,
        background: aiEnabled ? "rgba(201,100,66,0.08)" : "transparent",
        color: aiEnabled ? "var(--accent)" : "var(--faint)",
        fontSize: 11,
        cursor: "pointer",
        transition: "all 0.2s ease",
        whiteSpace: "nowrap",
      }}
      title={aiEnabled ? t("llm.collapse") : t("llm.expand")}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: aiEnabled ? "var(--accent)" : "var(--faint)",
          transition: "background 0.2s ease",
        }}
      />
      {t("llm.toggle")}
    </button>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/AiToggle.tsx
git commit -m "feat: 新增 AiToggle 开关组件

- 圆点 + 文字按钮，开启态强调色高亮
- 点击切换 llmChatStore.aiEnabled"
```

---

### Task 12: ChatPanel 容器 + ChatMessage 消息气泡

**Files:**
- Create: `frontend/src/components/ChatPanel/index.tsx`
- Create: `frontend/src/components/ChatPanel/ChatMessage.tsx`

- [ ] **Step 1: 实现 ChatMessage 气泡**

创建 `frontend/src/components/ChatPanel/ChatMessage.tsx`：

```tsx
import { LLMMessage } from "../../types";
import AiBlockRenderer from "./AiBlockRenderer";

interface Props {
  message: LLMMessage;
  streamingText?: string;
  currentAiBlock?: Record<string, unknown> | null;
}

export default function ChatMessage({ message, streamingText, currentAiBlock }: Props) {
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

  // 解析 ai_block
  let aiBlock = null;
  if (message.ai_block) {
    try {
      aiBlock = JSON.parse(message.ai_block);
    } catch {}
  }
  // 流式消息使用实时的 ai_block
  if (streamingText !== undefined && currentAiBlock) {
    aiBlock = currentAiBlock;
  }

  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div style={{ maxWidth: "85%" }}>
        {/* 文字气泡 */}
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
          {streamingText !== undefined ? streamingText || "..." : message.content}
          {streamingText !== undefined && streamingText && (
            <span className="animate-pulse" style={{ marginLeft: 1 }}>▊</span>
          )}
        </div>

        {/* ai_block 渲染 */}
        {aiBlock && <AiBlockRenderer block={aiBlock} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 实现 ChatPanel 容器**

创建 `frontend/src/components/ChatPanel/index.tsx`：

```tsx
import { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLLMChatStore } from "../../stores/llmChatStore";
import ChatMessage from "./ChatMessage";
import ChatSessionBar from "./ChatSessionBar";
import BufferingIndicator from "./BufferingIndicator";

export default function ChatPanel() {
  const { t } = useTranslation();
  const panelExpanded = useLLMChatStore((s) => s.panelExpanded);
  const setPanelExpanded = useLLMChatStore((s) => s.setPanelExpanded);
  const messages = useLLMChatStore((s) => s.messages);
  const streamingText = useLLMChatStore((s) => s.streamingText);
  const bufferingState = useLLMChatStore((s) => s.bufferingState);
  const currentAiBlock = useLLMChatStore((s) => s.currentAiBlock);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新消息自动滚到底
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  if (!panelExpanded) {
    // 折叠态：一行摘要
    const lastMsg = messages[messages.length - 1];
    const summary = lastMsg?.content?.slice(0, 60) || "";
    return (
      <div
        onClick={() => setPanelExpanded(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 8px",
          cursor: "pointer",
          borderBottom: "1px solid var(--border-s)",
          fontSize: 12,
          color: "var(--muted)",
          minHeight: 36,
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {summary}
        </span>
        <span style={{ color: "var(--faint)", fontSize: 10 }}>{t("llm.expand")}</span>
      </div>
    );
  }

  // 展开态
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "50%",
        minHeight: 200,
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
      }}
    >
      <ChatSessionBar />

      {/* 消息列表 */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.map((msg, i) => {
          const isLastAssistant = msg.role === "assistant" && i === messages.length - 1;
          return (
            <ChatMessage
              key={msg.id}
              message={msg}
              streamingText={isLastAssistant && streamingText ? streamingText : undefined}
              currentAiBlock={isLastAssistant ? currentAiBlock : null}
            />
          );
        })}
        {bufferingState === "buffering" && <BufferingIndicator />}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 提交**

```bash
mkdir -p frontend/src/components/ChatPanel
git add frontend/src/components/ChatPanel/index.tsx frontend/src/components/ChatPanel/ChatMessage.tsx
git commit -m "feat: 新增 ChatPanel 容器和 ChatMessage 消息气泡

- ChatPanel: 折叠态（一行摘要）+ 展开态（50% 高度，可滚动）
- ChatMessage: 用户/AI/系统三种角色气泡
- 流式文字光标动画 + ai_block 渲染分发"
```

---

### Task 13: AiBlockRenderer + QuestionForm + SuggestionCards + BufferingIndicator

**Files:**
- Create: `frontend/src/components/ChatPanel/AiBlockRenderer.tsx`
- Create: `frontend/src/components/ChatPanel/QuestionForm.tsx`
- Create: `frontend/src/components/ChatPanel/SuggestionCards.tsx`
- Create: `frontend/src/components/ChatPanel/BufferingIndicator.tsx`

- [ ] **Step 1: 实现 AiBlockRenderer**

创建 `frontend/src/components/ChatPanel/AiBlockRenderer.tsx`：

```tsx
import { AiBlock, AiBlockQuestions, AiBlockSuggestions } from "../../types";
import QuestionForm from "./QuestionForm";
import SuggestionCards from "./SuggestionCards";

interface Props {
  block: AiBlock;
}

export default function AiBlockRenderer({ block }: Props) {
  if (block.type === "questions") {
    return <QuestionForm block={block as AiBlockQuestions} />;
  }
  if (block.type === "suggestions") {
    return <SuggestionCards block={block as AiBlockSuggestions} />;
  }
  return null;
}
```

- [ ] **Step 2: 实现 QuestionForm**

创建 `frontend/src/components/ChatPanel/QuestionForm.tsx`：

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AiBlockQuestions, QuestionField } from "../../types";
import { useLLMChatStore } from "../../stores/llmChatStore";

interface Props {
  block: AiBlockQuestions;
}

export default function QuestionForm({ block }: Props) {
  const { t } = useTranslation();
  const sendMessage = useLLMChatStore((s) => s.sendMessage);
  const [values, setValues] = useState<Record<string, string | string[]>>({});
  const [errors, setErrors] = useState<string[]>([]);

  const handleSubmit = () => {
    // 必填校验
    const missing = block.fields
      .filter((f) => f.required)
      .filter((f) => !values[f.id] || (Array.isArray(values[f.id]) && (values[f.id] as string[]).length === 0));
    if (missing.length > 0) {
      setErrors(missing.map((f) => f.id));
      return;
    }
    // 拼接自然语言
    const parts = block.fields
      .filter((f) => values[f.id])
      .map((f) => `${f.label}：${Array.isArray(values[f.id]) ? (values[f.id] as string[]).join("、") : values[f.id]}`);
    sendMessage(parts.join("，"), undefined, values as Record<string, string>);
  };

  const handleSkip = () => {
    sendMessage("跳过了提问");
  };

  const setValue = (id: string, value: string | string[]) => {
    setValues((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => prev.filter((e) => e !== id));
  };

  const inputStyle = (hasError: boolean): React.CSSProperties => ({
    width: "100%",
    padding: "4px 8px",
    border: `1px solid ${hasError ? "var(--error)" : "var(--border)"}`,
    borderRadius: 4,
    fontSize: 11,
    color: "var(--fg)",
    background: "var(--input-bg)",
    boxSizing: "border-box" as const,
  });

  const renderField = (field: QuestionField) => {
    const hasError = errors.includes(field.id);
    switch (field.widget) {
      case "radio":
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
            {(field.options || []).map((opt) => (
              <label
                key={opt}
                onClick={() => setValue(field.id, opt)}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  border: `1px solid ${values[field.id] === opt ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: 4,
                  cursor: "pointer",
                  color: values[field.id] === opt ? "var(--accent)" : "var(--muted)",
                  background: values[field.id] === opt ? "rgba(201,100,66,0.06)" : "transparent",
                }}
              >
                {opt}
              </label>
            ))}
          </div>
        );
      case "select":
        return (
          <select
            value={(values[field.id] as string) || ""}
            onChange={(e) => setValue(field.id, e.target.value)}
            style={{ ...inputStyle(hasError), marginTop: 4 }}
          >
            <option value="">{t("llm.optional")}</option>
            {(field.options || []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      case "checkbox":
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
            {(field.options || []).map((opt) => {
              const selected = (values[field.id] as string[]) || [];
              const isChecked = selected.includes(opt);
              return (
                <label
                  key={opt}
                  onClick={() => {
                    const newVal = isChecked ? selected.filter((s) => s !== opt) : [...selected, opt];
                    setValue(field.id, newVal);
                  }}
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    border: `1px solid ${isChecked ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 4,
                    cursor: "pointer",
                    color: isChecked ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  {opt}
                </label>
              );
            })}
          </div>
        );
      case "textarea":
        return (
          <textarea
            value={(values[field.id] as string) || ""}
            onChange={(e) => setValue(field.id, e.target.value)}
            placeholder={field.placeholder}
            rows={3}
            style={{ ...inputStyle(hasError), marginTop: 4, resize: "vertical" }}
          />
        );
      default: // text
        return (
          <input
            type="text"
            value={(values[field.id] as string) || ""}
            onChange={(e) => setValue(field.id, e.target.value)}
            placeholder={field.placeholder}
            style={{ ...inputStyle(hasError), marginTop: 4 }}
          />
        );
    }
  };

  return (
    <div
      style={{
        marginTop: 6,
        border: "1px solid var(--accent)",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        background: "var(--card-bg)",
      }}
    >
      {/* 表单标题 */}
      {block.message && (
        <div
          style={{
            padding: "6px 10px",
            background: "rgba(201,100,66,0.06)",
            borderBottom: "1px solid rgba(201,100,66,0.15)",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--accent)",
          }}
        >
          {block.message}
        </div>
      )}
      {/* 表单字段 */}
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {block.fields.map((field) => (
          <div key={field.id}>
            <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>
              {field.required && <span style={{ color: "var(--accent)" }}>* </span>}
              {field.label}
              {!field.required && <span style={{ fontSize: 9, color: "var(--faint)" }}> ({t("llm.optional")})</span>}
            </label>
            {renderField(field)}
          </div>
        ))}
        {/* 操作按钮 */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 4 }}>
          <button
            onClick={handleSkip}
            style={{ fontSize: 11, padding: "4px 14px", background: "var(--card-bg)", color: "var(--faint)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}
          >
            {t("llm.skip")}
          </button>
          <button
            onClick={handleSubmit}
            style={{ fontSize: 11, padding: "4px 14px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500 }}
          >
            {t("llm.submitAnswer")}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 实现 SuggestionCards**

创建 `frontend/src/components/ChatPanel/SuggestionCards.tsx`：

```tsx
import { useTranslation } from "react-i18next";
import { AiBlockSuggestions } from "../../types";
import { useGenerationStore } from "../../stores/generationStore";
import { useLLMChatStore } from "../../stores/llmChatStore";
import { useSessionStore } from "../../stores/sessionStore";

interface Props {
  block: AiBlockSuggestions;
}

export default function SuggestionCards({ block }: Props) {
  const { t } = useTranslation();

  const handleUseForGeneration = (prompt: string) => {
    const sessionId = useSessionStore.getState().activeSessionId;
    if (!sessionId) return;
    const images = useGenerationStore.getState().attachments.map((a) => ({
      type: "base64" as const,
      data: a.data,
      media_type: a.media_type,
    }));
    useGenerationStore.getState().startGeneration(sessionId, prompt, undefined, images);
  };

  const handleEditAndUse = (prompt: string) => {
    // 将 prompt 填入输入框并关闭 AI 助手
    // 通过 custom event 通知 InputArea
    window.dispatchEvent(new CustomEvent("llm:edit-prompt", { detail: prompt }));
    useLLMChatStore.getState().toggleAI();
  };

  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
      {block.message && (
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>{block.message}</div>
      )}
      {block.items.map((item) => (
        <div
          key={item.id}
          style={{
            border: `1px solid ${item.recommended ? "var(--accent)" : "var(--border)"}`,
            borderRadius: "var(--radius-sm)",
            padding: 10,
            background: item.recommended ? "rgba(201,100,66,0.04)" : "var(--card-bg)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)" }}>
              {item.title}
            </span>
            {item.recommended && (
              <span
                style={{
                  fontSize: 10,
                  color: "var(--accent)",
                  background: "rgba(201,100,66,0.1)",
                  padding: "1px 6px",
                  borderRadius: 4,
                }}
              >
                {t("llm.recommended")}
              </span>
            )}
          </div>
          <p
            style={{
              fontSize: 11,
              color: "var(--muted)",
              margin: 0,
              lineHeight: 1.5,
              maxHeight: 48,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {item.prompt}
          </p>
          <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => handleEditAndUse(item.prompt)}
              style={{ fontSize: 11, padding: "3px 12px", background: "var(--card-bg)", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}
            >
              {t("llm.editAndUse")}
            </button>
            <button
              onClick={() => handleUseForGeneration(item.prompt)}
              style={{ fontSize: 11, padding: "3px 12px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500 }}
            >
              {t("llm.useForGeneration")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 实现 BufferingIndicator**

创建 `frontend/src/components/ChatPanel/BufferingIndicator.tsx`：

```tsx
import { useTranslation } from "react-i18next";

export default function BufferingIndicator() {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          borderRadius: "var(--radius-sm)",
          background: "rgba(201,100,66,0.06)",
          border: "1px dashed rgba(201,100,66,0.3)",
        }}
      >
        <div style={{ display: "flex", gap: 3 }}>
          {[0, 0.2, 0.4].map((delay, i) => (
            <div
              key={i}
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "var(--accent)",
                animation: `pulse 1.2s ease-in-out ${delay}s infinite`,
              }}
            />
          ))}
        </div>
        <span style={{ color: "var(--accent)", fontSize: 11, fontWeight: 500 }}>
          {t("llm.buffering")}
        </span>
      </div>
    </div>
  );
}
```

需要在 `globals.css` 中确认 `@keyframes pulse` 动画存在（如果没有则追加）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/ChatPanel/AiBlockRenderer.tsx frontend/src/components/ChatPanel/QuestionForm.tsx frontend/src/components/ChatPanel/SuggestionCards.tsx frontend/src/components/ChatPanel/BufferingIndicator.tsx
git commit -m "feat: 新增 ai_block 渲染组件组

- AiBlockRenderer: 根据 type 分发 questions/suggestions
- QuestionForm: 5 种 widget 渲染 + 必填校验 + 提交/跳过
- SuggestionCards: 推荐标签 + 采用生图/编辑后用按钮
- BufferingIndicator: 脉冲动画 + 缓冲提示文字"
```

---

### Task 14: ChatSessionBar 会话管理栏

**Files:**
- Create: `frontend/src/components/ChatPanel/ChatSessionBar.tsx`

- [ ] **Step 1: 实现 ChatSessionBar**

创建 `frontend/src/components/ChatPanel/ChatSessionBar.tsx`：

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLLMChatStore } from "../../stores/llmChatStore";
import { useSessionStore } from "../../stores/sessionStore";

export default function ChatSessionBar() {
  const { t } = useTranslation();
  const chatSessions = useLLMChatStore((s) => s.chatSessions);
  const currentChatSessionId = useLLMChatStore((s) => s.currentChatSessionId);
  const totalTokens = useLLMChatStore((s) => s.totalTokens);
  const panelExpanded = useLLMChatStore((s) => s.panelExpanded);
  const setPanelExpanded = useLLMChatStore((s) => s.setPanelExpanded);
  const selectChatSession = useLLMChatStore((s) => s.selectChatSession);
  const createChatSession = useLLMChatStore((s) => s.createChatSession);
  const deleteChatSession = useLLMChatStore((s) => s.deleteChatSession);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  const [showManage, setShowManage] = useState(false);

  const handleNew = async () => {
    if (activeSessionId) {
      await createChatSession(activeSessionId);
    }
  };

  const handleDelete = async (chatId: string) => {
    if (activeSessionId) {
      await deleteChatSession(chatId, activeSessionId);
    }
    setShowManage(false);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 10px",
        borderBottom: "1px solid var(--border-s)",
        fontSize: 12,
      }}
    >
      {/* 会话选择 */}
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
        {chatSessions.map((cs) => (
          <option key={cs.id} value={cs.id}>{cs.name}</option>
        ))}
      </select>

      {/* Token 统计 */}
      <span style={{ fontSize: 10, color: "var(--faint)", whiteSpace: "nowrap" }}>
        {t("llm.tokenCount", { count: totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens })}
      </span>

      {/* 新建 */}
      <button
        onClick={handleNew}
        style={{ fontSize: 11, padding: "2px 8px", background: "transparent", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", color: "var(--muted)" }}
      >
        + {t("llm.newChat")}
      </button>

      {/* 管理 */}
      <button
        onClick={() => setShowManage(!showManage)}
        style={{ fontSize: 11, padding: "2px 6px", background: "transparent", border: "none", cursor: "pointer", color: "var(--faint)" }}
      >
        {t("llm.manage")}
      </button>

      {/* 收起 */}
      <button
        onClick={() => setPanelExpanded(false)}
        style={{ fontSize: 11, padding: "2px 6px", background: "transparent", border: "none", cursor: "pointer", color: "var(--faint)" }}
      >
        {t("llm.collapse")}
      </button>

      {/* 管理面板（删除会话） */}
      {showManage && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 10,
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: 4,
            minWidth: 140,
            boxShadow: "0 4px 12px var(--card-shadow)",
            zIndex: 50,
          }}
        >
          {chatSessions.map((cs) => (
            <div
              key={cs.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "4px 8px",
                fontSize: 11,
              }}
            >
              <span style={{ color: "var(--muted)" }}>{cs.name}</span>
              <button
                onClick={() => handleDelete(cs.id)}
                style={{ fontSize: 10, color: "var(--error)", background: "none", border: "none", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/ChatPanel/ChatSessionBar.tsx
git commit -m "feat: 新增 ChatSessionBar 会话管理栏

- 会话下拉选择 + Token 统计 + 新建/管理/收起按钮
- 管理面板：删除聊天会话"
```

---

## Phase 5: 集成

### Task 15: InputArea 集成 AI 开关和聊天面板

**Files:**
- Modify: `frontend/src/components/InputArea.tsx`

- [ ] **Step 1: 在 InputArea 中集成 AI 功能**

修改 `frontend/src/components/InputArea.tsx`，需要做以下变更：

1. 在文件顶部 import 区追加：
```typescript
import AiToggle from "./AiToggle";
import ChatPanel from "./ChatPanel";
import { useLLMChatStore } from "../stores/llmChatStore";
```

2. 在组件函数体内的 store hooks 区追加：
```typescript
const aiEnabled = useLLMChatStore((s) => s.aiEnabled);
const sendMessage = useLLMChatStore((s) => s.sendMessage);
const panelExpanded = useLLMChatStore((s) => s.panelExpanded);
const setPanelExpanded = useLLMChatStore((s) => s.setPanelExpanded);
const currentChatSessionId = useLLMChatStore((s) => s.currentChatSessionId);
```

3. 在组件 return 中，**最顶部**（错误提示条之前）追加 ChatPanel：
```tsx
{aiEnabled && <ChatPanel />}
```

4. 在**工具栏行**中，`RatioSelector` 之后、`flex-1` span 之前插入 AiToggle：
```tsx
<AiToggle />
```

5. 修改 `handleGenerate` 逻辑，当 AI 开启时发送聊天消息而非触发生图：
```typescript
const handleSend = () => {
  if (!activeSessionId || !prompt.trim()) return;
  if (aiEnabled) {
    if (!currentChatSessionId) {
      // 自动创建聊天会话后发送
      useLLMChatStore.getState().createChatSession(activeSessionId).then(() => {
        useLLMChatStore.getState().sendMessage(prompt.trim());
      });
    } else {
      sendMessage(prompt.trim());
    }
    setPrompt("");
    return;
  }
  // 原有生图逻辑...
};
```

6. 修改 `handleKeyDown`：AI 开启时 Enter 直接发送，不需要 Ctrl：
```typescript
const handleKeyDown = (e: React.KeyboardEvent) => {
  if (aiEnabled) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  } else {
    // 原有 Ctrl+Enter 逻辑...
  }
};
```

7. 监听 `llm:edit-prompt` 事件（来自 SuggestionCards 的"编辑后用"按钮）：
```typescript
useEffect(() => {
  const handler = (e: Event) => setPrompt((e as CustomEvent).detail);
  window.addEventListener("llm:edit-prompt", handler);
  return () => window.removeEventListener("llm:edit-prompt", handler);
}, []);
```

8. 修改按钮文案和 placeholder：
```typescript
// textarea placeholder
placeholder={aiEnabled ? t("llm.placeholder") : t("input.placeholder")}

// 发送/生成按钮
{aiEnabled ? t("llm.send") : t("common.generate")}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/InputArea.tsx
git commit -m "feat: InputArea 集成 AI 开关和聊天面板

- ChatPanel 在 InputArea 顶部显示（AI 开启时）
- AiToggle 在工具栏右侧
- AI 模式：Enter 直接发送、placeholder 变更、按钮文案切换
- 监听 llm:edit-prompt 事件实现编辑后用功能"
```

---

### Task 16: SettingsDialog 集成 LLM 设置

**Files:**
- Modify: `frontend/src/components/SettingsDialog.tsx`

- [ ] **Step 1: 在 SettingsDialog 中添加 LLM 设置区域**

在 `frontend/src/components/SettingsDialog.tsx` 中：

1. import 区追加：
```typescript
import { getLLMSettings, updateLLMSettings } from "../services/api";
```

2. 在组件中追加 LLM 设置状态（与图片 API 设置平级）：
```typescript
const [llmSettings, setLLMSettings] = useState<{
  llm_api_key: string | null;
  llm_base_url: string | null;
  llm_model_name: string | null;
  llm_supports_vision: boolean | null;
  llm_system_prompt: string | null;
} | null>(null);

useEffect(() => {
  getLLMSettings().then(setLLMSettings).catch(() => {});
}, []);
```

3. 在模型名称字段之后、保存按钮之前，插入 LLM 设置区域：
```tsx
{/* 分隔线 */}
<div style={{ borderTop: "1px solid var(--border-s)", margin: "12px 0" }} />

{/* LLM AI 助手设置 */}
<div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginBottom: 8 }}>
  {t("llm.settingsTitle")}
</div>

{/* LLM API 密钥 */}
<div style={{ marginBottom: 10 }}>
  <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>
    {t("llm.apiKey")}
  </label>
  <input
    type="password"
    placeholder="sk-..."
    value={llmApiKey}
    onChange={(e) => setLLMApiKey(e.target.value)}
    style={inputStyle(!!llmKeyFocused)}
    onFocus={() => setLLMKeyFocused(true)}
    onBlur={() => setLLMKeyFocused(false)}
  />
</div>

{/* LLM 基础 URL */}
<div style={{ marginBottom: 10 }}>
  <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>
    {t("llm.baseUrl")}
  </label>
  <input
    type="text"
    placeholder="http://localhost:11434/v1"
    value={llmBaseUrl}
    onChange={(e) => setLLMBaseUrl(e.target.value)}
    style={inputStyle(!!llmUrlFocused)}
    onFocus={() => setLLMUrlFocused(true)}
    onBlur={() => setLLMUrlFocused(false)}
  />
</div>

{/* LLM 模型名称 */}
<div style={{ marginBottom: 10 }}>
  <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>
    {t("llm.modelName")}
  </label>
  <input
    type="text"
    placeholder="llama3.1:8b"
    value={llmModelName}
    onChange={(e) => setLLMModelName(e.target.value)}
    style={inputStyle(!!llmModelFocused)}
    onFocus={() => setLLMModelFocused(true)}
    onBlur={() => setLLMModelFocused(false)}
  />
</div>

{/* 图像识别支持 */}
<div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
  <input
    type="checkbox"
    checked={!!llmVision}
    onChange={(e) => setLLMVision(e.target.checked)}
  />
  <label style={{ fontSize: 11, color: "var(--muted)" }}>{t("llm.visionSupport")}</label>
</div>
```

4. 在保存按钮的 handler 中追加 LLM 设置保存：
```typescript
await updateLLMSettings({
  llm_api_key: llmApiKey || undefined,
  llm_base_url: llmBaseUrl || undefined,
  llm_model_name: llmModelName || undefined,
  llm_supports_vision: llmVision,
});
```

- [ ] **Step 2: 验证编译通过**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/SettingsDialog.tsx
git commit -m "feat: SettingsDialog 集成 LLM 设置区域

- 独立于图片 API 设置的 LLM 配置区域
- API 密钥、基础 URL、模型名称、图像识别支持开关
- 分隔线区分两个配置区域"
```

---

## 自审清单

### 1. 规格覆盖检查

| 规格要求 | 覆盖任务 |
|----------|----------|
| AI 助手开关（InputArea 右侧） | Task 11 + Task 15 |
| 聊天面板（折叠/展开/滚动） | Task 12 |
| 提问表单（5 种 widget + 必填校验） | Task 13 |
| 建议卡片（采用/编辑按钮） | Task 13 |
| AI 输出 JSON 协议（ai_block） | Task 3（解析）+ Task 7（SSE）+ Task 13（渲染） |
| SSE 流式事件（7 种类型） | Task 3 + Task 7 + Task 9 + Task 10 |
| 缓冲状态指示器 | Task 13（BufferingIndicator） |
| 数据模型（2 张表） | Task 1 |
| 后端 API（全部端点） | Task 4 + Task 5 + Task 6 + Task 7 |
| Token 统计（API usage + 估算） | Task 2 + Task 7 |
| LLM 设置（独立配置） | Task 4 + Task 16 |
| 聊天会话管理 | Task 5 + Task 14 |
| 消息编辑/删除（含批量） | Task 6 |
| 48h 软删除 + 撤销 | Task 6 |
| 输入区行为变化（placeholder/按钮/Enter） | Task 15 |
| i18n 翻译 | Task 8 |
| 附件处理（vision 检测 + 回退） | Task 3 |
| OpenAI 兼容协议 | Task 3 |

### 2. 占位符扫描

已检查，无 TBD / TODO / implement later / fill in details 等占位符。所有步骤包含具体代码。

### 3. 类型一致性检查

| 类型/函数 | 定义位置 | 使用位置 | 一致性 |
|-----------|----------|----------|--------|
| `LLMClient.chat_stream()` | Task 3 | Task 7 | ✅ 返回 `StreamEvent` |
| `StreamEvent.type` | Task 3 | Task 7, Task 10 | ✅ token/buffering/ai_block/usage/parse_warning/completed/error |
| `AiBlock` | Task 8 | Task 12, Task 13 | ✅ questions/suggestions 联合类型 |
| `LLMMessage` | Task 8 | Task 10, Task 12 | ✅ role/content/ai_block 等字段 |
| `sendLLMChat()` | Task 9 | Task 10 | ✅ handler 回调匹配 |
| `estimate_tokens()` | Task 2 | Task 7 | ✅ (text: str) -> int |
| `LLMClient.from_settings()` | Task 3 | Task 4 | ✅ settings dict → LLMClient |

### 4. 注意事项

- Task 9 的 `sendLLMChat` 需要确认现有 `connectSSE` 的 handler 签名。当前 `connectSSE` 接受 `SSEEventHandler`，需检查是否有 `onEvent(event, data)` 模式。如果没有，需要扩展 `connectSSE` 或写一个专用的 SSE 解析函数。
- Task 15 中 `handleSend` 的逻辑需要合并到现有的 `handleGenerate` 中，实际实现时需要仔细处理。
- Task 16 中需要添加额外的 useState 用于 LLM 设置字段的编辑状态。

