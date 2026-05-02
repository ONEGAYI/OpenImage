# backend/src/core/port.py
import socket
from pathlib import Path

PORT_FILE = Path(__file__).resolve().parent.parent.parent.parent / "frontend" / ".backend-port"
DEFAULT_PORT = 8765


def find_free_port() -> int:
    """让 OS 分配一个空闲端口（bind :0 → 读取实际端口 → 关闭）"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def write_port_file(port: int) -> None:
    """将端口号写入文件，供 Vite 读取"""
    PORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    PORT_FILE.write_text(str(port))


def read_port_file() -> int:
    """读取端口文件，文件不存在或内容无效时返回默认端口 8765"""
    try:
        return int(PORT_FILE.read_text().strip())
    except (FileNotFoundError, ValueError):
        return DEFAULT_PORT
