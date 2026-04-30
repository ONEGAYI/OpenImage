# backend/src/cli.py
import asyncio
import os
import sys
from pathlib import Path

import typer
from rich.console import Console

from src.core.config import get_base_dir

app = typer.Typer(name="openimage", help="OpenImage - GPT Image 2 客户端")
sessions_app = typer.Typer(help="会话管理")
app.add_typer(sessions_app, name="sessions")
console = Console()

MAX_RETRIES = 3
BASE_DELAY = 2
NON_RETRYABLE = (KeyboardInterrupt, SystemExit)
_NON_RETRYABLE_KEYWORDS = (
    "401", "invalid_api_key", "authentication",
    "403", "forbidden", "permission",
    "400", "invalid_request", "invalid_image",
)


def _is_retryable(exc: Exception) -> bool:
    msg = str(exc).lower()
    return not any(kw in msg for kw in _NON_RETRYABLE_KEYWORDS)


async def _retry(coro_fn, label: str):
    """带指数退避的重试执行器，失败时打印等待时间并自动重试"""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return await coro_fn()
        except NON_RETRYABLE:
            raise
        except Exception as e:
            if not _is_retryable(e) or attempt == MAX_RETRIES:
                raise
            delay = BASE_DELAY * (2 ** (attempt - 1))
            console.print(
                f"[yellow]  {label} 失败, "
                f"{delay}s 后重试 ({attempt}/{MAX_RETRIES})...[/yellow]"
            )
            await asyncio.sleep(delay)


@app.command()
def serve(
    port: int = 8765,
    base_dir: str = typer.Option(None, "--base-dir", help="数据目录覆盖"),
):
    """启动 HTTP API 服务"""
    import uvicorn
    from src.server import create_app

    resolved = Path(base_dir) if base_dir else get_base_dir()
    console.print(f"[green]Starting OpenImage server on port {port}...[/green]")
    console.print(f"[dim]Data directory: {resolved}[/dim]")
    uvicorn.run(create_app(resolved), host="127.0.0.1", port=port)


async def _load_client(db):
    """从数据库加载设置并创建 ImageClient，失败时退出"""
    from src.core.client import ImageClient

    api_key, base_url, api_mode, model_name = await asyncio.gather(
        db.get_setting("api_key"),
        db.get_setting("base_url"),
        db.get_setting("api_mode"),
        db.get_setting("model_name"),
    )
    if not api_key:
        console.print("[red]API key not set. Run: openimage config set api_key <key>[/red]")
        sys.exit(1)

    client = ImageClient.from_settings({
        "api_key": api_key,
        "base_url": base_url,
        "api_mode": api_mode,
        "model_name": model_name,
    })
    if not client:
        console.print("[red]Failed to initialize client[/red]")
        sys.exit(1)
    return client


@app.command()
def generate(
    prompt: str = typer.Argument(help="文本 prompt"),
    size: str = typer.Option("1024x1024", "--size", "-s", help="图片尺寸"),
    quality: str = typer.Option("high", "--quality", "-q", help="输出质量"),
    output: str = typer.Option("output.png", "--output", "-o", help="输出文件路径"),
):
    """单次文生图"""
    import base64
    from src.core.config import Config
    from src.core.database import Database

    async def _run():
        config = Config(get_base_dir())
        config.ensure_dirs()
        db = Database(config)
        await db.initialize()

        client = await _load_client(db)
        console.print(f"[yellow]Generating: {prompt}...[/yellow]")

        async def _do():
            result = await client.generate(
                prompt=prompt,
                images=[],
                previous_response_id=None,
                params={"size": size, "quality": quality, "output_format": "png"},
            )
            image_data = base64.b64decode(result.image_b64)
            Path(output).write_bytes(image_data)
            console.print(f"[green]Saved to {output} ({len(image_data)} bytes)[/green]")

        await _retry(_do, "生成")
        await db.close()

    asyncio.run(_run())


@app.command()
def edit(
    prompt: str = typer.Argument(help="编辑描述"),
    image: list[str] = typer.Option(..., "--image", "-i", help="输入图片路径（可多次指定）"),
    size: str = typer.Option("1024x1024", "--size", "-s"),
    quality: str = typer.Option("high", "--quality", "-q"),
    output: str = typer.Option("output.png", "--output", "-o"),
):
    """图生图 / 多图融合"""
    import base64
    from src.core.config import Config
    from src.core.database import Database

    async def _run():
        config = Config(get_base_dir())
        config.ensure_dirs()
        db = Database(config)
        await db.initialize()

        client = await _load_client(db)

        images = []
        for path in image:
            data = Path(path).read_bytes()
            b64 = base64.b64encode(data).decode()
            ext = Path(path).suffix.lstrip(".")
            media = f"image/{ext}" if ext != "jpg" else "image/jpeg"
            images.append({"type": "base64", "data": b64, "media_type": media})

        console.print(f"[yellow]Editing with {len(images)} image(s)...[/yellow]")

        async def _do():
            result = await client.generate(
                prompt=prompt,
                images=images,
                previous_response_id=None,
                params={"size": size, "quality": quality, "output_format": "png"},
            )
            out_data = base64.b64decode(result.image_b64)
            Path(output).write_bytes(out_data)
            console.print(f"[green]Saved to {output}[/green]")

        await _retry(_do, "编辑")
        await db.close()

    asyncio.run(_run())


@sessions_app.command("list")
def sessions_list():
    """列出所有会话"""
    from src.core.config import Config
    from src.core.database import Database
    from src.core.session import SessionManager

    async def _run():
        config = Config(get_base_dir())
        config.ensure_dirs()
        db = Database(config)
        await db.initialize()
        sm = SessionManager(db)
        sessions = await sm.list_all()
        for s in sessions:
            console.print(f"  {s['id']}  {s['name']}  {s['updated_at']}")
        if not sessions:
            console.print("[dim]No sessions[/dim]")
        await db.close()

    asyncio.run(_run())


@app.command()
def config(
    action: str = typer.Argument(help="set"),
    key: str = typer.Argument(help="配置键名"),
    value: str = typer.Argument(help="配置值"),
):
    """管理配置项"""
    from src.core.config import Config as AppConfig
    from src.core.database import Database

    async def _run():
        cfg = AppConfig(get_base_dir())
        cfg.ensure_dirs()
        db = Database(cfg)
        await db.initialize()
        if action == "set":
            await db.set_setting(key, value)
            console.print(f"[green]Set {key}[/green]")
        await db.close()

    asyncio.run(_run())


if __name__ == "__main__":
    app()
