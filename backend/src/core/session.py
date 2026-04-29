# backend/src/core/session.py
import uuid
from src.core.database import Database


def _sess_id() -> str:
    return f"sess_{uuid.uuid4().hex[:12]}"


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
