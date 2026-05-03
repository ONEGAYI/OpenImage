"""LLM 设置 API — 独立于图片生成 API 配置。"""
from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/llm-settings", tags=["llm-settings"])

LLM_SETTING_KEYS = [
    "llm_api_key",
    "llm_base_url",
    "llm_model_name",
    "llm_supports_vision",
    "llm_system_prompt",
]


class LLMSettingsUpdate(BaseModel):
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    llm_model_name: str | None = None
    llm_supports_vision: bool | None = None
    llm_system_prompt: str | None = None


def _db(request: Request):
    return request.app.state.db


@router.get("")
async def get_llm_settings(request: Request):
    db = _db(request)
    settings = {}
    for key in LLM_SETTING_KEYS:
        val = await db.get_setting(key)
        settings[key] = val

    # API key 脱敏
    api_key = settings.get("llm_api_key")
    response = {**settings}
    response["llm_api_key_set"] = bool(api_key)
    response["llm_api_key_preview"] = f"...{api_key[-4:]}" if api_key and len(api_key) > 4 else None
    if not api_key:
        response["llm_api_key"] = None

    return response


@router.patch("")
async def update_llm_settings(request: Request, body: LLMSettingsUpdate):
    db = _db(request)
    updates = body.model_dump(exclude_none=True)

    for key, value in updates.items():
        await db.set_setting(key, str(value) if not isinstance(value, str) else value)

    # 更新内存缓存（保留原始类型，仅 db 存储转为字符串）
    app_settings = request.app.state.llm_settings
    for key, value in updates.items():
        app_settings[key] = value

    # 重建 LLM 客户端
    old_client = request.app.state.llm_client
    from src.core.llm_client import LLMClient
    request.app.state.llm_client = LLMClient.from_settings(app_settings)
    if old_client and hasattr(old_client, "close"):
        import asyncio
        asyncio.ensure_future(old_client.close())

    return await get_llm_settings(request)
