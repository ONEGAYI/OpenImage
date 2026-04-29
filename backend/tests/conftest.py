# backend/tests/conftest.py
import tempfile
from pathlib import Path
from collections.abc import Generator

import pytest

from src.core.config import Config


@pytest.fixture
def tmp_base_dir() -> Generator[Path, None, None]:
    """提供临时基础目录，测试结束后自动清理"""
    with tempfile.TemporaryDirectory() as tmp:
        yield Path(tmp)


@pytest.fixture
def config(tmp_base_dir: Path) -> Config:
    """提供基于临时目录的 Config 实例"""
    cfg = Config(base_dir=tmp_base_dir)
    cfg.ensure_dirs()
    return cfg
