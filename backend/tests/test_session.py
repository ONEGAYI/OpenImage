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
