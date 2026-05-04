"""LLM 聊天会话 + 消息 API。"""
import json
import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.core.llm_prompt import compose_system_prompt
from src.core.llm_tokenizer import estimate_message_tokens, estimate_tokens
from src.core.sse import SSE_FLUSH, sse_event, sse_error, ERR_STREAM_ERROR
from src.core.utils import gen_id
from src.api.deps import get_db

DEFAULT_CHAT_NAME = "新对话"

router = APIRouter(prefix="/api", tags=["llm-chat"])


def _gen_id(prefix: str) -> str:
    return gen_id(prefix)


async def _get_prev_cumulative_tokens(conn, chat_id: str) -> int:
    """获取会话中最后一条未删除消息的累计 token_count。"""
    cursor = await conn.execute(
        "SELECT token_count FROM llm_messages "
        "WHERE chat_session_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",
        (chat_id,),
    )
    row = await cursor.fetchone()
    return row[0] if row else 0


async def _auto_name_session(conn, chat_id: str) -> str | None:
    """首次回复后将默认名替换为用户首条消息摘要，返回新名称或 None。"""
    cursor = await conn.execute(
        "SELECT content FROM llm_messages "
        "WHERE chat_session_id = ? AND role = 'user' AND deleted_at IS NULL "
        "ORDER BY created_at ASC LIMIT 1",
        (chat_id,),
    )
    first_msg = await cursor.fetchone()
    if not first_msg or not first_msg[0].strip():
        return None
    name = first_msg[0].replace("\n", " ").strip()[:30]
    cursor = await conn.execute(
        "UPDATE llm_chat_sessions SET name = ? WHERE id = ? AND name = ?",
        (name, chat_id, DEFAULT_CHAT_NAME),
    )
    return name if cursor.rowcount > 0 else None


async def _save_ai_response(
    conn,
    chat_id: str,
    full_text: str,
    ai_block_data: dict | None,
    thinking_content: str,
    thinking_duration_ms: int,
    user_cumulative: int,
    prompt_tokens: int,
    completion_tokens: int,
) -> tuple[str, int, str | None]:
    """保存 AI 回复并更新 token 统计，返回 (message_id, token_count, session_name)。"""
    ai_msg_id = _gen_id("lm")
    if prompt_tokens + completion_tokens > 0:
        token_count = prompt_tokens + completion_tokens
    else:
        token_count = user_cumulative + estimate_message_tokens(
            "assistant", full_text, thinking_content, ai_block_data,
        )
    ai_block_json = json.dumps(ai_block_data, ensure_ascii=False) if ai_block_data else None
    now = datetime.now(UTC).isoformat()

    await conn.execute(
        "INSERT INTO llm_messages "
        "(id, chat_session_id, role, content, ai_block, token_count, thinking_content, thinking_duration_ms, created_at) "
        "VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?)",
        (ai_msg_id, chat_id, full_text, ai_block_json, token_count,
         thinking_content or None, thinking_duration_ms or None, now),
    )
    await conn.execute(
        "UPDATE llm_chat_sessions SET total_tokens = ?, updated_at = ? WHERE id = ?",
        (token_count, now, chat_id),
    )
    session_name = await _auto_name_session(conn, chat_id)
    await conn.commit()
    return ai_msg_id, token_count, session_name


# ── Pydantic Models ──


class ChatSessionCreate(BaseModel):
    name: str = DEFAULT_CHAT_NAME


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


class InterruptedMessage(BaseModel):
    content: str
    thinking_content: str | None = None
    thinking_duration_ms: int | None = None


# ── 聊天会话 CRUD ──


@router.get("/sessions/{session_id}/llm-chats")
async def list_chat_sessions(session_id: str, request: Request):
    db = get_db(request)
    conn = db.connection()
    cursor = await conn.execute(
        "SELECT id, session_id, name, created_at, updated_at, total_tokens "
        "FROM llm_chat_sessions WHERE session_id = ? ORDER BY updated_at DESC",
        (session_id,),
    )
    rows = await cursor.fetchall()
    results = [
        {
            "id": r[0], "session_id": r[1], "name": r[2],
            "created_at": r[3], "updated_at": r[4], "total_tokens": r[5],
        }
        for r in rows
    ]

    return results


async def _recalc_token_counts(conn) -> None:
    """回填 token 数据异常的会话：按累计值语义重算 token_count。"""
    cursor = await conn.execute(
        "SELECT id FROM llm_chat_sessions",
    )
    sessions = await cursor.fetchall()
    needs_fix = []
    msg_fixes = []
    for (session_id,) in sessions:
        cursor = await conn.execute(
            "SELECT id, role, content, thinking_content, ai_block, token_count "
            "FROM llm_messages WHERE chat_session_id = ? AND deleted_at IS NULL ORDER BY created_at ASC",
            (session_id,),
        )
        msgs = await cursor.fetchall()
        cumulative = 0
        any_updated = False
        for msg in msgs:
            _, role, content, thinking, block, saved_tc = msg
            est = estimate_message_tokens(
                role=role, content=content,
                thinking_content=thinking,
                ai_block=json.loads(block) if block else None,
                saved_token_count=0,
            )
            cumulative += est
            if cumulative != saved_tc:
                msg_fixes.append((cumulative, msg[0]))
                any_updated = True
        total_tokens_row = await (await conn.execute(
            "SELECT total_tokens FROM llm_chat_sessions WHERE id = ?", (session_id,),
        )).fetchone()
        if any_updated or (total_tokens_row and total_tokens_row[0] != cumulative):
            needs_fix.append((cumulative, session_id))
    if msg_fixes:
        await conn.executemany("UPDATE llm_messages SET token_count = ? WHERE id = ?", msg_fixes)
    if needs_fix:
        await conn.executemany("UPDATE llm_chat_sessions SET total_tokens = ? WHERE id = ?", needs_fix)
        await conn.commit()


async def _cleanup_deleted_messages(conn) -> None:
    """清理超过 48h 的软删除记录。"""
    cutoff = (datetime.now(UTC) - timedelta(hours=48)).isoformat()
    await conn.execute(
        "DELETE FROM llm_messages WHERE deleted_at IS NOT NULL AND deleted_at < ?",
        (cutoff,),
    )
    await conn.commit()


# ── 聊天会话 CRUD ──


@router.post("/sessions/{session_id}/llm-chats")
async def create_chat_session(session_id: str, request: Request, body: ChatSessionCreate = None):
    db = get_db(request)
    chat_id = _gen_id("lc")
    name = body.name if body else DEFAULT_CHAT_NAME
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
    db = get_db(request)
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
        raise HTTPException(404, "Chat session not found")
    return {"id": row[0], "session_id": row[1], "name": row[2],
            "created_at": row[3], "updated_at": row[4], "total_tokens": row[5]}


@router.delete("/llm-chats/{chat_id}")
async def delete_chat_session(chat_id: str, request: Request):
    db = get_db(request)
    conn = db.connection()
    await conn.execute("DELETE FROM llm_messages WHERE chat_session_id = ?", (chat_id,))
    await conn.execute("DELETE FROM llm_chat_sessions WHERE id = ?", (chat_id,))
    await conn.commit()
    return {"ok": True}


# ── 消息 CRUD ──


@router.get("/llm-chats/{chat_id}/messages")
async def list_messages(chat_id: str, request: Request):
    db = get_db(request)
    conn = db.connection()

    cursor = await conn.execute(
        "SELECT id, chat_session_id, role, content, ai_block, token_count, attachments, "
        "thinking_content, thinking_duration_ms, created_at, deleted_at "
        "FROM llm_messages WHERE chat_session_id = ? AND deleted_at IS NULL ORDER BY created_at ASC",
        (chat_id,),
    )
    rows = await cursor.fetchall()
    return [
        {
            "id": r[0], "chat_session_id": r[1], "role": r[2], "content": r[3],
            "ai_block": r[4], "token_count": r[5], "attachments": r[6],
            "thinking_content": r[7], "thinking_duration_ms": r[8],
            "created_at": r[9], "deleted_at": r[10],
        }
        for r in rows
    ]


@router.patch("/llm-messages/{message_id}")
async def edit_message(message_id: str, request: Request, body: MessageEdit):
    db = get_db(request)
    conn = db.connection()
    await conn.execute(
        "UPDATE llm_messages SET content = ? WHERE id = ?",
        (body.content, message_id),
    )
    await conn.commit()
    cursor = await conn.execute("SELECT * FROM llm_messages WHERE id = ?", (message_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Message not found")
    return {"id": row[0], "content": row[3]}


@router.delete("/llm-messages/{message_id}")
async def delete_message(message_id: str, request: Request):
    db = get_db(request)
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
    if len(body.message_ids) > 100:
        raise HTTPException(400, "Too many message IDs (max 100)")
    db = get_db(request)
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
    db = get_db(request)
    conn = db.connection()
    await conn.execute(
        "UPDATE llm_messages SET deleted_at = NULL WHERE id = ?",
        (message_id,),
    )
    await conn.commit()
    return {"ok": True}


@router.delete("/llm-chats/{chat_id}/messages/last")
async def delete_last_message(chat_id: str, request: Request):
    """删除指定会话的最后一条未删除消息，更新 token 统计。"""
    db = get_db(request)
    conn = db.connection()

    # 查询最后一条未删除消息
    cursor = await conn.execute(
        "SELECT id, token_count FROM llm_messages "
        "WHERE chat_session_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",
        (chat_id,),
    )
    last_msg = await cursor.fetchone()
    if not last_msg:
        raise HTTPException(404, "No messages to delete")

    # 软删除
    now = datetime.now(UTC).isoformat()
    await conn.execute(
        "UPDATE llm_messages SET deleted_at = ? WHERE id = ?",
        (now, last_msg[0]),
    )

    # 查询新的最后一条未删除消息 → total_tokens
    total_tokens = await _get_prev_cumulative_tokens(conn, chat_id)

    await conn.execute(
        "UPDATE llm_chat_sessions SET total_tokens = ?, updated_at = ? WHERE id = ?",
        (total_tokens, now, chat_id),
    )
    await conn.commit()

    return {"ok": True, "deleted_message_id": last_msg[0], "total_tokens": total_tokens}


@router.post("/llm-chats/{chat_id}/messages/interrupted")
async def save_interrupted_message(chat_id: str, request: Request, body: InterruptedMessage):
    """保存中断生成后的部分消息。"""
    db = get_db(request)
    conn = db.connection()

    cursor = await conn.execute("SELECT id FROM llm_chat_sessions WHERE id = ?", (chat_id,))
    if not await cursor.fetchone():
        raise HTTPException(404, "Chat session not found")

    # 查询前一条消息的累计 token_count
    prev_token_count = await _get_prev_cumulative_tokens(conn, chat_id)

    msg_id = _gen_id("lm")
    content = body.content + "<!-- interrupted -->"
    token_count = prev_token_count + estimate_message_tokens("assistant", content, body.thinking_content)

    now = datetime.now(UTC).isoformat()
    await conn.execute(
        "INSERT INTO llm_messages "
        "(id, chat_session_id, role, content, ai_block, token_count, thinking_content, thinking_duration_ms, created_at) "
        "VALUES (?, ?, 'assistant', ?, NULL, ?, ?, ?, ?)",
        (msg_id, chat_id, content, token_count,
         body.thinking_content, body.thinking_duration_ms, now),
    )

    # 直接赋值（token_count 已是累计值）
    await conn.execute(
        "UPDATE llm_chat_sessions SET total_tokens = ?, updated_at = ? WHERE id = ?",
        (token_count, now, chat_id),
    )
    await conn.commit()

    return {
        "id": msg_id,
        "chat_session_id": chat_id,
        "role": "assistant",
        "content": content,
        "ai_block": None,
        "token_count": token_count,
        "attachments": None,
        "thinking_content": body.thinking_content,
        "thinking_duration_ms": body.thinking_duration_ms,
        "created_at": now,
        "deleted_at": None,
    }


# ── SSE 聊天 ──


@router.post("/llm-chats/{chat_id}/chat")
async def chat(chat_id: str, request: Request, body: ChatRequest):
    db = get_db(request)
    conn = db.connection()
    llm_client = request.app.state.llm_client

    # 验证聊天会话存在
    cursor = await conn.execute("SELECT session_id FROM llm_chat_sessions WHERE id = ?", (chat_id,))
    session_row = await cursor.fetchone()
    if not session_row:
        raise HTTPException(404, "Chat session not found")

    # 保存用户消息（token_count = 前一条累计值 + 本条估算值）
    user_msg_id = _gen_id("lm")
    now = datetime.now(UTC).isoformat()
    attachments_json = json.dumps(body.attachments) if body.attachments else None
    prev_token_count = await _get_prev_cumulative_tokens(conn, chat_id)
    user_cumulative = prev_token_count + estimate_tokens(body.content)
    await conn.execute(
        "INSERT INTO llm_messages (id, chat_session_id, role, content, token_count, attachments, created_at) "
        "VALUES (?, ?, 'user', ?, ?, ?, ?)",
        (user_msg_id, chat_id, body.content, user_cumulative, attachments_json, now),
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
        "SELECT prompt FROM images WHERE session_id = ? ORDER BY created_at DESC LIMIT 3",
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
        yield SSE_FLUSH

        full_text = ""
        ai_block_data = None
        prompt_tokens = 0
        completion_tokens = 0
        thinking_content = ""
        thinking_duration_ms = 0

        log = logging.getLogger(__name__)
        log.debug("新聊天请求 model=%s url=%s", llm_client.model_name, llm_client.base_url)

        try:
            async for event in llm_client.chat_stream(messages):
                if event.type == "token":
                    full_text += event.data["text"]
                elif event.type == "thinking":
                    thinking_content += event.data["text"]
                elif event.type == "ai_block":
                    ai_block_data = event.data
                elif event.type == "usage":
                    prompt_tokens = event.data.get("prompt_tokens", 0)
                    completion_tokens = event.data.get("completion_tokens", 0)
                elif event.type == "completed":
                    thinking_content = thinking_content or event.data.get("thinking_content", "")
                    thinking_duration_ms = event.data.get("thinking_duration_ms", 0)
                    continue  # 不转发 llm_client 的 completed，由后面保存完的 completed 取代

                yield sse_event(event.type, event.data)

                if event.type == "error":
                    log.error("LLM 流式错误: %s", event.data)
                    return

            log.debug("流结束 full_text=%dchars", len(full_text))

            ai_msg_id, token_count, session_name = await _save_ai_response(
                conn, chat_id, full_text, ai_block_data,
                thinking_content, thinking_duration_ms,
                user_cumulative, prompt_tokens, completion_tokens,
            )

            completed_data = {
                "message_id": ai_msg_id,
                "token_count": token_count,
                "total_tokens": token_count,
            }
            if thinking_content:
                completed_data["thinking_content"] = thinking_content
                completed_data["thinking_duration_ms"] = thinking_duration_ms
            if session_name:
                completed_data["session_name"] = session_name
            yield sse_event("completed", completed_data)

        except Exception as e:
            yield sse_error(ERR_STREAM_ERROR, str(e))

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
