# Inpainting（局部重绘）功能设计

## 概述

为 OpenImage 的三种 API 模式（responses / images / chat）添加 inpainting 局部重绘功能。用户可以在已有图片或上传图片上绘制蒙版，标记需要重绘的区域，AI 只替换蒙版覆盖部分。

### 范围

- **Inpainting（局部重绘）**：在已有图片上涂抹标记区域，AI 重绘标记部分，未标记区域保持不变
- **绘制工具**：笔刷（自由涂抹）+ 矩形（框选），橡皮擦擦除
- **图片来源**：会话中已生成的图片 + InputArea 上传的参考图片
- **三种 API 模式全覆盖**

### 不在范围（YAGNI）

- Outpainting（外延扩展）
- 蒙版撤销/重做（undo/redo）
- 蒙版保存/复用/持久化
- 多种蒙版颜色/透明度
- 多图同时 inpaint

## UI 交互设计

### 入口

**入口 1：DetailPanel（已生成图片）**

DetailPanel 选中单张图片后，操作按钮区域改为翻页式（两页），底部有页码指示器：
- 第一页：View / Save Image / Remove
- 第二页：Copy Prompt / Fork from Here / Inpaint

翻页交互：
- 点击页码指示器切换
- 鼠标在按钮区域内滚轮切换
- 切换时有左右仿真滑动动效（carousel 风格，ease-out 过渡）

**入口 2：InputArea 附件（上传图片）**

InputArea 附件缩略图 hover 时，左下角出现笔刷编辑图标（与右上角删除按钮对称）。点击后打开同一个蒙版编辑器。

编辑完成后的附件缩略图右下角显示珊瑚色勾号标记，边框变为珊瑚色 2px，表示已绑定蒙版。

### 蒙版编辑器（全屏 Overlay）

两个入口打开的是同一个 `MaskEditor` 组件。

**布局**（深色主题，与全屏图片查看器风格一致）：

```
┌─────────────────────────────────────────────────────┐
│ 顶栏：标题 + 图片来源信息        [Cancel] [Apply Mask] │
├────┬────────────────────────────────────────────────┤
│工具│                                                │
│栏  │              Canvas 区域                       │
│    │         （原图 + 蒙版叠加）                     │
│笔刷│                                                │
│矩形│                                                │
│橡皮│                              [−] 100% [+]      │
│擦  │                                                │
│    │                                                │
│大小│                                                │
│滑块│                                                │
├────┴────────────────────────────────────────────────┤
│ Prompt 输入：Describe what to generate...  [Generate] │
└─────────────────────────────────────────────────────┘
```

**工具栏**：
- 三个工具按钮：笔刷 / 矩形 / 橡皮擦，选中高亮
- 笔刷大小滑块（仅笔刷和橡皮擦模式显示）
- 缩放控制：显示百分比 + 重置按钮

**Canvas 区域**：
- 双 Canvas 层：底层渲染原图，顶层渲染蒙版叠加
- 蒙版叠加色：半透明珊瑚色（`rgba(205, 120, 92, 0.35)`）
- 支持滚轮缩放 + 中键/空格拖拽平移

**顶栏**：
- 左侧：标题 "Inpaint Editor" + 图片信息（来自已生成图片显示 "Step N — WxH"，来自附件显示 "来自附件"）
- 右侧：Cancel + Apply Mask 按钮

**底栏**：
- Prompt 输入框 + Generate 按钮
- 空 prompt 时禁用 Generate

**配色**：沿用 DESIGN.md 深色面板配色：
- 背景 `#141413`，面板 `#181715`，卡片 `#252320`
- 文字 `#faf9f5`（主）/ `#a09d96`（辅）
- 强调色 `#cc785c`（珊瑚色）

### 交互流程

1. 用户选中图片（Gallery Ctrl+Click 或 InputArea 附件 hover）
2. 点击 Inpaint / 编辑图标 → 打开全屏蒙版编辑器
3. 选择工具（笔刷/矩形），在图片上涂抹蒙版区域
4. 底栏输入重绘描述，点击 Generate
5. 编辑器关闭，回到主界面，新图片追加到会话

未绘制任何蒙版时，Generate 按钮禁用。Cancel 直接关闭，无确认弹窗。

## 数据流设计

### 前端 → 后端请求

两种数据来源，统一为一种请求格式：

**来自已生成图片（DetailPanel）**：
```
选中图片 → Inpaint → 编辑器 → 绘制蒙版 → prompt → Generate
→ POST /api/inpaint { source_image_id, mask_b64, prompt, session_id, params }
```

**来自上传附件（InputArea）**：
```
附件 hover → 编辑图标 → 编辑器 → 绘制蒙版 → prompt → Generate
→ POST /api/inpaint { source_image_b64, mask_b64, prompt, session_id, params }
```

### 蒙版格式

蒙版是**透明 PNG**（base64）：
- 被涂抹区域：**不透明**（珊瑚色渲染到 mask canvas）
- 未涂抹区域：**完全透明**
- 尺寸：与原图**同尺寸**（通过缩放比例 `displayScale = canvasDisplaySize / originalImageSize` 还原）

**重要：尺寸检测不依赖数据库记录**。前端使用 `Image.naturalWidth / naturalHeight` 从实际加载的图片获取真实尺寸；后端用 PIL `Image.open()` 读取实际尺寸。

### TypeScript 类型

```typescript
export interface InpaintRequest {
  session_id: string;
  prompt: string;
  source_image_id?: string;       // 已生成图片 ID
  source_image_b64?: string;      // 上传附件 base64
  mask_b64: string;               // 透明 PNG base64
  params?: GenerateParams;
}

export interface InpaintCompleted extends GenerateCompleted {}
```

## 后端路由设计

### API 端点

新增独立端点 `/api/inpaint`，与现有 `/api/generate` 并列。理由：
- Inpaint 请求结构与普通生成差异大（必须 mask + source）
- 后端处理逻辑不同（读取原图、组装蒙版、路由到不同 API endpoint）
- 前端调用入口不同，避免在 generate 中加 `if mask` 分支

```python
class InpaintRequest(BaseModel):
    session_id: str
    prompt: str
    source_image_id: str | None = None
    source_image_b64: str | None = None
    mask_b64: str
    params: GenerateParams | None = None

@router.post("/api/inpaint")
async def inpaint(body: InpaintRequest, request: Request):
    """Inpainting：局部重绘，返回 SSE"""
    ...
```

校验：`source_image_id` 和 `source_image_b64` 必须提供其一，否则 400。

### client.py 智能路由

`ImageClient.generate()` 方法新增 `mask_b64` 和 `source_image_b64` 参数，根据 API 模式走不同路径：

**images 模式（原生 inpainting）**：
```
POST {base_url}/images/edits
body: {
  image: source_b64,       // 原图 base64
  mask: mask_b64,          // 蒙版 PNG base64
  prompt: "...",
  model: "gpt-image-2",
  n: 1,
  response_format: "b64_json"
}
```

**responses 模式（双图 + 元 prompt）**：
```
OpenAI SDK responses.create()
input: [
  { type: "input_image", image_url: "data:image/png;base64,{source}" },
  { type: "input_image", image_url: "data:image/png;base64,{mask}" },
  { type: "input_text", text: "[Inpaint] Replace the masked (semi-transparent) region: {prompt}" }
]
tools: [{ type: "image_generation", ... }]
```

**chat 模式（双图 + 元 prompt）**：
```
POST {base_url}/chat/completions
messages: [{
  role: "user",
  content: [
    { type: "image_url", image_url: { url: "data:image/png;base64,{source}" } },
    { type: "image_url", image_url: { url: "data:image/png;base64,{mask}" } },
    { type: "text", text: "[Inpaint] Replace the white/colored region: {prompt}" }
  ]
}]
tools: [{ type: "image_generation", ... }]
```

对于 responses/chat 模式，蒙版不是原生支持的，后端负责组装元 prompt 告知模型蒙版含义，前端只需发送用户描述。

### 结果保存

复用现有 `_save_generated_image()` 函数，inpainting 生成的图片与普通生成图片存储方式一致（文件系统 + 数据库）。

## 前端组件架构

### 新增文件

```
frontend/src/components/
├── MaskEditor/
│   ├── index.tsx              # 主容器：Overlay + Canvas + 工具栏 + Prompt 栏
│   ├── MaskCanvas.tsx         # Canvas 核心：笔刷/矩形/橡皮擦绘制 + 蒙版叠加渲染
│   ├── ToolBar.tsx            # 左侧工具栏：工具选择 + 笔刷大小滑块
│   └── useMaskCanvas.ts       # Hook：Canvas 操作逻辑（绘制、缩放、平移）
```

### 组件职责

**`MaskEditor/index.tsx`** — 全屏 Overlay 容器
- Props: `{ imageSource: { type: 'generated', imageId } | { type: 'attachment', attachmentId, imageB64 }; onClose; onApply }`
- 渲染 Overlay（`z-index: 9999`，backdrop blur，与全屏图片查看器共用）
- 管理 prompt 文本和 Generate 按钮
- `onApply(maskB64, prompt)` 回调

**`MaskCanvas.tsx`** — Canvas 绘制核心
- 双 Canvas 层：底层原图，顶层蒙版叠加
- 原图缩放到 Canvas 可视区域（`object-fit: contain` 逻辑）
- 导出蒙版时生成与原图**同尺寸**的透明 PNG（通过临时 Canvas 按比例缩放）

**`useMaskCanvas.ts`** — Canvas 逻辑 Hook
- 管理绘制状态：当前工具、笔刷大小、蒙版路径数据
- 笔刷：`mousedown` → `mousemove` 绘制 → `mouseup` 结束
- 矩形：`mousedown` 起始点 → `mousemove` 实时预览 → `mouseup` 确认
- 橡皮擦：与笔刷相同路径，`globalCompositeOperation: 'destination-out'`
- 缩放/平移：滚轮缩放 + 中键/空格拖拽平移

**`ToolBar.tsx`** — 工具栏
- 三个工具按钮（笔刷/矩形/橡皮擦），选中高亮
- 笔刷大小滑块
- 缩放百分比 + 重置按钮

### State 管理

蒙版数据不放入全局 store 循环流转，通过组件间回调传递。**两个入口都是即时生成**（点击编辑器的 Generate 后立即调用 API，生成结果追加到会话）：

- DetailPanel `onInpaint(imageId)` → 打开 MaskEditor → `onApply(maskB64, prompt)` → 调用 `/api/inpaint`
- InputArea 附件编辑 → `onApply(maskB64, prompt)` → 调用 `/api/inpaint`（source_image_b64 取自附件数据）

### DetailPanel 翻页改造

DetailPanel 操作按钮区域改为翻页式：
- 第一页：View / Save Image / Remove
- 第二页：Copy Prompt / Fork from Here / Inpaint
- 底部页码指示器（两个圆点）
- 支持点击指示器和滚轮翻页
- 切换时有左右仿真滑动动效

### api.ts 新增

```typescript
export function inpaintImage(
  req: InpaintRequest,
  onCompleted: (data: InpaintCompleted) => void,
  onError: (code: string, message: string) => void
): AbortController
```

## 边界情况与错误处理

### 前端

| 场景 | 处理 |
|------|------|
| 未绘制蒙版就点 Generate | Generate 按钮禁用 |
| 蒙版覆盖整张图片 | 允许，等同于完全重新生成 |
| 图片过大（>4K） | Canvas 内部缩放显示，导出蒙版时按原图尺寸还原 |
| 编辑中切换工具 | 保留已绘制内容，无状态丢失 |
| Cancel | 直接关闭，不保存，无确认弹窗 |
| 空 prompt | 禁用 Generate 按钮（与现有行为一致） |

### 后端

| 场景 | 处理 |
|------|------|
| `source_image_id` 不存在 | 404 |
| `source_image_id` 和 `source_image_b64` 都没提供或都提供 | 400 Pydantic 校验 |
| `mask_b64` 解码失败 | 400 "Invalid mask image" |
| mask 尺寸与原图不匹配 | images 模式透传 API 错误；responses/chat 模式不影响 |
| 第三方 API 不支持 inpainting | 透传 HTTP 错误，前端显示错误 toast |
