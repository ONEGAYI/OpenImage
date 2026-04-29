# backend/src/core/client.py
from dataclasses import dataclass
from typing import Any

from openai import AsyncOpenAI


@dataclass
class GenerateResult:
    response_id: str
    image_b64: str
    revised_prompt: str | None
    total_tokens: int


class ImageClient:
    def __init__(self, api_key: str):
        self._client = AsyncOpenAI(api_key=api_key)

    def _build_input(
        self,
        prompt: str,
        images: list[dict],
        previous_response_id: str | None,
    ) -> list[dict]:
        """构建 Response API 的 input 消息列表"""
        content: list[dict] = [{"type": "input_text", "text": prompt}]

        for img in images:
            if img["type"] == "base64":
                content.append({
                    "type": "input_image",
                    "image_url": f"data:{img['media_type']};base64,{img['data']}",
                })

        return content

    async def generate(
        self,
        prompt: str,
        images: list[dict],
        previous_response_id: str | None,
        params: dict[str, Any] | None = None,
    ) -> GenerateResult:
        """调用 OpenAI Responses API 生成图片"""
        params = params or {}
        content = self._build_input(prompt, images, previous_response_id)

        tool_config: dict[str, Any] = {"type": "image_generation"}
        if params.get("size"):
            tool_config["size"] = params["size"]
        if params.get("quality"):
            tool_config["quality"] = params["quality"]
        if params.get("output_format"):
            tool_config["output_format"] = params["output_format"]

        create_kwargs: dict[str, Any] = {
            "model": "gpt-4.1",
            "input": [{"role": "user", "content": content}],
            "tools": [tool_config],
        }
        if previous_response_id:
            create_kwargs["previous_response_id"] = previous_response_id

        response = await self._client.responses.create(**create_kwargs)

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

    async def generate_stream(
        self,
        prompt: str,
        images: list[dict],
        previous_response_id: str | None,
        params: dict[str, Any] | None = None,
        partial_images: int = 2,
    ):
        """流式生成图片，yield SSE 事件字典"""
        import base64

        params = params or {}
        content = self._build_input(prompt, images, previous_response_id)

        tool_config: dict[str, Any] = {
            "type": "image_generation",
            "partial_images": partial_images,
        }
        if params.get("size"):
            tool_config["size"] = params["size"]
        if params.get("quality"):
            tool_config["quality"] = params["quality"]
        if params.get("output_format"):
            tool_config["output_format"] = params["output_format"]

        create_kwargs: dict[str, Any] = {
            "model": "gpt-4.1",
            "input": [{"role": "user", "content": content}],
            "tools": [tool_config],
            "stream": True,
        }
        if previous_response_id:
            create_kwargs["previous_response_id"] = previous_response_id

        stream = await self._client.responses.create(**create_kwargs)

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
