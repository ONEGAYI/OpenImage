"""LLM 聊天会话 + 消息 API。"""
import json
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.core.llm_prompt import compose_system_prompt
from src.core.llm_tokenizer import estimate_tokens

router = APIRouter(prefix="/api", tags=["llm-chat"])


def _db(request: Request):
    return request.app.state.db


def _gen_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# ── Pydantic Models ──


class ChatSessionCreate(BaseModel):
    name: str = "新对话"


class ChatSessionRename(BaseModel):
    name: str


class MessageEdit(BaseModel):
    content: str


class BatchDelete(BaseModel):
    message_ids: list[str]


class ChatContext(BaseModel):
    aspect_ratio: str | None = None
    size_label: str | None = None


class ChatRequest(BaseModel):
    content: str
    attachments: list[dict] | None = None
    form_response: dict | None = None
    context: ChatContext | None = None


# ── 聊天会话 CRUD ──


@router.get("/sessions/{session_id}/llm-chats")
async def list_chat_sessions(session_id: str, request: Request):
    db = _db(request)
    conn = db.connection()
    cursor = await conn.execute(
        "SELECT id, session_id, name, created_at, updated_at, total_tokens "
        "FROM llm_chat_sessions WHERE session_id = ? ORDER BY updated_at DESC",
        (session_id,),
    )
    rows = await cursor.fetchall()
    return [
        {
            "id": r[0], "session_id": r[1], "name": r[2],
            "created_at": r[3], "updated_at": r[4], "total_tokens": r[5],
        }
        for r in rows
    ]


@router.post("/sessions/{session_id}/llm-chats")
async def create_chat_session(session_id: str, request: Request, body: ChatSessionCreate = None):
    db = _db(request)
    chat_id = _gen_id("lc")
    name = body.name if body else "新对话"
    now = datetime.now(UTC).isoformat()

    conn = db.connection()
    await conn.execute(
        "INSERT INTO llm_chat_sessions (id, session_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (chat_id, session_id, name, now, now),
    )
    await conn.commit()

    return {
        "id": chat_id, "session_id": session_id, "name": name,
        "created_at": now, "updated_at": now, "total_tokens": 0,
    }


@router.patch("/llm-chats/{chat_id}")
async def rename_chat_session(chat_id: str, request: Request, body: ChatSessionRename):
    db = _db(request)
    conn = db.connection()
    now = datetime.now(UTC).isoformat()
    await conn.execute(
        "UPDATE llm_chat_sessions SET name = ?, updated_at = ? WHERE id = ?",
        (body.name, now, chat_id),
    )
    await conn.commit()
    cursor = await conn.execute("SELECT * FROM llm_chat_sessions WHERE id = ?", (chat_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "聊天会话不存在")
    return {"id": row[0], "session_id": row[1], "name": row[2],
            "created_at": row[3], "updated_at": row[4], "total_tokens": row[5]}


@router.delete("/llm-chats/{chat_id}")
async def delete_chat_session(chat_id: str, request: Request):
    db = _db(request)
    conn = db.connection()
    await conn.execute("DELETE FROM llm_messages WHERE chat_session_id = ?", (chat_id,))
    await conn.execute("DELETE FROM llm_chat_sessions WHERE id = ?", (chat_id,))
    await conn.commit()
    return {"ok": True}


# ── 消息 CRUD ──


@router.get("/llm-chats/{chat_id}/messages")
async def list_messages(chat_id: str, request: Request):
    db = _db(request)
    conn = db.connection()

    # 清理超过 48h 的软删除记录
    cutoff = (datetime.now(UTC) - timedelta(hours=48)).isoformat()
    await conn.execute(
        "DELETE FROM llm_messages WHERE chat_session_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?",
        (chat_id, cutoff),
    )
    await conn.commit()

    cursor = await conn.execute(
        "SELECT id, chat_session_id, role, content, ai_block, token_count, attachments, created_at, deleted_at "
        "FROM llm_messages WHERE chat_session_id = ? AND deleted_at IS NULL ORDER BY created_at ASC",
        (chat_id,),
    )
    rows = await cursor.fetchall()
    return [
        {
            "id": r[0], "chat_session_id": r[1], "role": r[2], "content": r[3],
            "ai_block": r[4], "token_count": r[5], "attachments": r[6],
            "created_at": r[7], "deleted_at": r[8],
        }
        for r in rows
    ]


@router.patch("/llm-messages/{message_id}")
async def edit_message(message_id: str, request: Request, body: MessageEdit):
    db = _db(request)
    conn = db.connection()
    await conn.execute(
        "UPDATE llm_messages SET content = ? WHERE id = ?",
        (body.content, message_id),
    )
    await conn.commit()
    cursor = await conn.execute("SELECT * FROM llm_messages WHERE id = ?", (message_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "消息不存在")
    return {"id": row[0], "content": row[3]}


@router.delete("/llm-messages/{message_id}")
async def delete_message(message_id: str, request: Request):
    db = _db(request)
    conn = db.connection()
    now = datetime.now(UTC).isoformat()
    await conn.execute(
        "UPDATE llm_messages SET deleted_at = ? WHERE id = ?",
        (now, message_id),
    )
    await conn.commit()
    return {"ok": True, "deleted_at": now}


@router.post("/llm-messages/batch-delete")
async def batch_delete_messages(request: Request, body: BatchDelete):
    db = _db(request)
    conn = db.connection()
    now = datetime.now(UTC).isoformat()
    placeholders = ",".join("?" for _ in body.message_ids)
    await conn.execute(
        f"UPDATE llm_messages SET deleted_at = ? WHERE id IN ({placeholders})",
        [now, *body.message_ids],
    )
    await conn.commit()
    return {"ok": True, "count": len(body.message_ids)}


@router.post("/llm-messages/{message_id}/undo-delete")
async def undo_delete_message(message_id: str, request: Request):
    db = _db(request)
    conn = db.connection()
    await conn.execute(
        "UPDATE llm_messages SET deleted_at = NULL WHERE id = ?",
        (message_id,),
    )
    await conn.commit()
    return {"ok": True}


# ── SSE 聊天 ──


@router.post("/llm-chats/{chat_id}/chat")
async def chat(chat_id: str, request: Request, body: ChatRequest):
    db = _db(request)
    conn = db.connection()
    llm_client = request.app.state.llm_client

    # 验证聊天会话存在
    cursor = await conn.execute("SELECT session_id FROM llm_chat_sessions WHERE id = ?", (chat_id,))
    session_row = await cursor.fetchone()
    if not session_row:
        raise HTTPException(404, "聊天会话不存在")

    # 保存用户消息
    user_msg_id = _gen_id("lm")
    now = datetime.now(UTC).isoformat()
    attachments_json = json.dumps(body.attachments) if body.attachments else None
    await conn.execute(
        "INSERT INTO llm_messages (id, chat_session_id, role, content, attachments, created_at) "
        "VALUES (?, ?, 'user', ?, ?, ?)",
        (user_msg_id, chat_id, body.content, attachments_json, now),
    )
    await conn.commit()

    # 加载历史消息（排除已删除的）
    cursor = await conn.execute(
        "SELECT role, content, ai_block FROM llm_messages "
        "WHERE chat_session_id = ? AND deleted_at IS NULL ORDER BY created_at ASC",
        (chat_id,),
    )
    history_rows = await cursor.fetchall()

    # 构建历史消息（ai_block 摘要附加到 content）
    history = []
    for r in history_rows:
        msg = {"role": r[0], "content": r[1]}
        if r[2]:  # ai_block
            try:
                block = json.loads(r[2])
                if block.get("type") == "questions":
                    labels = ", ".join(f["label"] for f in block.get("fields", []))
                    msg["content"] += f"\n[之前询问了用户：{labels}]"
                elif block.get("type") == "suggestions":
                    titles = ", ".join(s["title"] for s in block.get("items", []))
                    msg["content"] += f"\n[之前提供了以下方案：{titles}]"
            except json.JSONDecodeError:
                pass
        history.append(msg)

    # 查询当前会话图片（用于 L3 上下文注入）
    cursor = await conn.execute(
        "SELECT prompt FROM images WHERE session_id = ? ORDER BY created_at DESC LIMIT 5",
        (session_row[0],),
    )
    img_rows = await cursor.fetchall()
    session_images = [{"prompt": r[0]} for r in img_rows] if img_rows else None

    # 组装 4 层系统提示词
    user_custom = request.app.state.llm_settings.get("llm_system_prompt") or None
    system_prompt = compose_system_prompt(
        user_custom=user_custom,
        aspect_ratio=body.context.aspect_ratio if body.context else None,
        size_label=body.context.size_label if body.context else None,
        session_images=session_images,
    )

    # 构建消息列表
    messages = llm_client.build_messages(
        system_prompt=system_prompt,
        history=history[:-1],
        user_content=body.content,
        attachments=body.attachments or [],
    )

    async def event_generator():
        full_text = ""
        ai_block_data = None
        prompt_tokens = 0
        completion_tokens = 0

        try:
            async for event in llm_client.chat_stream(messages):
                if event.type == "token":
                    full_text += event.data["text"]
                    yield f"event: token\ndata: {json.dumps(event.data, ensure_ascii=False)}\n\n"

                elif event.type == "buffering":
                    yield f"event: buffering\ndata: {json.dumps(event.data, ensure_ascii=False)}\n\n"

                elif event.type == "ai_block":
                    ai_block_data = event.data
                    yield f"event: ai_block\ndata: {json.dumps(event.data, ensure_ascii=False)}\n\n"

                elif event.type == "parse_warning":
                    yield f"event: parse_warning\ndata: {json.dumps(event.data, ensure_ascii=False)}\n\n"

                elif event.type == "usage":
                    prompt_tokens = event.data.get("prompt_tokens", 0)
                    completion_tokens = event.data.get("completion_tokens", 0)
                    yield f"event: usage\ndata: {json.dumps(event.data, ensure_ascii=False)}\n\n"

                elif event.type == "error":
                    yield f"event: error\ndata: {json.dumps(event.data, ensure_ascii=False)}\n\n"
                    return

            # 保存 AI 回复
            ai_msg_id = _gen_id("lm")
            token_count = completion_tokens or estimate_tokens(full_text)
            ai_block_json = json.dumps(ai_block_data, ensure_ascii=False) if ai_block_data else None

            await conn.execute(
                "INSERT INTO llm_messages (id, chat_session_id, role, content, ai_block, token_count, created_at) "
                "VALUES (?, ?, 'assistant', ?, ?, ?, ?)",
                (ai_msg_id, chat_id, full_text, ai_block_json, token_count, datetime.now(UTC).isoformat()),
            )

            # 更新会话 token 统计
            total_add = prompt_tokens + completion_tokens
            if total_add > 0:
                await conn.execute(
                    "UPDATE llm_chat_sessions SET total_tokens = total_tokens + ?, updated_at = ? WHERE id = ?",
                    (total_add, datetime.now(UTC).isoformat(), chat_id),
                )
            else:
                await conn.execute(
                    "UPDATE llm_chat_sessions SET updated_at = ? WHERE id = ?",
                    (datetime.now(UTC).isoformat(), chat_id),
                )
            await conn.commit()

            yield f'event: completed\ndata: {json.dumps({"message_id": ai_msg_id, "token_count": token_count}, ensure_ascii=False)}\n\n'

        except Exception as e:
            yield f'event: error\ndata: {json.dumps({"code": "stream_error", "message": str(e)}, ensure_ascii=False)}\n\n'

    return StreamingResponse(event_generator(), media_type="text/event-stream")
