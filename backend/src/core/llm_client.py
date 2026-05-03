"""LLM API 客户端 — OpenAI 兼容协议。

支持：OpenAI、Ollama、LM Studio、vLLM、DeepSeek、Groq 等。
"""
import json
import re
from dataclasses import dataclass, field
from typing import AsyncGenerator

import httpx


@dataclass
class StreamEvent:
    type: str  # "token" | "buffering" | "ai_block" | "usage" | "parse_warning" | "completed" | "error"
    data: dict = field(default_factory=dict)


class LLMClient:
    def __init__(
        self,
        base_url: str,
        api_key: str = "",
        model_name: str = "",
        supports_vision: bool = False,
        system_prompt: str = "",
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model_name = model_name
        self.supports_vision = supports_vision
        self.system_prompt = system_prompt

    def build_messages(
        self,
        system_prompt: str,
        history: list[dict],
        user_content: str,
        attachments: list[dict],
    ) -> list[dict]:
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history)

        if self.supports_vision and attachments:
            content_parts: list[dict] = [{"type": "text", "text": user_content}]
            for att in attachments:
                content_parts.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:{att['media_type']};base64,{att['data']}"},
                })
            messages.append({"role": "user", "content": content_parts})
        elif attachments:
            meta = ", ".join(f"附件({att.get('media_type', 'unknown')})" for att in attachments)
            messages.append({"role": "user", "content": f"{user_content}\n[{meta}]"})
        else:
            messages.append({"role": "user", "content": user_content})

        return messages

    async def chat_stream(self, messages: list[dict]) -> AsyncGenerator[StreamEvent, None]:
        url = f"{self.base_url}/chat/completions"
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        body = {"model": self.model_name, "messages": messages, "stream": True}

        full_text = ""
        ai_block_buffer = ""
        in_ai_block = False

        async with httpx.AsyncClient(timeout=120.0) as http_client:
            async with http_client.stream("POST", url, json=body, headers=headers) as resp:
                if resp.status_code != 200:
                    error_text = await resp.aread()
                    yield StreamEvent(
                        type="error",
                        data={"message": error_text.decode(), "code": resp.status_code},
                    )
                    return

                async for line in resp.aiter_lines():
                    line = line.strip()
                    if not line or not line.startswith("data: "):
                        continue
                    payload = line[6:]
                    if payload == "[DONE]":
                        break

                    try:
                        chunk = json.loads(payload)
                    except json.JSONDecodeError:
                        continue

                    if "usage" in chunk and chunk["usage"]:
                        usage = chunk["usage"]
                        yield StreamEvent(type="usage", data={
                            "prompt_tokens": usage.get("prompt_tokens", 0),
                            "completion_tokens": usage.get("completion_tokens", 0),
                        })

                    choices = chunk.get("choices", [])
                    if not choices:
                        continue
                    delta = choices[0].get("delta", {})
                    token_text = delta.get("content", "")
                    if not token_text:
                        continue

                    full_text += token_text

                    if "```ai-block" in token_text and not in_ai_block:
                        in_ai_block = True
                        before = token_text.split("```ai-block")[0]
                        if before:
                            yield StreamEvent(type="token", data={"text": before})
                        yield StreamEvent(
                            type="buffering",
                            data={"status": "parsing_ai_block", "elapsed_ms": 0},
                        )
                        continue

                    if in_ai_block:
                        ai_block_buffer += token_text
                        if "```" in token_text and len(ai_block_buffer) > 12:
                            in_ai_block = False
                            json_str = ai_block_buffer.split("```")[0].strip()
                            try:
                                ai_block_data = json.loads(json_str)
                                yield StreamEvent(type="ai_block", data=ai_block_data)
                            except json.JSONDecodeError:
                                yield StreamEvent(
                                    type="parse_warning",
                                    data={"status": "json_parse_failed", "raw_text": json_str},
                                )
                            ai_block_buffer = ""
                        continue

                    yield StreamEvent(type="token", data={"text": token_text})

        yield StreamEvent(type="completed", data={"full_text": full_text})

    @staticmethod
    def extract_ai_block(text: str) -> dict | None:
        pattern = r"```ai-block\s*\n(.*?)\n```"
        match = re.search(pattern, text, re.DOTALL)
        if not match:
            return None
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            return None

    @classmethod
    def from_settings(cls, settings: dict) -> "LLMClient":
        return cls(
            base_url=settings.get("llm_base_url", "http://localhost:11434/v1"),
            api_key=settings.get("llm_api_key", ""),
            model_name=settings.get("llm_model_name", "llama3.1:8b"),
            supports_vision=settings.get("llm_supports_vision", False),
            system_prompt=settings.get("llm_system_prompt", ""),
        )
