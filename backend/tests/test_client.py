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
