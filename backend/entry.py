"""PyInstaller 入口点 — 绕过 Typer CLI 直接调用 uvicorn"""
import argparse
import logging
import sys
from pathlib import Path


def _setup_logging(base_dir: Path) -> None:
    """将 stderr/stdout 重定向到日志文件（console=False 下无终端输出）"""
    log_dir = base_dir / "data" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "backend.log"

    try:
        if log_file.stat().st_size > 2_000_000:
            log_file.write_text("")
    except FileNotFoundError:
        pass

    fh = open(log_file, "a", encoding="utf-8")  # noqa: SIM115
    sys.stderr = fh
    sys.stdout = fh
    logging.basicConfig(
        stream=sys.stderr,
        level=logging.DEBUG,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def main():
    parser = argparse.ArgumentParser(description="OpenImage Backend Server")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--base-dir", type=str, default=None)
    args = parser.parse_args()

    if getattr(sys, "frozen", False):
        if hasattr(sys, "_MEIPASS"):
            sys.path.insert(0, str(Path(sys._MEIPASS)))

        from src.core.config import get_base_dir
        resolved = Path(args.base_dir) if args.base_dir else get_base_dir()
        _setup_logging(resolved)
        logging.info("Backend starting (frozen mode), base_dir=%s", resolved)
    else:
        from src.core.config import get_base_dir
        resolved = Path(args.base_dir) if args.base_dir else get_base_dir()

    from src.core.port import find_free_port, write_port_file

    actual_port = args.port or find_free_port()

    # 非 frozen 模式（开发环境）写端口文件供 Vite 读取
    if not getattr(sys, "frozen", False):
        write_port_file(actual_port)

    try:
        import uvicorn
        from src.server import create_app
    except Exception as e:
        logging.critical("Import failed: %s", e, exc_info=True)
        raise

    try:
        uvicorn.run(
            create_app(resolved),
            host="127.0.0.1",
            port=actual_port,
            log_level="info",
            log_config={
                "version": 1,
                "disable_existing_loggers": False,
                "formatters": {
                    "default": {
                        "()": "uvicorn.logging.DefaultFormatter",
                        "fmt": "%(levelprefix)s %(message)s",
                        "use_colors": False,
                    },
                    "access": {
                        "()": "uvicorn.logging.AccessFormatter",
                        "fmt": '%(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s',
                        "use_colors": False,
                    },
                },
                "handlers": {
                    "default": {
                        "formatter": "default",
                        "class": "logging.StreamHandler",
                        "stream": "ext://sys.stderr",
                    },
                    "access": {
                        "formatter": "access",
                        "class": "logging.StreamHandler",
                        "stream": "ext://sys.stderr",
                    },
                },
                "loggers": {
                    "uvicorn": {"handlers": ["default"], "level": "INFO"},
                    "uvicorn.error": {"level": "INFO"},
                    "uvicorn.access": {"handlers": ["access"], "level": "INFO", "propagate": False},
                },
            },
        )
    except Exception as e:
        logging.critical("Backend failed to start: %s", e, exc_info=True)
        raise


if __name__ == "__main__":
    main()
