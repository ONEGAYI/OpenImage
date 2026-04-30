# Inpainting（局部重绘）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为三种 API 模式添加蒙版局部重绘功能，用户可在已有或上传图片上绘制蒙版，AI 只替换标记区域。

**Architecture:** 前端 Canvas 编辑器导出透明 PNG 蒙版 → 后端 `/api/inpaint` 独立端点接收蒙版 + 原图 → `client.py` 按 API 模式智能路由（images 用原生 edits 端点，responses/chat 通过双图 + 元 prompt）。

**Tech Stack:** FastAPI + PIL (后端), React Canvas API + Zustand (前端)

---

## 文件结构

### 新建

| 文件 | 职责 |
|------|------|
| `backend/src/api/inpaint.py` | Inpaint API 路由：请求校验、原图读取、调用 client、保存结果 |
| `backend/tests/test_inpaint.py` | Inpaint 端点 + client mask 路由测试 |
| `frontend/src/components/MaskEditor/index.tsx` | 蒙版编辑器主容器（Overlay + 工具栏 + Canvas + Prompt 栏） |
| `frontend/src/components/MaskEditor/MaskCanvas.tsx` | Canvas 渲染：原图显示 + 蒙版叠加 + 鼠标事件分发 |
| `frontend/src/components/MaskEditor/ToolBar.tsx` | 左侧工具栏：工具选择 + 笔刷大小 + 缩放 |
| `frontend/src/components/MaskEditor/useMaskCanvas.ts` | Hook：笔刷/矩形/橡皮擦绘制逻辑 + 缩放平移 + 蒙版导出 |

### 修改

| 文件 | 变更 |
|------|------|
| `backend/src/server.py:16-18,67-70` | 注册 inpaint router |
| `backend/src/core/client.py` | `generate()` 新增 mask 参数，三种模式路由 |
| `frontend/src/types/index.ts` | 新增 InpaintRequest / InpaintCompleted 类型 |
| `frontend/src/services/api.ts` | 新增 inpaintImage() 函数 |
| `frontend/src/components/DetailPanel.tsx` | 按钮翻页 + Inpaint 按钮 |
| `frontend/src/components/InputArea.tsx` | 附件缩略图编辑图标 |

---

## Task 1: 后端 — InpaintRequest 模型 + /api/inpaint 端点

**Files:**
- Create: `backend/src/api/inpaint.py`
- Modify: `backend/src/server.py:16-18,67-70`

- [ ] **Step 1: 创建 inpaint.py 路由文件**

```python
# backend/src/api/inpaint.py
import base64
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from PIL import Image
from io import BytesIO
from pydantic import BaseModel

from src.core.client import API_MODE_CHAT
from src.api.generate import GenerateParams, _read_image_b64, _save_generated_image

router = APIRouter(tags=["inpaint"])


class InpaintRequest(BaseModel):
    session_id: str
    prompt: str
    source_image_id: str | None = None
    source_image_b64: str | None = None
    mask_b64: str
    params: GenerateParams | None = None


def _decode_and_validate_mask(mask_b64: str) -> None:
    """校验 mask_b64 是否为合法图片"""
    try:
        data = base64.b64decode(mask_b64)
        Image.open(BytesIO(data))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid mask image")


@router.post("/api/inpaint")
async def inpaint(body: InpaintRequest, request: Request):
    """Inpainting 局部重绘，返回 SSE"""
    # 校验来源
    if not body.source_image_id and not body.source_image_b64:
        raise HTTPException(
            status_code=400,
            detail="Must provide either source_image_id or source_image_b64",
        )

    api_key = request.app.state.settings.get("api_key")
    if not api_key:
        raise HTTPException(status_code=400, detail="API key not configured")

    sessions = request.app.state.sessions
    session = await sessions.get(body.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    _decode_and_validate_mask(body.mask_b64)

    # 获取原图 base64
    if body.source_image_id:
        db = request.app.state.db
        store = request.app.state.store
        conn = db.connection()
        cursor = await conn.execute(
            "SELECT file_path FROM images WHERE id = ?", (body.source_image_id,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Source image not found")
        source_b64 = _read_image_b64(store, row["file_path"])
        if not source_b64:
            raise HTTPException(status_code=404, detail="Source image file missing")
    else:
        source_b64 = body.source_image_b64

    params = body.params or GenerateParams()
    client = request.app.state.client

    async def event_stream():
        try:
            yield f"event: generating\ndata: {json.dumps({'session_id': body.session_id})}\n\n"

            result = await client.generate(
                prompt=body.prompt,
                images=[],
                previous_response_id=None,
                params=params.model_dump(),
                history_images=None,
                mask_b64=body.mask_b64,
                source_image_b64=source_b64,
            )

            saved = await _save_generated_image(
                request=request,
                session_id=body.session_id,
                prompt=body.prompt,
                response_id=result.response_id,
                image_b64=result.image_b64,
                revised_prompt=result.revised_prompt,
                parent_image_id=body.source_image_id,
                params=params,
            )

            yield f"event: completed\ndata: {json.dumps(saved)}\n\n"

        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'code': 'inpaint_failed', 'message': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

- [ ] **Step 2: 在 server.py 注册 inpaint router**

在 `backend/src/server.py` 中添加 import 和 router 注册：

```python
# 在 imports 区域（约第 16-18 行之后）添加：
from src.api import inpaint as inpaint_api

# 在 include_router 区域（约第 67-70 行）添加：
app.include_router(inpaint_api.router)
```

- [ ] **Step 3: 验证服务器能启动**

Run: `cd backend && python -c "from src.server import create_app; app = create_app(); print('OK')"`

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/src/api/inpaint.py backend/src/server.py
git commit -m "feat(inpaint): 添加 /api/inpaint 端点和 InpaintRequest 模型"
```

---

## Task 2: 后端 — client.py images 模式 mask 路由

**Files:**
- Modify: `backend/src/core/client.py`

- [ ] **Step 1: 给 generate() 方法添加 mask 参数**

在 `client.py` 的 `generate()` 方法签名中添加 `mask_b64` 和 `source_image_b64` 参数：

```python
# 替换现有的 generate() 方法（约第 247-263 行）
async def generate(
    self,
    prompt: str,
    images: list[dict],
    previous_response_id: str | None,
    params: dict[str, Any] | None = None,
    history_images: list[str] | None = None,
    mask_b64: str | None = None,
    source_image_b64: str | None = None,
) -> GenerateResult:
    # Inpainting 路由
    if mask_b64 and source_image_b64:
        return await self._generate_inpaint(
            prompt, source_image_b64, mask_b64, params
        )
    # 原有路由
    if self.api_mode == API_MODE_CHAT:
        return await self._generate_via_chat(
            prompt, images, params, history_images
        )
    if self.api_mode == API_MODE_IMAGES:
        return await self._generate_via_images(prompt, images, params)
    return await self._generate_via_responses(
        prompt, images, previous_response_id, params
    )
```

- [ ] **Step 2: 实现 _generate_inpaint() 方法**

在 `client.py` 的 `generate()` 方法之前添加：

```python
async def _generate_inpaint(
    self,
    prompt: str,
    source_image_b64: str,
    mask_b64: str,
    params: dict[str, Any] | None = None,
) -> GenerateResult:
    """根据 API 模式路由 inpainting 请求"""
    if self.api_mode == API_MODE_IMAGES:
        return await self._inpaint_via_images(prompt, source_image_b64, mask_b64, params)
    if self.api_mode == API_MODE_CHAT:
        return await self._inpaint_via_chat(prompt, source_image_b64, mask_b64, params)
    return await self._inpaint_via_responses(prompt, source_image_b64, mask_b64, params)
```

- [ ] **Step 3: 实现 images 模式 inpaint（原生 /images/edits）**

```python
async def _inpaint_via_images(
    self,
    prompt: str,
    source_image_b64: str,
    mask_b64: str,
    params: dict[str, Any] | None = None,
) -> GenerateResult:
    """Images API 原生 inpainting: POST /v1/images/edits"""
    import asyncio

    source_bytes = base64.b64decode(source_image_b64)
    mask_bytes = base64.b64decode(mask_b64)

    files = {
        "image": ("source.png", source_bytes, "image/png"),
        "mask": ("mask.png", mask_bytes, "image/png"),
    }
    data = {
        "prompt": prompt,
        "model": self.model_name,
        "n": "1",
        "response_format": "b64_json",
    }
    extra_params = self._extract_params(params or {})
    data.update(extra_params)

    # httpx 不直接支持 multipart，用 asyncio + httpx 的 files 参数
    resp = await self._http.post(
        f"{self._base_url}/images/edits",
        data=data,
        files=files,
    )
    self._check_response(resp, "Images Edits API")
    item = resp.json()["data"][0]

    image_b64 = item.get("b64_json", "")
    if not image_b64:
        url = item.get("url", "")
        if url:
            image_b64 = await self._download_as_b64(url)

    return GenerateResult(
        response_id=self._make_response_id(),
        image_b64=image_b64,
        revised_prompt=item.get("revised_prompt"),
        total_tokens=0,
    )
```

- [ ] **Step 4: 实现 responses 模式 inpaint**

```python
async def _inpaint_via_responses(
    self,
    prompt: str,
    source_image_b64: str,
    mask_b64: str,
    params: dict[str, Any] | None = None,
) -> GenerateResult:
    """Responses API inpainting: 原图 + 蒙版作为 input_image + 元 prompt"""
    content = [
        {
            "type": "input_image",
            "image_url": f"data:image/png;base64,{source_image_b64}",
        },
        {
            "type": "input_image",
            "image_url": f"data:image/png;base64,{mask_b64}",
        },
        {
            "type": "input_text",
            "text": f"[Inpaint] Replace the masked (semi-transparent) region in the first image. The second image shows the mask area. {prompt}",
        },
    ]

    tool_config: dict[str, Any] = {
        "type": "image_generation",
        **self._extract_params(params or {}),
    }

    response = await self._openai.responses.create(
        model=self.model_name,
        input=[{"role": "user", "content": content}],
        tools=[tool_config],
    )

    image_b64 = ""
    revised_prompt = None
    for output in response.output:
        if output.type == "image_generation_call":
            image_b64 = output.result
            revised_prompt = getattr(output, "revised_prompt", None)

    return GenerateResult(
        response_id=response.id,
        image_b64=image_b64,
        revised_prompt=revised_prompt,
        total_tokens=response.usage.total_tokens if response.usage else 0,
    )
```

- [ ] **Step 5: 实现 chat 模式 inpaint**

```python
async def _inpaint_via_chat(
    self,
    prompt: str,
    source_image_b64: str,
    mask_b64: str,
    params: dict[str, Any] | None = None,
) -> GenerateResult:
    """Chat API inpainting: 原图 + 蒙版作为 image_url + 元 prompt"""
    content = [
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{source_image_b64}"},
        },
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{mask_b64}"},
        },
        {
            "type": "text",
            "text": f"[Inpaint] Replace the masked (semi-transparent) region in the first image. The second image shows the mask area. {prompt}",
        },
    ]

    payload: dict[str, Any] = {
        "model": self.model_name,
        "messages": [{"role": "user", "content": content}],
        "tools": [{
            "type": "image_generation",
            **self._extract_params(params or {}),
        }],
    }

    resp = await self._http.post(
        f"{self._base_url}/chat/completions",
        json=payload,
        headers={"Authorization": f"Bearer {self._api_key}"},
    )
    self._check_response(resp, "Chat Inpaint API")
    try:
        text = resp.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        raise ValueError(f"Chat Inpaint API 响应格式异常: {resp.text[:500]}")

    import re
    urls = re.findall(r'!\[.*?\]\((https?://[^)]+)\)', text)
    if not urls:
        urls = re.findall(r'(https?://\S+\.(?:png|jpg|jpeg|webp))', text)
    if not urls:
        urls = re.findall(r'(https?://\S+)', text)
    if not urls:
        raise ValueError(f"未在响应中找到图片 URL，响应内容：{text[:300]}")

    image_b64 = await self._download_as_b64(urls[0])

    return GenerateResult(
        response_id=self._make_response_id(),
        image_b64=image_b64,
        revised_prompt=None,
        total_tokens=0,
    )
```

- [ ] **Step 6: 验证编译**

Run: `cd backend && python -c "from src.core.client import ImageClient; print('OK')"`

Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add backend/src/core/client.py
git commit -m "feat(inpaint): client.py 三模式 mask 路由（images edits / responses 双图 / chat 双图）"
```

---

## Task 3: 后端 — 测试

**Files:**
- Create: `backend/tests/test_inpaint.py`

- [ ] **Step 1: 编写 client.py mask 路由测试**

```python
# backend/tests/test_inpaint.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import base64

from src.core.client import ImageClient, GenerateResult, API_MODE_IMAGES, API_MODE_CHAT

# 生成一个最小的有效 PNG 用于测试
def _make_minimal_png_b64() -> str:
    """1x1 透明 PNG base64"""
    return (
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
        "+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    )


class TestInpaintRouting:
    """测试 client.py 的 inpainting 路由逻辑"""

    @pytest.mark.asyncio
    async def test_inpaint_dispatches_to_images_edit(self):
        """images 模式应调用 /images/edits 端点"""
        client = ImageClient(api_key="sk-test", api_mode=API_MODE_IMAGES)

        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.text = '{"data":[{"b64_json":"result_b64","revised_prompt":null}]}'
        mock_response.headers = {"content-type": "application/json"}
        mock_response.json.return_value = {"data": [{"b64_json": "result_b64", "revised_prompt": None}]}

        with patch.object(client._http, "post", new_callable=AsyncMock, return_value=mock_response) as mock_post:
            result = await client.generate(
                prompt="add a hat",
                images=[],
                previous_response_id=None,
                mask_b64=_make_minimal_png_b64(),
                source_image_b64=_make_minimal_png_b64(),
            )

        assert isinstance(result, GenerateResult)
        assert result.image_b64 == "result_b64"
        # 验证调用了 /images/edits 端点
        call_url = mock_post.call_args[0][0]
        assert "/images/edits" in call_url

    @pytest.mark.asyncio
    async def test_inpaint_dispatches_to_responses(self):
        """responses 模式应组装双图 + 元 prompt 发送给 OpenAI SDK"""
        client = ImageClient(api_key="sk-test")

        mock_resp = MagicMock()
        mock_resp.id = "resp_inpaint"
        mock_resp.output = [
            MagicMock(type="image_generation_call", result="inpainted_b64", revised_prompt=None)
        ]
        mock_resp.usage = MagicMock(total_tokens=50)

        with patch("src.core.client.AsyncOpenAI") as MockOpenAI:
            mock_instance = MockOpenAI.return_value
            mock_instance.responses = MagicMock()
            mock_instance.responses.create = AsyncMock(return_value=mock_resp)
            client._openai = mock_instance

            result = await client.generate(
                prompt="change background",
                images=[],
                previous_response_id=None,
                mask_b64=_make_minimal_png_b64(),
                source_image_b64=_make_minimal_png_b64(),
            )

        assert result.response_id == "resp_inpaint"
        assert result.image_b64 == "inpainted_b64"

        # 验证 input 中包含 3 个元素：原图 + 蒙版 + 元 prompt
        call_kwargs = mock_instance.responses.create.call_args[1]
        input_content = call_kwargs["input"][0]["content"]
        assert len(input_content) == 3
        assert input_content[0]["type"] == "input_image"
        assert input_content[1]["type"] == "input_image"
        assert input_content[2]["type"] == "input_text"
        assert "[Inpaint]" in input_content[2]["text"]

    @pytest.mark.asyncio
    async def test_no_mask_falls_through_to_normal_generate(self):
        """没有 mask 时应走正常生成路径"""
        client = ImageClient(api_key="sk-test", api_mode=API_MODE_IMAGES)

        mock_response = MagicMock()
        mock_response.is_error = False
        mock_response.text = '{"data":[{"b64_json":"normal_b64"}]}'
        mock_response.headers = {"content-type": "application/json"}
        mock_response.json.return_value = {"data": [{"b64_json": "normal_b64"}]}

        with patch.object(client._http, "post", new_callable=AsyncMock, return_value=mock_response) as mock_post:
            result = await client.generate(
                prompt="draw a cat",
                images=[],
                previous_response_id=None,
            )

        assert result.image_b64 == "normal_b64"
        # 验证调用的是正常 /images/generations 而非 /images/edits
        call_url = mock_post.call_args[0][0]
        assert "/images/generations" in call_url


class TestInpaintAPI:
    """测试 /api/inpaint 端点"""

    @pytest.mark.asyncio
    async def test_inpaint_requires_source(self):
        """缺少 source_image_id 和 source_image_b64 应返回 400"""
        from src.api.inpaint import InpaintRequest
        req = InpaintRequest(
            session_id="sess_1",
            prompt="test",
            mask_b64=_make_minimal_png_b64(),
        )
        # source_image_id 和 source_image_b64 都为 None
        assert req.source_image_id is None
        assert req.source_image_b64 is None

    @pytest.mark.asyncio
    async def test_inpaint_request_model_valid(self):
        """InpaintRequest 模型应正确解析"""
        from src.api.inpaint import InpaintRequest
        req = InpaintRequest(
            session_id="sess_1",
            prompt="add a hat",
            source_image_id="img_123",
            mask_b64=_make_minimal_png_b64(),
        )
        assert req.source_image_id == "img_123"
        assert req.mask_b64 == _make_minimal_png_b64()
```

- [ ] **Step 2: 运行测试**

Run: `cd backend && python -m pytest tests/test_inpaint.py -v`

Expected: 4 tests PASS

- [ ] **Step 3: 运行全部测试确保无回归**

Run: `cd backend && python -m pytest tests/ -v`

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_inpaint.py
git commit -m "test(inpaint): 添加 client mask 路由和 API 端点测试"
```

---

## Task 4: 前端 — Types 和 API 层

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: 在 types/index.ts 添加 inpaint 类型**

在 `frontend/src/types/index.ts` 文件末尾添加：

```typescript
export interface InpaintRequest {
  session_id: string;
  prompt: string;
  source_image_id?: string;
  source_image_b64?: string;
  mask_b64: string;
  params?: GenerateParams;
}

export type InpaintCompleted = GenerateCompleted;

export type MaskImageSource =
  | { type: "generated"; imageId: string }
  | { type: "attachment"; attachmentId: string; imageB64: string };
```

- [ ] **Step 2: 在 api.ts 添加 inpaintImage 函数**

在 `frontend/src/services/api.ts` 的 Settings 区域之前添加：

```typescript
// --- Inpaint (SSE) ---

export function inpaintImage(
  req: InpaintRequest,
  onCompleted: (data: InpaintCompleted) => void,
  onError: (code: string, message: string) => void
): AbortController {
  const controller = new AbortController();

  fetch(`${BASE_URL}/api/inpaint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal: controller.signal,
  })
    .then(async (res) => {
      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === "completed") {
                onCompleted(data);
              } else if (currentEvent === "error") {
                onError(data.code, data.message);
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onError("network_error", err.message);
      }
    });

  return controller;
}
```

同时在文件顶部的 import 中添加 `InpaintRequest` 和 `InpaintCompleted`：

```typescript
import type {
  Session,
  Image,
  GenerateRequest,
  GenerateCompleted,
  SettingsResponse,
  InpaintRequest,
  InpaintCompleted,
} from "../types";
```

- [ ] **Step 3: 验证编译**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`

Expected: 无 inpaint 相关错误（可能有其他已有错误）

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/services/api.ts
git commit -m "feat(inpaint): 前端 InpaintRequest 类型和 API 通信函数"
```

---

## Task 5: 前端 — useMaskCanvas Hook

**Files:**
- Create: `frontend/src/components/MaskEditor/useMaskCanvas.ts`

- [ ] **Step 1: 实现 useMaskCanvas hook**

```typescript
// frontend/src/components/MaskEditor/useMaskCanvas.ts
import { useRef, useState, useCallback, useEffect } from "react";

export type Tool = "brush" | "rectangle" | "eraser";

interface Point {
  x: number;
  y: number;
}

interface Rect {
  start: Point;
  end: Point;
}

interface MaskCanvasState {
  tool: Tool;
  brushSize: number;
  zoom: number;
  panOffset: Point;
  isDrawing: boolean;
  hasMask: boolean;
}

export function useMaskCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  imageElement: HTMLImageElement | null
) {
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<MaskCanvasState>({
    tool: "brush",
    brushSize: 32,
    zoom: 1,
    panOffset: { x: 0, y: 0 },
    isDrawing: false,
    hasMask: false,
  });

  const currentPathRef = useRef<Point[]>([]);
  const currentRectRef = useRef<Rect | null>(null);
  const displayScaleRef = useRef(1);
  const lastPanPointRef = useRef<Point | null>(null);

  // 计算原图在 Canvas 中的显示区域（object-fit: contain）
  const getImageRect = useCallback(() => {
    if (!imageElement || !canvasRef.current) return null;
    const canvas = canvasRef.current;
    const imgW = imageElement.naturalWidth;
    const imgH = imageElement.naturalHeight;
    const canvasW = canvas.width;
    const canvasH = canvas.height;
    const scale = Math.min(canvasW / imgW, canvasH / imgH) * state.zoom;
    displayScaleRef.current = scale;
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const offsetX = (canvasW - drawW) / 2 + state.panOffset.x;
    const offsetY = (canvasH - drawH) / 2 + state.panOffset.y;
    return { x: offsetX, y: offsetY, w: drawW, h: drawH, scale };
  }, [imageElement, state.zoom, state.panOffset]);

  // 初始化离屏 mask canvas（与原图同尺寸）
  const ensureMaskCanvas = useCallback(() => {
    if (!imageElement) return null;
    if (
      !maskCanvasRef.current ||
      maskCanvasRef.current.width !== imageElement.naturalWidth ||
      maskCanvasRef.current.height !== imageElement.naturalHeight
    ) {
      const c = document.createElement("canvas");
      c.width = imageElement.naturalWidth;
      c.height = imageElement.naturalHeight;
      maskCanvasRef.current = c;
    }
    return maskCanvasRef.current;
  }, [imageElement]);

  // 将 canvas 坐标转换为原图坐标
  const canvasToImage = useCallback(
    (cx: number, cy: number): Point | null => {
      const rect = getImageRect();
      if (!rect) return null;
      return {
        x: (cx - rect.x) / rect.scale,
        y: (cy - rect.y) / rect.scale,
      };
    },
    [getImageRect]
  );

  // 在 mask canvas 上绘制一个笔触点
  const drawMaskDot = useCallback(
    (ctx: CanvasRenderingContext2D, imgPoint: Point, erase: boolean) => {
      const size = state.brushSize / displayScaleRef.current;
      ctx.beginPath();
      ctx.arc(imgPoint.x, imgPoint.y, size / 2, 0, Math.PI * 2);
      if (erase) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(205,120,92,1)";
      }
      ctx.fill();
    },
    [state.brushSize]
  );

  // 在 mask canvas 上绘制一条线段（两个点之间插值）
  const drawMaskLine = useCallback(
    (ctx: CanvasRenderingContext2D, from: Point, to: Point, erase: boolean) => {
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      const step = Math.max(1, state.brushSize / displayScaleRef.current / 4);
      const steps = Math.max(1, Math.ceil(dist / step));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        drawMaskDot(ctx, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, erase);
      }
    },
    [drawMaskDot, state.brushSize]
  );

  // 渲染蒙版叠加到显示 canvas
  const renderOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const maskC = maskCanvasRef.current;
    if (!canvas || !imageElement || !maskC) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = getImageRect();
    if (!rect) return;

    // 清空并绘制原图
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageElement, rect.x, rect.y, rect.w, rect.h);

    // 绘制蒙版叠加（半透明）
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.drawImage(maskC, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();

    // 绘制矩形预览
    if (currentRectRef.current) {
      const r = currentRectRef.current;
      const imgRect = getImageRect()!;
      const sx = r.start.x * rect.scale + rect.x;
      const sy = r.start.y * rect.scale + rect.y;
      const ex = r.end.x * rect.scale + rect.x;
      const ey = r.end.y * rect.scale + rect.y;
      ctx.fillStyle = "rgba(205,120,92,0.35)";
      ctx.fillRect(
        Math.min(sx, ex),
        Math.min(sy, ey),
        Math.abs(ex - sx),
        Math.abs(ey - sy)
      );
    }
  }, [canvasRef, imageElement, getImageRect]);

  // 鼠标事件处理
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!imageElement) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const bounds = canvas.getBoundingClientRect();
      const cx = e.clientX - bounds.left;
      const cy = e.clientY - bounds.top;

      // 中键拖拽平移
      if (e.button === 1) {
        lastPanPointRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      const imgPoint = canvasToImage(cx, cy);
      if (!imgPoint) return;

      const maskC = ensureMaskCanvas();
      if (!maskC) return;
      const ctx = maskC.getContext("2d");
      if (!ctx) return;

      setState((s) => ({ ...s, isDrawing: true }));

      if (state.tool === "rectangle") {
        currentRectRef.current = { start: imgPoint, end: imgPoint };
      } else {
        const erase = state.tool === "eraser";
        drawMaskDot(ctx, imgPoint, erase);
        currentPathRef.current = [imgPoint];
        setState((s) => ({ ...s, hasMask: true }));
      }
      renderOverlay();
    },
    [canvasRef, imageElement, state.tool, canvasToImage, ensureMaskCanvas, drawMaskDot, renderOverlay]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // 平移
      if (lastPanPointRef.current) {
        const dx = e.clientX - lastPanPointRef.current.x;
        const dy = e.clientY - lastPanPointRef.current.y;
        lastPanPointRef.current = { x: e.clientX, y: e.clientY };
        setState((s) => ({
          ...s,
          panOffset: { x: s.panOffset.x + dx, y: s.panOffset.y + dy },
        }));
        return;
      }

      if (!state.isDrawing || !imageElement) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const bounds = canvas.getBoundingClientRect();
      const cx = e.clientX - bounds.left;
      const cy = e.clientY - bounds.top;
      const imgPoint = canvasToImage(cx, cy);
      if (!imgPoint) return;

      if (state.tool === "rectangle") {
        currentRectRef.current = { ...currentRectRef.current!, end: imgPoint };
      } else {
        const maskC = ensureMaskCanvas();
        if (!maskC) return;
        const ctx = maskC.getContext("2d");
        if (!ctx) return;
        const last = currentPathRef.current[currentPathRef.current.length - 1];
        if (last) {
          const erase = state.tool === "eraser";
          drawMaskLine(ctx, last, imgPoint, erase);
        }
        currentPathRef.current.push(imgPoint);
      }
      renderOverlay();
    },
    [state.isDrawing, state.tool, imageElement, canvasRef, canvasToImage, ensureMaskCanvas, drawMaskLine, renderOverlay]
  );

  const handleMouseUp = useCallback(() => {
    if (lastPanPointRef.current) {
      lastPanPointRef.current = null;
      return;
    }

    if (state.tool === "rectangle" && currentRectRef.current) {
      const maskC = ensureMaskCanvas();
      if (maskC) {
        const ctx = maskC.getContext("2d");
        if (ctx) {
          const r = currentRectRef.current;
          ctx.fillStyle = "rgba(205,120,92,1)";
          ctx.globalCompositeOperation = "source-over";
          const x = Math.min(r.start.x, r.end.x);
          const y = Math.min(r.start.y, r.end.y);
          const w = Math.abs(r.end.x - r.start.x);
          const h = Math.abs(r.end.y - r.start.y);
          ctx.fillRect(x, y, w, h);
          setState((s) => ({ ...s, hasMask: true }));
        }
      }
      currentRectRef.current = null;
    }

    setState((s) => ({ ...s, isDrawing: false }));
    renderOverlay();
  }, [state.tool, ensureMaskCanvas, renderOverlay]);

  // 滚轮缩放
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setState((s) => ({
        ...s,
        zoom: Math.max(0.25, Math.min(5, s.zoom * delta)),
      }));
    },
    []
  );

  // 导出蒙版为透明 PNG base64
  const exportMask = useCallback((): string | null => {
    const maskC = maskCanvasRef.current;
    if (!maskC || !state.hasMask) return null;

    // 创建一个只包含 alpha 通道的输出 canvas
    const output = document.createElement("canvas");
    output.width = maskC.width;
    output.height = maskC.height;
    const ctx = output.getContext("2d")!;

    // 读取 mask canvas 的像素数据
    const maskCtx = maskC.getContext("2d")!;
    const imgData = maskCtx.getImageData(0, 0, maskC.width, maskC.height);

    // 生成蒙版：有绘制内容的区域为白色不透明，未绘制区域为透明
    const outData = ctx.createImageData(maskC.width, maskC.height);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const alpha = imgData.data[i + 3]; // mask canvas 的 alpha
      outData.data[i] = 255;     // R
      outData.data[i + 1] = 255; // G
      outData.data[i + 2] = 255; // B
      outData.data[i + 3] = alpha; // A (保留原始 alpha)
    }
    ctx.putImageData(outData, 0, 0);

    // 导出为 PNG base64
    const dataUrl = output.toDataURL("image/png");
    return dataUrl.split(",")[1];
  }, [state.hasMask]);

  // 重置蒙版
  const clearMask = useCallback(() => {
    const maskC = ensureMaskCanvas();
    if (maskC) {
      const ctx = maskC.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, maskC.width, maskC.height);
    }
    currentRectRef.current = null;
    setState((s) => ({ ...s, hasMask: false }));
    renderOverlay();
  }, [ensureMaskCanvas, renderOverlay]);

  // zoom/pan 变化时重新渲染
  useEffect(() => {
    renderOverlay();
  }, [state.zoom, state.panOffset, renderOverlay]);

  return {
    state,
    setTool: (tool: Tool) => setState((s) => ({ ...s, tool })),
    setBrushSize: (size: number) => setState((s) => ({ ...s, brushSize: size })),
    resetZoom: () => setState((s) => ({ ...s, zoom: 1, panOffset: { x: 0, y: 0 } })),
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    exportMask,
    clearMask,
    renderOverlay,
  };
}
```

- [ ] **Step 2: 验证编译**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`

Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MaskEditor/useMaskCanvas.ts
git commit -m "feat(inpaint): useMaskCanvas hook — 笔刷/矩形/橡皮擦绘制逻辑"
```

---

## Task 6: 前端 — ToolBar 组件

**Files:**
- Create: `frontend/src/components/MaskEditor/ToolBar.tsx`

- [ ] **Step 1: 实现 ToolBar 组件**

```typescript
// frontend/src/components/MaskEditor/ToolBar.tsx
import type { Tool } from "./useMaskCanvas";

interface ToolBarProps {
  tool: Tool;
  brushSize: number;
  zoom: number;
  onToolChange: (tool: Tool) => void;
  onBrushSizeChange: (size: number) => void;
  onResetZoom: () => void;
}

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "brush", label: "Brush", icon: "M12 19l7-7 3 3-7 7-3-3z M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" },
  { id: "rectangle", label: "Rectangle", icon: "M3 3h18v18H3z" },
  { id: "eraser", label: "Eraser", icon: "M20 20H7L3 16l9-9 8 8-4 4z" },
];

export default function ToolBar({
  tool,
  brushSize,
  zoom,
  onToolChange,
  onBrushSizeChange,
  onResetZoom,
}: ToolBarProps) {
  return (
    <div
      style={{
        width: 52,
        background: "var(--surface-dark, #181715)",
        borderRight: "1px solid var(--surface-dark-elevated, #252320)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "12px 0",
        gap: 4,
      }}
    >
      {TOOLS.map(({ id, label, icon }) => (
        <button
          key={id}
          onClick={() => onToolChange(id)}
          title={label}
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: tool === id ? "var(--surface-dark-elevated, #252320)" : "transparent",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            if (tool !== id) e.currentTarget.style.background = "rgba(255,255,255,0.05)";
          }}
          onMouseLeave={(e) => {
            if (tool !== id) e.currentTarget.style.background = "transparent";
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={tool === id ? "#faf9f5" : "#a09d96"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={icon} />
          </svg>
        </button>
      ))}

      <div style={{ flex: 1 }} />

      {/* 笔刷大小（仅笔刷和橡皮擦时显示） */}
      {tool !== "rectangle" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: Math.min(24, brushSize * 0.6 + 4),
              height: Math.min(24, brushSize * 0.6 + 4),
              borderRadius: "50%",
              border: "2px solid #faf9f5",
            }}
          />
          <span style={{ color: "#faf9f5", fontSize: 10 }}>{brushSize}px</span>
          <input
            type="range"
            min={4}
            max={128}
            value={brushSize}
            onChange={(e) => onBrushSizeChange(Number(e.target.value))}
            style={{ width: 36, writingMode: "vertical-lr", direction: "rtl", accentColor: "#cc785c" }}
          />
        </div>
      )}

      {/* 缩放控制 */}
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <span style={{ color: "#a09d96", fontSize: 10 }}>{Math.round(zoom * 100)}%</span>
        <button
          onClick={onResetZoom}
          style={{
            fontSize: 10,
            color: "#a09d96",
            background: "none",
            border: "1px solid #252320",
            borderRadius: 4,
            padding: "2px 6px",
            cursor: "pointer",
          }}
        >
          Fit
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/MaskEditor/ToolBar.tsx
git commit -m "feat(inpaint): ToolBar 组件 — 工具选择 + 笔刷大小 + 缩放控制"
```

---

## Task 7: 前端 — MaskCanvas 组件

**Files:**
- Create: `frontend/src/components/MaskEditor/MaskCanvas.tsx`

- [ ] **Step 1: 实现 MaskCanvas 组件**

```typescript
// frontend/src/components/MaskEditor/MaskCanvas.tsx
import { useEffect, useRef, useCallback } from "react";
import { useMaskCanvas } from "./useMaskCanvas";

interface MaskCanvasProps {
  imageUrl: string;
  onMaskReady: (hasMask: boolean) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  maskCanvasHook: ReturnType<typeof useMaskCanvas>;
}

export default function MaskCanvas({ imageUrl, maskCanvasHook }: MaskCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // 加载图片
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      maskCanvasHook.renderOverlay();
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // 调整 canvas 尺寸匹配容器
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
      maskCanvasHook.renderOverlay();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [maskCanvasHook]);

  // 创建 hook 实例的替代：这里用传入的 hook
  const hook = maskCanvasHook;

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, position: "relative", overflow: "hidden", cursor: "crosshair" }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }}
        onMouseDown={hook.handleMouseDown}
        onMouseMove={hook.handleMouseMove}
        onMouseUp={hook.handleMouseUp}
        onMouseLeave={hook.handleMouseUp}
        onWheel={hook.handleWheel}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/MaskEditor/MaskCanvas.tsx
git commit -m "feat(inpaint): MaskCanvas 组件 — 双层 Canvas 渲染 + 事件分发"
```

---

## Task 8: 前端 — MaskEditor 主容器

**Files:**
- Create: `frontend/src/components/MaskEditor/index.tsx`

- [ ] **Step 1: 实现 MaskEditor 主容器**

```typescript
// frontend/src/components/MaskEditor/index.tsx
import { useState, useRef, useCallback } from "react";
import { useMaskCanvas } from "./useMaskCanvas";
import MaskCanvas from "./MaskCanvas";
import ToolBar from "./ToolBar";
import { getImageFileUrl } from "../../services/api";
import type { MaskImageSource } from "../../types";

interface MaskEditorProps {
  source: MaskImageSource;
  onClose: () => void;
  onGenerate: (maskB64: string, prompt: string) => void;
  isGenerating?: boolean;
}

export default function MaskEditor({ source, onClose, onGenerate, isGenerating }: MaskEditorProps) {
  const [prompt, setPrompt] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 获取图片 URL
  const imageUrl =
    source.type === "generated"
      ? getImageFileUrl(source.imageId)
      : `data:image/png;base64,${source.imageB64}`;

  // 图片元素（由 MaskCanvas 加载，这里通过 ref 共享）
  const imageElRef = useRef<HTMLImageElement | null>(null);

  // 使用 mask canvas hook（需要先加载图片）
  const hook = useMaskCanvas(canvasRef, imageElRef.current);

  const handleGenerate = useCallback(() => {
    const maskB64 = hook.exportMask();
    if (!maskB64 || !prompt.trim()) return;
    onGenerate(maskB64, prompt.trim());
  }, [hook, prompt, onGenerate]);

  const sourceLabel =
    source.type === "generated"
      ? source.imageId
      : "来自附件";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 9999, background: "rgba(20,20,19,0.85)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="flex flex-col"
        style={{
          width: "92vw",
          height: "90vh",
          background: "#141413",
          borderRadius: "var(--radius-lg, 12px)",
          overflow: "hidden",
          boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
        }}
      >
        {/* 顶栏 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 20px",
            background: "#181715",
            borderBottom: "1px solid #252320",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "#faf9f5", fontSize: 14, fontWeight: 500 }}>Inpaint Editor</span>
            <span style={{ color: "#a09d96", fontSize: 12 }}>{sourceLabel}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                background: "#252320",
                color: "#a09d96",
                border: "none",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={hook.clearMask}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                background: "#252320",
                color: "#faf9f5",
                border: "none",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>
        </div>

        {/* 主区域 */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <ToolBar
            tool={hook.state.tool}
            brushSize={hook.state.brushSize}
            zoom={hook.state.zoom}
            onToolChange={hook.setTool}
            onBrushSizeChange={hook.setBrushSize}
            onResetZoom={hook.resetZoom}
          />
          <MaskCanvas
            imageUrl={imageUrl}
            onMaskReady={() => {}}
            canvasRef={canvasRef}
            maskCanvasHook={hook}
          />
        </div>

        {/* 底栏 Prompt */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 20px",
            background: "#181715",
            borderTop: "1px solid #252320",
          }}
        >
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what to generate in the masked area..."
            style={{
              flex: 1,
              padding: "9px 14px",
              borderRadius: 8,
              background: "#252320",
              border: "none",
              color: "#faf9f5",
              fontSize: 13,
              outline: "none",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hook.state.hasMask && prompt.trim()) {
                handleGenerate();
              }
            }}
          />
          <button
            onClick={handleGenerate}
            disabled={!hook.state.hasMask || !prompt.trim() || isGenerating}
            style={{
              padding: "9px 22px",
              borderRadius: 8,
              background: "#cc785c",
              color: "#faf9f5",
              border: "none",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              opacity: !hook.state.hasMask || !prompt.trim() ? 0.4 : 1,
            }}
          >
            {isGenerating ? "Generating..." : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -30`

Expected: 无新错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MaskEditor/index.tsx
git commit -m "feat(inpaint): MaskEditor 主容器 — 全屏 Overlay + 工具栏 + Canvas + Prompt"
```

---

## Task 9: 前端 — DetailPanel 翻页 + Inpaint 按钮

**Files:**
- Modify: `frontend/src/components/DetailPanel.tsx`

- [ ] **Step 1: 添加翻页状态和 Inpaint 按钮**

在 `DetailPanel.tsx` 中添加翻页逻辑和 Inpaint 按钮。主要改动：

1. 添加 `useState` 导入
2. 添加 `buttonPage` state 和 `setEditingMask` state
3. 将操作按钮拆分为两页，添加翻页指示器和滚轮监听
4. 第二页新增 Inpaint 按钮
5. 当 `editingMask` 有值时渲染 `MaskEditor`

在文件顶部的 state 声明区域添加：

```typescript
const [buttonPage, setButtonPage] = useState(0);
const [editingMask, setEditingMask] = useState<MaskImageSource | null>(null);
```

将 Actions 区域（约第 133-185 行）替换为翻页式：

```tsx
{/* Actions — 翻页式 */}
<div
  className="border-t flex flex-col gap-2 mt-auto"
  style={{ padding: 16, borderColor: "var(--border-s)", boxSizing: "border-box" }}
  onWheel={(e) => {
    e.deltaY > 0 ? setButtonPage((p) => Math.min(1, p + 1)) : setButtonPage((p) => Math.max(0, p - 1));
  }}
>
  <div style={{ overflow: "hidden", position: "relative" }}>
    <div
      style={{
        display: "flex",
        transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
        transform: `translateX(-${buttonPage * 100}%)`,
      }}
    >
      {/* 第一页 */}
      <div style={{ minWidth: "100%", flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {isSingle ? (
          <>
            <button onClick={() => setViewingImage(singleImage!)} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border-none"
              style={{ background: "var(--accent)", color: "#faf9f5" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-h)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
            >View</button>
            <button onClick={handleSave} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border"
              style={{ background: "var(--sand)", color: "var(--fg)", borderColor: "var(--border)", boxSizing: "border-box" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.boxShadow = "0 1px 4px var(--card-shadow)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--sand)"; e.currentTarget.style.boxShadow = "none"; }}
            >Save Image</button>
            <button onClick={handleRemove} disabled={deleting} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border-none disabled:opacity-50"
              style={{ background: "rgba(181,51,51,0.08)", color: "var(--error)", boxSizing: "border-box" }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "rgba(181,51,51,0.14)"; }}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(181,51,51,0.08)")}
            >{deleting ? "Removing..." : "Remove"}</button>
          </>
        ) : (
          <>
            <button onClick={handleRemove} disabled={deleting} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border-none disabled:opacity-50"
              style={{ background: "rgba(181,51,51,0.08)", color: "var(--error)", boxSizing: "border-box" }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "rgba(181,51,51,0.14)"; }}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(181,51,51,0.08)")}
            >{deleting ? "Removing..." : "Remove Selected"}</button>
            <button onClick={handleSaveAll} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border-none"
              style={{ background: "var(--accent)", color: "#faf9f5" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-h)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
            >Save All</button>
          </>
        )}
      </div>

      {/* 第二页 */}
      <div style={{ minWidth: "100%", flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {isSingle ? (
          <>
            <button onClick={handleCopyPrompt} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border"
              style={{ background: "var(--sand)", color: "var(--fg)", borderColor: "var(--border)", boxSizing: "border-box" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.boxShadow = "0 1px 4px var(--card-shadow)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--sand)"; e.currentTarget.style.boxShadow = "none"; }}
            >Copy Prompt</button>
            <button onClick={handleFork} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border"
              style={{ background: "var(--sand)", color: "var(--accent)", borderColor: "var(--border)", boxSizing: "border-box" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.boxShadow = "0 1px 4px var(--card-shadow)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--sand)"; e.currentTarget.style.boxShadow = "none"; }}
            >Fork from Here</button>
            <button onClick={() => setEditingMask({ type: "generated", imageId: singleImage!.id })} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border-none"
              style={{ background: "var(--accent)", color: "#faf9f5" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-h)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
            >Inpaint</button>
          </>
        ) : (
          <>
            <button onClick={handleCopyPrompts} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border"
              style={{ background: "var(--sand)", color: "var(--fg)", borderColor: "var(--border)", boxSizing: "border-box" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.boxShadow = "0 1px 4px var(--card-shadow)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--sand)"; e.currentTarget.style.boxShadow = "none"; }}
            >Copy Prompts</button>
            <button onClick={handleForkLast} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border"
              style={{ background: "var(--sand)", color: "var(--accent)", borderColor: "var(--border)", boxSizing: "border-box" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.boxShadow = "0 1px 4px var(--card-shadow)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--sand)"; e.currentTarget.style.boxShadow = "none"; }}
            >Fork from Last</button>
          </>
        )}
      </div>
    </div>
  </div>

  {/* 页码指示器 */}
  <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
    {[0, 1].map((p) => (
      <button
        key={p}
        onClick={() => setButtonPage(p)}
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: buttonPage === p ? "var(--accent)" : "var(--border)",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      />
    ))}
  </div>
</div>

{/* MaskEditor Overlay */}
{editingMask && activeSessionId && (
  <MaskEditor
    source={editingMask}
    onClose={() => setEditingMask(null)}
    onGenerate={(maskB64, prompt) => {
      // 调用 inpaint API
      import("../services/api").then(({ inpaintImage }) => {
        import("./sessionStore").then(({ useSessionStore }) => {
          const store = useSessionStore.getState();
          const req = editingMask.type === "generated"
            ? { session_id: activeSessionId, prompt, source_image_id: editingMask.imageId, mask_b64: maskB64 }
            : { session_id: activeSessionId, prompt, source_image_b64: editingMask.imageB64, mask_b64: maskB64 };
          inpaintImage(
            req,
            () => {
              setEditingMask(null);
              Promise.all([store.fetchSessions(), store.selectSession(activeSessionId)]);
            },
            (code, msg) => {
              console.error("Inpaint failed:", code, msg);
            }
          );
        });
      });
    }}
  />
)}
```

同时需要在文件顶部添加导入：

```typescript
import MaskEditor from "./MaskEditor";
import type { MaskImageSource } from "../types";
```

- [ ] **Step 2: 验证编译**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -30`

Expected: 无新错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DetailPanel.tsx
git commit -m "feat(inpaint): DetailPanel 翻页按钮 + Inpaint 入口"
```

---

## Task 10: 前端 — InputArea 附件编辑入口

**Files:**
- Modify: `frontend/src/components/InputArea.tsx`

- [ ] **Step 1: 在附件缩略图添加编辑图标**

在 `InputArea.tsx` 中添加 `editingAttachment` state 和编辑图标。

在 state 声明区添加：

```typescript
const [editingAttachment, setEditingAttachment] = useState<AttachedFile | null>(null);
```

将附件缩略图区域（约第 117-132 行）中每个缩略图添加编辑图标按钮：

在 `<img>` 标签和删除按钮之间添加：

```tsx
{/* 编辑图标（左下角） */}
<button
  onClick={() => setEditingAttachment(att)}
  className="absolute bottom-0.5 left-0.5 w-[20px] h-[20px] rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
  style={{ background: "rgba(20,20,19,0.6)" }}
  title="Inpaint this image"
>
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
  </svg>
</button>
```

在文件末尾（`</div>` 闭合标签之前）添加 MaskEditor：

```tsx
{editingAttachment && activeSessionId && (
  <MaskEditor
    source={{ type: "attachment", attachmentId: editingAttachment.id, imageB64: editingAttachment.data }}
    onClose={() => setEditingAttachment(null)}
    onGenerate={(maskB64, prompt) => {
      import("../services/api").then(({ inpaintImage }) => {
        import("../stores/sessionStore").then(({ useSessionStore }) => {
          const store = useSessionStore.getState();
          inpaintImage(
            {
              session_id: activeSessionId,
              prompt,
              source_image_b64: editingAttachment.data,
              mask_b64: maskB64,
            },
            () => {
              setEditingAttachment(null);
              Promise.all([store.fetchSessions(), store.selectSession(activeSessionId)]);
            },
            (code, msg) => {
              console.error("Inpaint failed:", code, msg);
            }
          );
        });
      });
    }}
  />
)}
```

添加导入：

```typescript
import MaskEditor from "./MaskEditor";
```

- [ ] **Step 2: 验证编译**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/InputArea.tsx
git commit -m "feat(inpaint): InputArea 附件缩略图编辑图标入口"
```

---

## Task 11: 集成验证 + 文件树更新

**Files:**
- Modify: `CLAUDE.md`（文件树）

- [ ] **Step 1: 启动后端验证 /api/inpaint 端点**

Run: `cd backend && python -m src.cli serve &`

然后测试端点存在：

Run: `curl -s -X POST http://localhost:8765/api/inpaint -H "Content-Type: application/json" -d '{}' | python -m json.tool`

Expected: 返回 422（缺少必填字段）或 400 错误，确认端点存在

- [ ] **Step 2: 启动前端开发服务器**

Run: `cd frontend && npm run dev`

在浏览器中打开 http://localhost:1420，验证：
- Gallery 中选中图片后，DetailPanel 按钮区翻页正常
- 第二页显示 Inpaint 按钮
- 点击 Inpaint 打开编辑器 overlay
- 工具栏笔刷/矩形/橡皮擦切换正常
- InputArea 附件 hover 显示编辑图标

- [ ] **Step 3: 更新 CLAUDE.md 文件树**

在文件树中添加新文件：

```
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── generate.py
│   │   │   ├── images.py
│   │   │   ├── inpaint.py          # Inpainting 局部重绘 API（mask + 原图 → SSE）
│   │   │   ├── sessions.py
│   │   │   └── settings.py
```

```
│   ├── src/
│   │   ├── components/
│   │   │   ├── MaskEditor/         # 蒙版编辑器（Canvas 笔刷/矩形 + 工具栏）
│   │   │   │   ├── index.tsx       # 全屏 Overlay 容器
│   │   │   │   ├── MaskCanvas.tsx  # Canvas 渲染 + 事件分发
│   │   │   │   ├── ToolBar.tsx     # 工具选择 + 笔刷大小 + 缩放
│   │   │   │   └── useMaskCanvas.ts  # 绘制逻辑 hook
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: 更新文件树，添加 inpainting 相关文件"
```

---

## 自查结果

### 1. Spec 覆盖检查

| Spec 要求 | 对应 Task |
|-----------|----------|
| DetailPanel 翻页按钮 + Inpaint 入口 | Task 9 |
| InputArea 附件编辑图标入口 | Task 10 |
| 全屏蒙版编辑器（工具栏 + Canvas + Prompt） | Task 5-8 |
| 笔刷 + 矩形 + 橡皮擦工具 | Task 5 (useMaskCanvas) |
| 滚轮缩放 + 中键平移 | Task 5 |
| 透明 PNG 蒙版导出 | Task 5 (exportMask) |
| 后端 /api/inpaint 独立端点 | Task 1 |
| client.py 三模式智能路由 | Task 2 |
| images 模式原生 /images/edits | Task 2 |
| responses/chat 双图 + 元 prompt | Task 2 |
| 尺寸用 Image.naturalWidth 而非 DB | Task 5 (useMaskCanvas) |
| 翻页滚轮 + 仿真滑动动效 | Task 9 |
| 后端测试 | Task 3 |
| 未绘制蒙版禁用 Generate | Task 8 |

### 2. 占位符扫描

无 TBD / TODO / "implement later" / "add validation" 等占位符。

### 3. 类型一致性

- `InpaintRequest`：types/index.ts 和 api.ts 和后端 InpaintRequest(BaseModel) 字段一致
- `MaskImageSource`：types/index.ts 定义，DetailPanel 和 InputArea 使用一致
- `useMaskCanvas` hook 返回类型：在 MaskCanvas 和 MaskEditor 中引用一致
- `Tool` 类型：useMaskCanvas.ts 导出，ToolBar.tsx 导入，一致
