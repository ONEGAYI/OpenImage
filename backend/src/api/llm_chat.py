"""LLM 聊天会话 + 消息 API。"""
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

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
    now = datetime.utcnow().isoformat()

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
    now = datetime.utcnow().isoformat()
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
