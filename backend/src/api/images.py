# backend/src/api/images.py
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

router = APIRouter(prefix="/api/images", tags=["images"])


@router.get("/{image_id}")
async def get_image(image_id: str, request: Request):
    db = request.app.state.db
    conn = db.connection()
    cursor = await conn.execute("SELECT * FROM images WHERE id = ?", (image_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Image not found")
    return dict(row)


@router.get("/{image_id}/file")
async def get_image_file(image_id: str, request: Request):
    db = request.app.state.db
    store = request.app.state.store
    conn = db.connection()
    cursor = await conn.execute("SELECT file_path FROM images WHERE id = ?", (image_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Image not found")
    path = store.get_absolute_path(row["file_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Image file missing")
    return FileResponse(path, media_type="image/png", filename=path.name)


@router.delete("/{image_id}")
async def delete_image(image_id: str, request: Request):
    db = request.app.state.db
    store = request.app.state.store
    conn = db.connection()
    cursor = await conn.execute("SELECT file_path FROM images WHERE id = ?", (image_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Image not found")
    path = store.get_absolute_path(row["file_path"])
    store.delete_image(path)
    await conn.execute("DELETE FROM images WHERE id = ?", (image_id,))
    await conn.commit()
    return {"ok": True}
