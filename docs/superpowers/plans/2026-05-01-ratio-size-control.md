# 图片比例/尺寸控制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为图片生成添加比例（1:1/16:9/9:16）和尺寸档位（1K/2K/4K）控制，前端 InputArea 工具栏按钮 + 向上弹出 Popover 选择，后端 Inpaint 自动锁定源图比例。

**Architecture:** 前端在 generationStore 中维护 aspectRatio/imageSize 状态，通过 SIZE_MAP 构造 params.size 像素字符串随请求发送。后端 generate.py 新增映射表供 Inpaint 端点从源图尺寸自动计算比例对应的输出尺寸。数据流：Store → API → 后端透传 → OpenAI。

**Tech Stack:** Python/FastAPI（后端）、React + Zustand（前端状态）、CSS Variables（设计系统）、PIL（图片尺寸读取）

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| Create | `backend/tests/test_size_mapping.py` | 映射函数 + 比例检测 + Inpaint 尺寸计算测试 |
| Create | `frontend/src/components/RatioSelector.tsx` | 比例/尺寸选择 Popover 组件（触发按钮 + 浮层） |
| Modify | `backend/src/api/generate.py` | 新增 SIZE_TABLE、resolve_size()、detect_closest_ratio() |
| Modify | `backend/src/api/inpaint.py` | 从源图尺寸自动计算 params.size，import PIL |
| Modify | `frontend/src/stores/generationStore.ts` | 新增 aspectRatio/imageSize 状态 + SIZE_MAP + params 传递 |
| Modify | `frontend/src/components/InputArea.tsx` | 集成 RatioSelector 到工具栏 |
| Modify | `CLAUDE.md` | 更新文件树 |

---

### Task 1: Backend — 比例→像素映射函数（TDD）

**Files:**
- Create: `backend/tests/test_size_mapping.py`
- Modify: `backend/src/api/generate.py`（在 `GenerateParams` 类之后、`_resolve_previous` 函数之前插入）

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_size_mapping.py`：

```python
import pytest
from src.api.generate import resolve_size, detect_closest_ratio, SIZE_TABLE


class TestResolveSize:
    def test_1x1_1k(self):
        assert resolve_size("1:1", "1K") == "1024x1024"

    def test_1x1_4k(self):
        assert resolve_size("1:1", "4K") == "2880x2880"

    def test_16x9_2k(self):
        assert resolve_size("16:9", "2K") == "2048x1152"

    def test_9x16_1k(self):
        assert resolve_size("9:16", "1K") == "1024x1536"

    def test_all_combinations_valid(self):
        """所有组合返回的尺寸边长都是 16 的倍数（gpt-image-2 要求）"""
        for ratio, tiers in SIZE_TABLE.items():
            for tier, size in tiers.items():
                w, h = size.split("x")
                assert int(w) % 16 == 0, f"{ratio}/{tier}: {w} 不是 16 的倍数"
                assert int(h) % 16 == 0, f"{ratio}/{tier}: {h} 不是 16 的倍数"

    def test_invalid_ratio_raises(self):
        with pytest.raises(KeyError):
            resolve_size("4:3", "1K")

    def test_invalid_tier_raises(self):
        with pytest.raises(KeyError):
            resolve_size("1:1", "8K")


class TestDetectClosestRatio:
    def test_exact_square(self):
        assert detect_closest_ratio(1024, 1024) == "1:1"

    def test_exact_16x9(self):
        assert detect_closest_ratio(1920, 1080) == "16:9"

    def test_exact_9x16(self):
        assert detect_closest_ratio(1080, 1920) == "9:16"

    def test_near_square(self):
        """接近正方形的图片应识别为 1:1"""
        assert detect_closest_ratio(1100, 1000) == "1:1"

    def test_landscape(self):
        """横向图片应识别为 16:9"""
        assert detect_closest_ratio(1536, 1024) == "16:9"

    def test_portrait(self):
        """纵向图片应识别为 9:16"""
        assert detect_closest_ratio(1024, 1536) == "9:16"
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd backend && python -m pytest tests/test_size_mapping.py -v`
Expected: FAIL — `ImportError: cannot import name 'resolve_size'`

- [ ] **Step 3: 实现映射函数**

在 `backend/src/api/generate.py` 第 28 行（`GenerateParams` 类结束后）之后、第 38 行（`_resolve_previous` 之前）插入：

```python

SIZE_TABLE: dict[str, dict[str, str]] = {
    "1:1": {"1K": "1024x1024", "2K": "2048x2048", "4K": "2880x2880"},
    "16:9": {"1K": "1536x1024", "2K": "2048x1152", "4K": "3840x2160"},
    "9:16": {"1K": "1024x1536", "2K": "1152x2048", "4K": "2160x3840"},
}


def resolve_size(aspect_ratio: str, image_size: str) -> str:
    """将比例+档位映射为像素尺寸字符串（如 "1536x1024"）"""
    return SIZE_TABLE[aspect_ratio][image_size]


def detect_closest_ratio(width: int, height: int) -> str:
    """从像素尺寸检测最接近的支持比例"""
    actual = width / height
    supported = {"1:1": 1.0, "16:9": 16 / 9, "9:16": 9 / 16}
    return min(supported, key=lambda k: abs(actual - supported[k]))

```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd backend && python -m pytest tests/test_size_mapping.py -v`
Expected: 全部 PASS（12 tests）

- [ ] **Step 5: 提交**

```bash
git add backend/src/api/generate.py backend/tests/test_size_mapping.py
git commit -m "feat: 添加比例→像素尺寸映射表和比例检测函数

- SIZE_TABLE 定义 9 种比例×档位组合的像素尺寸
- resolve_size() 将抽象参数映射为 API 兼容的像素字符串
- detect_closest_ratio() 从图片尺寸检测最接近的支持比例
- 所有边长均为 16 的倍数，满足 gpt-image-2 要求"
```

---

### Task 2: Backend — Inpaint 自动计算源图尺寸

**Files:**
- Modify: `backend/src/api/inpaint.py`
- Modify: `backend/tests/test_size_mapping.py`（追加测试）

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_size_mapping.py` 末尾追加：

```python
class TestInpaintSizeCalculation:
    """测试 Inpaint 从源图尺寸自动计算 params.size"""

    def test_inpaint_size_square(self):
        """正方形源图应映射到 1:1 1K"""
        from src.api.inpaint import _inpaint_size_from_source
        assert _inpaint_size_from_source(1024, 1024, "1K") == "1024x1024"

    def test_inpaint_size_landscape(self):
        """横向源图应映射到 16:9 2K"""
        from src.api.inpaint import _inpaint_size_from_source
        assert _inpaint_size_from_source(1920, 1080, "2K") == "2048x1152"

    def test_inpaint_size_portrait(self):
        """纵向源图应映射到 9:16 1K"""
        from src.api.inpaint import _inpaint_size_from_source
        assert _inpaint_size_from_source(1080, 1920, "1K") == "1024x1536"

    def test_inpaint_size_non_standard(self):
        """非标准尺寸源图应检测最接近比例"""
        from src.api.inpaint import _inpaint_size_from_source
        # 800x600 ≈ 4:3，最接近 16:9
        assert _inpaint_size_from_source(800, 600, "1K") == "1536x1024"

    def test_inpaint_size_default_tier(self):
        """不传 tier 默认使用 1K"""
        from src.api.inpaint import _inpaint_size_from_source
        assert _inpaint_size_from_source(1536, 1024) == "1536x1024"
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd backend && python -m pytest tests/test_size_mapping.py::TestInpaintSizeCalculation -v`
Expected: FAIL — `ImportError: cannot import name '_inpaint_size_from_source'`

- [ ] **Step 3: 实现 inpaint 辅助函数**

修改 `backend/src/api/inpaint.py`：

1. 更新第 8 行 import：

```python
from src.api.generate import (
    GenerateParams, _read_image_b64, _save_generated_image,
    resolve_size, detect_closest_ratio,
)
```

2. 在文件顶部 import 区追加（第 2 行之后）：

```python
from io import BytesIO

from PIL import Image
```

3. 在 `_validate_mask_b64` 函数（第 22-27 行）之后添加：

```python

def _inpaint_size_from_source(width: int, height: int, tier: str = "1K") -> str:
    """根据源图尺寸和档位计算 Inpaint 输出尺寸（自动锁定比例）"""
    ratio = detect_closest_ratio(width, height)
    return resolve_size(ratio, tier)

```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd backend && python -m pytest tests/test_size_mapping.py::TestInpaintSizeCalculation -v`
Expected: 全部 PASS（5 tests）

- [ ] **Step 5: 集成到 inpaint 端点**

修改 `backend/src/api/inpaint.py` 的 `inpaint` 函数。在 `params = body.params or GenerateParams()` （约第 68 行）之后、`client = request.app.state.client`（约第 69 行）之前，插入源图尺寸检测逻辑：

```python
    # Inpaint 自动锁定源图比例，计算输出尺寸
    source_data = base64.b64decode(source_b64)
    source_img = Image.open(BytesIO(source_data))
    params.size = _inpaint_size_from_source(*source_img.size)

```

修改后的上下文应如下（约第 68-75 行）：

```python
    params = body.params or GenerateParams()
    # Inpaint 自动锁定源图比例，计算输出尺寸
    source_data = base64.b64decode(source_b64)
    source_img = Image.open(BytesIO(source_data))
    params.size = _inpaint_size_from_source(*source_img.size)

    client = request.app.state.client
```

- [ ] **Step 6: 运行全部后端测试**

Run: `cd backend && python -m pytest tests/ -v`
Expected: 全部 PASS

- [ ] **Step 7: 提交**

```bash
git add backend/src/api/inpaint.py backend/tests/test_size_mapping.py
git commit -m "feat: Inpaint 自动锁定源图比例计算输出尺寸

- 新增 _inpaint_size_from_source() 辅助函数
- inpaint 端点从源图实际尺寸检测比例，自动设定 params.size
- 保证 Inpaint 输出与源图比例一致，避免蒙版坐标变形"
```

---

### Task 3: Frontend — Store 添加比例/尺寸状态

**Files:**
- Modify: `frontend/src/stores/generationStore.ts`

- [ ] **Step 1: 添加 SIZE_MAP 常量和新状态**

修改 `frontend/src/stores/generationStore.ts`：

1. 在第 3 行 `import { generateImage } from "../services/api";` 之后，添加 SIZE_MAP 和选项常量：

```typescript

export const SIZE_MAP: Record<string, Record<string, string>> = {
  "1:1": { "1K": "1024x1024", "2K": "2048x2048", "4K": "2880x2880" },
  "16:9": { "1K": "1536x1024", "2K": "2048x1152", "4K": "3840x2160" },
  "9:16": { "1K": "1024x1536", "2K": "1152x2048", "4K": "2160x3840" },
};

export const RATIO_OPTIONS = ["1:1", "16:9", "9:16"] as const;
export const SIZE_OPTIONS = ["1K", "2K", "4K"] as const;
```

2. 在 `GenerationState` 接口中（第 25 行 `setPendingForkFrom` 之后）添加：

```typescript
  aspectRatio: string;
  imageSize: string;
  setAspectRatio: (ratio: string) => void;
  setImageSize: (size: string) => void;
```

3. 在 store 实现中（约第 33 行 `pendingForkFrom: null,` 之后）添加默认值：

```typescript
  aspectRatio: "1:1",
  imageSize: "1K",
```

4. 在 store 实现中（约第 91 行 `setPendingForkFrom` 方法之后）添加方法：

```typescript

  setAspectRatio: (ratio) => set({ aspectRatio: ratio }),
  setImageSize: (size) => set({ imageSize: size }),
```

- [ ] **Step 2: 修改 startGeneration 传递 params**

将 `startGeneration` 方法（约第 45 行）中的 `const { attachments } = get();` 替换为：

```typescript
    const { attachments, aspectRatio, imageSize } = get();
```

将 `generateImage` 调用中的参数对象从：

```typescript
      {
        session_id: sessionId,
        prompt,
        images,
        fork_from: forkFrom,
      },
```

改为：

```typescript
      {
        session_id: sessionId,
        prompt,
        images,
        fork_from: forkFrom,
        params: { size: SIZE_MAP[aspectRatio]?.[imageSize] || "1024x1024" },
      },
```

- [ ] **Step 3: 验证前端编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无 TypeScript 错误

- [ ] **Step 4: 提交**

```bash
git add frontend/src/stores/generationStore.ts
git commit -m "feat: generationStore 添加比例/尺寸状态和 params 传递

- 新增 SIZE_MAP 常量定义 9 种比例×档位映射
- 新增 aspectRatio (默认 1:1) 和 imageSize (默认 1K) 状态
- startGeneration 现在构造 params: { size } 传递给 API
- 导出 RATIO_OPTIONS 和 SIZE_OPTIONS 供 UI 使用"
```

---

### Task 4: Frontend — RatioSelector Popover 组件

**Files:**
- Create: `frontend/src/components/RatioSelector.tsx`
- Modify: `frontend/src/components/InputArea.tsx`

- [ ] **Step 1: 创建 RatioSelector 组件**

创建 `frontend/src/components/RatioSelector.tsx`：

```tsx
import { useState, useRef, useEffect } from "react";
import { useGenerationStore, RATIO_OPTIONS, SIZE_OPTIONS } from "../stores/generationStore";

const RATIO_ICONS: Record<string, { w: number; h: number }> = {
  "1:1": { w: 20, h: 20 },
  "16:9": { w: 26, h: 15 },
  "9:16": { w: 15, h: 26 },
};

function ratioIconStyle(ratio: string, active: boolean) {
  const { w, h } = RATIO_ICONS[ratio];
  return {
    width: w,
    height: h,
    border: `1.5px solid ${active ? "white" : "var(--silver)"}`,
    borderRadius: ratio === "1:1" ? 3 : 2,
  };
}

export default function RatioSelector() {
  const { aspectRatio, imageSize, setAspectRatio, setImageSize } = useGenerationStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const isCustom = aspectRatio !== "1:1" || imageSize !== "1K";

  const buttonBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 10px",
    fontSize: 12,
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
  };

  const optionBtn = (selected: boolean): React.CSSProperties => ({
    flex: 1,
    padding: selected ? "8px 0" : "6px 0",
    borderRadius: "var(--radius-sm)",
    border: selected ? "none" : "1px solid var(--border)",
    background: selected ? "var(--accent)" : "none",
    fontSize: 12,
    color: selected ? "white" : "var(--muted)",
    fontWeight: selected ? 500 : 400,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    boxShadow: selected ? "0 1px 4px rgba(201,100,66,0.2)" : "none",
  });

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* 触发按钮 */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          ...buttonBase,
          color: isCustom ? "white" : "var(--muted)",
          background: isCustom ? "var(--accent)" : "none",
          border: isCustom ? "none" : "1px solid var(--border)",
        }}
        onMouseEnter={(e) => {
          if (!isCustom) {
            e.currentTarget.style.background = "var(--sand)";
            e.currentTarget.style.color = "var(--fg)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isCustom) {
            e.currentTarget.style.background = "none";
            e.currentTarget.style.color = "var(--muted)";
          }
        }}
        title="比例和尺寸"
      >
        <span style={{ display: "inline-block", ...ratioIconStyle(aspectRatio, isCustom) }} />
        {aspectRatio} · {imageSize}
      </button>

      {/* Popover */}
      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 10px)",
            left: "50%",
            transform: "translateX(-50%)",
            width: 240,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
            padding: 14,
            zIndex: 50,
          }}
        >
          {/* 居中小三角 */}
          <div
            style={{
              position: "absolute",
              bottom: -6,
              left: "50%",
              marginLeft: -6,
              width: 12,
              height: 12,
              background: "var(--surface)",
              borderRight: "1px solid var(--border)",
              borderBottom: "1px solid var(--border)",
              transform: "rotate(45deg)",
            }}
          />

          {/* 比例区 */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--faint)",
                marginBottom: 8,
              }}
            >
              比例
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {RATIO_OPTIONS.map((ratio) => {
                const selected = aspectRatio === ratio;
                return (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    style={optionBtn(selected)}
                  >
                    <div style={ratioIconStyle(ratio, selected)} />
                    <span>{ratio}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 分割线 */}
          <div
            style={{
              height: 1,
              background: "var(--border)",
              margin: "0 -14px 12px",
            }}
          />

          {/* 尺寸区 */}
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--faint)",
                marginBottom: 8,
              }}
            >
              尺寸
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {SIZE_OPTIONS.map((tier) => {
                const selected = imageSize === tier;
                return (
                  <button
                    key={tier}
                    onClick={() => setImageSize(tier)}
                    style={{ ...optionBtn(selected), flexDirection: "row", padding: "6px 0" }}
                  >
                    {tier}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 集成到 InputArea 工具栏**

修改 `frontend/src/components/InputArea.tsx`：

1. 在第 6 行 `import MaskEditor from "./MaskEditor";` 之后添加 import：

```typescript
import RatioSelector from "./RatioSelector";
```

2. 在工具栏行中，Settings 按钮闭合标签（约第 173 行 `</button>`）之后、`<span className="flex-1" />`（约第 175 行）之前，插入：

```tsx
        <RatioSelector />
```

- [ ] **Step 3: 验证前端编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无 TypeScript 错误

Run: `cd frontend && npm run build`
Expected: BUILD SUCCESS

- [ ] **Step 4: 功能验证**

启动开发服务器：

```bash
cd frontend && npm run dev
```

验证项：
- Settings 按钮右侧出现新按钮，默认显示 "1:1 · 1K"（muted 色 + 边框）
- 点击按钮向上弹出 Popover，居中小三角指向按钮
- 比例区 3 个选项含比例形状图标，尺寸区 3 个文字选项
- 选择 16:9 后按钮变 coral 高亮，显示 "16:9 · 1K"
- 选择 2K 后按钮显示 "16:9 · 2K"
- 点击外部 Popover 自动关闭
- 切回 1:1 · 1K 后按钮恢复默认 muted 样式
- 输入 prompt 点击 Generate → 后端日志确认 params.size 正确传递

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/RatioSelector.tsx frontend/src/components/InputArea.tsx
git commit -m "feat: 添加比例/尺寸选择 Popover 组件

- 新增 RatioSelector：工具栏触发按钮 + 向上弹出 Popover
- 比例区 3 选项（1:1/16:9/9:16）含比例形状图标
- 尺寸区 3 选项（1K/2K/4K）纯文字按钮
- 选中项 coral 高亮，点击外部自动关闭
- 居中小三角箭头指向触发按钮
- 集成到 InputArea 工具栏 Settings 按钮右侧"
```

---

### Task 5: 最终验证与文档更新

- [ ] **Step 1: 运行全部后端测试**

Run: `cd backend && python -m pytest tests/ -v`
Expected: 全部 PASS

- [ ] **Step 2: 前端生产构建**

Run: `cd frontend && npm run build`
Expected: BUILD SUCCESS

- [ ] **Step 3: 更新 CLAUDE.md 文件树**

在 CLAUDE.md 文件结构树的 `frontend/src/components/` 区域，`InputArea.tsx` 行之前添加：

```
│   │   │   ├── RatioSelector.tsx    # 比例/尺寸选择 Popover（工具栏触发按钮）
```

- [ ] **Step 4: 提交**

```bash
git add CLAUDE.md
git commit -m "docs: 更新文件树，添加 RatioSelector 组件"
```
