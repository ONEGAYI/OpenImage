# backend/src/server.py
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from src.core.config import Config
from src.core.database import Database
from src.core.storage import ImageStore
from src.core.session import SessionManager
from src.core.client import ImageClient
from src.api.settings import _load_settings
from src.api.llm_settings import _load_llm_settings
from src.api.llm_chat import _recalc_token_counts, _cleanup_deleted_messages

from src.api import sessions as sessions_api
from src.api import generate as generate_api
from src.api import images as images_api
from src.api import settings as settings_api
from src.api import inpaint as inpaint_api
from src.api import llm_settings as llm_settings_api
from src.api import llm_chat as llm_chat_api
from src.core.llm_client import LLMClient

try:
    from src.build_info import BUILD_TIMESTAMP
except ImportError:
    BUILD_TIMESTAMP = None

APP_VERSION = "1.5.0"
FULL_VERSION = f"v{APP_VERSION}-{BUILD_TIMESTAMP}" if BUILD_TIMESTAMP else f"v{APP_VERSION}-dev"


class _CORPHeaderMiddleware:
    """Pure ASGI middleware — adds Cross-Origin-Resource-Policy header.

    BaseHTTPMiddleware (@app.middleware("http")) uses an asyncio.Queue to relay
    response bodies, which batches SSE events and breaks streaming.
    This implementation injects the header at the ASGI level with zero buffering.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_corp(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"cross-origin-resource-policy", b"cross-origin"))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_corp)


def create_app(base_dir: Path | None = None) -> FastAPI:
    config = Config(base_dir=base_dir)
    config.ensure_dirs()

    db = Database(config)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await db.initialize()
        app.state.db = db
        app.state.config = config
        app.state.sessions = SessionManager(db)
        app.state.store = ImageStore(config)

        settings, llm_settings = await asyncio.gather(
            _load_settings(db), _load_llm_settings(db)
        )
        app.state.settings = settings
        app.state.client = ImageClient.from_settings(settings)
        app.state.llm_settings = llm_settings
        app.state.llm_client = LLMClient.from_settings(llm_settings)

        # 启动时并行执行一次性数据维护
        conn = db.connection()
        await asyncio.gather(
            _recalc_token_counts(conn),
            _cleanup_deleted_messages(conn),
        )

        yield

        # 关闭客户端连接（httpx.AsyncClient / AsyncOpenAI）
        for client in (app.state.client, app.state.llm_client):
            if client:
                try:
                    await client.close()
                except Exception:
                    pass
        await db.close()

    app = FastAPI(title="OpenImage", version=APP_VERSION, lifespan=lifespan)
    app.state.full_version = FULL_VERSION

    app.add_middleware(_CORPHeaderMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^(tauri://localhost|https?://tauri\.localhost|https?://localhost:\d+)$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        max_age=600,
    )

    app.include_router(sessions_api.router)
    app.include_router(generate_api.router)
    app.include_router(images_api.router)
    app.include_router(settings_api.router)
    app.include_router(inpaint_api.router)
    app.include_router(llm_settings_api.router)
    app.include_router(llm_chat_api.router)

    return app


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(create_app(), host="127.0.0.1", port=8765)
