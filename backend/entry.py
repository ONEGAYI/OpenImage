"""PyInstaller 入口点 — 绕过 Typer CLI 直接调用 uvicorn"""
import argparse
import sys
from pathlib import Path

if getattr(sys, 'frozen', False):
    if hasattr(sys, '_MEIPASS'):
        sys.path.insert(0, str(Path(sys._MEIPASS)))

import uvicorn
from src.server import create_app
from src.cli import _get_base_dir


def main():
    parser = argparse.ArgumentParser(description='OpenImage Backend Server')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--base-dir', type=str, default=None)
    args = parser.parse_args()

    resolved = Path(args.base_dir) if args.base_dir else _get_base_dir()
    uvicorn.run(create_app(resolved), host='127.0.0.1', port=args.port, log_level='info')


if __name__ == '__main__':
    main()
