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
