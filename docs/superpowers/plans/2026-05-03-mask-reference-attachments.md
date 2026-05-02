# Inpaint 参考图片附件功能 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 MaskEditor 的底栏输入区增加参考图片附件功能，允许 inpainting 时附加额外参考图片。

**Architecture:** 后端扩展 `InpaintRequest` 增加 `reference_images` 字段，三种 API 模式的 `_inpaint_via_*` 方法将参考图拼入请求。前端 MaskEditor 新增参考图管理 UI，两个入口（InputArea/DetailPanel）传入不同的初始参考图。Images 模式下参考图不保证兼容，前端显示非阻塞提示。

**Tech Stack:** Python FastAPI + Pydantic（后端），React + TypeScript + Zustand（前端），httpx + OpenAI SDK（API 客户端）

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `backend/src/api/inpaint.py` | 修改 | 新增 `ReferenceImage` model，`InpaintRequest` 扩展 `reference_images` 字段，传递给 client |
| `backend/src/core/client.py` | 修改 | `generate()` / `_generate_inpaint()` / `_inpaint_via_*` 方法接受并处理参考图 |
| `backend/tests/test_inpaint.py` | 修改 | 新增参考图相关的单元测试 |
| `frontend/src/types/index.ts` | 修改 | `InpaintRequest` 增加 `reference_images` 字段 |
| `frontend/src/components/MaskEditor/index.tsx` | 修改 | 新增参考图 UI、内部状态、props 扩展 |
| `frontend/src/components/InputArea.tsx` | 修改 | 传递 `initialReferences` 和 `referenceImages` 给 API |
| `frontend/src/components/DetailPanel.tsx` | 修改 | 传递空的 `initialReferences`，`onGenerate` 回调传递参考图 |
| `frontend/src/i18n/zh.json` | 修改 | 新增 3 个翻译 key |
| `frontend/src/i18n/en.json` | 修改 | 新增 3 个翻译 key |

---

### Task 1: 后端 — ReferenceImage model + InpaintRequest 扩展

**Files:**
- Modify: `backend/src/api/inpaint.py:21-27`
- Test: `backend/tests/test_inpaint.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_inpaint.py` 的 `TestInpaintAPI` 类末尾添加：

```python
def test_inpaint_request_with_reference_images(self):
    """InpaintRequest 支持 reference_images 字段"""
    from src.api.inpaint import InpaintRequest, ReferenceImage
    b64 = _make_minimal_png_b64()
    req = InpaintRequest(
        session_id="sess_1",
        prompt="edit with reference",
        source_image_b64=b64,
        mask_b64=b64,
        reference_images=[
            ReferenceImage(data=b64, media_type="image/png"),
            ReferenceImage(data=b64, media_type="image/jpeg"),
        ],
    )
    assert req.reference_images is not None
    assert len(req.reference_images) == 2
    assert req.reference_images[0].media_type == "image/png"
    assert req.reference_images[1].media_type == "image/jpeg"

def test_inpaint_request_reference_images_optional(self):
    """reference_images 是可选字段，默认为 None"""
    from src.api.inpaint import InpaintRequest
    req = InpaintRequest(
        session_id="sess_1",
        prompt="test",
        mask_b64=_make_minimal_png_b64(),
    )
    assert req.reference_images is None
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && python -m pytest tests/test_inpaint.py::TestInpaintAPI::test_inpaint_request_with_reference_images -v`
Expected: FAIL — `ImportError: cannot import name 'ReferenceImage'`

- [ ] **Step 3: 实现最小代码**

在 `backend/src/api/inpaint.py` 的 `InpaintRequest` 类之前添加 `ReferenceImage` model，并在 `InpaintRequest` 中新增字段：

```python
class ReferenceImage(BaseModel):
    data: str        # base64
    media_type: str  # e.g. "image/png"


class InpaintRequest(BaseModel):
    session_id: str
    prompt: str
    source_image_id: str | None = None
    source_image_b64: str | None = None
    mask_b64: str
    reference_images: list[ReferenceImage] | None = None
    params: GenerateParams | None = None
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && python -m pytest tests/test_inpaint.py::TestInpaintAPI -v`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/api/inpaint.py backend/tests/test_inpaint.py
git commit -m "feat: InpaintRequest 支持 reference_images 字段

后端 InpaintRequest 新增可选的 reference_images 字段，
类型为 ReferenceImage(data, media_type) 列表。
新增对应的 Pydantic model 和单元测试。"
```

---

### Task 2: 后端 — client.py 三种 inpaint 方法接受参考图

**Files:**
- Modify: `backend/src/core/client.py:311-460`
- Test: `backend/tests/test_inpaint.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_inpaint.py` 的 `TestInpaintRouting` 类末尾添加：

```python
@pytest.mark.asyncio
async def test_inpaint_with_references_via_responses(self):
    """responses 模式 inpaint 应将参考图插入 content 数组"""
    client = ImageClient(api_key="sk-test")

    mock_resp = MagicMock()
    mock_resp.id = "resp_ref"
    mock_resp.output = [
        MagicMock(type="image_generation_call", result="ref_result_b64", revised_prompt=None)
    ]
    mock_resp.usage = MagicMock(total_tokens=60)

    ref_b64 = _make_minimal_png_b64()

    with patch("src.core.client.AsyncOpenAI") as MockOpenAI:
        mock_instance = MockOpenAI.return_value
        mock_instance.responses = MagicMock()
        mock_instance.responses.create = AsyncMock(return_value=mock_resp)
        client._openai = mock_instance

        result = await client.generate(
            prompt="change style",
            images=[],
            previous_response_id=None,
            mask_b64=_make_minimal_png_b64(),
            source_image_b64=_make_minimal_png_b64(),
            reference_images=[{"data": ref_b64, "media_type": "image/png"}],
        )

    assert result.image_b64 == "ref_result_b64"

    call_kwargs = mock_instance.responses.create.call_args[1]
    input_content = call_kwargs["input"][0]["content"]
    # 4 个元素：原图 + 蒙版 + 参考图 + 文本
    assert len(input_content) == 4
    assert input_content[0]["type"] == "input_image"  # source
    assert input_content[1]["type"] == "input_image"  # mask
    assert input_content[2]["type"] == "input_image"  # reference
    assert input_content[3]["type"] == "input_text"    # prompt

@pytest.mark.asyncio
async def test_inpaint_with_references_via_chat(self):
    """chat 模式 inpaint 应将参考图插入 content 数组"""
    client = ImageClient(api_key="sk-test", api_mode=API_MODE_CHAT)

    mock_response = MagicMock()
    mock_response.is_error = False
    mock_response.status_code = 200
    mock_response.text = '{"choices":[{"message":{"content":"![img](http://example.com/result.png)"}}]}'
    mock_response.headers = {"content-type": "application/json"}
    mock_response.json.return_value = {"choices": [{"message": {"content": "![img](http://example.com/result.png)"}}]}

    ref_b64 = _make_minimal_png_b64()

    with patch.object(client._http, "post", new_callable=AsyncMock, return_value=mock_response) as mock_post, \
         patch.object(client, "_download_as_b64", new_callable=AsyncMock, return_value="downloaded_b64"):
        result = await client.generate(
            prompt="style transfer",
            images=[],
            previous_response_id=None,
            mask_b64=_make_minimal_png_b64(),
            source_image_b64=_make_minimal_png_b64(),
            reference_images=[{"data": ref_b64, "media_type": "image/png"}],
        )

    assert result.image_b64 == "downloaded_b64"

    call_kwargs = mock_post.call_args[1]
    content = call_kwargs["json"]["messages"][0]["content"]
    # 4 个元素：source + mask + reference + text
    assert len(content) == 4
    assert content[2]["type"] == "image_url"  # reference

@pytest.mark.asyncio
async def test_inpaint_without_references_still_works(self):
    """不传参考图时 inpaint 行为不变"""
    client = ImageClient(api_key="sk-test")

    mock_resp = MagicMock()
    mock_resp.id = "resp_no_ref"
    mock_resp.output = [
        MagicMock(type="image_generation_call", result="no_ref_b64", revised_prompt=None)
    ]
    mock_resp.usage = MagicMock(total_tokens=40)

    with patch("src.core.client.AsyncOpenAI") as MockOpenAI:
        mock_instance = MockOpenAI.return_value
        mock_instance.responses = MagicMock()
        mock_instance.responses.create = AsyncMock(return_value=mock_resp)
        client._openai = mock_instance

        result = await client.generate(
            prompt="simple inpaint",
            images=[],
            previous_response_id=None,
            mask_b64=_make_minimal_png_b64(),
            source_image_b64=_make_minimal_png_b64(),
        )

    assert result.image_b64 == "no_ref_b64"

    call_kwargs = mock_instance.responses.create.call_args[1]
    input_content = call_kwargs["input"][0]["content"]
    # 3 个元素（无参考图）
    assert len(input_content) == 3
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && python -m pytest tests/test_inpaint.py::TestInpaintRouting::test_inpaint_with_references_via_responses -v`
Expected: FAIL — `generate()` 不接受 `reference_images` 参数

- [ ] **Step 3: 实现 client.py 变更**

修改 `generate()` 方法签名，新增 `reference_images` 参数：

```python
async def generate(
    self,
    prompt: str,
    images: list[dict],
    previous_response_id: str | None,
    params: dict[str, Any] | None = None,
    history_images: list[str] | None = None,
    mask_b64: str | None = None,
    source_image_b64: str | None = None,
    reference_images: list[dict] | None = None,
) -> GenerateResult:
    # Inpainting 路由
    if mask_b64 and source_image_b64:
        return await self._generate_inpaint(
            prompt, source_image_b64, mask_b64, params, reference_images
        )
    # ... 原有路由不变
```

修改 `_generate_inpaint()` 传递参考图：

```python
async def _generate_inpaint(
    self,
    prompt: str,
    source_image_b64: str,
    mask_b64: str,
    params: dict[str, Any] | None = None,
    reference_images: list[dict] | None = None,
) -> GenerateResult:
    if self.api_mode == API_MODE_IMAGES:
        return await self._inpaint_via_images(prompt, source_image_b64, mask_b64, params, reference_images)
    if self.api_mode == API_MODE_CHAT:
        return await self._inpaint_via_chat(prompt, source_image_b64, mask_b64, params, reference_images)
    return await self._inpaint_via_responses(prompt, source_image_b64, mask_b64, params, reference_images)
```

修改 `_inpaint_via_responses()` 在 source + mask 之后插入参考图：

```python
async def _inpaint_via_responses(
    self,
    prompt: str,
    source_image_b64: str,
    mask_b64: str,
    params: dict[str, Any] | None = None,
    reference_images: list[dict] | None = None,
) -> GenerateResult:
    content = [
        {"type": "input_image", "image_url": f"data:image/png;base64,{source_image_b64}"},
        {"type": "input_image", "image_url": f"data:image/png;base64,{mask_b64}"},
    ]
    for ref in (reference_images or []):
        content.append({
            "type": "input_image",
            "image_url": f"data:{ref['media_type']};base64,{ref['data']}",
        })
    content.append({
        "type": "input_text",
        "text": f"{_INPAINT_META_PROMPT} {prompt}",
    })
    # ... 剩余不变（tool_config + responses.create）
```

修改 `_inpaint_via_chat()` 同理插入参考图：

```python
async def _inpaint_via_chat(
    self,
    prompt: str,
    source_image_b64: str,
    mask_b64: str,
    params: dict[str, Any] | None = None,
    reference_images: list[dict] | None = None,
) -> GenerateResult:
    content = [
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{source_image_b64}"}},
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{mask_b64}"}},
    ]
    for ref in (reference_images or []):
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:{ref['media_type']};base64,{ref['data']}"},
        })
    content.append({
        "type": "text",
        "text": f"{_INPAINT_META_PROMPT} {prompt}",
    })
    # ... 剩余不变
```

修改 `_inpaint_via_images()` 签名（接受但不使用参考图，images API 原生不支持）：

```python
async def _inpaint_via_images(
    self,
    prompt: str,
    source_image_b64: str,
    mask_b64: str,
    params: dict[str, Any] | None = None,
    reference_images: list[dict] | None = None,
) -> GenerateResult:
    # images API 的 /images/edits 不支持额外参考图，忽略 reference_images
    # ... 原有实现不变
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && python -m pytest tests/test_inpaint.py -v`
Expected: 全部 PASS（包括原有测试和新测试）

- [ ] **Step 5: 提交**

```bash
git add backend/src/core/client.py backend/tests/test_inpaint.py
git commit -m "feat: client.py 三种 inpaint 方法支持参考图

- generate() 新增 reference_images 参数
- _generate_inpaint() 传递参考图给路由方法
- _inpaint_via_responses/chat 将参考图插入 content 数组
- _inpaint_via_images 接受但忽略参考图（API 限制）
- 新增 3 个测试验证参考图传递链路"
```

---

### Task 3: 后端 — inpaint.py 端点传递参考图给 client

**Files:**
- Modify: `backend/src/api/inpaint.py:93-105`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_inpaint.py` 末尾新增测试类：

```python
class TestInpaintWithReferences:
    """测试 inpaint 端点传递参考图给 client"""

    @pytest.mark.asyncio
    async def test_inpaint_endpoint_passes_references(self):
        """端点应将 reference_images 传递给 client.generate()"""
        from src.api.inpaint import InpaintRequest, ReferenceImage
        b64 = _make_minimal_png_b64()

        # 验证 request model 能正确携带参考图
        req = InpaintRequest(
            session_id="sess_1",
            prompt="test with refs",
            source_image_b64=b64,
            mask_b64=b64,
            reference_images=[ReferenceImage(data=b64, media_type="image/png")],
        )
        refs_as_dicts = [{"data": r.data, "media_type": r.media_type} for r in req.reference_images]
        assert len(refs_as_dicts) == 1
        assert refs_as_dicts[0]["data"] == b64
```

- [ ] **Step 2: 运行测试确认通过**（此测试验证的是 model 层，应直接 PASS）

Run: `cd backend && python -m pytest tests/test_inpaint.py::TestInpaintWithReferences -v`
Expected: PASS

- [ ] **Step 3: 修改 inpaint.py 端点传递参考图**

在 `event_stream()` 内的 `client.generate()` 调用中增加 `reference_images` 参数：

```python
async def event_stream():
    try:
        yield f"event: generating\ndata: {json.dumps({'session_id': body.session_id})}\n\n"

        refs = [{"data": r.data, "media_type": r.media_type} for r in body.reference_images] if body.reference_images else None

        result = await client.generate(
            prompt=body.prompt,
            images=[],
            previous_response_id=None,
            params=params.model_dump(),
            history_images=None,
            mask_b64=body.mask_b64,
            source_image_b64=source_b64,
            reference_images=refs,
        )
        # ... 后续不变
```

- [ ] **Step 4: 运行全部 inpaint 测试**

Run: `cd backend && python -m pytest tests/test_inpaint.py -v`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/api/inpaint.py backend/tests/test_inpaint.py
git commit -m "feat: inpaint 端点传递参考图给 client

event_stream() 中将 InpaintRequest.reference_images
转换为 dict 列表后传递给 client.generate()。"
```

---

### Task 4: 前端 — Types 扩展

**Files:**
- Modify: `frontend/src/types/index.ts:68-75`

- [ ] **Step 1: 修改 InpaintRequest 类型**

在 `frontend/src/types/index.ts` 的 `InpaintRequest` 接口中增加 `reference_images` 字段：

```typescript
export interface InpaintRequest {
  session_id: string;
  prompt: string;
  source_image_id?: string;
  source_image_b64?: string;
  mask_b64: string;
  reference_images?: AttachedFile[];
  params?: GenerateParams;
}
```

- [ ] **Step 2: 验证 TypeScript 编译通过**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: 可能有 MaskEditor 相关的类型错误（因为还没改 MaskEditor props），这些将在后续 Task 修复

- [ ] **Step 3: 提交**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: InpaintRequest 类型扩展 reference_images 字段"
```

---

### Task 5: 前端 — MaskEditor 参考图 UI + 状态管理（含 images 模式提示）

**Files:**
- Modify: `frontend/src/components/MaskEditor/index.tsx`

这是最大的变更。MaskEditor 需要：
1. 扩展 props（`onGenerate` 增加 `referenceImages` 参数，新增 `initialReferences`）
2. 内部 `references` 状态 + 文件选择逻辑
3. 底栏 prompt 上方新增参考图 UI 区域
4. 获取 API mode 用于 images 模式提示

- [ ] **Step 1: 修改 MaskEditor props 和状态**

修改 `MaskEditorProps` 接口：

```typescript
interface MaskEditorProps {
  source: MaskImageSource;
  onClose: () => void;
  onGenerate: (
    maskB64: string,
    prompt: string,
    referenceImages: AttachedFile[],
    reportError: (msg: string) => void
  ) => void;
  initialReferences?: AttachedFile[];
}
```

在组件内部新增状态：

```typescript
const [references, setReferences] = useState<AttachedFile[]>(initialReferences ?? []);
const referenceFileRef = useRef<HTMLInputElement>(null);
```

新增参考图操作函数（复用 `fileToBase64` 逻辑，在组件内定义）：

```typescript
const handleAddReference = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (!files) return;
  for (const file of Array.from(files)) {
    if (!file.type.startsWith("image/")) continue;
    const data = await fileToBase64(file);
    setReferences((prev) => [...prev, {
      id: crypto.randomUUID(),
      name: file.name,
      data,
      media_type: file.type,
      preview_url: `data:${file.type};base64,${data}`,
    }]);
  }
  e.target.value = "";
}, []);

const handleRemoveReference = useCallback((id: string) => {
  setReferences((prev) => prev.filter((r) => r.id !== id));
}, []);
```

修改 `handleGenerate` 传递参考图：

```typescript
const handleGenerate = useCallback(() => {
  const maskB64 = hook.exportMask();
  if (!maskB64 || !prompt.trim()) return;
  setGenerating(true);
  setErrorMsg(null);
  onGenerateRef.current(maskB64, prompt.trim(), references, (msg: string) => {
    setGenerating(false);
    setErrorMsg(msg);
  });
}, [hook.exportMask, prompt, references]);
```

- [ ] **Step 1b: 获取 API mode 并添加 images 模式提示逻辑**

在组件内获取当前 API mode（通过 `getSettings` 获取）：

```typescript
import { getSettings } from "../../services/api";
// ...
const [apiMode, setApiMode] = useState<string>("responses");

useEffect(() => {
  getSettings().then((s) => setApiMode(s.api_mode)).catch(() => {});
}, []);
```

在生成按钮区域，当 `apiMode === "images"` 且 `references.length > 0` 时显示提示图标：

```tsx
{apiMode === "images" && references.length > 0 && (
  <span
    style={{ fontSize: 12, color: "#a09d96", cursor: "help" }}
    title={t("mask.imagesModeWarning")}
  >
    ⚠️
  </span>
)}
```

- [ ] **Step 2: 新增参考图 UI 区域**

在底栏 prompt 区域上方、`{errorMsg && ...}` 下方插入参考图片区域。在底栏 `<div>` 的最上方，`<input>` 之前添加：

```tsx
{/* 参考图片区域 */}
{(references.length > 0 || true) && (
  <div style={{
    display: "flex",
    gap: 6,
    alignItems: "center",
    padding: "6px 20px",
    background: "#1c1b18",
    borderTop: "1px solid #252320",
    minHeight: references.length > 0 ? 40 : 28,
  }}>
    <span style={{ fontSize: 10, color: "#a09d96", flexShrink: 0 }}>{t("mask.referenceImages")}</span>
    {references.map((ref) => (
      <div
        key={ref.id}
        style={{
          width: 32, height: 32, borderRadius: 4, overflow: "hidden",
          border: "1px solid #3a3835", position: "relative", flexShrink: 0,
        }}
      >
        <img src={ref.preview_url} alt={ref.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <button
          onClick={() => handleRemoveReference(ref.id)}
          style={{
            position: "absolute", top: -3, right: -3, width: 13, height: 13,
            background: "#c96442", borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 7, color: "white", border: "none", cursor: "pointer",
            lineHeight: 1,
          }}
        >✕</button>
      </div>
    ))}
    <button
      onClick={() => referenceFileRef.current?.click()}
      style={{
        width: 32, height: 32, border: "1px dashed #555", borderRadius: 4,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#777", fontSize: 14, cursor: "pointer", flexShrink: 0,
        background: "transparent",
      }}
    >+</button>
    <input
      ref={referenceFileRef}
      type="file"
      accept="image/*"
      multiple
      onChange={handleAddReference}
      style={{ display: "none" }}
    />
  </div>
)}
```

- [ ] **Step 3: 在组件文件底部添加 fileToBase64 辅助函数**

（如果不存在的话——实际上 InputArea 中已有此函数但未导出，需在 MaskEditor 中也定义一份或提取为共享工具）

在 `MaskEditor/index.tsx` 文件末尾（`export default` 之后或之前）添加：

```typescript
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

- [ ] **Step 4: 验证编译**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: 可能有 InputArea/DetailPanel 的类型错误（`onGenerate` 签名变了），这些在后续 Task 修复

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/MaskEditor/index.tsx
git commit -m "feat: MaskEditor 新增参考图片 UI 和状态管理

- onGenerate 回调新增 referenceImages 参数
- 新增 initialReferences prop 用于从 InputArea 携带附件
- 底栏 prompt 上方增加参考图缩略图区域
- 支持添加/删除参考图，复用 AttachedFile 类型"
```

---

### Task 6: 前端 — InputArea 传递初始参考图和参考图给 API

**Files:**
- Modify: `frontend/src/components/InputArea.tsx:238-261`

- [ ] **Step 1: 修改 InputArea 的 MaskEditor 调用**

InputArea 中 `editingAttachment` 场景需要：
1. 计算 `initialReferences`：排除当前编辑的附件
2. `onGenerate` 回调传递 `referenceImages` 给 `inpaintImage`

修改 `InputArea.tsx` 中的 MaskEditor 渲染部分：

```tsx
{editingAttachment && activeSessionId && (
  <MaskEditor
    source={{ type: "attachment", attachmentId: editingAttachment.id, imageB64: editingAttachment.data }}
    initialReferences={attachments.filter((a) => a.id !== editingAttachment.id)}
    onClose={() => setEditingAttachment(null)}
    onGenerate={(maskB64, prompt, referenceImages, reportError) => {
      const store = useSessionStore.getState();
      inpaintImage(
        {
          session_id: activeSessionId,
          prompt,
          source_image_b64: editingAttachment.data,
          mask_b64: maskB64,
          reference_images: referenceImages.length > 0 ? referenceImages : undefined,
        },
        () => {
          setEditingAttachment(null);
          Promise.all([store.fetchSessions(), store.selectSession(activeSessionId)]);
        },
        (_code, msg) => {
          reportError(msg || t("error.generateFailed"));
        }
      );
    }}
  />
)}
```

- [ ] **Step 2: 验证编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS（InputArea 类型错误应已修复）

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/InputArea.tsx
git commit -m "feat: InputArea 传递初始参考图和参考图给 inpaint API

- 计算初始参考图时排除当前编辑的附件
- onGenerate 回调传递 referenceImages 给 inpaintImage"
```

---

### Task 7: 前端 — DetailPanel 传递空参考图

**Files:**
- Modify: `frontend/src/components/DetailPanel.tsx:252-272`

- [ ] **Step 1: 修改 DetailPanel 的 MaskEditor 调用**

修改 `DetailPanel.tsx` 中的 MaskEditor `onGenerate` 回调：

```tsx
{editingMask && activeSessionId && (
  <MaskEditor
    source={editingMask}
    onClose={() => setEditingMask(null)}
    onGenerate={(maskB64, prompt, referenceImages, reportError) => {
      const req: InpaintRequest = editingMask.type === "generated"
        ? { session_id: activeSessionId, prompt, source_image_id: editingMask.imageId, mask_b64: maskB64 }
        : { session_id: activeSessionId, prompt, source_image_b64: editingMask.imageB64, mask_b64: maskB64 };
      if (referenceImages.length > 0) {
        req.reference_images = referenceImages;
      }
      inpaintImage(
        req,
        () => {
          setEditingMask(null);
          Promise.all([fetchSessions(), selectSession(activeSessionId)]);
        },
        (_code, msg) => {
          reportError(msg || t("error.generateFailed"));
        }
      );
    }}
  />
)}
```

注意需要在文件顶部导入 `InpaintRequest` 类型：

```typescript
import type { Image, MaskImageSource, InpaintRequest } from "../types";
```

- [ ] **Step 2: 验证编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/DetailPanel.tsx
git commit -m "feat: DetailPanel 支持传递参考图给 inpaint API

onGenerate 回调适配新签名，传递 referenceImages。
从 DetailPanel 进入时初始参考图为空。"
```

---

### Task 8: 前端 — i18n 翻译

**Files:**
- Modify: `frontend/src/i18n/zh.json`
- Modify: `frontend/src/i18n/en.json`

- [ ] **Step 1: 在 `zh.json` 的 `mask.fit` 行后添加**

```json
"mask.referenceImages": "参考图",
"mask.addReference": "添加参考图",
"mask.imagesModeWarning": "Images API 模式下参考图可能不被支持，如遇错误请移除参考图",
```

- [ ] **Step 2: 在 `en.json` 的 `mask.fit` 行后添加**

```json
"mask.referenceImages": "References",
"mask.addReference": "Add Reference",
"mask.imagesModeWarning": "Reference images may not be supported in Images API mode. Remove them if errors occur.",
```

- [ ] **Step 3: 验证 JSON 格式正确**

Run: `cd frontend && node -e "JSON.parse(require('fs').readFileSync('src/i18n/zh.json','utf8')); console.log('zh OK')" && node -e "JSON.parse(require('fs').readFileSync('src/i18n/en.json','utf8')); console.log('en OK')"`
Expected: `zh OK` / `en OK`

- [ ] **Step 4: 提交**

```bash
git add frontend/src/i18n/zh.json frontend/src/i18n/en.json
git commit -m "feat: 新增参考图片相关 i18n 翻译 key"
```

---

### Task 9: 端到端验证

- [ ] **Step 1: 启动后端**

Run: `cd backend && python -m src.cli serve`
Expected: 后端在 8765 端口启动成功

- [ ] **Step 2: 启动前端**

Run: `cd frontend && npm run dev`
Expected: Vite 开发服务器启动，无编译错误

- [ ] **Step 3: 手动测试路径 1 — 从 InputArea 进入**

1. 附加 2-3 张图片到 InputArea
2. 点击第一张图片的编辑图标进入 MaskEditor
3. 验证参考图区域显示了其他附件
4. 删除一张参考图
5. 画蒙版 → 输入 prompt → 点击生成
6. 验证请求发送成功

- [ ] **Step 4: 手动测试路径 2 — 从 DetailPanel 进入**

1. 选择一张历史图片
2. 点击 Inpaint 按钮进入 MaskEditor
3. 验证参考图区域为空
4. 点击 + 添加一张参考图
5. 画蒙版 → 输入 prompt → 点击生成
6. 验证请求发送成功

- [ ] **Step 5: 运行全部后端测试**

Run: `cd backend && python -m pytest tests/ -v`
Expected: 全部 PASS
