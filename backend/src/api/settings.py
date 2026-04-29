# backend/src/api/settings.py
from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    api_key: str | None = None
    base_url: str | None = None


def _rebuild_client(request: Request):
    from src.core.client import ImageClient

    settings = request.app.state.settings
    api_key = settings.get("api_key")
    base_url = settings.get("base_url") or None
    request.app.state.client = ImageClient(api_key=api_key, base_url=base_url) if api_key else None


@router.get("")
async def get_settings(request: Request):
    db = request.app.state.db
    api_key = await db.get_setting("api_key")
    base_url = await db.get_setting("base_url")
    return {
        "api_key_set": api_key is not None,
        "api_key_preview": f"...{api_key[-4:]}" if api_key else None,
        "base_url": base_url,
    }


@router.patch("")
async def update_settings(body: SettingsUpdate, request: Request):
    db = request.app.state.db
    if body.api_key is not None:
        await db.set_setting("api_key", body.api_key)
        request.app.state.settings["api_key"] = body.api_key
    if body.base_url is not None:
        await db.set_setting("base_url", body.base_url)
        request.app.state.settings["base_url"] = body.base_url
    _rebuild_client(request)
    return {"ok": True}
