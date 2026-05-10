# backend/tests/test_session.py
import pytest
from src.core.database import Database
from src.core.session import SessionManager
from src.core.storage import ImageStore


@pytest.fixture
async def db(config) -> Database:
    database = Database(config)
    await database.initialize()
    yield database
    await database.close()


@pytest.fixture
async def sessions(db: Database) -> SessionManager:
    return SessionManager(db)


@pytest.fixture
async def store(config) -> ImageStore:
    return ImageStore(config)


async def _insert_image(db, session_id, step, response_id="resp_001", prompt="test", parent_id=None, file_path=None):
    """辅助函数：向 images 表插入一条记录"""
    from src.core.utils import gen_id
    conn = db.connection()
    img_id = gen_id("img")
    rel_path = file_path or f"{session_id}/{step}.png"
    await conn.execute(
        """INSERT INTO images
        (id, session_id, step, response_id, prompt, revised_prompt,
         parent_image_id, file_path, size, quality, output_format)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (img_id, session_id, step, response_id, prompt, None, parent_id, rel_path, "1024x1024", "auto", "png"),
    )
    await conn.commit()
    return img_id


async def test_create_session(sessions: SessionManager):
    session = await sessions.create("测试会话")
    assert session["id"].startswith("sess_")
    assert session["name"] == "测试会话"
    assert session["head_response_id"] is None


async def test_list_sessions(sessions: SessionManager):
    await sessions.create("会话A")
    await sessions.create("会话B")
    result = await sessions.list_all()
    assert len(result) == 2


async def test_get_session(sessions: SessionManager):
    created = await sessions.create("我的会话")
    fetched = await sessions.get(created["id"])
    assert fetched["name"] == "我的会话"


async def test_rename_session(sessions: SessionManager):
    created = await sessions.create("旧名称")
    renamed = await sessions.rename(created["id"], "新名称")
    assert renamed["name"] == "新名称"


async def test_delete_session(sessions: SessionManager):
    created = await sessions.create("待删除")
    await sessions.delete(created["id"])
    result = await sessions.list_all()
    assert len(result) == 0


async def test_update_head_response(sessions: SessionManager):
    created = await sessions.create("测试")
    await sessions.update_head(created["id"], "resp_001")
    fetched = await sessions.get(created["id"])
    assert fetched["head_response_id"] == "resp_001"


async def test_fork_creates_new_session(sessions: SessionManager, db: Database, store: ImageStore):
    """Fork 应创建新 session 并拷贝目标图片及之前所有图片"""
    src = await sessions.create("Sunset")
    await sessions.update_head(src["id"], "resp_003")

    src_dir = store._images_dir / src["id"]
    src_dir.mkdir(parents=True, exist_ok=True)
    for step in range(1, 4):
        (src_dir / f"{step}.png").write_bytes(b"fake_png_data")

    img1 = await _insert_image(db, src["id"], 1, "resp_001", "step 1", file_path=f"{src['id']}/1.png")
    img2 = await _insert_image(db, src["id"], 2, "resp_002", "step 2", parent_id=img1, file_path=f"{src['id']}/2.png")
    await _insert_image(db, src["id"], 3, "resp_003", "step 3", parent_id=img2, file_path=f"{src['id']}/3.png")

    result = await sessions.fork(store, src["id"], img2)

    assert result["name"] == "Sunset (Fork #1)"
    assert result["head_response_id"] == "resp_002"
    assert result["id"] != src["id"]

    images = await sessions.get_images(result["id"])
    assert len(images) == 2
    steps = sorted([img["step"] for img in images])
    assert steps == [1, 2]

    for img in images:
        if img["step"] == 1:
            assert img["response_id"] == "resp_001"
        elif img["step"] == 2:
            assert img["response_id"] == "resp_002"

    dst_dir = store._images_dir / result["id"]
    assert (dst_dir / "1.png").exists()
    assert (dst_dir / "2.png").exists()
    assert not (dst_dir / "3.png").exists()


async def test_fork_numbering_increments(sessions: SessionManager, db: Database, store: ImageStore):
    """多次 fork 编号递增"""
    src = await sessions.create("MyProject")
    src_dir = store._images_dir / src["id"]
    src_dir.mkdir(parents=True, exist_ok=True)
    (src_dir / "1.png").write_bytes(b"data")
    img1 = await _insert_image(db, src["id"], 1, file_path=f"{src['id']}/1.png")

    fork1 = await sessions.fork(store, src["id"], img1)
    assert fork1["name"] == "MyProject (Fork #1)"

    fork2 = await sessions.fork(store, src["id"], img1)
    assert fork2["name"] == "MyProject (Fork #2)"


async def test_fork_independence(sessions: SessionManager, db: Database, store: ImageStore):
    """删除原 session 不影响 fork 分支"""
    src = await sessions.create("ToDelete")
    src_dir = store._images_dir / src["id"]
    src_dir.mkdir(parents=True, exist_ok=True)
    (src_dir / "1.png").write_bytes(b"data")
    img1 = await _insert_image(db, src["id"], 1, file_path=f"{src['id']}/1.png")

    forked = await sessions.fork(store, src["id"], img1)

    await sessions.delete(src["id"])

    images = await sessions.get_images(forked["id"])
    assert len(images) == 1

    dst_dir = store._images_dir / forked["id"]
    assert (dst_dir / "1.png").exists()
