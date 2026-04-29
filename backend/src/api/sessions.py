# backend/src/api/sessions.py
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class SessionCreate(BaseModel):
    name: str


class SessionRename(BaseModel):
    name: str


# 注入点：在 server.py 中通过 router.state 注入 SessionManager
def _sessions(request) -> "SessionManager":
    from src.core.session import SessionManager
    return request.app.state.sessions


@router.post("")
async def create_session(body: SessionCreate, request: Request):
    sm = _sessions(request)
    return await sm.create(body.name)


@router.get("")
async def list_sessions(request: Request):
    sm = _sessions(request)
    return await sm.list_all()


@router.get("/{session_id}")
async def get_session(session_id: str, request: Request):
    sm = _sessions(request)
    session = await sm.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.patch("/{session_id}")
async def rename_session(session_id: str, body: SessionRename, request: Request):
    sm = _sessions(request)
    session = await sm.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return await sm.rename(session_id, body.name)


@router.get("/{session_id}/images")
async def get_session_images(session_id: str, request: Request):
    sm = _sessions(request)
    session = await sm.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db = request.app.state.db
    conn = db.connection()
    cursor = await conn.execute(
        "SELECT * FROM images WHERE session_id = ? ORDER BY step ASC",
        (session_id,),
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@router.delete("/{session_id}")
async def delete_session(session_id: str, request: Request):
    sm = _sessions(request)
    session = await sm.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await sm.delete(session_id)
    return {"ok": True}
