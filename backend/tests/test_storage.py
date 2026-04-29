# backend/tests/test_storage.py
import pytest
from pathlib import Path

from src.core.storage import ImageStore


@pytest.fixture
def store(config) -> ImageStore:
    return ImageStore(config)


def test_save_image_creates_file_and_dir(store: ImageStore):
    """保存图片应在 images/{session_id}/ 下创建文件"""
    image_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
    path = store.save_image("sess_abc", image_data, "png")

    assert path.exists()
    assert path.parent.name == "sess_abc"
    assert path.suffix == ".png"
    assert path.read_bytes() == image_data


def test_save_image_generates_unique_names(store: ImageStore):
    """多次保存应生成不同的文件名"""
    p1 = store.save_image("sess_abc", b"data1", "png")
    p2 = store.save_image("sess_abc", b"data2", "png")
    assert p1 != p2


def test_delete_image_removes_file(store: ImageStore):
    """删除图片应移除文件"""
    path = store.save_image("sess_abc", b"data", "png")
    assert path.exists()

    store.delete_image(path)
    assert not path.exists()


def test_delete_image_ignores_missing(store: ImageStore):
    """删除不存在的文件不应报错"""
    store.delete_image(Path("nonexistent.png"))
