# backend/src/api/generate.py
import base64
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

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


def _sessions(request: Request):
    return request.app.state.sessions


def _db(request: Request):
    return request.app.state.db


def _store(request: Request):
    return request.app.state.store


def _client(request: Request):
    return request.app.state.client


async def _resolve_previous_response_id(
    request: Request, session_id: str, fork_from: str | None
) -> str | None:
    """确定 previous_response_id：fork_from 优先，否则用会话 head"""
    db = _db(request)
    if fork_from:
        conn = db.connection()
        cursor = await conn.execute(
            "SELECT response_id FROM images WHERE id = ?", (fork_from,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Fork source image not found")
        return row["response_id"]

    sessions = _sessions(request)
    session = await sessions.get(session_id)
    return session.get("head_response_id") if session else None


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
    db = _db(request)
    store = _store(request)
    sessions = _sessions(request)

    image_data = base64.b64decode(image_b64)
    file_path = store.save_image(session_id, image_data, params.output_format)

    conn = db.connection()
    cursor = await conn.execute(
        "SELECT COUNT(*) as cnt FROM images WHERE session_id = ?",
        (session_id,),
    )
    row = await cursor.fetchone()
    step = (row["cnt"] if row else 0) + 1

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

    sessions = _sessions(request)
    session = await sessions.get(body.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    previous_response_id = await _resolve_previous_response_id(
        request, body.session_id, body.fork_from
    )

    params = body.params or GenerateParams()
    images = [img.model_dump(exclude_none=True) for img in body.images if img.type == "base64"]

    client = _client(request)

    async def event_stream():
        import json

        try:
            yield f"event: generating\ndata: {json.dumps({'session_id': body.session_id})}\n\n"

            result = await client.generate(
                prompt=body.prompt,
                images=images,
                previous_response_id=previous_response_id,
                params=params.model_dump(),
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
