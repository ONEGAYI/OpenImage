import base64
from io import BytesIO

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from PIL import Image
from pydantic import BaseModel

from src.api.generate import (
    GenerateParams,
    _read_image_b64,
    _save_generated_image,
    resolve_size,
    detect_closest_ratio,
)
from src.core.sse import SSE_FLUSH, sse_event, sse_error, ERR_INPAINT_FAILED
from src.api.deps import require_api_key, require_session, get_client

router = APIRouter(tags=["inpaint"])


class ReferenceImage(BaseModel):
    data: str        # base64
    media_type: str  # e.g. "image/png"


class InpaintRequest(BaseModel):
    session_id: str
    prompt: str
    source_image_id: str | None = None
    source_image_b64: str | None = None
    mask_b64: str
    reference_images: list[ReferenceImage] | None = None
    params: GenerateParams | None = None


def _validate_mask_b64(mask_b64: str) -> None:
    """校验 mask_b64 是否为合法 base64"""
    import binascii
    try:
        base64.b64decode(mask_b64, validate=True)
    except (binascii.Error, ValueError, TypeError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid mask image: {e}")


def _inpaint_size_from_source(width: int, height: int, tier: str = "1K") -> str:
    """根据源图尺寸和档位计算 Inpaint 输出尺寸（自动锁定比例）"""
    ratio = detect_closest_ratio(width, height)
    return resolve_size(ratio, tier)


@router.post("/api/inpaint")
async def inpaint(body: InpaintRequest, request: Request):
    """Inpainting 局部重绘，返回 SSE"""
    # 校验来源
    if not body.source_image_id and not body.source_image_b64:
        raise HTTPException(
            status_code=400,
            detail="Must provide either source_image_id or source_image_b64",
        )

    require_api_key(request)
    await require_session(request, body.session_id)

    _validate_mask_b64(body.mask_b64)

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

    # Inpaint 自动锁定源图比例，计算输出尺寸
    source_data = base64.b64decode(source_b64)
    source_img = Image.open(BytesIO(source_data))
    params.size = _inpaint_size_from_source(*source_img.size)
    del source_data
    source_img.close()

    client = get_client(request)

    async def event_stream():
        try:
            yield SSE_FLUSH
            yield sse_event("generating", {"session_id": body.session_id})

            refs = [{"data": r.data, "media_type": r.media_type} for r in body.reference_images] if body.reference_images else None

            result = await client.generate(
                prompt=body.prompt,
                images=[],
                previous_response_id=None,
                params=params.model_dump(),
                history_images=None,
                mask_b64=body.mask_b64,
                source_image_b64=source_b64,
                reference_images=refs,
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

            yield sse_event("completed", saved)

        except Exception as e:
            yield sse_error(ERR_INPAINT_FAILED, str(e))

    return StreamingResponse(event_stream(), media_type="text/event-stream")
