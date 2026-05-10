# backend/src/core/storage.py
import time
import uuid
from pathlib import Path

from src.core.config import Config


class ImageStore:
    def __init__(self, config: Config):
        self._images_dir = config.images_dir

    def save_image(self, session_id: str, data: bytes, fmt: str = "png") -> Path:
        """保存图片文件到 images/{session_id}/ 目录，返回文件路径"""
        session_dir = self._images_dir / session_id
        session_dir.mkdir(parents=True, exist_ok=True)

        timestamp = int(time.time())
        unique = uuid.uuid4().hex[:8]
        filename = f"{timestamp}_{unique}.{fmt}"
        filepath = session_dir / filename

        filepath.write_bytes(data)
        return filepath

    def delete_image(self, path: Path) -> None:
        path.unlink(missing_ok=True)

    def get_absolute_path(self, relative_path: str) -> Path:
        """将相对路径转为绝对路径"""
        return self._images_dir / relative_path

    def copy_session_images(
        self,
        src_session_id: str,
        dst_session_id: str,
        file_names: list[str],
    ) -> None:
        """将源 session 中的指定图片文件物理拷贝到目标 session 目录"""
        src_dir = self._images_dir / src_session_id
        dst_dir = self._images_dir / dst_session_id
        dst_dir.mkdir(parents=True, exist_ok=True)
        for name in file_names:
            src_file = src_dir / name
            dst_file = dst_dir / name
            if src_file.exists():
                dst_file.write_bytes(src_file.read_bytes())
