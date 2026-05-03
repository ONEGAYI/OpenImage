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
    thinking_content TEXT,
    thinking_duration_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_llm_messages_session ON llm_messages(chat_session_id);
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
        await self._migrate_thinking_columns()
        await self._db.commit()

    async def _migrate_thinking_columns(self) -> None:
        """为已有数据库添加 thinking_content / thinking_duration_ms 列"""
        cursor = await self._db.execute("PRAGMA table_info(llm_messages)")
        columns = {row[1] for row in await cursor.fetchall()}
        if "thinking_content" not in columns:
            await self._db.execute("ALTER TABLE llm_messages ADD COLUMN thinking_content TEXT")
        if "thinking_duration_ms" not in columns:
            await self._db.execute("ALTER TABLE llm_messages ADD COLUMN thinking_duration_ms INTEGER")

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
