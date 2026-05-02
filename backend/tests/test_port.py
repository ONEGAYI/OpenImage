# backend/tests/test_port.py
import socket
from pathlib import Path

from src.core.port import find_free_port, write_port_file, read_port_file


def test_find_free_port_returns_positive_int():
    port = find_free_port()
    assert isinstance(port, int)
    assert port > 0


def test_find_free_port_is_available():
    """验证返回的端口确实可以绑定"""
    port = find_free_port()
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", port))  # 不应抛异常


def test_find_free_port_returns_different_ports():
    """连续调用应返回不同端口（前一个已释放，可能重复但概率极低）"""
    ports = {find_free_port() for _ in range(5)}
    assert len(ports) >= 2


def test_write_and_read_port_file(tmp_path, monkeypatch):
    monkeypatch.setattr("src.core.port.PORT_FILE", tmp_path / ".backend-port")
    write_port_file(12345)
    assert read_port_file() == 12345


def test_read_port_file_missing_returns_default(tmp_path, monkeypatch):
    monkeypatch.setattr("src.core.port.PORT_FILE", tmp_path / "nonexistent")
    assert read_port_file() == 8765


def test_read_port_file_invalid_content_returns_default(tmp_path, monkeypatch):
    port_file = tmp_path / ".backend-port"
    port_file.write_text("not-a-number")
    monkeypatch.setattr("src.core.port.PORT_FILE", port_file)
    assert read_port_file() == 8765
