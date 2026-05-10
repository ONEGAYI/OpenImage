# backend/src/api/generate.py
import base64
import logging

logger = logging.getLogger(__name__)
from io import BytesIO

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from PIL import Image
from pydantic import BaseModel

from src.core.sse import SSE_FLUSH, sse_event, sse_error, ERR_GENERATION_FAILED
from src.core.utils import gen_id
from src.api.deps import require_api_key, require_session, get_client

router = APIRouter(tags=["generate"])


class ImageInput(BaseModel):
    type: str  # "base64" | "image_id"
    data: str | None = None
    media_type: str | None = None
    id: str | None = None


class GenerateParams(BaseModel):
    size: str = "1024x1024"
    quality: str = "auto"
    output_format: str = "png"
    input_fidelity: str | None = None
    moderation: str | None = None


SIZE_TABLE: dict[str, dict[str, str]] = {
    "1:1": {"1K": "1024x1024", "2K": "2048x2048", "4K": "2880x2880"},
    "16:9": {"1K": "1536x1024", "2K": "2048x1152", "4K": "3840x2160"},
    "9:16": {"1K": "1024x1536", "2K": "1152x2048", "4K": "2160x3840"},
}

_SUPPORTED_SIZES = frozenset(v["1K"] for v in SIZE_TABLE.values())


def resolve_size(aspect_ratio: str, image_size: str) -> str:
    """将比例+档位映射为像素尺寸字符串（如 "1536x1024"）"""
    return SIZE_TABLE[aspect_ratio][image_size]


def detect_closest_ratio(width: int, height: int) -> str:
    """从像素尺寸检测最接近的支持比例"""
    actual = width / height
    supported = {"1:1": 1.0, "16:9": 16 / 9, "9:16": 9 / 16}
    return min(supported, key=lambda k: abs(actual - supported[k]))


class GenerateRequest(BaseModel):
    session_id: str
    prompt: str
    images: list[ImageInput] = []
    params: GenerateParams | None = None


async def _resolve_previous(
    request: Request, session_id: str
) -> tuple[str | None, str | None]:
    """解析上一步上下文：返回 (previous_response_id, history_image_b64)"""
    db = request.app.state.db
    store = request.app.state.store

    sessions = request.app.state.sessions
    session = await sessions.get(session_id)
    response_id = session.get("head_response_id") if session else None

    conn = db.connection()
    cursor = await conn.execute(
        "SELECT file_path FROM images WHERE session_id = ? ORDER BY step DESC LIMIT 1",
        (session_id,),
    )
    row = await cursor.fetchone()
    img_b64 = _read_image_b64(store, row["file_path"]) if row else None
    return response_id, img_b64


def _read_image_b64(store, relative_path: str) -> str | None:
    """从磁盘读取图片文件并返回 base64"""
    path = store.get_absolute_path(relative_path)
    if not path.exists():
        return None
    return base64.b64encode(path.read_bytes()).decode()


def _get_image_size(image_data: bytes) -> str | None:
    """读取图片实际尺寸，返回 "WxH" 格式"""
    try:
        img = Image.open(BytesIO(image_data))
        return f"{img.size[0]}x{img.size[1]}"
    except OSError:
        return None


async def _save_generated_image(
    request: Request,
    session_id: str,
    prompt: str,
    response_id: str,
    image_b64: str,
    revised_prompt: str | None,
    parent_image_id: str | None,
    params: GenerateParams,
) -> dict:
    """保存生成的图片到文件系统和数据库"""
    db = request.app.state.db
    store = request.app.state.store
    sessions = request.app.state.sessions

    image_data = base64.b64decode(image_b64)
    file_path = store.save_image(session_id, image_data, params.output_format)

    actual_size = _get_image_size(image_data) or params.size

    conn = db.connection()
    cursor = await conn.execute(
        "SELECT COALESCE(MAX(step), 0) + 1 as next_step FROM images WHERE session_id = ?",
        (session_id,),
    )
    row = await cursor.fetchone()
    step = row["next_step"]

    img_id = gen_id("img")
    relative_path = f"{session_id}/{file_path.name}"

    await conn.execute(
        """INSERT INTO images
        (id, session_id, step, response_id, prompt, revised_prompt,
         parent_image_id, file_path, size, quality, output_format)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            img_id, session_id, step, response_id, prompt,
            revised_prompt, parent_image_id, relative_path,
            actual_size, params.quality, params.output_format,
        ),
    )
    await conn.commit()

    await sessions.update_head(session_id, response_id)

    return {
        "image_id": img_id,
        "response_id": response_id,
        "revised_prompt": revised_prompt,
        "step": step,
        "file_path": relative_path,
        "size": actual_size,
        "quality": params.quality,
    }


@router.post("/api/generate")
async def generate(body: GenerateRequest, request: Request):
    """流式生成图片，返回 SSE"""
    require_api_key(request)
    await require_session(request, body.session_id)

    previous_response_id, history_image_b64 = await _resolve_previous(
        request, body.session_id
    )

    params = body.params or GenerateParams()
    if params.size not in _SUPPORTED_SIZES:
        logger.warning("Size '%s' not in supported set %s, API may silently ignore it", params.size, _SUPPORTED_SIZES)
    images = [img.model_dump(exclude_none=True) for img in body.images if img.type == "base64"]

    client = get_client(request)
    history_images = [history_image_b64] if history_image_b64 else None

    async def event_stream():
        try:
            yield SSE_FLUSH
            yield sse_event("generating", {"session_id": body.session_id})

            result = await client.generate(
                prompt=body.prompt,
                images=images,
                previous_response_id=previous_response_id,
                params=params.model_dump(),
                history_images=history_images,
            )

            saved = await _save_generated_image(
                request=request,
                session_id=body.session_id,
                prompt=body.prompt,
                response_id=result.response_id,
                image_b64=result.image_b64,
                revised_prompt=result.revised_prompt,
                parent_image_id=None,
                params=params,
            )

            yield sse_event("completed", saved)

        except Exception as e:
            logger.exception("Generation failed for session %s", body.session_id)
            yield sse_error(ERR_GENERATION_FAILED, str(e))

    return StreamingResponse(event_stream(), media_type="text/event-stream")
