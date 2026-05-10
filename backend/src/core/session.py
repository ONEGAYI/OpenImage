# backend/src/core/session.py
from __future__ import annotations

from src.core.database import Database
from src.core.storage import ImageStore
from src.core.utils import gen_id


def _sess_id() -> str:
    return gen_id("sess")


class SessionManager:
    def __init__(self, db: Database):
        self._db = db

    async def create(self, name: str) -> dict:
        sid = _sess_id()
        conn = self._db.connection()
        await conn.execute(
            "INSERT INTO sessions (id, name) VALUES (?, ?)",
            (sid, name),
        )
        await conn.commit()
        return await self.get(sid)

    async def get(self, session_id: str) -> dict | None:
        conn = self._db.connection()
        cursor = await conn.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        )
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def list_all(self) -> list[dict]:
        conn = self._db.connection()
        cursor = await conn.execute(
            """
            SELECT
                s.*,
                COUNT(i.id) as image_count,
                (SELECT i2.id FROM images i2
                 WHERE i2.session_id = s.id
                 ORDER BY i2.step DESC LIMIT 1
                ) as latest_image_id
            FROM sessions s
            LEFT JOIN images i ON i.session_id = s.id
            GROUP BY s.id
            ORDER BY s.updated_at DESC
            """
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def rename(self, session_id: str, name: str) -> dict:
        conn = self._db.connection()
        await conn.execute(
            "UPDATE sessions SET name = ?, updated_at = datetime('now') WHERE id = ?",
            (name, session_id),
        )
        await conn.commit()
        return await self.get(session_id)

    async def delete(self, session_id: str) -> None:
        conn = self._db.connection()
        await conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        await conn.commit()

    async def update_head(self, session_id: str, response_id: str) -> None:
        conn = self._db.connection()
        await conn.execute(
            "UPDATE sessions SET head_response_id = ?, updated_at = datetime('now') WHERE id = ?",
            (response_id, session_id),
        )
        await conn.commit()

    async def get_images(self, session_id: str) -> list[dict]:
        conn = self._db.connection()
        cursor = await conn.execute(
            "SELECT * FROM images WHERE session_id = ? ORDER BY step ASC",
            (session_id,),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def fork(self, store: ImageStore, session_id: str, image_id: str) -> dict:
        """Fork 会话：创建新 session 并拷贝目标图片及之前所有图片"""
        conn = self._db.connection()

        cursor = await conn.execute(
            "SELECT * FROM images WHERE id = ? AND session_id = ?",
            (image_id, session_id),
        )
        target = await cursor.fetchone()
        if not target:
            raise ValueError("Image not found")

        target_step = target["step"]
        target_response_id = target["response_id"]

        src_session = await self.get(session_id)
        base_name = src_session["name"]
        cursor = await conn.execute(
            "SELECT name FROM sessions WHERE name LIKE ?",
            (f"{base_name} (Fork #%)",),
        )
        fork_rows = await cursor.fetchall()
        next_num = len(fork_rows) + 1
        fork_name = f"{base_name} (Fork #{next_num})"

        fork_id = _sess_id()
        await conn.execute(
            "INSERT INTO sessions (id, name, head_response_id) VALUES (?, ?, ?)",
            (fork_id, fork_name, target_response_id),
        )
        await conn.commit()

        cursor = await conn.execute(
            "SELECT * FROM images WHERE session_id = ? AND step <= ? ORDER BY step ASC",
            (session_id, target_step),
        )
        rows = await cursor.fetchall()

        file_names = []
        for row in rows:
            file_names.append(row["file_path"].split("/", 1)[1] if "/" in row["file_path"] else row["file_path"])
        store.copy_session_images(session_id, fork_id, file_names)

        for row in rows:
            new_img_id = gen_id("img")
            orig_file_name = row["file_path"].split("/", 1)[1] if "/" in row["file_path"] else row["file_path"]
            new_file_path = f"{fork_id}/{orig_file_name}"
            await conn.execute(
                """INSERT INTO images
                (id, session_id, step, response_id, prompt, revised_prompt,
                 parent_image_id, file_path, size, quality, output_format)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    new_img_id, fork_id, row["step"], row["response_id"],
                    row["prompt"], row["revised_prompt"], row["parent_image_id"],
                    new_file_path, row["size"], row["quality"], row["output_format"],
                ),
            )
        await conn.commit()

        return await self.get(fork_id)
