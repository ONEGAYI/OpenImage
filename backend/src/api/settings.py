# backend/src/api/settings.py
from fastapi import APIRouter, Request
from pydantic import BaseModel

from src.core.client import DEFAULT_API_MODE, DEFAULT_MODEL_NAME

router = APIRouter(prefix="/api/settings", tags=["settings"])

_SETTING_FIELDS = ("api_key", "base_url", "api_mode", "model_name")

_ENDPOINT_PATHS = {
    "responses": "/responses",
    "images": "/images/generations",
    "chat": "/chat/completions",
}


def _resolve_endpoint(base_url: str | None, api_mode: str) -> str:
    raw = (base_url or "https://api.openai.com/v1").rstrip("/")
    if not raw.endswith("/v1"):
        raw += "/v1"
    return raw + _ENDPOINT_PATHS.get(api_mode, "")


class SettingsUpdate(BaseModel):
    api_key: str | None = None
    base_url: str | None = None
    api_mode: str | None = None
    model_name: str | None = None


def _rebuild_client(request: Request):
    from src.core.client import ImageClient

    request.app.state.client = ImageClient.from_settings(
        request.app.state.settings
    )


async def _load_settings(db) -> dict:
    raw = {key: await db.get_setting(key) for key in _SETTING_FIELDS}
    return {
        "api_key": raw["api_key"],
        "base_url": raw["base_url"],
        "api_mode": raw["api_mode"] or DEFAULT_API_MODE,
        "model_name": raw["model_name"] or DEFAULT_MODEL_NAME,
    }


@router.get("")
async def get_settings(request: Request):
    db = request.app.state.db
    settings = await _load_settings(db)
    api_key = settings["api_key"]
    return {
        "api_key_set": api_key is not None,
        "api_key_preview": f"...{api_key[-4:]}" if api_key else None,
        "api_key": api_key,
        **{k: settings[k] for k in ("base_url", "api_mode", "model_name")},
        "resolved_endpoint": _resolve_endpoint(settings["base_url"], settings["api_mode"]),
        "full_version": request.app.state.full_version,
    }


@router.patch("")
async def update_settings(body: SettingsUpdate, request: Request):
    db = request.app.state.db
    for field in _SETTING_FIELDS:
        value = getattr(body, field, None)
        if value is not None:
            await db.set_setting(field, value)
            request.app.state.settings[field] = value
    _rebuild_client(request)
    return {"ok": True}
