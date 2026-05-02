# Inpaint 参考图片附件功能设计

> 日期：2026-05-03
> 状态：已批准

## 概述

在 MaskEditor 的底栏输入区域增加参考图片附件功能，允许用户在 inpainting 时附加额外参考图片来引导生成结果。

## 背景

当前 inpainting 流程只传递 source image + mask + prompt，无法携带额外的参考图片。但三种 API 模式（responses/images/chat）均已支持多图片输入，前端也有完善的 `AttachedFile` 基础设施。只需要在 inpaint 路径中"穿针引线"即可实现。

## 前端 UI 设计

### 布局变更

MaskEditor 底栏由单层变为两层：

```
┌──────────────────────────────────────────┐
│ 顶栏: 标题 + 来源标签    取消 | 清除蒙版 │
├──────┬───────────────────────────────────┤
│      │                                   │
│ 工具 │     Canvas 绘图区                  │
│  栏  │     (不变)                        │
│(左侧)│                                   │
├──────┴───────────────────────────────────┤
│ 📎 参考图: [📷✕] [📷✕] [+]             │  ← 新增
├──────────────────────────────────────────┤
│ [prompt 输入框]                [生成按钮] │
└──────────────────────────────────────────┘
```

- 顶栏、左侧工具栏、Canvas 区——无改动
- 参考图区域为空时只显示标签和添加按钮，不占多余空间
- 参考图缩略图 + 删除按钮 + 添加按钮，交互复用 InputArea 的附件样式

### 交互行为

**从 InputArea 进入（附件编辑）**：
- 自动携带 InputArea 中的其他附件（排除当前正在编辑的附件）
- 用户可删除任意参考图
- 用户可继续添加新图片

**从 DetailPanel 进入（历史图片）**：
- 参考图区域初始为空
- 用户可自行添加参考图

### MaskEditor Props 扩展

```typescript
interface MaskEditorProps {
  source: MaskImageSource;
  onClose: () => void;
  onGenerate: (
    maskB64: string,
    prompt: string,
    referenceImages: AttachedFile[],  // 新增
    reportError: (msg: string) => void
  ) => void;
  initialReferences?: AttachedFile[]; // 从 InputArea 进入时携带
}
```

### 组件内部状态

- `references: AttachedFile[]` — 由 `initialReferences` 初始化
- `addReference(file: AttachedFile)` — 添加参考图
- `removeReference(id: string)` — 删除参考图
- 复用 InputArea 的 `fileToBase64` 转换逻辑

## API 层变更

### 前端 InpaintRequest 扩展

```typescript
interface InpaintRequest {
  session_id: string;
  prompt: string;
  source_image_id?: string;
  source_image_b64?: string;
  mask_b64: string;
  reference_images?: AttachedFile[];  // 新增
  params?: GenerateParams;
}
```

### 后端 InpaintRequest Pydantic model 扩展

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
    reference_images: list[ReferenceImage] | None = None  # 新增
    params: GenerateParams | None = None
```

## 后端 API 模式处理

### responses 模式

参考图作为额外的 `input_image` 插入 content 数组，位于 source + mask 之后、text 之前：

```python
content = [
    {"type": "input_image", "image_url": f"data:image/png;base64,{source}"},
    {"type": "input_image", "image_url": f"data:image/png;base64,{mask}"},
    # 参考图
    *[{"type": "input_image", "image_url": f"data:{r.media_type};base64,{r.data}"} for r in references],
    {"type": "input_text", "text": f"{_INPAINT_META_PROMPT} {prompt}"},
]
```

### chat 模式

参考图作为额外的 `image_url` 消息：

```python
messages = [
    {"role": "user", "content": [
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{source}"}},
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{mask}"}},
        *[{"type": "image_url", "image_url": {"url": f"data:{r.media_type};base64,{r.data}"}} for r in references],
        {"type": "text", "text": f"{_INPAINT_META_PROMPT} {prompt}"},
    ]},
]
```

### images 模式

`/v1/images/edits` 原生不支持额外参考图片。策略：

- 尝试将参考图通过 edits 端点传递（探索可行方式）
- 如果 API 返回错误，通过 SSE `error` 事件正常返回错误信息
- 前端在 images 模式下当参考图存在时，显示非阻塞提示

### images 模式前端提示

当 API 设置为 images 模式且用户附加了参考图时，在生成按钮附近显示提示图标 + tooltip：

> "Images API 模式下参考图可能不被支持，如遇错误请移除参考图"

提示不阻塞操作，仅作提醒。

## 数据流

```
用户操作:
  1. 选择源图 → 打开 MaskEditor（携带 initialReferences）
  2. 绘制蒙版
  3. (可选) 在参考图区域添加/删除参考图
  4. 输入 prompt → 点击生成

前端数据流:
  MaskEditor.handleGenerate()
  → exportMask() + prompt + references
  → onGenerate(maskB64, prompt, references, reportError)
  → InputArea/DetailPanel 构造 InpaintRequest
  → api.inpaintImage(req)
  → POST /api/inpaint (SSE)

后端数据流:
  /api/inpaint 接收 InpaintRequest
  → 验证 source + mask
  → client.generate(prompt, images=[], mask_b64, source_image_b64, reference_images)
  → 根据 api_mode 路由到对应 _inpaint_via_* 方法
  → 参考 + 源图 + 蒙版 → OpenAI API
  → SSE 事件流返回结果
```

## 涉及文件

| 文件 | 变更 |
|------|------|
| `frontend/src/types/index.ts` | `MaskEditorProps` 和 `InpaintRequest` 类型扩展 |
| `frontend/src/components/MaskEditor/index.tsx` | 新增参考图区域 UI、内部状态管理、props 扩展 |
| `frontend/src/components/InputArea.tsx` | 传递 `initialReferences` 给 MaskEditor |
| `frontend/src/components/DetailPanel.tsx` | 传递空的 `initialReferences` 给 MaskEditor |
| `frontend/src/services/api.ts` | `inpaintImage()` 传递 `reference_images` |
| `backend/src/api/inpaint.py` | `InpaintRequest` model 扩展，传递参考图给 client |
| `backend/src/core/client.py` | `_inpaint_via_*` 方法处理参考图 |
| `frontend/src/i18n/zh.json` | 新增翻译 key |
| `frontend/src/i18n/en.json` | 新增翻译 key |

## i18n 变更

新增翻译 key：

| Key | 中文 | 英文 |
|-----|------|------|
| `mask.referenceImages` | 参考图 | References |
| `mask.addReference` | 添加参考图 | Add Reference |
| `mask.imagesModeWarning` | Images API 模式下参考图可能不被支持，如遇错误请移除参考图 | Reference images may not be supported in Images API mode. Remove them if errors occur. |
