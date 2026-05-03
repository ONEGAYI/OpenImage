import uuid


def gen_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def normalize_base_url(raw: str | None) -> str:
    """确保 base_url 以 /v1 结尾（OpenAI 兼容 API 的标准路径前缀）"""
    url = (raw or "https://api.openai.com/v1").rstrip("/")
    if not url.endswith("/v1"):
        url += "/v1"
    return url
