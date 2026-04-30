# backend/src/core/config.py
import os
import sys
from pathlib import Path


def get_base_dir() -> Path:
    """获取应用数据目录（仅用于独立运行时的 fallback）

    Tauri 桌面端通过 --base-dir 传入安装目录，不经过此函数。
    开发环境：返回项目根目录
    独立运行（PyInstaller）：返回系统标准应用数据目录
    """
    if getattr(sys, 'frozen', False):
        if sys.platform == 'win32':
            base = Path(os.environ.get('APPDATA', Path.home() / 'AppData' / 'Roaming'))
        elif sys.platform == 'darwin':
            base = Path.home() / 'Library' / 'Application Support'
        else:
            base = Path.home() / '.local' / 'share'
        return base / 'OpenImage'
    return Path(__file__).parent.parent.parent


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
