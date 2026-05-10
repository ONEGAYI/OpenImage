# backend/src/api/sessions.py
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from src.core.session import SessionManager

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class SessionCreate(BaseModel):
    name: str


class SessionRename(BaseModel):
    name: str


class ForkRequest(BaseModel):
    image_id: str


def _sessions(request: Request) -> SessionManager:
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
    return await sm.get_images(session_id)


@router.post("/{session_id}/fork")
async def fork_session(session_id: str, body: ForkRequest, request: Request):
    sm = _sessions(request)
    store = request.app.state.store
    session = await sm.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        return await sm.fork(store, session_id, body.image_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{session_id}")
async def delete_session(session_id: str, request: Request):
    sm = _sessions(request)
    session = await sm.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await sm.delete(session_id)
    return {"ok": True}
