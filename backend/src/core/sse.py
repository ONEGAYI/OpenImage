import json
from typing import Any

# SSE 错误码常量
ERR_GENERATION_FAILED = "generation_failed"
ERR_INPAINT_FAILED = "inpaint_failed"
ERR_STREAM_ERROR = "stream_error"

# SSE 注释撑破代理/TCP 初始缓冲，强制立即 flush
SSE_FLUSH = f": {' ' * 1024}\n\n"


def sse_event(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def sse_error(code: str, message: str) -> str:
    return sse_event("error", {"code": code, "message": message})
