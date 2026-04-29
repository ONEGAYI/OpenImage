# backend/src/core/config.py
from pathlib import Path


class Config:
    """管理应用的所有路径和运行时配置"""

    def __init__(self, base_dir: Path | None = None):
        if base_dir is None:
            base_dir = Path.cwd()
        self.base_dir = base_dir
        self.data_dir = base_dir / "data"
        self.db_path = self.data_dir / "openimage.db"
        self.images_dir = self.data_dir / "images"
        self.logs_dir = self.data_dir / "logs"

    def ensure_dirs(self) -> None:
        """确保所有必要的目录存在"""
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.images_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)
