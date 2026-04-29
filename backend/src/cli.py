# backend/src/cli.py
import asyncio
import sys
from pathlib import Path

import typer
from rich.console import Console

app = typer.Typer(name="openimage", help="OpenImage - GPT Image 2 客户端")
sessions_app = typer.Typer(help="会话管理")
app.add_typer(sessions_app, name="sessions")
console = Console()


def _get_base_dir() -> Path:
    """获取数据目录，默认为当前工作目录"""
    return Path.cwd()


@app.command()
def serve(port: int = 8765):
    """启动 HTTP API 服务"""
    import uvicorn
    from src.server import create_app

    console.print(f"[green]Starting OpenImage server on port {port}...[/green]")
    uvicorn.run(create_app(_get_base_dir()), host="127.0.0.1", port=port)


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
    from src.core.client import ImageClient

    async def _run():
        config = Config(_get_base_dir())
        config.ensure_dirs()
        db = Database(config)
        await db.initialize()

        api_key = await db.get_setting("api_key")
        if not api_key:
            console.print("[red]API key not set. Run: openimage config set api_key <key>[/red]")
            sys.exit(1)

        client = ImageClient(api_key)
        console.print(f"[yellow]Generating: {prompt}...[/yellow]")

        result = await client.generate(
            prompt=prompt,
            images=[],
            previous_response_id=None,
            params={"size": size, "quality": quality, "output_format": "png"},
        )

        image_data = base64.b64decode(result.image_b64)
        Path(output).write_bytes(image_data)
        console.print(f"[green]Saved to {output} ({len(image_data)} bytes)[/green]")

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
    from src.core.client import ImageClient

    async def _run():
        config = Config(_get_base_dir())
        config.ensure_dirs()
        db = Database(config)
        await db.initialize()

        api_key = await db.get_setting("api_key")
        if not api_key:
            console.print("[red]API key not set.[/red]")
            sys.exit(1)

        images = []
        for path in image:
            data = Path(path).read_bytes()
            b64 = base64.b64encode(data).decode()
            ext = Path(path).suffix.lstrip(".")
            media = f"image/{ext}" if ext != "jpg" else "image/jpeg"
            images.append({"type": "base64", "data": b64, "media_type": media})

        client = ImageClient(api_key)
        console.print(f"[yellow]Editing with {len(images)} image(s)...[/yellow]")

        result = await client.generate(
            prompt=prompt,
            images=images,
            previous_response_id=None,
            params={"size": size, "quality": quality, "output_format": "png"},
        )

        out_data = base64.b64decode(result.image_b64)
        Path(output).write_bytes(out_data)
        console.print(f"[green]Saved to {output}[/green]")

        await db.close()

    asyncio.run(_run())


@sessions_app.command("list")
def sessions_list():
    """列出所有会话"""
    from src.core.config import Config
    from src.core.database import Database
    from src.core.session import SessionManager

    async def _run():
        config = Config(_get_base_dir())
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
        cfg = AppConfig(_get_base_dir())
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
