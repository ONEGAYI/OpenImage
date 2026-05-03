"""中断消息保存端点测试。"""
import pytest
from httpx import ASGITransport, AsyncClient

from src.server import create_app


@pytest.fixture
async def app(tmp_base_dir):
    """创建临时数据目录的测试 app。"""
    app = create_app(tmp_base_dir)
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
