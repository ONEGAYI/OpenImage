# backend/src/core/client.py
import asyncio
import base64
import re
from dataclasses import dataclass
from typing import Any

import httpx
from openai import AsyncOpenAI

from src.core.utils import gen_id, normalize_base_url

# 502/503 是网关瞬时抖动，524 是 Cloudflare 超时（可能因负载自愈）
# 其他 Cloudflare 5xx（520-523/525-527）通常反映配置或协议问题，不重试
_RETRYABLE_STATUS = frozenset({502, 503, 524})

API_MODE_RESPONSES = "responses"
API_MODE_IMAGES = "images"
API_MODE_CHAT = "chat"

DEFAULT_API_MODE = API_MODE_RESPONSES
DEFAULT_MODEL_NAME = "gpt-image-2"
_PARAM_KEYS = ("size", "quality", "output_format")
_INPAINT_META_PROMPT = "[Inpaint] Replace the masked (semi-transparent) region in the first image. The second image shows the mask area."


@dataclass
class GenerateResult:
    response_id: str
    image_b64: str
    revised_prompt: str | None
    total_tokens: int


class ImageClient:
    def __init__(
        self,
        api_key: str,
        base_url: str | None = None,
        api_mode: str = DEFAULT_API_MODE,
        model_name: str = DEFAULT_MODEL_NAME,
    ):
        self._openai = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._http = httpx.AsyncClient(timeout=180)
        self._api_key = api_key
        self._base_url = normalize_base_url(base_url)
        self.api_mode = api_mode
        self.model_name = model_name

    async def close(self):
        await self._http.aclose()
        await self._openai.close()

    @staticmethod
    def _check_response(resp: httpx.Response, endpoint: str) -> None:
        """检查 HTTP 响应，提供详细错误信息"""
        if resp.is_error:
            code = resp.status_code
            # 524 单独处理：提供具体操作建议，而非通用 Cloudflare 错误提示
            if code == 524:
                raise ValueError(
                    f"{endpoint} 请求超时 (HTTP 524)：代理服务器等待上游 API 响应超时。\n"
                    f"这通常发生在请求包含多张参考图或复杂提示词时。\n"
                    f"建议：简化提示词、减少参考图数量，或更换超时更长的 API 代理。"
                )
            # 其余 Cloudflare 5xx 不重试：通常是配置/协议问题，非瞬时
            if 520 <= code <= 527:
                raise ValueError(
                    f"{endpoint} 请求失败 (HTTP {code})：代理服务端返回 Cloudflare 错误，"
                    f"这通常是代理服务的临时问题，可以稍后重试。"
                )
            body = resp.text[:500] or "(空响应)"
            raise ValueError(f"{endpoint} 请求失败 (HTTP {code}): {body}")
        if not resp.text:
            raise ValueError(
                f"{endpoint} 返回空响应 (HTTP {resp.status_code})"
            )
        ct = resp.headers.get("content-type", "")
        if "json" not in ct and not resp.text.strip().startswith("{"):
            raise ValueError(
                f"{endpoint} 返回非 JSON 响应 (HTTP {resp.status_code}, "
                f"Content-Type: {ct}), 这通常意味着 API Base URL 不正确。"
                f"请确认 Base URL 包含正确的路径前缀（如 /v1）。"
                f"响应前 200 字符: {resp.text[:200]!r}"
            )

    async def _post(
        self, url: str, *, endpoint: str, max_retries: int = 1, **kwargs
    ) -> httpx.Response:
        """POST 请求，对瞬时错误（502/503/524）自动重试"""
        for attempt in range(max_retries + 1):
            resp = await self._http.post(url, **kwargs)
            if resp.status_code not in _RETRYABLE_STATUS or attempt >= max_retries:
                self._check_response(resp, endpoint)
                return resp
            await asyncio.sleep(2 ** attempt * 2)
        raise RuntimeError("_post: unreachable")  # defensive

    @classmethod
    def from_settings(cls, settings: dict) -> "ImageClient | None":
        api_key = settings.get("api_key")
        if not api_key:
            return None
        return cls(
            api_key=api_key,
            base_url=settings.get("base_url") or None,
            api_mode=settings.get("api_mode", DEFAULT_API_MODE),
            model_name=settings.get("model_name", DEFAULT_MODEL_NAME),
        )

    def _extract_params(self, params: dict[str, Any]) -> dict[str, Any]:
        return {k: params[k] for k in _PARAM_KEYS if params.get(k)}

    async def _download_as_b64(self, url: str) -> str:
        resp = await self._http.get(url)
        resp.raise_for_status()
        return base64.b64encode(resp.content).decode()

    @staticmethod
    def _extract_image_urls(text: str) -> list[str]:
        urls = re.findall(r'!\[.*?\]\((https?://[^)]+)\)', text)
        if not urls:
            urls = re.findall(r'(https?://\S+\.(?:png|jpg|jpeg|webp))', text)
        if not urls:
            urls = re.findall(r'(https?://\S+)', text)
        return urls

    def _make_response_id(self) -> str:
        return gen_id("img")

    # ---- Responses API (OpenAI SDK) ----

    async def _generate_via_responses(
        self,
        prompt: str,
        images: list[dict],
        previous_response_id: str | None,
        params: dict[str, Any] | None = None,
    ) -> GenerateResult:
        params = params or {}
        content = self._build_responses_input(prompt, images)
        tool_config: dict[str, Any] = {
            "type": "image_generation", **self._extract_params(params)
        }

        create_kwargs: dict[str, Any] = {
            "model": self.model_name,
            "input": [{"role": "user", "content": content}],
            "tools": [tool_config],
        }
        if previous_response_id:
            create_kwargs["previous_response_id"] = previous_response_id

        response = await self._openai.responses.create(**create_kwargs)

        return self._parse_responses_result(response)

    @staticmethod
    def _parse_responses_result(response) -> GenerateResult:
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

    def _build_responses_input(self, prompt: str, images: list[dict]) -> list[dict]:
        content: list[dict] = [{"type": "input_text", "text": prompt}]
        for img in images:
            if img["type"] == "base64":
                content.append({
                    "type": "input_image",
                    "image_url": f"data:{img['media_type']};base64,{img['data']}",
                })
        return content

    # ---- Images API (httpx) ----

    async def _parse_images_api_item(self, item: dict) -> GenerateResult:
        """解析 Images API 返回的 data item（b64/url 回退）"""
        image_b64 = item.get("b64_json", "")
        if not image_b64:
            url = item.get("url", "")
            if url:
                image_b64 = await self._download_as_b64(url)

        return GenerateResult(
            response_id=self._make_response_id(),
            image_b64=image_b64,
            revised_prompt=item.get("revised_prompt"),
            total_tokens=0,
        )

    async def _generate_via_images(
        self,
        prompt: str,
        images: list[dict],
        params: dict[str, Any] | None = None,
    ) -> GenerateResult:
        payload: dict[str, Any] = {
            "model": self.model_name,
            "prompt": prompt,
            "n": 1,
            "response_format": "b64_json",
            **self._extract_params(params or {}),
        }

        resp = await self._post(
            f"{self._base_url}/images/generations",
            endpoint="Images API",
            json=payload,
            headers={"Authorization": f"Bearer {self._api_key}"},
        )
        return await self._parse_images_api_item(resp.json()["data"][0])

    async def _edit_via_images(
        self,
        prompt: str,
        reference_b64: str,
        params: dict[str, Any] | None = None,
    ) -> GenerateResult:
        """Images API 参考图生成：POST /v1/images/edits（无 mask，纯参考图）"""
        files = {
            "image": ("reference.png", base64.b64decode(reference_b64), "image/png"),
        }
        data = {
            "prompt": prompt,
            "model": self.model_name,
            "n": "1",
            "response_format": "b64_json",
        }
        data.update(self._extract_params(params or {}))

        resp = await self._post(
            f"{self._base_url}/images/edits",
            endpoint="Images Edits API",
            data=data,
            files=files,
            headers={"Authorization": f"Bearer {self._api_key}"},
        )
        return await self._parse_images_api_item(resp.json()["data"][0])

    # ---- Chat Completions API (httpx) ----

    def _build_chat_content(
        self, prompt: str, images: list[dict], history_images: list[str] | None = None
    ) -> list[dict]:
        """构建 Chat Completions 的多模态 content 数组，图片在前文本在后"""
        content: list[dict] = []
        for b64 in (history_images or []):
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{b64}"},
            })
        for img in images:
            if img.get("type") == "base64" and img.get("data"):
                content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{img.get('media_type', 'image/png')};base64,{img['data']}"
                    },
                })
        content.append({"type": "text", "text": prompt})
        return content

    async def _generate_via_chat(
        self,
        prompt: str,
        images: list[dict],
        params: dict[str, Any] | None = None,
        history_images: list[str] | None = None,
    ) -> GenerateResult:
        content = self._build_chat_content(prompt, images, history_images)
        payload: dict[str, Any] = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": content}],
            "tools": [{
                "type": "image_generation",
                **self._extract_params(params or {}),
            }],
        }

        resp = await self._post(
            f"{self._base_url}/chat/completions",
            endpoint="Chat API",
            json=payload,
            headers={"Authorization": f"Bearer {self._api_key}"},
        )
        return await self._parse_chat_image_result(resp, "Chat API")

    async def _parse_chat_image_result(self, resp: httpx.Response, label: str) -> GenerateResult:
        try:
            text = resp.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError):
            raise ValueError(f"{label} 响应格式异常: {resp.text[:500]}")

        urls = self._extract_image_urls(text)
        if not urls:
            raise ValueError(f"未在 {label} 响应中找到图片 URL，响应内容：{text[:300]}")

        image_b64 = await self._download_as_b64(urls[0])

        return GenerateResult(
            response_id=self._make_response_id(),
            image_b64=image_b64,
            revised_prompt=None,
            total_tokens=0,
        )

    # ---- 统一入口 ----

    async def _generate_inpaint(
        self,
        prompt: str,
        source_image_b64: str,
        mask_b64: str,
        params: dict[str, Any] | None = None,
        reference_images: list[dict] | None = None,
    ) -> GenerateResult:
        """根据 API 模式路由 inpainting 请求"""
        if self.api_mode == API_MODE_IMAGES:
            return await self._inpaint_via_images(prompt, source_image_b64, mask_b64, params)
        if self.api_mode == API_MODE_CHAT:
            return await self._inpaint_via_chat(prompt, source_image_b64, mask_b64, params, reference_images)
        return await self._inpaint_via_responses(prompt, source_image_b64, mask_b64, params, reference_images)

    async def _inpaint_via_images(
        self,
        prompt: str,
        source_image_b64: str,
        mask_b64: str,
        params: dict[str, Any] | None = None,
    ) -> GenerateResult:
        """Images API 原生 inpainting: POST /v1/images/edits（不支持额外参考图）"""
        source_bytes = base64.b64decode(source_image_b64)
        mask_bytes = base64.b64decode(mask_b64)

        files = {
            "image": ("source.png", source_bytes, "image/png"),
            "mask": ("mask.png", mask_bytes, "image/png"),
        }
        data = {
            "prompt": prompt,
            "model": self.model_name,
            "n": "1",
            "response_format": "b64_json",
        }
        extra_params = self._extract_params(params or {})
        data.update(extra_params)

        resp = await self._post(
            f"{self._base_url}/images/edits",
            endpoint="Images Inpaint API",
            data=data,
            files=files,
            headers={"Authorization": f"Bearer {self._api_key}"},
        )
        return await self._parse_images_api_item(resp.json()["data"][0])

    async def _inpaint_via_responses(
        self,
        prompt: str,
        source_image_b64: str,
        mask_b64: str,
        params: dict[str, Any] | None = None,
        reference_images: list[dict] | None = None,
    ) -> GenerateResult:
        """Responses API inpainting: 原图 + 蒙版 + 参考图作为 input_image + 元 prompt"""
        content = [
            {
                "type": "input_image",
                "image_url": f"data:image/png;base64,{source_image_b64}",
            },
            {
                "type": "input_image",
                "image_url": f"data:image/png;base64,{mask_b64}",
            },
        ]
        for ref in (reference_images or []):
            content.append({
                "type": "input_image",
                "image_url": f"data:{ref['media_type']};base64,{ref['data']}",
            })
        content.append({
            "type": "input_text",
            "text": f"{_INPAINT_META_PROMPT} {prompt}",
        })

        tool_config: dict[str, Any] = {
            "type": "image_generation",
            **self._extract_params(params or {}),
        }

        response = await self._openai.responses.create(
            model=self.model_name,
            input=[{"role": "user", "content": content}],
            tools=[tool_config],
        )

        return self._parse_responses_result(response)

    async def _inpaint_via_chat(
        self,
        prompt: str,
        source_image_b64: str,
        mask_b64: str,
        params: dict[str, Any] | None = None,
        reference_images: list[dict] | None = None,
    ) -> GenerateResult:
        """Chat API inpainting: 原图 + 蒙版 + 参考图作为 image_url + 元 prompt"""
        content = [
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{source_image_b64}"},
            },
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{mask_b64}"},
            },
        ]
        for ref in (reference_images or []):
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:{ref['media_type']};base64,{ref['data']}"},
            })
        content.append({
            "type": "text",
            "text": f"{_INPAINT_META_PROMPT} {prompt}",
        })

        payload: dict[str, Any] = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": content}],
            "tools": [{
                "type": "image_generation",
                **self._extract_params(params or {}),
            }],
        }

        resp = await self._post(
            f"{self._base_url}/chat/completions",
            endpoint="Chat Inpaint API",
            json=payload,
            headers={"Authorization": f"Bearer {self._api_key}"},
        )
        return await self._parse_chat_image_result(resp, "Chat Inpaint API")

    async def generate(
        self,
        prompt: str,
        images: list[dict],
        previous_response_id: str | None,
        params: dict[str, Any] | None = None,
        history_images: list[str] | None = None,
        mask_b64: str | None = None,
        source_image_b64: str | None = None,
        reference_images: list[dict] | None = None,
    ) -> GenerateResult:
        # Inpainting 路由
        if mask_b64 and source_image_b64:
            return await self._generate_inpaint(
                prompt, source_image_b64, mask_b64, params, reference_images
            )
        # 原有路由
        if self.api_mode == API_MODE_CHAT:
            return await self._generate_via_chat(
                prompt, images, params, history_images
            )
        if self.api_mode == API_MODE_IMAGES:
            if history_images:
                return await self._edit_via_images(prompt, history_images[0], params)
            if images:
                return await self._edit_via_images(prompt, images[0]["data"], params)
            return await self._generate_via_images(prompt, images, params)
        return await self._generate_via_responses(
            prompt, images, previous_response_id, params
        )

    async def generate_stream(
        self,
        prompt: str,
        images: list[dict],
        previous_response_id: str | None,
        params: dict[str, Any] | None = None,
        partial_images: int = 2,
    ):
        params = params or {}
        content = self._build_responses_input(prompt, images)
        tool_config: dict[str, Any] = {
            "type": "image_generation",
            "partial_images": partial_images,
            **self._extract_params(params),
        }

        create_kwargs: dict[str, Any] = {
            "model": self.model_name,
            "input": [{"role": "user", "content": content}],
            "tools": [tool_config],
            "stream": True,
        }
        if previous_response_id:
            create_kwargs["previous_response_id"] = previous_response_id

        stream = await self._openai.responses.create(**create_kwargs)

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
