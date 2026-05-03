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
    conn = db.connection()
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
