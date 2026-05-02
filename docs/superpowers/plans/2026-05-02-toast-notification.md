# Toast 通知系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为保存图片操作添加底部气泡提示，显示确认信息。

**Architecture:** 新增 `toastStore`（Zustand）管理通知队列（上限 1 条），`Toast.tsx` 组件负责渲染和动画。在 `App.tsx` 根层级挂载容器，`DetailPanel.tsx` 的保存操作触发 toast。

**Tech Stack:** React + Zustand + CSS transitions + react-i18next

---

### Task 1: 创建 toastStore

**Files:**
- Create: `frontend/src/stores/toastStore.ts`

- [ ] **Step 1: 编写 toastStore**

```ts
import { create } from "zustand";

interface Toast {
  id: string;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  showToast: (message: string, duration?: number) => void;
  dismissToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  showToast: (message: string, duration = 3000) => {
    const id = String(Date.now());
    set({ toasts: [{ id, message }] });
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },

  dismissToast: (id: string) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
```

- [ ] **Step 2: 验证构建**

Run: `cd frontend && npm run build`
Expected: 构建成功，无类型错误

- [ ] **Step 3: 提交**

```bash
git add frontend/src/stores/toastStore.ts
git commit -m "feat: 添加 toastStore 通知状态管理"
```

---

### Task 2: 创建 Toast 组件

**Files:**
- Create: `frontend/src/components/Toast.tsx`

- [ ] **Step 1: 编写 Toast 组件**

组件包含两部分：
- `ToastContainer` — 固定在底部居中的容器，读取 toastStore 渲染通知
- 每条通知带进入/退出动画，使用 `useState` + `useEffect` 控制可见状态实现退出过渡

```tsx
import { useState, useEffect } from "react";
import { useToastStore } from "../stores/toastStore";

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} id={toast.id} message={toast.message} onDismiss={dismissToast} />
      ))}
    </div>
  );
}

function ToastItem({ id, message, onDismiss }: { id: string; message: string; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div
      onClick={() => {
        setVisible(false);
        setTimeout(() => onDismiss(id), 150);
      }}
      style={{
        padding: "10px 16px",
        borderRadius: 8,
        background: "rgba(0,0,0,0.75)",
        color: "#fff",
        fontSize: 14,
        maxWidth: 400,
        whiteSpace: "nowrap" as const,
        overflow: "hidden",
        textOverflow: "ellipsis",
        cursor: "pointer",
        pointerEvents: "auto",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: "opacity 150ms ease, transform 200ms ease",
      }}
    >
      {message}
    </div>
  );
}
```

- [ ] **Step 2: 验证构建**

Run: `cd frontend && npm run build`
Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/Toast.tsx
git commit -m "feat: 添加 Toast 通知组件（底部气泡提示）"
```

---

### Task 3: 挂载 ToastContainer 到 App.tsx

**Files:**
- Modify: `frontend/src/App.tsx:1-10` (import) 和 `frontend/src/App.tsx:114` (渲染)

- [ ] **Step 1: 添加 import 和渲染 ToastContainer**

在 `App.tsx` 顶部 import 区域添加：
```ts
import ToastContainer from "./components/Toast";
```

在 `App.tsx` return 的 `<div>` 容器末尾（`SettingsDialog` 之后，关闭 `</div>` 之前）添加：
```tsx
<ToastContainer />
```

具体位置：第 10 行后添加 import，第 114 行 `{showSettings && <SettingsDialog ... />}` 后添加 `<ToastContainer />`。

- [ ] **Step 2: 验证构建**

Run: `cd frontend && npm run build`
Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add frontend/src/App.tsx
git commit -m "feat: 在 App 根层级挂载 ToastContainer"
```

---

### Task 4: 添加 i18n 翻译

**Files:**
- Modify: `frontend/src/i18n/zh.json:98` (error 行之前插入)
- Modify: `frontend/src/i18n/en.json:98` (error 行之前插入)

- [ ] **Step 1: 在 zh.json 添加 toast 翻译**

在 `"mask.fit": "适配"` 和 `"error.generateFailed"` 之间插入：

```json
  "toast.imageSaved": "已保存图片 {{name}}",
  "toast.imagesSaved": "已保存 {{count}} 张图片",
```

- [ ] **Step 2: 在 en.json 添加 toast 翻译**

在 `"mask.fit": "Fit"` 和 `"error.generateFailed"` 之间插入：

```json
  "toast.imageSaved": "Image saved: {{name}}",
  "toast.imagesSaved": "{{count}} images saved",
```

- [ ] **Step 3: 验证构建**

Run: `cd frontend && npm run build`
Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add frontend/src/i18n/zh.json frontend/src/i18n/en.json
git commit -m "feat: 添加 toast 通知的 i18n 翻译"
```

---

### Task 5: 集成 toast 到 DetailPanel 保存操作

**Files:**
- Modify: `frontend/src/components/DetailPanel.tsx:1-7` (import) 和 `:39-58` (handleSave / handleSaveAll)

- [ ] **Step 1: 添加 toastStore import**

在 DetailPanel.tsx 第 6 行后添加：
```ts
import { useToastStore } from "../stores/toastStore";
```

- [ ] **Step 2: 在组件内获取 showToast**

在 `DetailPanel` 函数内，第 12 行 `const { setPendingForkFrom } = ...` 之后添加：
```ts
const showToast = useToastStore((s) => s.showToast);
```

- [ ] **Step 3: 修改 handleSave 添加 toast 调用**

将 `handleSave`（第 39-46 行）替换为：

```ts
  const handleSave = () => {
    if (!singleImage) return;
    const url = getImageFileUrl(singleImage.id);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openimage_step${singleImage.step}.png`;
    a.click();
    showToast(t("toast.imageSaved", { name: a.download }));
  };
```

- [ ] **Step 4: 修改 handleSaveAll 添加 toast 调用**

将 `handleSaveAll`（第 48-58 行）替换为：

```ts
  const handleSaveAll = () => {
    selectedImages.forEach((img, i) => {
      setTimeout(() => {
        const url = getImageFileUrl(img.id);
        const a = document.createElement("a");
        a.href = url;
        a.download = `openimage_step${img.step}.png`;
        a.click();
      }, i * 200);
    });
    showToast(t("toast.imagesSaved", { count: selectedImages.length }));
  };
```

- [ ] **Step 5: 验证构建**

Run: `cd frontend && npm run build`
Expected: 构建成功

- [ ] **Step 6: 手动测试**

Run: `cd frontend && npm run dev`

1. 打开应用，生成或选择一张图片
2. 点击「保存图片」→ 底部应出现气泡"已保存图片 openimage_step1.png"，3 秒后自动消失
3. 多选图片，点击「保存全部」→ 底部应出现气泡"已保存 3 张图片"
4. 点击气泡应立即关闭

- [ ] **Step 7: 提交**

```bash
git add frontend/src/components/DetailPanel.tsx
git commit -m "feat: 保存图片时显示 toast 通知"
```
