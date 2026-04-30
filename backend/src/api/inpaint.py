import base64
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from PIL import Image
from io import BytesIO
from pydantic import BaseModel

from src.core.client import API_MODE_CHAT
from src.api.generate import GenerateParams, _read_image_b64, _save_generated_image

router = APIRouter(tags=["inpaint"])


class InpaintRequest(BaseModel):
    session_id: str
    prompt: str
    source_image_id: str | None = None
    source_image_b64: str | None = None
    mask_b64: str
    params: GenerateParams | None = None


def _decode_and_validate_mask(mask_b64: str) -> None:
    """校验 mask_b64 是否为合法图片"""
    try:
        data = base64.b64decode(mask_b64)
        Image.open(BytesIO(data))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid mask image")


@router.post("/api/inpaint")
async def inpaint(body: InpaintRequest, request: Request):
    """Inpainting 局部重绘，返回 SSE"""
    # 校验来源
    if not body.source_image_id and not body.source_image_b64:
        raise HTTPException(
            status_code=400,
            detail="Must provide either source_image_id or source_image_b64",
        )

    api_key = request.app.state.settings.get("api_key")
    if not api_key:
        raise HTTPException(status_code=400, detail="API key not configured")

    sessions = request.app.state.sessions
    session = await sessions.get(body.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    _decode_and_validate_mask(body.mask_b64)

    # 获取原图 base64
    if body.source_image_id:
        db = request.app.state.db
        store = request.app.state.store
        conn = db.connection()
        cursor = await conn.execute(
            "SELECT file_path FROM images WHERE id = ?", (body.source_image_id,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Source image not found")
        source_b64 = _read_image_b64(store, row["file_path"])
        if not source_b64:
            raise HTTPException(status_code=404, detail="Source image file missing")
    else:
        source_b64 = body.source_image_b64

    params = body.params or GenerateParams()
    client = request.app.state.client

    async def event_stream():
        try:
            yield f"event: generating\ndata: {json.dumps({'session_id': body.session_id})}\n\n"

            result = await client.generate(
                prompt=body.prompt,
                images=[],
                previous_response_id=None,
                params=params.model_dump(),
                history_images=None,
                mask_b64=body.mask_b64,
                source_image_b64=source_b64,
            )

            saved = await _save_generated_image(
                request=request,
                session_id=body.session_id,
                prompt=body.prompt,
                response_id=result.response_id,
                image_b64=result.image_b64,
                revised_prompt=result.revised_prompt,
                parent_image_id=body.source_image_id,
                params=params,
            )

            yield f"event: completed\ndata: {json.dumps(saved)}\n\n"

        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'code': 'inpaint_failed', 'message': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
