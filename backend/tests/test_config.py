# backend/tests/test_config.py
import tempfile
from pathlib import Path

from src.core.config import Config


def test_config_defaults_to_cwd_data_dir():
    """配置模块默认使用当前工作目录下的 data/ 子目录"""
    with tempfile.TemporaryDirectory() as tmp:
        cfg = Config(base_dir=Path(tmp))
        assert cfg.data_dir == Path(tmp) / "data"
        assert cfg.db_path == Path(tmp) / "data" / "openimage.db"
        assert cfg.images_dir == Path(tmp) / "data" / "images"
        assert cfg.logs_dir == Path(tmp) / "data" / "logs"


def test_config_creates_dirs_on_init():
    """初始化时自动创建所需的目录结构"""
    with tempfile.TemporaryDirectory() as tmp:
        cfg = Config(base_dir=Path(tmp))
        cfg.ensure_dirs()
        assert cfg.data_dir.exists()
        assert cfg.images_dir.exists()
        assert cfg.logs_dir.exists()
