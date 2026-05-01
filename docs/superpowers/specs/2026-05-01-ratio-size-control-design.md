# 图片比例/尺寸控制

> 日期: 2026-05-01
> 状态: 设计确认，待实施

## 概述

为图片生成添加比例和尺寸控制功能。用户可在 InputArea 底栏的工具按钮弹出选单中选择比例（1:1 / 16:9 / 9:16）和尺寸档位（1K / 2K / 4K），后端将抽象参数映射为 gpt-image-2 兼容的像素尺寸。

## 用户界面

### 触发按钮

InputArea 工具栏中，Settings 按钮右侧新增一个按钮：

- **默认状态**：显示 `比例图标 + 1:1 · 1K`，样式与 Attach / Settings 按钮一致（muted 色 + hairline 边框）
- **自定义后**：按钮变为 coral 背景高亮，显示当前选择（如 `16:9 · 2K`）
- 按钮上的比例图标用一个小矩形（CSS 绘制）表示当前比例形状

### 向上弹出 Popover

点击按钮后向上展开 popover：

- **比例区**：3 个选项（1:1 / 16:9 / 9:16），每个包含比例形状图标 + 文字标签
- **分割线**：hairline 色
- **尺寸区**：3 个选项（1K / 2K / 4K），纯文字按钮
- **选中态**：coral 背景 + 白色文字
- **未选中态**：hairline 边框 + muted 文字
- 底部居中小三角箭头指向触发按钮
- 点击外部自动关闭

### 设计 Token

| 元素 | Token |
|---|---|
| Popover 背景 | `--surface` |
| Popover 边框 | `--border` |
| Popover 圆角 | `--radius-md` (12px) |
| 选中项背景 | `--accent` (#c96442) |
| 未选中项边框 | `--border` |
| 未选中项文字 | `--muted` |
| 区标签 | uppercase, `--faint` 色, 10px |
| 阴影 | `0 4px 20px rgba(0,0,0,0.1)` |

## 数据流

### Generate 流程

```
InputArea (aspectRatio + imageSize state)
  → generationStore.startGeneration(params)
    → generateImage({ ..., params: { size: "1536x1024" } })
      → POST /api/generate (body.params.size)
        → client.py (_extract_params → API request)
```

### 变更点

| 层 | 变更 |
|---|---|
| **generationStore** | 新增 `aspectRatio`（默认 `"1:1"`）和 `imageSize`（默认 `"1K"`）状态。`startGeneration` 构造 `params: { size }` 传入 `generateImage` |
| **后端 generate.py** | 新增 `resolve_size(aspect_ratio, image_size)` 映射函数，在构造 `GenerateParams` 时将比例+档位转为像素值 |
| **后端 client.py** | 无变更（`_PARAM_KEYS` 已含 `"size"`，透传机制已就绪） |
| **前端 api.ts** | 无变更（`GenerateRequest.params` 已定义） |

### 比例→像素映射

后端 `generate.py` 中新增映射表，gpt-image-2 要求边长为 16 的倍数：

| 比例 | 1K | 2K | 4K |
|---|---|---|---|
| 1:1 | 1024×1024 | 2048×2048 | 2880×2880 |
| 16:9 | 1536×1024 | 2048×1152 | 3840×2160 |
| 9:16 | 1024×1536 | 1152×2048 | 2160×3840 |

## Inpaint 约束

Inpaint 操作中蒙版坐标与源图严格对应。比例变更会导致蒙版空间映射变形，因此：

- **比例**：自动锁定为源图比例，不可切换。从源图实际尺寸计算最接近的支持比例。
- **尺寸档位**：可选（1K / 2K / 4K）。同比例下不同分辨率是均匀缩放，蒙版坐标保持比例一致，安全可靠。

Inpaint 请求中的 `params.size` 在后端根据源图比例 + 用户选择的档位自动计算，前端无需特殊处理。

## 状态管理

比例和尺寸选择**不持久化**到后端/数据库，仅存在 Zustand store（`generationStore`）中：

- 应用生命周期内保持上次选择
- 刷新页面回到默认值（1:1 · 1K）

## 默认值

| 参数 | 默认值 | 说明 |
|---|---|---|
| 比例 | `1:1` | 与当前固定 1024×1024 行为一致 |
| 尺寸 | `1K` | 与当前默认质量一致 |

## 影响范围

- **前端**：`InputArea.tsx`（新增触发按钮 + Popover）、`generationStore.ts`（新增状态和 params 传递）
- **后端**：`generate.py`（新增映射函数）、`inpaint.py`（构造 params 时计算锁定比例的尺寸）
- **类型**：无变更（`GenerateParams.size` 已存在）
- **API**：无变更（请求/响应结构不变，仅 params.size 有值）
