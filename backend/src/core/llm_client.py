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
        self.base_url = (base_url or "").rstrip("/")
        self.api_key = api_key
        self.model_name = model_name
        self.supports_vision = supports_vision
        self.system_prompt = system_prompt
        self._http_client: httpx.AsyncClient | None = None

    async def close(self):
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()
            self._http_client = None

    def _get_http_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(timeout=120.0)
        return self._http_client

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

        full_text = ""  # 保留完整原始文本（含 ai_block 标签），用于持久化和 completed 事件
        pending = ""       # 尚未输出的文本（可能包含不完整的标签前缀）
        ai_block_buf = ""
        in_ai_block = False

        OPEN_TAG = "<ai_block>"
        CLOSE_TAG = "</ai_block>"

        def _emit_ai_block(json_str: str) -> StreamEvent:
            try:
                return StreamEvent(type="ai_block", data=json.loads(json_str))
            except json.JSONDecodeError:
                return StreamEvent(
                    type="parse_warning",
                    data={"status": "json_parse_failed", "raw_text": json_str},
                )

        http_client = self._get_http_client()
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

                # --- ai_block 收集模式 ---
                if in_ai_block:
                    ai_block_buf += token_text
                    if CLOSE_TAG in ai_block_buf:
                        in_ai_block = False
                        json_str, rest = ai_block_buf.split(CLOSE_TAG, 1)
                        yield _emit_ai_block(json_str.strip())
                        ai_block_buf = ""
                        pending = rest
                    continue

                # --- 累积到 pending ---
                pending += token_text

                # 检测完整 <ai_block> 开标签
                if OPEN_TAG in pending:
                    idx = pending.index(OPEN_TAG)
                    before = pending[:idx]
                    after = pending[idx + len(OPEN_TAG):]

                    if before:
                        yield StreamEvent(type="token", data={"text": before})
                    yield StreamEvent(
                        type="buffering",
                        data={"status": "parsing_ai_block", "elapsed_ms": 0},
                    )

                    if CLOSE_TAG in after:
                        json_str, rest = after.split(CLOSE_TAG, 1)
                        yield _emit_ai_block(json_str.strip())
                        pending = rest
                    else:
                        in_ai_block = True
                        ai_block_buf = after
                        pending = ""
                    continue

                # 输出安全前缀：只缓冲可能是 <ai_block> 前缀的尾部
                last_lt = pending.rfind("<")
                if last_lt != -1 and OPEN_TAG.startswith(pending[last_lt:]):
                    safe = pending[:last_lt]
                    if safe:
                        yield StreamEvent(type="token", data={"text": safe})
                    pending = pending[last_lt:]
                else:
                    if pending:
                        yield StreamEvent(type="token", data={"text": pending})
                    pending = ""

        # 流结束：刷新残留
        if pending:
            yield StreamEvent(type="token", data={"text": pending})
        if in_ai_block and ai_block_buf:
            yield StreamEvent(
                type="parse_warning",
                data={"status": "unclosed_ai_block", "raw_text": ai_block_buf},
            )

        yield StreamEvent(type="completed", data={"full_text": full_text})

    @staticmethod
    def extract_ai_block(text: str) -> dict | None:
        pattern = r"<ai_block>\s*(.*?)\s*</ai_block>"
        match = re.search(pattern, text, re.DOTALL)
        if not match:
            return None
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            return None

    @classmethod
    def from_settings(cls, settings: dict) -> "LLMClient":
        vision_val = settings.get("llm_supports_vision", False)
        if isinstance(vision_val, str):
            vision_val = vision_val.lower() == "true"
        return cls(
            base_url=settings.get("llm_base_url") or "http://localhost:11434/v1",
            api_key=settings.get("llm_api_key") or "",
            model_name=settings.get("llm_model_name") or "llama3.1:8b",
            supports_vision=bool(vision_val),
            system_prompt=settings.get("llm_system_prompt", ""),
        )
