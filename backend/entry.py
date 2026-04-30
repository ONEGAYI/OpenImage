"""PyInstaller 入口点 — 绕过 Typer CLI 直接调用 uvicorn"""
import argparse
import sys
from pathlib import Path


class _NullStream:
    def write(self, *a, **kw): pass
    def flush(self): pass
    def isatty(self): return False


if getattr(sys, 'frozen', False):
    if hasattr(sys, '_MEIPASS'):
        sys.path.insert(0, str(Path(sys._MEIPASS)))
    # console=False 时无终端，补一个 dummy stream 避免 uvicorn logging 崩溃
    if sys.stderr is None:
        sys.stderr = _NullStream()
    if sys.stdout is None:
        sys.stdout = _NullStream()

import uvicorn
from src.server import create_app
from src.core.config import get_base_dir


def main():
    parser = argparse.ArgumentParser(description='OpenImage Backend Server')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--base-dir', type=str, default=None)
    args = parser.parse_args()

    resolved = Path(args.base_dir) if args.base_dir else get_base_dir()
    uvicorn.run(
        create_app(resolved),
        host='127.0.0.1',
        port=args.port,
        log_level='info',
        log_config={
            'version': 1,
            'disable_existing_loggers': False,
            'formatters': {
                'default': {
                    '()': 'uvicorn.logging.DefaultFormatter',
                    'fmt': '%(levelprefix)s %(message)s',
                    'use_colors': False,
                },
                'access': {
                    '()': 'uvicorn.logging.AccessFormatter',
                    'fmt': '%(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s',
                    'use_colors': False,
                },
            },
            'handlers': {
                'default': {
                    'formatter': 'default',
                    'class': 'logging.StreamHandler',
                    'stream': 'ext://sys.stderr',
                },
                'access': {
                    'formatter': 'access',
                    'class': 'logging.StreamHandler',
                    'stream': 'ext://sys.stderr',
                },
            },
            'loggers': {
                'uvicorn': {'handlers': ['default'], 'level': 'INFO'},
                'uvicorn.error': {'level': 'INFO'},
                'uvicorn.access': {'handlers': ['access'], 'level': 'INFO', 'propagate': False},
            },
        },
    )


if __name__ == '__main__':
    main()
