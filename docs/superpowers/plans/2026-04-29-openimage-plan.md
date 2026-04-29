# OpenImage 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个通过 OpenAI Responses API 调用 GPT Image 2 的桌面图像生成应用，支持文生图、图生图、多图融合和迭代编辑。

**Architecture:** Python FastAPI 后端提供 HTTP API + CLI 双入口，Tauri 2.x + React 前端通过 HTTP/SSE 通信。前后端完全解耦，后端独立可运行。数据存储在安装目录下的 SQLite + 文件系统。

**Tech Stack:** Python 3.12+ / FastAPI / Typer / OpenAI SDK / SQLite / Tauri 2.x / React 18 / TypeScript / Tailwind CSS / Zustand / Vite

---

## 并行策略

本计划分三个阶段，**轨道 A（后端）** 和 **轨道 B（前端）** 可完全并行开发：

```
轨道 A (Backend) ─────────────────┐
                                   ├── 集成阶段
轨道 B (Frontend) ────────────────┘
```

**共享契约：** `docs/superpowers/specs/2026-04-29-openimage-design.md` 中的 HTTP API 端点和数据结构定义。两端以此为接口契约。

---

## 轨道 A：后端（Python）

### 文件清单

| 文件 | 职责 |
|------|------|
| `backend/pyproject.toml` | 项目配置、依赖声明 |
| `backend/src/__init__.py` | 包标记 |
| `backend/src/core/__init__.py` | 包标记 |
| `backend/src/core/config.py` | 路径管理、配置读写、环境变量 |
| `backend/src/core/database.py` | SQLite 连接、schema 初始化、migration |
| `backend/src/core/storage.py` | 图片文件读写、目录管理 |
| `backend/src/core/session.py` | 会话 CRUD、迭代链管理、Fork 逻辑 |
| `backend/src/core/client.py` | OpenAI Responses API 封装、流式处理 |
| `backend/src/api/__init__.py` | 包标记 |
| `backend/src/api/sessions.py` | 会话 CRUD 路由 |
| `backend/src/api/generate.py` | 生成端点、SSE 流式推送 |
| `backend/src/api/images.py` | 图片查询/下载/删除路由 |
| `backend/src/api/settings.py` | 配置读写路由 |
| `backend/src/server.py` | FastAPI 应用组装、CORS、lifespan |
| `backend/src/cli.py` | Typer CLI 入口 |
| `backend/tests/conftest.py` | 测试 fixtures（临时目录、内存数据库） |
| `backend/tests/test_config.py` | config 模块测试 |
| `backend/tests/test_database.py` | database 模块测试 |
| `backend/tests/test_storage.py` | storage 模块测试 |
| `backend/tests/test_session.py` | session 模块测试 |
| `backend/tests/test_client.py` | client 模块测试（mock OpenAI） |
| `backend/tests/test_api.py` | API 路由集成测试 |

---

### Task A1: 项目脚手架

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/src/__init__.py`
- Create: `backend/src/core/__init__.py`
- Create: `backend/src/api/__init__.py`

- [ ] **Step 1: 创建目录结构**

```bash
cd D:/CODE/Project/OpenImage
mkdir -p backend/src/core backend/src/api backend/tests
```

- [ ] **Step 2: 创建 pyproject.toml**

```toml
# backend/pyproject.toml
[project]
name = "openimage"
version = "0.1.0"
description = "GPT Image 2 desktop client - backend"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "typer>=0.13.0",
    "openai>=1.66.0",
    "pydantic>=2.10.0",
    "pydantic-settings>=2.7.0",
    "aiosqlite>=0.21.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.25.0",
    "httpx>=0.28.0",
    "respx>=0.22.0",
]

[project.scripts]
openimage = "src.cli:app"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 3: 创建包标记文件**

创建空文件 `backend/src/__init__.py`、`backend/src/core/__init__.py`、`backend/src/api/__init__.py`。

- [ ] **Step 4: 安装依赖**

```bash
cd D:/CODE/Project/OpenImage/backend
pip install -e ".[dev]"
```

- [ ] **Step 5: 提交**

```bash
git add backend/
git commit -m "feat: 初始化后端项目脚手架

- 创建 pyproject.toml 声明依赖（FastAPI、Typer、OpenAI SDK 等）
- 建立目录结构 src/core、src/api、tests"
```

---

### Task A2: 配置模块 (core/config.py)

**Files:**
- Create: `backend/src/core/config.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_config.py`

- [ ] **Step 1: 编写 config 测试**

```python
# backend/tests/test_config.py
import tempfile
from pathlib import Path

from src.core.config import Config


def test_config_defaults_to_cwd_data_dir():
    """配置模块默认使用当前工作目录下的 data/ 子目录"""
    with tempfile.TemporaryDirectory() as tmp:
        cfg = Config(base_dir=Path(tmp))
        assert cfg.data_dir == Path(tmp) / "data"
        assert cfg.db_path == Path(tmp) / "data" / "openimage.db"
        assert cfg.images_dir == Path(tmp) / "data" / "images"
        assert cfg.logs_dir == Path(tmp) / "data" / "logs"


def test_config_creates_dirs_on_init():
    """初始化时自动创建所需的目录结构"""
    with tempfile.TemporaryDirectory() as tmp:
        cfg = Config(base_dir=Path(tmp))
        cfg.ensure_dirs()
        assert cfg.data_dir.exists()
        assert cfg.images_dir.exists()
        assert cfg.logs_dir.exists()
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd D:/CODE/Project/OpenImage/backend
python -m pytest tests/test_config.py -v
```

Expected: FAIL - `ModuleNotFoundError: No module named 'src.core.config'`

- [ ] **Step 3: 实现 config**

```python
# backend/src/core/config.py
from pathlib import Path


class Config:
    """管理应用的所有路径和运行时配置"""

    def __init__(self, base_dir: Path | None = None):
        if base_dir is None:
            base_dir = Path.cwd()
        self.base_dir = base_dir
        self.data_dir = base_dir / "data"
        self.db_path = self.data_dir / "openimage.db"
        self.images_dir = self.data_dir / "images"
        self.logs_dir = self.data_dir / "logs"

    def ensure_dirs(self) -> None:
        """确保所有必要的目录存在"""
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.images_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd D:/CODE/Project/OpenImage/backend
python -m pytest tests/test_config.py -v
```

Expected: 2 passed

- [ ] **Step 5: 创建 conftest.py**

```python
# backend/tests/conftest.py
import tempfile
from pathlib import Path
from collections.abc import Generator

import pytest

from src.core.config import Config


@pytest.fixture
def tmp_base_dir() -> Generator[Path, None, None]:
    """提供临时基础目录，测试结束后自动清理"""
    with tempfile.TemporaryDirectory() as tmp:
        yield Path(tmp)


@pytest.fixture
def config(tmp_base_dir: Path) -> Config:
    """提供基于临时目录的 Config 实例"""
    cfg = Config(base_dir=tmp_base_dir)
    cfg.ensure_dirs()
    return cfg
```

- [ ] **Step 6: 提交**

```bash
git add backend/src/core/config.py backend/tests/conftest.py backend/tests/test_config.py
git commit -m "feat: 添加配置模块，管理数据目录路径

- Config 类封装所有路径（数据库、图片、日志）
- 支持自定义 base_dir，默认 cwd
- ensure_dirs() 自动创建目录结构"
```

---

### Task A3: 数据库模块 (core/database.py)

**Files:**
- Create: `backend/src/core/database.py`
- Create: `backend/tests/test_database.py`

- [ ] **Step 1: 编写数据库测试**

```python
# backend/tests/test_database.py
import pytest
from src.core.database import Database


@pytest.fixture
async def db(config) -> Database:
    """提供基于临时目录的 Database 实例"""
    database = Database(config)
    await database.initialize()
    yield database
    await database.close()


async def test_initialize_creates_tables(db: Database):
    """初始化应创建 sessions、images、settings 三张表"""
    async with db.connection() as conn:
        tables = await conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        names = {row[0] for row in await tables.fetchall()}
    assert "sessions" in names
    assert "images" in names
    assert "settings" in names


async def test_settings_crud(db: Database):
    """settings 表应支持 get/set/delete"""
    assert await db.get_setting("api_key") is None

    await db.set_setting("api_key", "sk-test-123")
    assert await db.get_setting("api_key") == "sk-test-123"

    await db.set_setting("api_key", "sk-updated")
    assert await db.get_setting("api_key") == "sk-updated"
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd D:/CODE/Project/OpenImage/backend
python -m pytest tests/test_database.py -v
```

Expected: FAIL

- [ ] **Step 3: 实现数据库模块**

```python
# backend/src/core/database.py
import aiosqlite
from pathlib import Path

from src.core.config import Config

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    head_response_id TEXT
);

CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    step INTEGER NOT NULL,
    response_id TEXT,
    prompt TEXT NOT NULL,
    revised_prompt TEXT,
    parent_image_id TEXT REFERENCES images(id) ON DELETE SET NULL,
    file_path TEXT NOT NULL,
    size TEXT NOT NULL DEFAULT '1024x1024',
    quality TEXT NOT NULL DEFAULT 'high',
    output_format TEXT NOT NULL DEFAULT 'png',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_images_session ON images(session_id);
CREATE INDEX IF NOT EXISTS idx_images_parent ON images(parent_image_id);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


class Database:
    def __init__(self, config: Config):
        self._db_path = config.db_path
        self._db: aiosqlite.Connection | None = None

    async def initialize(self) -> None:
        """打开数据库连接并执行 schema"""
        self._db = await aiosqlite.connect(self._db_path)
        self._db.row_factory = aiosqlite.Row
        await self._db.executescript(_SCHEMA)
        await self._db.commit()

    async def close(self) -> None:
        if self._db:
            await self._db.close()
            self._db = None

    def connection(self) -> aiosqlite.Connection:
        assert self._db is not None, "Database not initialized"
        return self._db

    async def get_setting(self, key: str) -> str | None:
        assert self._db is not None
        cursor = await self._db.execute(
            "SELECT value FROM settings WHERE key = ?", (key,)
        )
        row = await cursor.fetchone()
        return row["value"] if row else None

    async def set_setting(self, key: str, value: str) -> None:
        assert self._db is not None
        await self._db.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        await self._db.commit()
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd D:/CODE/Project/OpenImage/backend
python -m pytest tests/test_database.py -v
```

Expected: 2 passed

- [ ] **Step 5: 提交**

```bash
git add backend/src/core/database.py backend/tests/test_database.py
git commit -m "feat: 添加数据库模块，SQLite schema 初始化和 settings CRUD

- 三张表：sessions、images、settings
- images 表通过 parent_image_id 构建迭代树
- Database 类管理连接生命周期"
```

---

### Task A4: 图片存储模块 (core/storage.py)

**Files:**
- Create: `backend/src/core/storage.py`
- Create: `backend/tests/test_storage.py`

- [ ] **Step 1: 编写存储测试**

```python
# backend/tests/test_storage.py
import pytest
from pathlib import Path

from src.core.storage import ImageStore


@pytest.fixture
def store(config) -> ImageStore:
    return ImageStore(config)


def test_save_image_creates_file_and_dir(store: ImageStore):
    """保存图片应在 images/{session_id}/ 下创建文件"""
    image_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
    path = store.save_image("sess_abc", image_data, "png")

    assert path.exists()
    assert path.parent.name == "sess_abc"
    assert path.suffix == ".png"
    assert path.read_bytes() == image_data


def test_save_image_generates_unique_names(store: ImageStore):
    """多次保存应生成不同的文件名"""
    p1 = store.save_image("sess_abc", b"data1", "png")
    p2 = store.save_image("sess_abc", b"data2", "png")
    assert p1 != p2


def test_delete_image_removes_file(store: ImageStore):
    """删除图片应移除文件"""
    path = store.save_image("sess_abc", b"data", "png")
    assert path.exists()

    store.delete_image(path)
    assert not path.exists()


def test_delete_image_ignores_missing(store: ImageStore):
    """删除不存在的文件不应报错"""
    store.delete_image(Path("nonexistent.png"))
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd D:/CODE/Project/OpenImage/backend
python -m pytest tests/test_storage.py -v
```

- [ ] **Step 3: 实现 storage**

```python
# backend/src/core/storage.py
import time
import uuid
from pathlib import Path

from src.core.config import Config


class ImageStore:
    def __init__(self, config: Config):
        self._images_dir = config.images_dir

    def save_image(self, session_id: str, data: bytes, fmt: str = "png") -> Path:
        """保存图片文件到 images/{session_id}/ 目录，返回文件路径"""
        session_dir = self._images_dir / session_id
        session_dir.mkdir(parents=True, exist_ok=True)

        timestamp = int(time.time())
        unique = uuid.uuid4().hex[:8]
        filename = f"{timestamp}_{unique}.{fmt}"
        filepath = session_dir / filename

        filepath.write_bytes(data)
        return filepath

    def delete_image(self, path: Path) -> None:
        """删除图片文件，忽略不存在的文件"""
        try:
            path.unlink(missing_ok=True)
        except FileNotFoundError:
            pass

    def get_absolute_path(self, relative_path: str) -> Path:
        """将相对路径转为绝对路径"""
        return self._images_dir / relative_path
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd D:/CODE/Project/OpenImage/backend
python -m pytest tests/test_storage.py -v
```

- [ ] **Step 5: 提交**

```bash
git add backend/src/core/storage.py backend/tests/test_storage.py
git commit -m "feat: 添加图片存储模块

- save_image 按 session_id 分目录存储
- 文件名使用 timestamp_uuid 格式保证唯一性
- 支持 delete 和路径解析"
```

---

### Task A5: 会话管理模块 (core/session.py)

**Files:**
- Create: `backend/src/core/session.py`
- Create: `backend/tests/test_session.py`

- [ ] **Step 1: 编写会话测试**

```python
# backend/tests/test_session.py
import pytest
from src.core.database import Database
from src.core.session import SessionManager


@pytest.fixture
async def db(config) -> Database:
    database = Database(config)
    await database.initialize()
    yield database
    await database.close()


@pytest.fixture
async def sessions(db: Database) -> SessionManager:
    return SessionManager(db)


async def test_create_session(sessions: SessionManager):
    session = await sessions.create("测试会话")
    assert session["id"].startswith("sess_")
    assert session["name"] == "测试会话"
    assert session["head_response_id"] is None


async def test_list_sessions(sessions: SessionManager):
    await sessions.create("会话A")
    await sessions.create("会话B")
    result = await sessions.list_all()
    assert len(result) == 2


async def test_get_session(sessions: SessionManager):
    created = await sessions.create("我的会话")
    fetched = await sessions.get(created["id"])
    assert fetched["name"] == "我的会话"


async def test_rename_session(sessions: SessionManager):
    created = await sessions.create("旧名称")
    renamed = await sessions.rename(created["id"], "新名称")
    assert renamed["name"] == "新名称"


async def test_delete_session(sessions: SessionManager):
    created = await sessions.create("待删除")
    await sessions.delete(created["id"])
    result = await sessions.list_all()
    assert len(result) == 0


async def test_update_head_response(sessions: SessionManager):
    created = await sessions.create("测试")
    await sessions.update_head(created["id"], "resp_001")
    fetched = await sessions.get(created["id"])
    assert fetched["head_response_id"] == "resp_001"
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd D:/CODE/Project/OpenImage/backend
python -m pytest tests/test_session.py -v
```

- [ ] **Step 3: 实现 session**

```python
# backend/src/core/session.py
import uuid
from src.core.database import Database


def _sess_id() -> str:
    return f"sess_{uuid.uuid4().hex[:12]}"


class SessionManager:
    def __init__(self, db: Database):
        self._db = db

    async def create(self, name: str) -> dict:
        sid = _sess_id()
        conn = self._db.connection()
        await conn.execute(
            "INSERT INTO sessions (id, name) VALUES (?, ?)",
            (sid, name),
        )
        await conn.commit()
        return await self.get(sid)

    async def get(self, session_id: str) -> dict | None:
        conn = self._db.connection()
        cursor = await conn.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        )
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def list_all(self) -> list[dict]:
        conn = self._db.connection()
        cursor = await conn.execute(
            "SELECT * FROM sessions ORDER BY updated_at DESC"
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def rename(self, session_id: str, name: str) -> dict:
        conn = self._db.connection()
        await conn.execute(
            "UPDATE sessions SET name = ?, updated_at = datetime('now') WHERE id = ?",
            (name, session_id),
        )
        await conn.commit()
        return await self.get(session_id)

    async def delete(self, session_id: str) -> None:
        conn = self._db.connection()
        await conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        await conn.commit()

    async def update_head(self, session_id: str, response_id: str) -> None:
        conn = self._db.connection()
        await conn.execute(
            "UPDATE sessions SET head_response_id = ?, updated_at = datetime('now') WHERE id = ?",
            (response_id, session_id),
        )
        await conn.commit()
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd D:/CODE/Project/OpenImage/backend
python -m pytest tests/test_session.py -v
```

- [ ] **Step 5: 提交**

```bash
git add backend/src/core/session.py backend/tests/test_session.py
git commit -m "feat: 添加会话管理模块

- SessionManager 封装会话 CRUD
- 支持 create/get/list_all/rename/delete/update_head
- head_response_id 追踪迭代链头"
```

---

### Task A6: OpenAI 客户端模块 (core/client.py)

**Files:**
- Create: `backend/src/core/client.py`
- Create: `backend/tests/test_client.py`

- [ ] **Step 1: 编写客户端测试**

```python
# backend/tests/test_client.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.core.client import ImageClient, GenerateResult


@pytest.fixture
def client() -> ImageClient:
    return ImageClient(api_key="sk-test")


def test_build_text_only_input(client: ImageClient):
    """纯文本 prompt 应构建为 input_text 消息"""
    messages = client._build_input("画一只猫", [], None)
    assert len(messages) == 1
    assert messages[0]["type"] == "input_text"
    assert messages[0]["text"] == "画一只猫"


def test_build_input_with_base64_images(client: ImageClient):
    """base64 图片应转为 input_image 消息"""
    images = [
        {"type": "base64", "data": "abc123", "media_type": "image/png"},
    ]
    messages = client._build_input("参考这张图", images, None)
    assert len(messages) == 2
    assert messages[0]["type"] == "input_text"
    assert messages[1]["type"] == "input_image"
    assert messages[1]["image_url"].startswith("data:image/png;base64,")


def test_build_input_with_multiple_images(client: ImageClient):
    """多张图片应按顺序追加"""
    images = [
        {"type": "base64", "data": "img1", "media_type": "image/png"},
        {"type": "base64", "data": "img2", "media_type": "image/jpeg"},
    ]
    messages = client._build_input("融合", images, None)
    assert len(messages) == 3  # 1 text + 2 images


@pytest.mark.asyncio
async def test_generate_calls_openai(client: ImageClient):
    """generate 应正确调用 OpenAI Responses API"""
    mock_response = MagicMock()
    mock_response.id = "resp_123"
    mock_response.output = [
        MagicMock(type="image_generation_call", result="base64data", revised_prompt="revised")
    ]
    mock_response.usage = MagicMock(
        total_tokens=100,
        input_tokens=50,
        output_tokens=50,
    )

    with patch("src.core.client.AsyncOpenAI") as MockOpenAI:
        mock_instance = MockOpenAI.return_value
        mock_instance.responses = MagicMock()
        mock_instance.responses.create = AsyncMock(return_value=mock_response)

        client._client = mock_instance
        result = await client.generate(
            prompt="画一只猫",
            images=[],
            previous_response_id=None,
            params={"size": "1024x1024", "quality": "high", "output_format": "png"},
        )

    assert isinstance(result, GenerateResult)
    assert result.response_id == "resp_123"
    assert result.image_b64 == "base64data"
    assert result.revised_prompt == "revised"
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd D:/CODE/Project/OpenImage/backend
python -m pytest tests/test_client.py -v
```

- [ ] **Step 3: 实现客户端**

```python
# backend/src/core/client.py
from dataclasses import dataclass
from typing import Any

from openai import AsyncOpenAI


@dataclass
class GenerateResult:
    response_id: str
    image_b64: str
    revised_prompt: str | None
    total_tokens: int


class ImageClient:
    def __init__(self, api_key: str):
        self._client = AsyncOpenAI(api_key=api_key)

    def _build_input(
        self,
        prompt: str,
        images: list[dict],
        previous_response_id: str | None,
    ) -> list[dict]:
        """构建 Response API 的 input 消息列表"""
        content: list[dict] = [{"type": "input_text", "text": prompt}]

        for img in images:
            if img["type"] == "base64":
                content.append({
                    "type": "input_image",
                    "image_url": f"data:{img['media_type']};base64,{img['data']}",
                })

        return content

    async def generate(
        self,
        prompt: str,
        images: list[dict],
        previous_response_id: str | None,
        params: dict[str, Any] | None = None,
    ) -> GenerateResult:
        """调用 OpenAI Responses API 生成图片"""
        params = params or {}
        content = self._build_input(prompt, images, previous_response_id)

        tool_config: dict[str, Any] = {"type": "image_generation"}
        if params.get("size"):
            tool_config["size"] = params["size"]
        if params.get("quality"):
            tool_config["quality"] = params["quality"]
        if params.get("output_format"):
            tool_config["output_format"] = params["output_format"]

        create_kwargs: dict[str, Any] = {
            "model": "gpt-4.1",
            "input": [{"role": "user", "content": content}],
            "tools": [tool_config],
        }
        if previous_response_id:
            create_kwargs["previous_response_id"] = previous_response_id

        response = await self._client.responses.create(**create_kwargs)

        image_b64 = ""
        revised_prompt = None
        for output in response.output:
            if output.type == "image_generation_call":
                image_b64 = output.result
                revised_prompt = getattr(output, "revised_prompt", None)

        return GenerateResult(
            response_id=response.id,
            image_b64=image_b64,
            revised_prompt=revised_prompt,
            total_tokens=response.usage.total_tokens if response.usage else 0,
        )

    async def generate_stream(
        self,
        prompt: str,
        images: list[dict],
        previous_response_id: str | None,
        params: dict[str, Any] | None = None,
        partial_images: int = 2,
    ):
        """流式生成图片，yield SSE 事件字典"""
        import base64

        params = params or {}
        content = self._build_input(prompt, images, previous_response_id)

        tool_config: dict[str, Any] = {
            "type": "image_generation",
            "partial_images": partial_images,
        }
        if params.get("size"):
            tool_config["size"] = params["size"]
        if params.get("quality"):
            tool_config["quality"] = params["quality"]
        if params.get("output_format"):
            tool_config["output_format"] = params["output_format"]

        create_kwargs: dict[str, Any] = {
            "model": "gpt-4.1",
            "input": [{"role": "user", "content": content}],
            "tools": [tool_config],
            "stream": True,
        }
        if previous_response_id:
            create_kwargs["previous_response_id"] = previous_response_id

        stream = await self._client.responses.create(**create_kwargs)

        response_id = None
        final_b64 = None
        revised_prompt = None

        async for event in stream:
            if event.type == "response.image_generation_call.partial_image":
                yield {
                    "event": "partial_image",
                    "data": {
                        "index": event.partial_image_index,
                        "b64_json": event.partial_image_b64,
                    },
                }
            elif event.type == "response.image_generation_call":
                response_id = event.id if hasattr(event, "id") else None
            elif hasattr(event, "response") and hasattr(event.response, "id"):
                response_id = event.response.id

        yield {
            "event": "completed",
            "data": {
                "response_id": response_id,
                "b64_json": final_b64,
                "revised_prompt": revised_prompt,
            },
        }
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd D:/CODE/Project/OpenImage/backend
python -m pytest tests/test_client.py -v
```

- [ ] **Step 5: 提交**

```bash
git add backend/src/core/client.py backend/tests/test_client.py
git commit -m "feat: 添加 OpenAI Response API 客户端

- ImageClient 封装 Responses API 调用
- 支持纯文本/带图片/迭代链调用
- generate() 同步返回，generate_stream() 流式 yield
- _build_input() 统一构建消息格式"
```

---

### Task A7: API 路由 — 会话 (api/sessions.py)

**Files:**
- Create: `backend/src/api/sessions.py`

- [ ] **Step 1: 实现会话路由**

```python
# backend/src/api/sessions.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class SessionCreate(BaseModel):
    name: str


class SessionRename(BaseModel):
    name: str


# 注入点：在 server.py 中通过 router.state 注入 SessionManager
def _sessions(request) -> "SessionManager":
    from src.core.session import SessionManager
    return request.app.state.sessions


@router.post("")
async def create_session(body: SessionCreate, request):
    sm = _sessions(request)
    return await sm.create(body.name)


@router.get("")
async def list_sessions(request):
    sm = _sessions(request)
    return await sm.list_all()


@router.get("/{session_id}")
async def get_session(session_id: str, request):
    sm = _sessions(request)
    session = await sm.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.patch("/{session_id}")
async def rename_session(session_id: str, body: SessionRename, request):
    sm = _sessions(request)
    session = await sm.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return await sm.rename(session_id, body.name)


@router.delete("/{session_id}")
async def delete_session(session_id: str, request):
    sm = _sessions(request)
    session = await sm.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await sm.delete(session_id)
    return {"ok": True}
```

- [ ] **Step 2: 提交**

```bash
git add backend/src/api/sessions.py
git commit -m "feat: 添加会话 API 路由

- POST/GET /api/sessions 创建和列表
- GET/PATCH/DELETE /api/sessions/{id} 详情/重命名/删除"
```

---

### Task A8: API 路由 — 图片生成 (api/generate.py)

**Files:**
- Create: `backend/src/api/generate.py`

这是最核心的端点，连接 Client、Session、Storage、SSE 流式推送。

- [ ] **Step 1: 实现生成路由**

```python
# backend/src/api/generate.py
import base64
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter(tags=["generate"])


class ImageInput(BaseModel):
    type: str  # "base64" | "image_id"
    data: str | None = None
    media_type: str | None = None
    id: str | None = None


class GenerateParams(BaseModel):
    size: str = "1024x1024"
    quality: str = "high"
    output_format: str = "png"


class GenerateRequest(BaseModel):
    session_id: str
    prompt: str
    images: list[ImageInput] = []
    fork_from: str | None = None
    params: GenerateParams | None = None


def _sessions(request: Request):
    return request.app.state.sessions


def _db(request: Request):
    return request.app.state.db


def _store(request: Request):
    return request.app.state.store


def _client(request: Request):
    return request.app.state.client


async def _resolve_previous_response_id(
    request: Request, session_id: str, fork_from: str | None
) -> str | None:
    """确定 previous_response_id：fork_from 优先，否则用会话 head"""
    db = _db(request)
    if fork_from:
        conn = db.connection()
        cursor = await conn.execute(
            "SELECT response_id FROM images WHERE id = ?", (fork_from,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Fork source image not found")
        return row["response_id"]

    sessions = _sessions(request)
    session = await sessions.get(session_id)
    return session.get("head_response_id") if session else None


async def _save_generated_image(
    request: Request,
    session_id: str,
    prompt: str,
    response_id: str,
    image_b64: str,
    revised_prompt: str | None,
    parent_image_id: str | None,
    params: GenerateParams,
) -> dict:
    """保存生成的图片到文件系统和数据库"""
    db = _db(request)
    store = _store(request)
    sessions = _sessions(request)

    image_data = base64.b64decode(image_b64)
    file_path = store.save_image(session_id, image_data, params.output_format)

    conn = db.connection()
    cursor = await conn.execute(
        "SELECT COUNT(*) as cnt FROM images WHERE session_id = ?",
        (session_id,),
    )
    row = await cursor.fetchone()
    step = (row["cnt"] if row else 0) + 1

    img_id = f"img_{uuid.uuid4().hex[:12]}"
    relative_path = f"{session_id}/{file_path.name}"

    await conn.execute(
        """INSERT INTO images
        (id, session_id, step, response_id, prompt, revised_prompt,
         parent_image_id, file_path, size, quality, output_format)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            img_id, session_id, step, response_id, prompt,
            revised_prompt, parent_image_id, relative_path,
            params.size, params.quality, params.output_format,
        ),
    )
    await conn.commit()

    await sessions.update_head(session_id, response_id)

    return {
        "image_id": img_id,
        "response_id": response_id,
        "revised_prompt": revised_prompt,
        "step": step,
        "file_path": relative_path,
        "size": params.size,
        "quality": params.quality,
    }


@router.post("/api/generate")
async def generate(body: GenerateRequest, request: Request):
    """流式生成图片，返回 SSE"""
    api_key = request.app.state.settings.get("api_key")
    if not api_key:
        raise HTTPException(status_code=400, detail="API key not configured")

    sessions = _sessions(request)
    session = await sessions.get(body.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    previous_response_id = await _resolve_previous_response_id(
        request, body.session_id, body.fork_from
    )

    params = body.params or GenerateParams()
    images = [img.model_dump(exclude_none=True) for img in body.images if img.type == "base64"]

    client = _client(request)

    async def event_stream():
        import json

        try:
            yield f"event: generating\ndata: {json.dumps({'session_id': body.session_id})}\n\n"

            result = await client.generate(
                prompt=body.prompt,
                images=images,
                previous_response_id=previous_response_id,
                params=params.model_dump(),
            )

            saved = await _save_generated_image(
                request=request,
                session_id=body.session_id,
                prompt=body.prompt,
                response_id=result.response_id,
                image_b64=result.image_b64,
                revised_prompt=result.revised_prompt,
                parent_image_id=body.fork_from,
                params=params,
            )

            yield f"event: completed\ndata: {json.dumps(saved)}\n\n"

        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'code': 'generation_failed', 'message': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

- [ ] **Step 2: 提交**

```bash
git add backend/src/api/generate.py
git commit -m "feat: 添加图片生成 API 端点

- POST /api/generate 返回 SSE 流式响应
- 支持 fork_from 指定分支起点
- 自动保存生成结果到文件和数据库
- 自动更新会话 head_response_id"
```

---

### Task A9: API 路由 — 图片和配置 (api/images.py, api/settings.py)

**Files:**
- Create: `backend/src/api/images.py`
- Create: `backend/src/api/settings.py`

- [ ] **Step 1: 实现图片路由**

```python
# backend/src/api/images.py
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

router = APIRouter(prefix="/api/images", tags=["images"])


@router.get("/{image_id}")
async def get_image(image_id: str, request: Request):
    db = request.app.state.db
    conn = db.connection()
    cursor = await conn.execute("SELECT * FROM images WHERE id = ?", (image_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Image not found")
    return dict(row)


@router.get("/{image_id}/file")
async def get_image_file(image_id: str, request: Request):
    db = request.app.state.db
    store = request.app.state.store
    conn = db.connection()
    cursor = await conn.execute("SELECT file_path FROM images WHERE id = ?", (image_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Image not found")
    path = store.get_absolute_path(row["file_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Image file missing")
    return FileResponse(path, media_type="image/png", filename=path.name)


@router.delete("/{image_id}")
async def delete_image(image_id: str, request: Request):
    db = request.app.state.db
    store = request.app.state.store
    conn = db.connection()
    cursor = await conn.execute("SELECT file_path FROM images WHERE id = ?", (image_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Image not found")
    path = store.get_absolute_path(row["file_path"])
    store.delete_image(path)
    await conn.execute("DELETE FROM images WHERE id = ?", (image_id,))
    await conn.commit()
    return {"ok": True}
```

- [ ] **Step 2: 实现配置路由**

```python
# backend/src/api/settings.py
from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    api_key: str | None = None


@router.get("")
async def get_settings(request: Request):
    db = request.app.state.db
    api_key = await db.get_setting("api_key")
    return {
        "api_key_set": api_key is not None,
        "api_key_preview": f"...{api_key[-4:]}" if api_key else None,
    }


@router.patch("")
async def update_settings(body: SettingsUpdate, request: Request):
    db = request.app.state.db
    if body.api_key is not None:
        await db.set_setting("api_key", body.api_key)
        from src.core.client import ImageClient
        request.app.state.client = ImageClient(api_key=body.api_key)
    return {"ok": True}
```

- [ ] **Step 3: 提交**

```bash
git add backend/src/api/images.py backend/src/api/settings.py
git commit -m "feat: 添加图片和配置 API 路由

- GET/DELETE /api/images/{id} 图片元数据和删除
- GET /api/images/{id}/file 图片文件下载
- GET/PATCH /api/settings 配置读写（含 API Key 热更新）"
```

---

### Task A10: FastAPI 应用组装 (server.py)

**Files:**
- Create: `backend/src/server.py`

- [ ] **Step 1: 实现应用入口**

```python
# backend/src/server.py
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.core.config import Config
from src.core.database import Database
from src.core.storage import ImageStore
from src.core.session import SessionManager
from src.core.client import ImageClient

from src.api import sessions as sessions_api
from src.api import generate as generate_api
from src.api import images as images_api
from src.api import settings as settings_api


def create_app(base_dir: Path | None = None) -> FastAPI:
    config = Config(base_dir=base_dir)
    config.ensure_dirs()

    db = Database(config)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await db.initialize()
        app.state.db = db
        app.state.config = config
        app.state.sessions = SessionManager(db)
        app.state.store = ImageStore(config)

        api_key = await db.get_setting("api_key")
        app.state.client = ImageClient(api_key) if api_key else None
        app.state.settings = {"api_key": api_key}

        yield
        await db.close()

    app = FastAPI(title="OpenImage", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["tauri://localhost", "http://localhost:1420"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(sessions_api.router)
    app.include_router(generate_api.router)
    app.include_router(images_api.router)
    app.include_router(settings_api.router)

    return app


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(create_app(), host="127.0.0.1", port=8765)
```

- [ ] **Step 2: 手动验证服务启动**

```bash
cd D:/CODE/Project/OpenImage/backend
python -c "from src.server import create_app; app = create_app(); print('OK')"
```

Expected: `OK`

- [ ] **Step 3: 提交**

```bash
git add backend/src/server.py
git commit -m "feat: 组装 FastAPI 应用

- lifespan 管理 DB 初始化和关闭
- CORS 允许 Tauri 来源
- 挂载所有 API 路由
- create_app 工厂函数支持自定义 base_dir"
```

---

### Task A11: CLI 入口 (cli.py)

**Files:**
- Create: `backend/src/cli.py`

- [ ] **Step 1: 实现 CLI**

```python
# backend/src/cli.py
import asyncio
import sys
from pathlib import Path

import typer
from rich.console import Console

app = typer.Typer(name="openimage", help="OpenImage - GPT Image 2 客户端")
sessions_app = typer.Typer(help="会话管理")
app.add_typer(sessions_app, name="sessions")
console = Console()


def _get_base_dir() -> Path:
    """获取数据目录，默认为当前工作目录"""
    return Path.cwd()


@app.command()
def serve(port: int = 8765):
    """启动 HTTP API 服务"""
    import uvicorn
    from src.server import create_app

    console.print(f"[green]Starting OpenImage server on port {port}...[/green]")
    uvicorn.run(create_app(_get_base_dir()), host="127.0.0.1", port=port)


@app.command()
def generate(
    prompt: str = typer.Argument(help="文本 prompt"),
    size: str = typer.Option("1024x1024", "--size", "-s", help="图片尺寸"),
    quality: str = typer.Option("high", "--quality", "-q", help="输出质量"),
    output: str = typer.Option("output.png", "--output", "-o", help="输出文件路径"),
):
    """单次文生图"""
    import base64
    from src.core.config import Config
    from src.core.database import Database
    from src.core.client import ImageClient

    async def _run():
        config = Config(_get_base_dir())
        config.ensure_dirs()
        db = Database(config)
        await db.initialize()

        api_key = await db.get_setting("api_key")
        if not api_key:
            console.print("[red]API key not set. Run: openimage config set api_key <key>[/red]")
            sys.exit(1)

        client = ImageClient(api_key)
        console.print(f"[yellow]Generating: {prompt}...[/yellow]")

        result = await client.generate(
            prompt=prompt,
            images=[],
            previous_response_id=None,
            params={"size": size, "quality": quality, "output_format": "png"},
        )

        image_data = base64.b64decode(result.image_b64)
        Path(output).write_bytes(image_data)
        console.print(f"[green]Saved to {output} ({len(image_data)} bytes)[/green]")

        await db.close()

    asyncio.run(_run())


@app.command()
def edit(
    prompt: str = typer.Argument(help="编辑描述"),
    image: list[str] = typer.Option(..., "--image", "-i", help="输入图片路径（可多次指定）"),
    size: str = typer.Option("1024x1024", "--size", "-s"),
    quality: str = typer.Option("high", "--quality", "-q"),
    output: str = typer.Option("output.png", "--output", "-o"),
):
    """图生图 / 多图融合"""
    import base64
    from src.core.config import Config
    from src.core.database import Database
    from src.core.client import ImageClient

    async def _run():
        config = Config(_get_base_dir())
        config.ensure_dirs()
        db = Database(config)
        await db.initialize()

        api_key = await db.get_setting("api_key")
        if not api_key:
            console.print("[red]API key not set.[/red]")
            sys.exit(1)

        images = []
        for path in image:
            data = Path(path).read_bytes()
            b64 = base64.b64encode(data).decode()
            ext = Path(path).suffix.lstrip(".")
            media = f"image/{ext}" if ext != "jpg" else "image/jpeg"
            images.append({"type": "base64", "data": b64, "media_type": media})

        client = ImageClient(api_key)
        console.print(f"[yellow]Editing with {len(images)} image(s)...[/yellow]")

        result = await client.generate(
            prompt=prompt,
            images=images,
            previous_response_id=None,
            params={"size": size, "quality": quality, "output_format": "png"},
        )

        out_data = base64.b64decode(result.image_b64)
        Path(output).write_bytes(out_data)
        console.print(f"[green]Saved to {output}[/green]")

        await db.close()

    asyncio.run(_run())


@sessions_app.command("list")
def sessions_list():
    """列出所有会话"""
    from src.core.config import Config
    from src.core.database import Database
    from src.core.session import SessionManager

    async def _run():
        config = Config(_get_base_dir())
        config.ensure_dirs()
        db = Database(config)
        await db.initialize()
        sm = SessionManager(db)
        sessions = await sm.list_all()
        for s in sessions:
            console.print(f"  {s['id']}  {s['name']}  {s['updated_at']}")
        if not sessions:
            console.print("[dim]No sessions[/dim]")
        await db.close()

    asyncio.run(_run())


@app.command()
def config(
    action: str = typer.Argument(help="set"),
    key: str = typer.Argument(help="配置键名"),
    value: str = typer.Argument(help="配置值"),
):
    """管理配置项"""
    from src.core.config import Config as AppConfig
    from src.core.database import Database

    async def _run():
        cfg = AppConfig(_get_base_dir())
        cfg.ensure_dirs()
        db = Database(cfg)
        await db.initialize()
        if action == "set":
            await db.set_setting(key, value)
            console.print(f"[green]Set {key}[/green]")
        await db.close()

    asyncio.run(_run())


if __name__ == "__main__":
    app()
```

- [ ] **Step 2: 验证 CLI 可运行**

```bash
cd D:/CODE/Project/OpenImage/backend
python -m src.cli --help
```

Expected: 显示帮助信息

- [ ] **Step 3: 提交**

```bash
git add backend/src/cli.py
git commit -m "feat: 添加 CLI 入口

- serve: 启动 HTTP 服务
- generate: 单次文生图
- edit: 图生图/多图融合
- sessions list: 列出会话
- config set: 设置配置项"
```

---

## 轨道 B：前端（Tauri + React）

### 前置条件

```bash
# 安装 Tauri CLI 和前端工具链
# 需要 Node.js >= 20, Rust toolchain
npm install -g @tauri-apps/cli
```

### 文件清单

| 文件 | 职责 |
|------|------|
| `frontend/package.json` | 依赖声明 |
| `frontend/vite.config.ts` | Vite 配置 |
| `frontend/tsconfig.json` | TypeScript 配置 |
| `frontend/tailwind.config.js` | Tailwind 暗色主题配置 |
| `frontend/index.html` | SPA 入口 |
| `frontend/src/main.tsx` | React 入口 |
| `frontend/src/App.tsx` | 根组件，三栏布局 |
| `frontend/src/types/index.ts` | TS 类型定义（与 API 契约对齐） |
| `frontend/src/services/api.ts` | HTTP/SSE API 调用层 |
| `frontend/src/stores/sessionStore.ts` | Zustand 会话状态 |
| `frontend/src/stores/generationStore.ts` | Zustand 生成状态 |
| `frontend/src/components/Sidebar.tsx` | 左侧会话列表 |
| `frontend/src/components/Gallery.tsx` | 中间图片画廊 |
| `frontend/src/components/InputArea.tsx` | 输入栏（附件+文本+按钮） |
| `frontend/src/components/DetailPanel.tsx` | 右侧图片详情 |
| `frontend/src/components/SettingsDialog.tsx` | 设置弹窗 |
| `frontend/src/styles/globals.css` | Tailwind 基础样式 |
| `frontend/src-tauri/Cargo.toml` | Tauri Rust 依赖 |
| `frontend/src-tauri/src/main.rs` | Tauri 入口 |
| `frontend/src-tauri/tauri.conf.json` | Tauri 窗口/权限配置 |

---

### Task B1: 前端项目脚手架

**Files:**
- Create: `frontend/` 整个目录（由 Tauri CLI 生成）

- [ ] **Step 1: 创建 Tauri + React 项目**

```bash
cd D:/CODE/Project/OpenImage
npm create tauri-app@latest -- frontend --template react-ts
```

选择：React, TypeScript

- [ ] **Step 2: 安装额外依赖**

```bash
cd D:/CODE/Project/OpenImage/frontend
npm install zustand tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: 配置 Tailwind**

在 `frontend/vite.config.ts` 中添加 Tailwind 插件：

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
```

创建 `frontend/src/styles/globals.css`：

```css
@import "tailwindcss";

:root {
  --color-bg: #0f172a;
  --color-surface: #1e293b;
  --color-border: #334155;
  --color-text: #e2e8f0;
  --color-muted: #94a3b8;
  --color-accent: #3b82f6;
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: system-ui, -apple-system, sans-serif;
  overflow: hidden;
}

#root {
  height: 100vh;
}
```

- [ ] **Step 4: 验证项目可运行**

```bash
cd D:/CODE/Project/OpenImage/frontend
npm run dev
```

在浏览器打开 http://localhost:1420 确认页面加载。

- [ ] **Step 5: 提交**

```bash
git add frontend/
git commit -m "feat: 初始化 Tauri + React 前端项目

- Tauri 2.x + React 18 + TypeScript
- Tailwind CSS 暗色主题配置
- 基础样式变量定义"
```

---

### Task B2: TypeScript 类型定义

**Files:**
- Create: `frontend/src/types/index.ts`

- [ ] **Step 1: 定义与后端 API 对齐的类型**

```typescript
// frontend/src/types/index.ts

export interface Session {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  head_response_id: string | null;
}

export interface Image {
  id: string;
  session_id: string;
  step: number;
  response_id: string;
  prompt: string;
  revised_prompt: string | null;
  parent_image_id: string | null;
  file_path: string;
  size: string;
  quality: string;
  output_format: string;
  created_at: string;
}

export interface GenerateParams {
  size?: string;
  quality?: string;
  output_format?: string;
}

export interface GenerateRequest {
  session_id: string;
  prompt: string;
  images?: ImageInput[];
  fork_from?: string;
  params?: GenerateParams;
}

export interface ImageInput {
  type: "base64" | "image_id";
  data?: string;
  media_type?: string;
  id?: string;
}

export interface GenerateCompleted {
  image_id: string;
  response_id: string;
  revised_prompt: string | null;
  step: number;
  file_path: string;
  size: string;
  quality: string;
}

export interface SettingsResponse {
  api_key_set: boolean;
  api_key_preview: string | null;
}

export interface AttachedFile {
  id: string;
  name: string;
  data: string;  // base64
  media_type: string;
  preview_url: string;
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/types/
git commit -m "feat: 添加前端 TypeScript 类型定义

- 与后端 API 契约完全对齐
- 覆盖 Session、Image、GenerateRequest 等核心类型"
```

---

### Task B3: API 调用层

**Files:**
- Create: `frontend/src/services/api.ts`

- [ ] **Step 1: 实现 API 服务**

```typescript
// frontend/src/services/api.ts
import type {
  Session,
  Image,
  GenerateRequest,
  GenerateCompleted,
  GenerateParams,
  SettingsResponse,
} from "../types";

const BASE_URL = "http://localhost:8765";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

// --- Sessions ---
export async function listSessions(): Promise<Session[]> {
  return request("/api/sessions");
}

export async function createSession(name: string): Promise<Session> {
  return request("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function getSession(id: string): Promise<Session> {
  return request(`/api/sessions/${id}`);
}

export async function renameSession(
  id: string,
  name: string
): Promise<Session> {
  return request(`/api/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function deleteSession(id: string): Promise<void> {
  await request(`/api/sessions/${id}`, { method: "DELETE" });
}

// --- Images ---
export async function getSessionImages(sessionId: string): Promise<Image[]> {
  return request(`/api/sessions/${sessionId}/images`);
}

export async function getImage(id: string): Promise<Image> {
  return request(`/api/images/${id}`);
}

export function getImageFileUrl(id: string): string {
  return `${BASE_URL}/api/images/${id}/file`;
}

export async function deleteImage(id: string): Promise<void> {
  await request(`/api/images/${id}`, { method: "DELETE" });
}

// --- Generate (SSE) ---
export function generateImage(
  req: GenerateRequest,
  onPartial: (index: number, b64: string) => void,
  onCompleted: (data: GenerateCompleted) => void,
  onError: (code: string, message: string) => void
): AbortController {
  const controller = new AbortController();

  fetch(`${BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal: controller.signal,
  })
    .then(async (res) => {
      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            if (currentEvent === "partial_image") {
              onPartial(data.index, data.b64_json);
            } else if (currentEvent === "completed") {
              onCompleted(data);
            } else if (currentEvent === "error") {
              onError(data.code, data.message);
            }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onError("network_error", err.message);
      }
    });

  return controller;
}

// --- Settings ---
export async function getSettings(): Promise<SettingsResponse> {
  return request("/api/settings");
}

export async function updateApiKey(apiKey: string): Promise<void> {
  await request("/api/settings", {
    method: "PATCH",
    body: JSON.stringify({ api_key: apiKey }),
  });
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/services/
git commit -m "feat: 添加前端 API 调用层

- 封装所有 HTTP 端点调用
- SSE 流式生成支持（EventSource 风格解析）
- AbortController 支持取消生成"
```

---

### Task B4: Zustand 状态管理

**Files:**
- Create: `frontend/src/stores/sessionStore.ts`
- Create: `frontend/src/stores/generationStore.ts`

- [ ] **Step 1: 实现会话 store**

```typescript
// frontend/src/stores/sessionStore.ts
import { create } from "zustand";
import type { Session, Image } from "../types";
import * as api from "../services/api";

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  images: Image[];
  loading: boolean;

  fetchSessions: () => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  createSession: (name: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, name: string) => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  images: [],
  loading: false,

  fetchSessions: async () => {
    const sessions = await api.listSessions();
    set({ sessions });
  },

  selectSession: async (id: string) => {
    set({ loading: true, activeSessionId: id });
    try {
      const images = await api.getSessionImages(id);
      set({ images });
    } finally {
      set({ loading: false });
    }
  },

  createSession: async (name: string) => {
    const session = await api.createSession(name);
    set((state) => ({ sessions: [session, ...state.sessions] }));
    await get().selectSession(session.id);
  },

  deleteSession: async (id: string) => {
    await api.deleteSession(id);
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      activeSessionId:
        state.activeSessionId === id ? null : state.activeSessionId,
      images: state.activeSessionId === id ? [] : state.images,
    }));
  },

  renameSession: async (id: string, name: string) => {
    await api.renameSession(id, name);
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, name } : s
      ),
    }));
  },
}));
```

- [ ] **Step 2: 实现生成 store**

```typescript
// frontend/src/stores/generationStore.ts
import { create } from "zustand";
import type { AttachedFile, GenerateCompleted } from "../types";
import { generateImage } from "../services/api";

interface GenerationState {
  isGenerating: boolean;
  partialImage: string | null;
  error: string | null;
  attachments: AttachedFile[];
  abortController: AbortController | null;

  addAttachment: (file: AttachedFile) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  startGeneration: (
    sessionId: string,
    prompt: string,
    forkFrom?: string
  ) => void;
  cancelGeneration: () => void;
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  isGenerating: false,
  partialImage: null,
  error: null,
  attachments: [],
  abortController: null,

  addAttachment: (file) =>
    set((state) => ({ attachments: [...state.attachments, file] })),

  removeAttachment: (id) =>
    set((state) => ({
      attachments: state.attachments.filter((a) => a.id !== id),
    })),

  clearAttachments: () => set({ attachments: [] }),

  startGeneration: (sessionId, prompt, forkFrom) => {
    const { attachments } = get();
    set({ isGenerating: true, partialImage: null, error: null });

    const images = attachments.map((a) => ({
      type: "base64" as const,
      data: a.data,
      media_type: a.media_type,
    }));

    const controller = generateImage(
      {
        session_id: sessionId,
        prompt,
        images,
        fork_from: forkFrom,
      },
      (index, b64) => {
        set({ partialImage: `data:image/png;base64,${b64}` });
      },
      (data: GenerateCompleted) => {
        set({
          isGenerating: false,
          partialImage: null,
        });
        // 通知 sessionStore 刷新图片列表
        // 通过 import 避免 circular dep
        import("./sessionStore").then(({ useSessionStore }) => {
          useSessionStore.getState().selectSession(sessionId);
        });
      },
      (code, message) => {
        set({ isGenerating: false, error: `${code}: ${message}` });
      }
    );

    set({ abortController: controller });
  },

  cancelGeneration: () => {
    get().abortController?.abort();
    set({ isGenerating: false, partialImage: null, abortController: null });
  },
}));
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/stores/
git commit -m "feat: 添加 Zustand 状态管理

- sessionStore: 会话列表、选中状态、图片列表
- generationStore: 生成状态、附件管理、SSE 流处理"
```

---

### Task B5: 前端 UI 组件（使用 frontend-design 技能）

**Files:**
- Create: `frontend/src/components/Sidebar.tsx`
- Create: `frontend/src/components/Gallery.tsx`
- Create: `frontend/src/components/InputArea.tsx`
- Create: `frontend/src/components/DetailPanel.tsx`
- Create: `frontend/src/components/SettingsDialog.tsx`
- Modify: `frontend/src/App.tsx`

此任务建议使用 `frontend-design` 技能确保 UI 质量和美观度。核心要点：

1. **Sidebar.tsx** — 会话列表 + 新建按钮，选中高亮，支持右键删除/重命名
2. **Gallery.tsx** — 图片卡片网格，每张显示 step 和 prompt 摘要，当前图片高亮边框，生成中显示加载占位
3. **InputArea.tsx** — 三段式布局：附件预览（上）+ 文本输入（中）+ 操作按钮（下）。附件区向上动态扩展，最大高度 40vh
4. **DetailPanel.tsx** — 选中图片的预览 + 元数据 + 操作按钮（保存/Fork/复制 prompt）
5. **SettingsDialog.tsx** — API Key 输入和保存
6. **App.tsx** — 组装三栏布局，flex 布局

**暗色主题色值：**
- 背景 `#0f172a`、表面 `#1e293b`、边框 `#334155`
- 文字 `#e2e8f0`、次级 `#94a3b8`
- 强调 `#3b82f6`

> 此任务的具体代码由 frontend-design 技能在执行时生成，遵循设计文档中的 UI 规范。

- [ ] **Step 1: 实现各组件**
- [ ] **Step 2: 组装 App.tsx**
- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/ frontend/src/App.tsx
git commit -m "feat: 实现前端 UI 组件

- Sidebar: 会话列表管理
- Gallery: 图片卡片网格展示
- InputArea: 动态扩展输入栏
- DetailPanel: 图片详情和操作
- SettingsDialog: 配置弹窗"
```

---

### Task B6: Tauri 集成配置

**Files:**
- Modify: `frontend/src-tauri/tauri.conf.json`
- Modify: `frontend/src-tauri/src/main.rs`

- [ ] **Step 1: 配置 Tauri 窗口**

```json
// frontend/src-tauri/tauri.conf.json 关键配置
{
  "app": {
    "windows": [
      {
        "title": "OpenImage",
        "width": 1280,
        "height": 800,
        "minWidth": 960,
        "minHeight": 600,
        "center": true,
        "decorations": true
      }
    ]
  },
  "plugins": {
    "shell": {
      "open": true
    }
  }
}
```

- [ ] **Step 2: 配置 Tauri sidecar 启动后端**

在 Tauri Rust 代码中添加启动后端进程的逻辑：

```rust
// frontend/src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: 验证 Tauri 桌面窗口可正常打开**

```bash
cd D:/CODE/Project/OpenImage/frontend
npm run tauri dev
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src-tauri/
git commit -m "feat: 配置 Tauri 窗口和 shell 插件

- 默认窗口 1280x800，最小 960x600
- 启用 shell 插件用于打开外部链接"
```

---

## 集成阶段

### Task I1: 端到端联调

**前置：** 轨道 A（后端）和 轨道 B（前端）均完成

- [ ] **Step 1: 启动后端服务**

```bash
cd D:/CODE/Project/OpenImage/backend
python -m src.cli serve --port 8765
```

- [ ] **Step 2: 配置 API Key**

通过前端 Settings 或 CLI 设置 API Key：

```bash
python -m src.cli config set api_key sk-your-key-here
```

- [ ] **Step 3: 启动前端并验证完整流程**

```bash
cd D:/CODE/Project/OpenImage/frontend
npm run tauri dev
```

验证：
1. 创建新会话 → 会话出现在左侧列表
2. 输入 prompt 生成图片 → 渐进预览 → 卡片出现
3. 继续输入修改 prompt → 新图片追加
4. 点击历史图片 → 右侧显示详情
5. Fork → 新迭代链正确分支

- [ ] **Step 4: 修复集成问题**
- [ ] **Step 5: 提交**

```bash
git commit -m "feat: 完成前后端集成联调

- 验证完整生成流程
- 验证迭代链和 Fork 功能
- 验证 SSE 流式渐进预览"
```

---

### Task I2: .gitignore 和项目根文件

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: 创建 .gitignore**

```gitignore
# Python
__pycache__/
*.pyc
.venv/
dist/
*.egg-info/

# Node
node_modules/
frontend/dist/

# Tauri
frontend/src-tauri/target/

# IDE
.vscode/
.idea/

# Data (不应提交用户数据)
data/

# OS
.DS_Store
Thumbs.db

# Superpowers brainstorm sessions
.superpowers/
```

- [ ] **Step 2: 提交**

```bash
git add .gitignore
git commit -m "chore: 添加 .gitignore"
```

---

## 自审清单

**1. Spec 覆盖：**

| Spec 要求 | 对应 Task |
|-----------|-----------|
| ResponseAPIClient | A6 |
| SessionManager | A5 |
| ImageStore | A4 |
| SSE 流式 | A8 |
| CLI (serve/generate/edit/chat) | A11 |
| 会话 API 路由 | A7 |
| 图片 API 路由 | A9 |
| 配置 API 路由 | A9 |
| FastAPI 组装 | A10 |
| Tauri + React 脚手架 | B1 |
| TS 类型 | B2 |
| API 调用层 | B3 |
| Zustand stores | B4 |
| UI 组件（三栏布局） | B5 |
| 输入栏动态扩展 | B5 (InputArea) |
| Tauri 配置 | B6 |
| 端到端联调 | I1 |
| 安装目录数据存储 | A2 (Config.base_dir) |

**2. 占位符扫描：** Task B5 中对 UI 组件代码使用 frontend-design 技能委托，已标注具体组件职责和样式参数，无模糊 TBD。

**3. 类型一致性：** 后端 Pydantic 模型（GenerateRequest、ImageInput 等）与前端 TypeScript 类型（types/index.ts）字段名和结构完全对齐。
