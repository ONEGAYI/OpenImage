# backend/tests/test_inpaint.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import base64

from src.core.client import ImageClient, GenerateResult, API_MODE_IMAGES, API_MODE_CHAT


def _make_minimal_png_b64() -> str:
    """1x1 透明 PNG base64"""
    return (
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
        "+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    )


class TestInpaintRouting:
    """测试 client.py 的 inpainting 路由逻辑"""

    @pytest.mark.asyncio
    async def test_inpaint_dispatches_to_images_edit(self):
        """images 模式应调用 /images/edits 端点"""
        client = ImageClient(api_key="sk-test", api_mode=API_MODE_IMAGES)

        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.status_code = 200
        mock_response.text = '{"data":[{"b64_json":"result_b64","revised_prompt":null}]}'
        mock_response.headers = {"content-type": "application/json"}
        mock_response.json.return_value = {"data": [{"b64_json": "result_b64", "revised_prompt": None}]}

        with patch.object(client._http, "post", new_callable=AsyncMock, return_value=mock_response) as mock_post:
            result = await client.generate(
                prompt="add a hat",
                images=[],
                previous_response_id=None,
                mask_b64=_make_minimal_png_b64(),
                source_image_b64=_make_minimal_png_b64(),
            )

        assert isinstance(result, GenerateResult)
        assert result.image_b64 == "result_b64"
        # 验证调用了 /images/edits 端点
        call_url = mock_post.call_args[0][0]
        assert "/images/edits" in call_url

    @pytest.mark.asyncio
    async def test_inpaint_dispatches_to_responses(self):
        """responses 模式应组装双图 + 元 prompt 发送给 OpenAI SDK"""
        client = ImageClient(api_key="sk-test")

        mock_resp = MagicMock()
        mock_resp.id = "resp_inpaint"
        mock_resp.output = [
            MagicMock(type="image_generation_call", result="inpainted_b64", revised_prompt=None)
        ]
        mock_resp.usage = MagicMock(total_tokens=50)

        with patch("src.core.client.AsyncOpenAI") as MockOpenAI:
            mock_instance = MockOpenAI.return_value
            mock_instance.responses = MagicMock()
            mock_instance.responses.create = AsyncMock(return_value=mock_resp)
            client._openai = mock_instance

            result = await client.generate(
                prompt="change background",
                images=[],
                previous_response_id=None,
                mask_b64=_make_minimal_png_b64(),
                source_image_b64=_make_minimal_png_b64(),
            )

        assert result.response_id == "resp_inpaint"
        assert result.image_b64 == "inpainted_b64"

        # 验证 input 中包含 3 个元素：原图 + 蒙版 + 元 prompt
        call_kwargs = mock_instance.responses.create.call_args[1]
        input_content = call_kwargs["input"][0]["content"]
        assert len(input_content) == 3
        assert input_content[0]["type"] == "input_image"
        assert input_content[1]["type"] == "input_image"
        assert input_content[2]["type"] == "input_text"
        assert "[Inpaint]" in input_content[2]["text"]

    @pytest.mark.asyncio
    async def test_no_mask_falls_through_to_normal_generate(self):
        """没有 mask 时应走正常生成路径"""
        client = ImageClient(api_key="sk-test", api_mode=API_MODE_IMAGES)

        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.status_code = 200
        mock_response.text = '{"data":[{"b64_json":"normal_b64"}]}'
        mock_response.headers = {"content-type": "application/json"}
        mock_response.json.return_value = {"data": [{"b64_json": "normal_b64"}]}

        with patch.object(client._http, "post", new_callable=AsyncMock, return_value=mock_response) as mock_post:
            result = await client.generate(
                prompt="draw a cat",
                images=[],
                previous_response_id=None,
            )

        assert result.image_b64 == "normal_b64"
        # 验证调用的是正常 /images/generations 而非 /images/edits
        call_url = mock_post.call_args[0][0]
        assert "/images/generations" in call_url


class TestInpaintAPI:
    """测试 /api/inpaint 端点和 InpaintRequest 模型"""

    def test_inpaint_requires_source(self):
        """缺少 source_image_id 和 source_image_b64 应正常构造但两者均为 None"""
        from src.api.inpaint import InpaintRequest
        req = InpaintRequest(
            session_id="sess_1",
            prompt="test",
            mask_b64=_make_minimal_png_b64(),
        )
        # source_image_id 和 source_image_b64 都为 None
        assert req.source_image_id is None
        assert req.source_image_b64 is None

    def test_inpaint_request_model_valid(self):
        """InpaintRequest 模型应正确解析"""
        from src.api.inpaint import InpaintRequest
        req = InpaintRequest(
            session_id="sess_1",
            prompt="add a hat",
            source_image_id="img_123",
            mask_b64=_make_minimal_png_b64(),
        )
        assert req.source_image_id == "img_123"
        assert req.mask_b64 == _make_minimal_png_b64()

    def test_inpaint_request_with_source_b64(self):
        """InpaintRequest 支持 source_image_b64 而非 source_image_id"""
        from src.api.inpaint import InpaintRequest
        b64 = _make_minimal_png_b64()
        req = InpaintRequest(
            session_id="sess_1",
            prompt="edit this",
            source_image_b64=b64,
            mask_b64=b64,
        )
        assert req.source_image_b64 == b64
        assert req.source_image_id is None

    def test_inpaint_request_with_reference_images(self):
        """InpaintRequest 支持 reference_images 字段"""
        from src.api.inpaint import InpaintRequest, ReferenceImage
        b64 = _make_minimal_png_b64()
        req = InpaintRequest(
            session_id="sess_1",
            prompt="edit with reference",
            source_image_b64=b64,
            mask_b64=b64,
            reference_images=[
                ReferenceImage(data=b64, media_type="image/png"),
                ReferenceImage(data=b64, media_type="image/jpeg"),
            ],
        )
        assert req.reference_images is not None
        assert len(req.reference_images) == 2
        assert req.reference_images[0].media_type == "image/png"
        assert req.reference_images[1].media_type == "image/jpeg"

    def test_inpaint_request_reference_images_optional(self):
        """reference_images 是可选字段，默认为 None"""
        from src.api.inpaint import InpaintRequest
        req = InpaintRequest(
            session_id="sess_1",
            prompt="test",
            mask_b64=_make_minimal_png_b64(),
        )
        assert req.reference_images is None


class TestInpaintWithReferences:
    """测试 client.py 三种 inpaint 模式下的参考图传递"""

    @pytest.mark.asyncio
    async def test_inpaint_with_references_via_responses(self):
        """responses 模式 inpaint 应将参考图插入 content 数组"""
        client = ImageClient(api_key="sk-test")

        mock_resp = MagicMock()
        mock_resp.id = "resp_ref"
        mock_resp.output = [
            MagicMock(type="image_generation_call", result="ref_result_b64", revised_prompt=None)
        ]
        mock_resp.usage = MagicMock(total_tokens=60)

        ref_b64 = _make_minimal_png_b64()

        with patch("src.core.client.AsyncOpenAI") as MockOpenAI:
            mock_instance = MockOpenAI.return_value
            mock_instance.responses = MagicMock()
            mock_instance.responses.create = AsyncMock(return_value=mock_resp)
            client._openai = mock_instance

            result = await client.generate(
                prompt="change style",
                images=[],
                previous_response_id=None,
                mask_b64=_make_minimal_png_b64(),
                source_image_b64=_make_minimal_png_b64(),
                reference_images=[{"data": ref_b64, "media_type": "image/png"}],
            )

        assert result.image_b64 == "ref_result_b64"

        call_kwargs = mock_instance.responses.create.call_args[1]
        input_content = call_kwargs["input"][0]["content"]
        # 4 个元素：原图 + 蒙版 + 参考图 + 文本
        assert len(input_content) == 4
        assert input_content[0]["type"] == "input_image"  # source
        assert input_content[1]["type"] == "input_image"  # mask
        assert input_content[2]["type"] == "input_image"  # reference
        assert input_content[3]["type"] == "input_text"    # prompt

    @pytest.mark.asyncio
    async def test_inpaint_with_references_via_chat(self):
        """chat 模式 inpaint 应将参考图插入 content 数组"""
        client = ImageClient(api_key="sk-test", api_mode=API_MODE_CHAT)

        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.status_code = 200
        mock_response.text = '{"choices":[{"message":{"content":"![img](http://example.com/result.png)"}}]}'
        mock_response.headers = {"content-type": "application/json"}
        mock_response.json.return_value = {"choices": [{"message": {"content": "![img](http://example.com/result.png)"}}]}

        ref_b64 = _make_minimal_png_b64()

        with patch.object(client._http, "post", new_callable=AsyncMock, return_value=mock_response) as mock_post, \
             patch.object(client, "_download_as_b64", new_callable=AsyncMock, return_value="downloaded_b64"):
            result = await client.generate(
                prompt="style transfer",
                images=[],
                previous_response_id=None,
                mask_b64=_make_minimal_png_b64(),
                source_image_b64=_make_minimal_png_b64(),
                reference_images=[{"data": ref_b64, "media_type": "image/png"}],
            )

        assert result.image_b64 == "downloaded_b64"

        call_kwargs = mock_post.call_args[1]
        content = call_kwargs["json"]["messages"][0]["content"]
        # 4 个元素：source + mask + reference + text
        assert len(content) == 4
        assert content[2]["type"] == "image_url"  # reference

    @pytest.mark.asyncio
    async def test_inpaint_without_references_still_works(self):
        """不传参考图时 inpaint 行为不变"""
        client = ImageClient(api_key="sk-test")

        mock_resp = MagicMock()
        mock_resp.id = "resp_no_ref"
        mock_resp.output = [
            MagicMock(type="image_generation_call", result="no_ref_b64", revised_prompt=None)
        ]
        mock_resp.usage = MagicMock(total_tokens=40)

        with patch("src.core.client.AsyncOpenAI") as MockOpenAI:
            mock_instance = MockOpenAI.return_value
            mock_instance.responses = MagicMock()
            mock_instance.responses.create = AsyncMock(return_value=mock_resp)
            client._openai = mock_instance

            result = await client.generate(
                prompt="simple inpaint",
                images=[],
                previous_response_id=None,
                mask_b64=_make_minimal_png_b64(),
                source_image_b64=_make_minimal_png_b64(),
            )

        assert result.image_b64 == "no_ref_b64"

        call_kwargs = mock_instance.responses.create.call_args[1]
        input_content = call_kwargs["input"][0]["content"]
        # 3 个元素（无参考图）
        assert len(input_content) == 3
