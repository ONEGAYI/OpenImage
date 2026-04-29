# backend/src/core/client.py
import base64
import re
import uuid
from dataclasses import dataclass
from typing import Any

import httpx
from openai import AsyncOpenAI

API_MODE_RESPONSES = "responses"
API_MODE_IMAGES = "images"
API_MODE_CHAT = "chat"

DEFAULT_API_MODE = API_MODE_RESPONSES
DEFAULT_MODEL_NAME = "gpt-image-2"
_PARAM_KEYS = ("size", "quality", "output_format")


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
        self._base_url = (base_url or "https://api.openai.com/v1").rstrip("/")
        self.api_mode = api_mode
        self.model_name = model_name

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

    def _make_response_id(self) -> str:
        return f"img_{uuid.uuid4().hex[:16]}"

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

        resp = await self._http.post(
            f"{self._base_url}/images/generations",
            json=payload,
            headers={"Authorization": f"Bearer {self._api_key}"},
        )
        resp.raise_for_status()
        item = resp.json()["data"][0]

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

    # ---- Chat Completions API (httpx) ----

    async def _generate_via_chat(
        self,
        prompt: str,
        images: list[dict],
        params: dict[str, Any] | None = None,
    ) -> GenerateResult:
        payload: dict[str, Any] = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
        }

        resp = await self._http.post(
            f"{self._base_url}/chat/completions",
            json=payload,
            headers={"Authorization": f"Bearer {self._api_key}"},
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]

        urls = re.findall(r'!\[.*?\]\((https?://[^)]+)\)', content)
        if not urls:
            urls = re.findall(r'(https?://\S+\.(?:png|jpg|jpeg|webp))', content)
        if not urls:
            urls = re.findall(r'(https?://\S+)', content)

        if not urls:
            raise ValueError(f"未在响应中找到图片 URL，响应内容：{content[:300]}")

        image_b64 = await self._download_as_b64(urls[0])

        return GenerateResult(
            response_id=self._make_response_id(),
            image_b64=image_b64,
            revised_prompt=None,
            total_tokens=0,
        )

    # ---- 统一入口 ----

    async def generate(
        self,
        prompt: str,
        images: list[dict],
        previous_response_id: str | None,
        params: dict[str, Any] | None = None,
    ) -> GenerateResult:
        if self.api_mode == API_MODE_CHAT:
            return await self._generate_via_chat(prompt, images, params)
        if self.api_mode == API_MODE_IMAGES:
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
