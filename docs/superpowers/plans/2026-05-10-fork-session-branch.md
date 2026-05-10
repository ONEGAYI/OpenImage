# Fork 会话分支功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Fork 机制从"同一 session 内标记"改造为"创建新 session + 物理拷贝图片"的独立分支。

**Architecture:** 后端新增 `POST /api/sessions/{id}/fork` 端点，一次调用完成 session 创建、数据库拷贝、文件拷贝。前端 DetailPanel 直接调用该 API 并切换到新 session。移除旧的 `fork_from` / `pendingForkFrom` 逻辑。

**Tech Stack:** Python FastAPI + SQLite + aiosqlite | React + TypeScript + Zustand

---

## 文件变更清单

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `backend/src/core/session.py` | 新增 `fork` 方法（数据库拷贝 + 命名） |
| 修改 | `backend/src/core/storage.py` | 新增 `copy_session_images` 方法（物理文件拷贝） |
| 修改 | `backend/src/api/sessions.py` | 新增 `POST /{id}/fork` 路由 |
| 修改 | `backend/src/api/generate.py` | 移除 `fork_from` 字段和 `_resolve_previous` 中的 fork 分支 |
| 修改 | `backend/tests/test_session.py` | 新增 fork 测试用例 |
| 修改 | `frontend/src/services/api.ts` | 新增 `forkSession` 函数，移除 `fork_from` 相关 |
| 修改 | `frontend/src/types/index.ts` | 移除 `GenerateRequest.fork_from` |
| 修改 | `frontend/src/stores/generationStore.ts` | 移除 `pendingForkFrom` 及 `setPendingForkFrom` |
| 修改 | `frontend/src/components/DetailPanel.tsx` | Fork 按钮改为直接调用 API |
| 修改 | `frontend/src/components/InputArea.tsx` | 移除 fork 提示条 UI |
| 修改 | `frontend/src/i18n/zh.json` | 更新/新增 fork 相关翻译 |
| 修改 | `frontend/src/i18n/en.json` | 更新/新增 fork 相关翻译 |

---

### Task 1: 后端 — Storage 新增文件拷贝方法

**Files:**
- Modify: `backend/src/core/storage.py`

- [ ] **Step 1: 添加 `copy_session_images` 方法**

在 `ImageStore` 类中新增方法，将源 session 目录下指定文件拷贝到目标 session 目录：

```python
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
```

- [ ] **Step 2: 提交**

```bash
git add backend/src/core/storage.py
git commit -m "feat(storage): 新增 copy_session_images 方法用于 Fork 文件拷贝"
```

---

### Task 2: 后端 — SessionManager 新增 fork 方法

**Files:**
- Modify: `backend/src/core/session.py`
- Test: `backend/tests/test_session.py`

- [ ] **Step 1: 编写 fork 测试用例**

在 `test_session.py` 中添加以下测试。需要在文件顶部增加 import：

```python
import shutil
from src.core.storage import ImageStore
```

新增 fixture：

```python
@pytest.fixture
async def store(config) -> ImageStore:
    return ImageStore(config)
```

测试用例：

```python
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


async def test_fork_creates_new_session(sessions: SessionManager, db: Database, store: ImageStore):
    """Fork 应创建新 session 并拷贝目标图片及之前所有图片"""
    # 创建源 session 并插入 3 张图片
    src = await sessions.create("Sunset")
    await sessions.update_head(src["id"], "resp_003")

    # 创建物理文件
    src_dir = store._images_dir / src["id"]
    src_dir.mkdir(parents=True, exist_ok=True)
    for step in range(1, 4):
        (src_dir / f"{step}.png").write_bytes(b"fake_png_data")

    img1 = await _insert_image(db, src["id"], 1, "resp_001", "step 1", file_path=f"{src['id']}/1.png")
    img2 = await _insert_image(db, src["id"], 2, "resp_002", "step 2", parent_id=img1, file_path=f"{src['id']}/2.png")
    img3 = await _insert_image(db, src["id"], 3, "resp_003", "step 3", parent_id=img2, file_path=f"{src['id']}/3.png")

    # Fork from img2（step=2）
    result = await sessions.fork(store, src["id"], img2)

    # 验证新 session
    assert result["name"] == "Sunset (Fork #1)"
    assert result["head_response_id"] == "resp_002"
    assert result["id"] != src["id"]

    # 验证拷贝了 step 1 和 step 2 的图片（共 2 张）
    images = await sessions.get_images(result["id"])
    assert len(images) == 2
    steps = sorted([img["step"] for img in images])
    assert steps == [1, 2]

    # 验证 response_id 保留
    for img in images:
        if img["step"] == 1:
            assert img["response_id"] == "resp_001"
        elif img["step"] == 2:
            assert img["response_id"] == "resp_002"

    # 验证文件被拷贝
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

    # 删除原 session
    await sessions.delete(src["id"])

    # fork 分支的图片仍存在
    images = await sessions.get_images(forked["id"])
    assert len(images) == 1

    # fork 分支的文件仍存在
    dst_dir = store._images_dir / forked["id"]
    assert (dst_dir / "1.png").exists()
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && python -m pytest tests/test_session.py -v -k fork`
Expected: FAIL（`SessionManager` 没有 `fork` 方法）

- [ ] **Step 3: 实现 `fork` 方法**

在 `session.py` 的 `SessionManager` 类中添加：

```python
import re
from src.core.storage import ImageStore

class SessionManager:
    # ... 现有方法 ...

    async def fork(self, store: ImageStore, session_id: str, image_id: str) -> dict:
        """Fork 会话：创建新 session 并拷贝目标图片及之前所有图片"""
        conn = self._db.connection()

        # 1. 查询目标图片
        cursor = await conn.execute(
            "SELECT * FROM images WHERE id = ? AND session_id = ?",
            (image_id, session_id),
        )
        target = await cursor.fetchone()
        if not target:
            raise ValueError("Image not found")

        target_step = target["step"]
        target_response_id = target["response_id"]

        # 2. 查询源 session 名称，计算 fork 编号
        src_session = await self.get(session_id)
        base_name = src_session["name"]
        cursor = await conn.execute(
            "SELECT name FROM sessions WHERE name LIKE ?",
            (f"{base_name} (Fork #%)",),
        )
        fork_rows = await cursor.fetchall()
        next_num = len(fork_rows) + 1
        fork_name = f"{base_name} (Fork #{next_num})"

        # 3. 创建新 session
        fork_id = _sess_id()
        await conn.execute(
            "INSERT INTO sessions (id, name, head_response_id) VALUES (?, ?, ?)",
            (fork_id, fork_name, target_response_id),
        )
        await conn.commit()

        # 4. 查询需要拷贝的图片记录（step <= target_step）
        cursor = await conn.execute(
            "SELECT * FROM images WHERE session_id = ? AND step <= ? ORDER BY step ASC",
            (session_id, target_step),
        )
        rows = await cursor.fetchall()

        # 5. 物理拷贝文件
        file_names = []
        for row in rows:
            # file_path 格式为 "session_id/xxx.png"，取文件名部分
            file_names.append(row["file_path"].split("/", 1)[1] if "/" in row["file_path"] else row["file_path"])
        store.copy_session_images(session_id, fork_id, file_names)

        # 6. 数据库拷贝
        for row in rows:
            from src.core.utils import gen_id
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
```

同时在文件顶部新增 import：
```python
from src.core.storage import ImageStore
```

注意：`ImageStore` 的 import 放在方法参数类型注解中会导致循环依赖问题。使用 `from __future__ import annotations` 或将 `ImageStore` 的 import 放在方法内部。推荐在文件顶部添加 `from __future__ import annotations`。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && python -m pytest tests/test_session.py -v -k fork`
Expected: 3 个 fork 测试全部 PASS

- [ ] **Step 5: 运行全部测试确认无回归**

Run: `cd backend && python -m pytest tests/ -v`
Expected: 全部 PASS

- [ ] **Step 6: 提交**

```bash
git add backend/src/core/session.py backend/tests/test_session.py
git commit -m "feat(session): 实现 fork 方法 — 创建新会话并拷贝图片记录和文件

- SessionManager.fork: 数据库级拷贝目标图片及之前所有记录
- 物理拷贝图片文件到新 session 目录
- 命名规则: 原名 (Fork #N)，编号自动递增
- 保留 response_id 链和 step 顺序"
```

---

### Task 3: 后端 — 新增 Fork API 路由

**Files:**
- Modify: `backend/src/api/sessions.py`

- [ ] **Step 1: 添加 Fork 路由**

在 `sessions.py` 中新增请求模型和路由：

```python
from pydantic import BaseModel


class SessionCreate(BaseModel):
    name: str


class SessionRename(BaseModel):
    name: str


class ForkRequest(BaseModel):
    image_id: str
```

新增路由（放在 `delete_session` 之前）：

```python
@router.post("/{session_id}/fork")
async def fork_session(session_id: str, body: ForkRequest, request: Request):
    sm = _sessions(request)
    store = request.app.state.store
    session = await sm.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        return await sm.fork(store, session_id, body.image_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
```

- [ ] **Step 2: 提交**

```bash
git add backend/src/api/sessions.py
git commit -m "feat(api): 新增 POST /api/sessions/{id}/fork 端点

接受 image_id 参数，调用 SessionManager.fork 创建独立分支"
```

---

### Task 4: 后端 — 清理旧的 fork_from 逻辑

**Files:**
- Modify: `backend/src/api/generate.py`

- [ ] **Step 1: 移除 `fork_from` 相关代码**

在 `generate.py` 中：

1. 从 `GenerateRequest` 移除 `fork_from` 字段：

```python
class GenerateRequest(BaseModel):
    session_id: str
    prompt: str
    images: list[ImageInput] = []
    params: GenerateParams | None = None
```

2. 移除 `_resolve_previous` 的 `fork_from` 参数和 fork 分支：

```python
async def _resolve_previous(
    request: Request, session_id: str
) -> tuple[str | None, str | None]:
    """解析上一步上下文：返回 (previous_response_id, history_image_b64)"""
    db = request.app.state.db
    store = request.app.state.store

    # 无 fork：response_id 取 session head，history 取最新图片
    sessions = request.app.state.sessions
    session = await sessions.get(session_id)
    response_id = session.get("head_response_id") if session else None

    conn = db.connection()
    cursor = await conn.execute(
        "SELECT file_path FROM images WHERE session_id = ? ORDER BY step DESC LIMIT 1",
        (session_id,),
    )
    row = await cursor.fetchone()
    img_b64 = _read_image_b64(store, row["file_path"]) if row else None
    return response_id, img_b64
```

3. 更新 `generate` 函数中的调用和参数：

```python
previous_response_id, history_image_b64 = await _resolve_previous(
    request, body.session_id
)
```

同时移除 `event_stream` 中的 `parent_image_id=body.fork_from`，改为 `None`：

```python
saved = await _save_generated_image(
    request=request,
    session_id=body.session_id,
    prompt=body.prompt,
    response_id=result.response_id,
    image_b64=result.image_b64,
    revised_prompt=result.revised_prompt,
    parent_image_id=None,
    params=params,
)
```

- [ ] **Step 2: 运行全部测试确认无回归**

Run: `cd backend && python -m pytest tests/ -v`
Expected: 全部 PASS

- [ ] **Step 3: 提交**

```bash
git add backend/src/api/generate.py
git commit -m "refactor(generate): 移除旧的 fork_from 逻辑

Fork 功能已由独立的 POST /fork 端点替代，生成流程不再需要 fork_from 参数"
```

---

### Task 5: 前端 — 新增 forkSession API 函数

**Files:**
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: 从 `types/index.ts` 移除 `fork_from`**

将 `GenerateRequest` 中的 `fork_from` 字段移除：

```typescript
export interface GenerateRequest {
  session_id: string;
  prompt: string;
  images?: ImageInput[];
  params?: GenerateParams;
}
```

- [ ] **Step 2: 在 `api.ts` 新增 `forkSession` 函数**

在 Sessions 区块的 `deleteSession` 之后添加：

```typescript
export async function forkSession(
  sessionId: string,
  imageId: string
): Promise<Session> {
  return request(`/api/sessions/${sessionId}/fork`, {
    method: "POST",
    body: JSON.stringify({ image_id: imageId }),
  });
}
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/services/api.ts frontend/src/types/index.ts
git commit -m "feat(api): 新增 forkSession 函数，移除 fork_from 类型"
```

---

### Task 6: 前端 — 清理 generationStore 中的 fork 状态

**Files:**
- Modify: `frontend/src/stores/generationStore.ts`

- [ ] **Step 1: 移除 `pendingForkFrom` 和 `setPendingForkFrom`**

1. 从 `GenerationState` 接口移除：
   - `pendingForkFrom: string | null;`
   - `setPendingForkFrom: (id: string | null) => void;`

2. 从 `create` 初始值移除：
   - `pendingForkFrom: null,`

3. 删除 `setPendingForkFrom` 实现：
   ```typescript
   setPendingForkFrom: (id) => set({ pendingForkFrom: id }),
   ```

4. 从 `startGeneration` 方法签名中移除 `forkFrom` 参数：
   ```typescript
   startGeneration: (sessionId: string, prompt: string, onSuccess?: () => void) => void;
   ```

5. 从 `startGeneration` 实现中移除 `forkFrom`：
   - 函数签名：移除 `forkFrom` 参数
   - `generateImage` 调用：移除 `fork_from: forkFrom`

更新后的 `startGeneration` 签名和调用：

```typescript
startGeneration: (sessionId, prompt, onSuccess) => {
    const { attachments, aspectRatio, imageSize, quality, moderation, sessionGenerations } = get();
    if (sessionGenerations[sessionId]?.isGenerating) return;

    const images = attachments.map((a) => ({
      type: "base64" as const,
      data: a.data,
      media_type: a.media_type,
    }));

    const params: Record<string, string> = {
      size: SIZE_MAP[aspectRatio]?.[imageSize] || "1024x1024",
      quality,
      moderation,
    };

    const controller = generateImage(
      {
        session_id: sessionId,
        prompt,
        images,
        params,
      },
      // ... 回调不变
    );
    // ... 其余不变
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/stores/generationStore.ts
git commit -m "refactor(generationStore): 移除 pendingForkFrom 状态和 forkFrom 参数

Fork 不再通过生成流程触发，改为独立的 API 调用"
```

---

### Task 7: 前端 — 改造 DetailPanel 和 InputArea

**Files:**
- Modify: `frontend/src/components/DetailPanel.tsx`
- Modify: `frontend/src/components/InputArea.tsx`
- Modify: `frontend/src/i18n/zh.json`
- Modify: `frontend/src/i18n/en.json`

- [ ] **Step 1: 更新 i18n 翻译**

在 `zh.json` 中：
- 移除 `"input.forkingFrom"` 行
- 新增 `"toast.sessionForked": "已创建分支: {{name}}"`

在 `en.json` 中：
- 移除 `"input.forkingFrom"` 行
- 新增 `"toast.sessionForked": "Branch created: {{name}}"`

- [ ] **Step 2: 改造 DetailPanel**

1. 新增 import：

```typescript
import { forkSession } from "../services/api";
```

移除 import：
```typescript
// 移除: import { useGenerationStore } from "../stores/generationStore";
```

2. 移除 store 引用：

```typescript
// 移除: const { setPendingForkFrom } = useGenerationStore();
```

3. 新增 `forking` 状态：

```typescript
const [forking, setForking] = useState(false);
```

4. 改造 `handleFork`：

```typescript
const handleFork = async () => {
  if (!singleImage || forking || !activeSessionId) return;
  setForking(true);
  try {
    const newSession = await forkSession(activeSessionId, singleImage.id);
    await Promise.all([fetchSessions(), selectSession(newSession.id)]);
    showToast(t("toast.sessionForked", { name: newSession.name }));
  } catch (err) {
    console.error("Fork failed:", err);
    showToast(t("error.generateFailed"));
  } finally {
    setForking(false);
  }
};
```

5. 改造 `handleForkLast`：

```typescript
const handleForkLast = async () => {
  const last = selectedImages[selectedImages.length - 1];
  if (!last || forking || !activeSessionId) return;
  setForking(true);
  try {
    const newSession = await forkSession(activeSessionId, last.id);
    await Promise.all([fetchSessions(), selectSession(newSession.id)]);
    showToast(t("toast.sessionForked", { name: newSession.name }));
  } catch (err) {
    console.error("Fork failed:", err);
    showToast(t("error.generateFailed"));
  } finally {
    setForking(false);
  }
};
```

6. 给 Fork 按钮加上 `disabled={forking}` 属性防止重复点击：

单选 Fork 按钮：
```tsx
<button onClick={handleFork} disabled={forking} className="..." ...>
```

多选 Fork 按钮：
```tsx
<button onClick={handleForkLast} disabled={forking} className="..." ...>
```

- [ ] **Step 3: 清理 InputArea**

1. 移除 `generationStore` 中 `pendingForkFrom` 和 `setPendingForkFrom` 的解构：

```typescript
const {
  attachments,
  error,
  addAttachment,
  removeAttachment,
  startGeneration,
  clearAttachments,
  clearError,
} = useGenerationStore();
```

2. 移除 `handleGenerate` 中的 `pendingForkFrom` 引用：

```typescript
const handleGenerate = () => {
  if (!activeSessionId || !prompt.trim() || isThisGenerating) return;
  startGeneration(
    activeSessionId,
    prompt.trim(),
    () => {
      setPrompt("");
      clearAttachments();
    }
  );
};
```

3. 移除整个 `pendingForkFrom` 提示条 UI 块（约 10 行）：

```tsx
// 删除整个 {pendingForkFrom && ( ... )} 块
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/DetailPanel.tsx frontend/src/components/InputArea.tsx frontend/src/i18n/zh.json frontend/src/i18n/en.json
git commit -m "feat(frontend): Fork 按钮改为直接调用 API 创建独立分支

- DetailPanel: 点击 Fork 立即创建新 session 并自动切换
- InputArea: 移除旧的 fork 提示条 UI
- 新增 toast.sessionForked 翻译
- Fork 按钮增加 loading 防重复点击"
```

---

### Task 8: 最终验证与清理

**Files:** 无新增

- [ ] **Step 1: 运行后端全部测试**

Run: `cd backend && python -m pytest tests/ -v`
Expected: 全部 PASS

- [ ] **Step 2: TypeScript 编译检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: 全局搜索确认无残留 `fork_from` / `pendingForkFrom` 引用**

Run: `grep -r "fork_from\|forkFrom\|pendingForkFrom" --include="*.ts" --include="*.tsx" --include="*.py" backend/ frontend/src/`
Expected: 仅在 `backend/tests/test_session.py` 的 `_insert_image` 中可能无关出现，不应有业务逻辑残留

- [ ] **Step 4: 最终提交（如有遗漏修复）**

```bash
git add -A
git commit -m "chore: Fork 功能改造最终清理"
```
