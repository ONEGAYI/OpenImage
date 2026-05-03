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
