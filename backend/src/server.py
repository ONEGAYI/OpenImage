# backend/src/server.py
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from src.core.config import Config
from src.core.database import Database
from src.core.storage import ImageStore
from src.core.session import SessionManager
from src.core.client import ImageClient
from src.api.settings import _load_settings

from src.api import sessions as sessions_api
from src.api import generate as generate_api
from src.api import images as images_api
from src.api import settings as settings_api
from src.api import inpaint as inpaint_api
from src.api.llm_settings import router as llm_settings_api
# from src.api.llm_chat import router as llm_chat_api  # Task 5 创建后取消注释
from src.core.llm_client import LLMClient

try:
    from src.build_info import BUILD_TIMESTAMP
except ImportError:
    BUILD_TIMESTAMP = None

APP_VERSION = "1.4.0"
FULL_VERSION = f"v{APP_VERSION}-{BUILD_TIMESTAMP}" if BUILD_TIMESTAMP else f"v{APP_VERSION}-dev"


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

        settings = await _load_settings(db)
        app.state.settings = settings
        app.state.client = ImageClient.from_settings(settings)

        # LLM 设置
        llm_settings = {}
        for key in ["llm_api_key", "llm_base_url", "llm_model_name", "llm_supports_vision", "llm_system_prompt"]:
            val = await db.get_setting(key)
            llm_settings[key] = val
        app.state.llm_settings = llm_settings
        app.state.llm_client = LLMClient.from_settings(llm_settings)

        yield
        await db.close()

    app = FastAPI(title="OpenImage", version=APP_VERSION, lifespan=lifespan)
    app.state.full_version = FULL_VERSION

    @app.middleware("http")
    async def add_corp_header(request: Request, call_next):
        response = await call_next(request)
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        return response

    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^(tauri://localhost|https?://tauri\.localhost|https?://localhost:\d+)$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(sessions_api.router)
    app.include_router(generate_api.router)
    app.include_router(images_api.router)
    app.include_router(settings_api.router)
    app.include_router(inpaint_api.router)
    app.include_router(llm_settings_api.router)
    # app.include_router(llm_chat_api.router)  # Task 5 创建后取消注释

    return app


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(create_app(), host="127.0.0.1", port=8765)
