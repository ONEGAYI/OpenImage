from fastapi import HTTPException, Request


def get_db(request: Request):
    return request.app.state.db


def get_client(request: Request):
    return request.app.state.client


def require_api_key(request: Request) -> str:
    api_key = request.app.state.settings.get("api_key")
    if not api_key:
        raise HTTPException(status_code=400, detail="API key not configured")
    return api_key


async def require_session(request: Request, session_id: str):
    session = await request.app.state.sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session
