# backend/src/api/settings.py
from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    api_key: str | None = None


@router.get("")
async def get_settings(request: Request):
    db = request.app.state.db
    api_key = await db.get_setting("api_key")
    return {
        "api_key_set": api_key is not None,
        "api_key_preview": f"...{api_key[-4:]}" if api_key else None,
    }


@router.patch("")
async def update_settings(body: SettingsUpdate, request: Request):
    db = request.app.state.db
    if body.api_key is not None:
        await db.set_setting("api_key", body.api_key)
        from src.core.client import ImageClient
        request.app.state.client = ImageClient(api_key=body.api_key)
    return {"ok": True}
