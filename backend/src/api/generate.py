# backend/src/api/generate.py
import base64
import json
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.core.client import API_MODE_CHAT

router = APIRouter(tags=["generate"])


class ImageInput(BaseModel):
    type: str  # "base64" | "image_id"
    data: str | None = None
    media_type: str | None = None
    id: str | None = None


class GenerateParams(BaseModel):
    size: str = "1024x1024"
    quality: str = "high"
    output_format: str = "png"


class GenerateRequest(BaseModel):
    session_id: str
    prompt: str
    images: list[ImageInput] = []
    fork_from: str | None = None
    params: GenerateParams | None = None


async def _resolve_previous(
    request: Request, session_id: str, fork_from: str | None
) -> tuple[str | None, str | None]:
    """解析上一步上下文：返回 (previous_response_id, history_image_b64)"""
    db = request.app.state.db
    store = request.app.state.store

    # fork_from：查指定图片的 response_id 和 file_path（一次查询）
    if fork_from:
        conn = db.connection()
        cursor = await conn.execute(
            "SELECT response_id, file_path FROM images WHERE id = ?", (fork_from,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Fork source image not found")

        response_id = row["response_id"]
        img_b64 = _read_image_b64(store, row["file_path"])
        return response_id, img_b64

    # 无 fork：response_id 取 session head，history 取最新图片
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

    conn = db.connection()
    cursor = await conn.execute(
        "SELECT COALESCE(MAX(step), 0) + 1 as next_step FROM images WHERE session_id = ?",
        (session_id,),
    )
    row = await cursor.fetchone()
    step = row["next_step"]

    img_id = f"img_{uuid.uuid4().hex[:12]}"
    relative_path = f"{session_id}/{file_path.name}"

    await conn.execute(
        """INSERT INTO images
        (id, session_id, step, response_id, prompt, revised_prompt,
         parent_image_id, file_path, size, quality, output_format)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            img_id, session_id, step, response_id, prompt,
            revised_prompt, parent_image_id, relative_path,
            params.size, params.quality, params.output_format,
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
        "size": params.size,
        "quality": params.quality,
    }


@router.post("/api/generate")
async def generate(body: GenerateRequest, request: Request):
    """流式生成图片，返回 SSE"""
    api_key = request.app.state.settings.get("api_key")
    if not api_key:
        raise HTTPException(status_code=400, detail="API key not configured")

    sessions = request.app.state.sessions
    session = await sessions.get(body.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    previous_response_id, history_image_b64 = await _resolve_previous(
        request, body.session_id, body.fork_from
    )

    params = body.params or GenerateParams()
    images = [img.model_dump(exclude_none=True) for img in body.images if img.type == "base64"]

    client = request.app.state.client
    history_images = [history_image_b64] if (
        client.api_mode == API_MODE_CHAT and history_image_b64
    ) else None

    async def event_stream():
        try:
            yield f"event: generating\ndata: {json.dumps({'session_id': body.session_id})}\n\n"

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
                parent_image_id=body.fork_from,
                params=params,
            )

            yield f"event: completed\ndata: {json.dumps(saved)}\n\n"

        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'code': 'generation_failed', 'message': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
