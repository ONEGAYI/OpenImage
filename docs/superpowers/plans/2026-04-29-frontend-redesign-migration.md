# 前端样式迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 OpenImage 前端从深蓝色 Tailwind 内联样式迁移为 Claude 暖色调设计系统，包含亮/暗主题切换和新增 Topbar 组件。

**Architecture:** 基础先行策略 — 先搭建 CSS 变量 + 主题基础设施，然后从 Topbar 开始逐个组件更新。使用 Tailwind 布局类 + CSS 自定义属性实现主题切换，通过 `data-theme` 属性在 `<html>` 上控制主题。后端需要小幅修改以支持 Sidebar 缩略图（session image_count + latest_image_id）。

**Tech Stack:** React 18 + Zustand + Tailwind CSS v4 + Vite + FastAPI (后端)

---

## 文件结构

| 操作 | 文件路径 | 职责 |
|------|----------|------|
| 重写 | `frontend/src/styles/globals.css` | CSS 变量系统、主题、基础样式 |
| 新增 | `frontend/src/hooks/useTheme.ts` | 主题切换 hook |
| 新增 | `frontend/src/components/Topbar.tsx` | 标题栏（会话名 + 设置 + 主题切换） |
| 新增 | `frontend/src/components/SettingsDialog.tsx` | 从 InputArea 提取的设置弹窗 |
| 修改 | `frontend/src/App.tsx` | 新布局结构 |
| 重构 | `frontend/src/components/Sidebar.tsx` | wordmark + 搜索 + 缩略图 |
| 修改 | `frontend/src/components/Gallery.tsx` | 暖色风格 |
| 修改 | `frontend/src/components/DetailPanel.tsx` | 暖色风格 |
| 修改 | `frontend/src/components/InputArea.tsx` | 暖色风格，移除 SettingsDialog |
| 修改 | `frontend/src/types/index.ts` | Session 类型增加 image_count, latest_image_id |
| 修改 | `backend/src/core/session.py` | list_all() 返回 image_count + latest_image_id |
| 修改 | `frontend/src/stores/sessionStore.ts` | 新增 searchQuery 状态 |

---

### Task 1: CSS 变量系统 & 主题基础设施

**Files:**
- Rewrite: `frontend/src/styles/globals.css`
- Create: `frontend/src/hooks/useTheme.ts`

- [ ] **Step 1: 重写 globals.css**

将现有 `globals.css` 完整替换为以下内容。保留 Tailwind v4 的 `@import "tailwindcss"`（移除 v3 的 `@tailwind` 指令），添加完整的 CSS 变量系统。

```css
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
@import "tailwindcss";

:root {
  /* 背景系统 */
  --bg: #f5f4ed;
  --surface: #faf9f5;
  --sidebar-bg: #ebe8de;
  --input-bg: #ffffff;
  --card-bg: #ffffff;
  --sand: #e8e6dc;
  --silver: #b0aea5;

  /* 文字系统 */
  --fg: #141413;
  --muted: #5e5d59;
  --faint: #87867f;

  /* 边框系统 */
  --border: #e8e6dc;
  --border-s: #f0eee6;
  --ring: #d1cfc5;

  /* 强调色 */
  --accent: #c96442;
  --accent-h: #b35537;

  /* 语义色 */
  --error: #b53333;
  --info: #3898ec;
  --success: #4a7c59;

  /* 阴影 */
  --card-shadow: rgba(0,0,0,0.04);
  --overlay: rgba(20,20,19,0.5);

  /* 字体 */
  --font-display: 'Playfair Display', Georgia, serif;
  --font-body: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, Menlo, monospace;

  /* 圆角 */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;

  /* 布局 */
  --sidebar-w: 260px;
  --detail-w: 310px;
  --topbar-h: 52px;
}

[data-theme="dark"] {
  --bg: #141413;
  --surface: #1e1d1b;
  --sidebar-bg: #1a1918;
  --input-bg: #1e1d1b;
  --card-bg: #1e1d1b;
  --sand: #2a2927;
  --silver: #5e5d59;

  --fg: #faf9f5;
  --muted: #b0aea5;
  --faint: #87867f;

  --border: #30302e;
  --border-s: #252422;
  --ring: #4d4c48;

  --accent: #d97757;
  --accent-h: #c96442;

  --error: #e05555;
  --info: #5aabf0;
  --success: #6aad7a;

  --card-shadow: rgba(0,0,0,0.2);
  --overlay: rgba(0,0,0,0.7);
}

/* 基础重置 */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; }
body {
  font-family: var(--font-body);
  background: var(--bg);
  color: var(--fg);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  transition: background 0.3s, color 0.3s;
}
button { font-family: inherit; cursor: pointer; border: none; background: none; color: inherit; font-size: inherit; }
input, textarea, select { font-family: inherit; font-size: inherit; color: var(--fg); }
img { display: block; max-width: 100%; }

/* 滚动条 */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--faint); }

/* 动画 */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fadeIn { animation: fadeIn 0.3s ease-out; }
```

- [ ] **Step 2: 创建 useTheme hook**

创建 `frontend/src/hooks/useTheme.ts`：

```typescript
import { useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "oi-theme";

function getInitialTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
```

- [ ] **Step 3: 在 main.tsx 中设置初始主题**

修改 `frontend/src/main.tsx`，在 React 渲染前先应用主题，避免闪烁：

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

// 防止主题闪烁：在 React 挂载前应用保存的主题
const saved = localStorage.getItem("oi-theme");
if (saved === "dark" || saved === "light") {
  document.documentElement.setAttribute("data-theme", saved);
} else {
  document.documentElement.setAttribute("data-theme", "light");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 4: 验证开发服务器启动**

Run: `cd D:/CODE/Project/OpenImage/frontend && npm run dev`

在浏览器中访问 `http://localhost:1420`，确认：
1. 页面背景变为暖色 `#f5f4ed`（不再是深蓝色）
2. 文字颜色为深色 `#141413`
3. 无 CSS 编译错误

- [ ] **Step 5: 提交**

```bash
cd D:/CODE/Project/OpenImage
git add frontend/src/styles/globals.css frontend/src/hooks/useTheme.ts frontend/src/main.tsx
git commit -m "feat: 建立 CSS 变量系统和主题切换基础设施

重写 globals.css，使用完整的 CSS 自定义属性系统替代硬编码颜色值。
包含亮色/暗色双主题定义（通过 data-theme 属性切换）。
创建 useTheme hook 管理主题状态和 localStorage 持久化。
在 main.tsx 中预先应用主题防止闪烁。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 后端增强 — Session 图片计数

**Files:**
- Modify: `backend/src/core/session.py` (list_all 方法)
- Modify: `frontend/src/types/index.ts` (Session 接口)

- [ ] **Step 1: 修改 session.py 的 list_all 方法**

在 `backend/src/core/session.py` 中，修改 `list_all()` 方法，使用 LEFT JOIN 获取每个 session 的图片数量和最新图片 ID：

```python
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
```

- [ ] **Step 2: 更新前端 Session 类型**

在 `frontend/src/types/index.ts` 中，为 `Session` 接口添加两个可选字段：

```typescript
export interface Session {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  head_response_id: string | null;
  image_count?: number;
  latest_image_id?: string | null;
}
```

- [ ] **Step 3: 验证后端启动和 API 响应**

Run: `cd D:/CODE/Project/OpenImage/backend && python -m src.cli serve`

用浏览器或 curl 访问 `http://localhost:8765/api/sessions`，确认响应中包含 `image_count` 和 `latest_image_id` 字段。

- [ ] **Step 4: 提交**

```bash
cd D:/CODE/Project/OpenImage
git add backend/src/core/session.py frontend/src/types/index.ts
git commit -m "feat: 后端 session 列表返回图片计数和最新图片 ID

修改 session.py list_all() 方法，使用 LEFT JOIN 查询每个会话的
图片数量和最新图片 ID，支持前端侧边栏缩略图显示。
更新前端 Session 类型定义，添加可选字段。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Topbar 组件

**Files:**
- Create: `frontend/src/components/Topbar.tsx`

- [ ] **Step 1: 创建 Topbar 组件**

创建 `frontend/src/components/Topbar.tsx`：

```tsx
import { useSessionStore } from "../stores/sessionStore";
import { useTheme } from "../hooks/useTheme";

interface TopbarProps {
  onOpenSettings: () => void;
}

export default function Topbar({ onOpenSettings }: TopbarProps) {
  const { sessions, activeSessionId } = useSessionStore();
  const { theme, toggleTheme } = useTheme();

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const title = activeSession?.name ?? "OpenImage";

  return (
    <header
      className="flex items-center justify-between px-5 border-b"
      style={{
        height: "var(--topbar-h)",
        minHeight: "var(--topbar-h)",
        borderColor: "var(--border-s)",
        background: "var(--bg)",
        transition: "background 0.3s, border-color 0.3s",
      }}
    >
      <div
        className="font-semibold tracking-tight"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "16px",
          color: "var(--fg)",
        }}
      >
        {title}
      </div>

      <div className="flex items-center gap-1.5">
        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="flex items-center justify-center rounded-lg transition-colors"
          style={{
            width: 34,
            height: 34,
            color: "var(--muted)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--sand)";
            e.currentTarget.style.color = "var(--fg)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "none";
            e.currentTarget.style.color = "var(--muted)";
          }}
          title="Settings"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="relative rounded-full cursor-pointer border"
          style={{
            width: 50,
            height: 28,
            background: "var(--sand)",
            borderColor: "var(--border)",
            transition: "background 0.3s",
          }}
          title="Toggle theme"
        >
          <span
            className="absolute inset-0 flex items-center justify-between px-1.5 pointer-events-none"
            style={{ fontSize: 13 }}
          >
            <span>&#9728;</span>
            <span>&#9790;</span>
          </span>
          <span
            className="absolute top-[3px] left-[3px] w-5 h-5 rounded-full"
            style={{
              background: "var(--accent)",
              transform: theme === "dark" ? "translateX(22px)" : "translateX(0)",
              transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            }}
          />
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: 验证组件编译**

Run: `cd D:/CODE/Project/OpenImage/frontend && npx tsc --noEmit`

确认 TypeScript 编译无错误。

- [ ] **Step 3: 提交**

```bash
cd D:/CODE/Project/OpenImage
git add frontend/src/components/Topbar.tsx
git commit -m "feat: 新增 Topbar 组件（标题栏 + 主题切换 + 设置入口）

包含当前会话标题（Playfair Display 字体）、设置按钮（齿轮图标）
和主题切换开关（日/月图标滑块，赤陶色圆点）。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 提取 SettingsDialog 为共享组件

**Files:**
- Create: `frontend/src/components/SettingsDialog.tsx` (从 InputArea.tsx 提取)

- [ ] **Step 1: 创建独立的 SettingsDialog 组件**

创建 `frontend/src/components/SettingsDialog.tsx`，从 `InputArea.tsx` 中提取现有的 `SettingsDialog` 函数组件，并更新所有样式为暖色调：

```tsx
import { useState, useEffect } from "react";
import { getSettings, updateSettings } from "../services/api";

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiMode, setApiMode] = useState<"responses" | "images" | "chat">("chat");
  const [modelName, setModelName] = useState("gpt-image-2");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getSettings().then((s) => {
      if (s.api_key) setApiKey(s.api_key);
      if (s.base_url) setBaseUrl(s.base_url);
      if (s.api_mode) setApiMode(s.api_mode);
      if (s.model_name) setModelName(s.model_name);
    });
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await updateSettings({
        api_key: apiKey.trim(),
        ...(baseUrl.trim() && { base_url: baseUrl.trim() }),
        api_mode: apiMode,
        model_name: modelName.trim(),
      });
      setMessage("Settings saved");
      setTimeout(onClose, 800);
    } catch (err) {
      setMessage(`Error: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: "var(--overlay)" }}
    >
      <div
        className="rounded-xl border p-6 w-[420px] max-h-[90vh] overflow-y-auto"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "0 8px 32px var(--card-shadow)",
        }}
      >
        <h3
          className="text-lg font-medium mb-4"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--fg)",
          }}
        >
          Settings
        </h3>

        <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>
          API Key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className="w-full border rounded-lg px-3 py-2 text-sm mb-3 outline-none"
          style={{
            background: "var(--input-bg)",
            borderColor: "var(--border)",
            color: "var(--fg)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
            e.currentTarget.style.boxShadow = "0 0 0 2px rgba(201,100,66,0.1)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />

        <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>
          API Base URL
        </label>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
          className="w-full border rounded-lg px-3 py-2 text-sm mb-1 outline-none"
          style={{
            background: "var(--input-bg)",
            borderColor: "var(--border)",
            color: "var(--fg)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
            e.currentTarget.style.boxShadow = "0 0 0 2px rgba(201,100,66,0.1)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        <div className="text-xs mb-3" style={{ color: "var(--faint)" }}>
          留空则使用 OpenAI 默认地址
        </div>

        <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>
          API 模式
        </label>
        <select
          value={apiMode}
          onChange={(e) => setApiMode(e.target.value as "responses" | "images" | "chat")}
          className="w-full border rounded-lg px-3 py-2 text-sm mb-1 outline-none cursor-pointer"
          style={{
            background: "var(--input-bg)",
            borderColor: "var(--border)",
            color: "var(--fg)",
          }}
        >
          <option value="chat">Chat Completions（/v1/chat/completions，推荐）</option>
          <option value="images">Images API（/v1/images/generations）</option>
          <option value="responses">Responses API（OpenAI 原生，支持多轮编辑）</option>
        </select>
        <div className="text-xs mb-3" style={{ color: "var(--faint)" }}>
          第三方代理推荐 Chat Completions 或 Images API
        </div>

        <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>
          模型名称
        </label>
        <input
          type="text"
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          placeholder="gpt-image-2"
          className="w-full border rounded-lg px-3 py-2 text-sm mb-1 outline-none"
          style={{
            background: "var(--input-bg)",
            borderColor: "var(--border)",
            color: "var(--fg)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
            e.currentTarget.style.boxShadow = "0 0 0 2px rgba(201,100,66,0.1)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        <div className="text-xs mb-4" style={{ color: "var(--faint)" }}>
          图像生成模型 ID，如 gpt-image-2、gemini-2.5-flash-image 等
        </div>

        {message && (
          <div className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            {message}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded-lg transition-colors cursor-pointer"
            style={{ color: "var(--muted)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!apiKey.trim() || saving}
            className="px-4 py-1.5 text-sm rounded-lg transition-colors cursor-pointer disabled:opacity-40"
            style={{
              background: "var(--accent)",
              color: "#faf9f5",
            }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
cd D:/CODE/Project/OpenImage
git add frontend/src/components/SettingsDialog.tsx
git commit -m "feat: 提取 SettingsDialog 为独立共享组件

从 InputArea 中提取设置弹窗为独立的 SettingsDialog 组件，
使用 CSS 变量替代硬编码颜色，支持主题切换。
后续 Topbar 和 InputArea 都可触发此弹窗。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: App 布局更新 + 集成 Topbar

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 重写 App.tsx**

```tsx
import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Gallery from "./components/Gallery";
import InputArea from "./components/InputArea";
import DetailPanel from "./components/DetailPanel";
import Topbar from "./components/Topbar";
import SettingsDialog from "./components/SettingsDialog";

function App() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{
        background: "var(--bg)",
        color: "var(--fg)",
      }}
    >
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onOpenSettings={() => setShowSettings(true)} />
        <Gallery />
        <InputArea onOpenSettings={() => setShowSettings(true)} />
      </div>

      <DetailPanel />

      {showSettings && (
        <SettingsDialog onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

export default App;
```

注意：这里 `InputArea` 需要接受一个新的 prop `onOpenSettings`，将在 Task 9 中实现。

- [ ] **Step 2: 验证编译**

Run: `cd D:/CODE/Project/OpenImage/frontend && npx tsc --noEmit`

此时可能会有类型错误，因为 InputArea 还没有接受 `onOpenSettings` prop。暂时在 App.tsx 中传入但不要求 InputArea 必须使用它——用 TypeScript 的可选 prop 处理。

- [ ] **Step 3: 提交**

```bash
cd D:/CODE/Project/OpenImage
git add frontend/src/App.tsx
git commit -m "feat: 集成 Topbar 到 App 布局，设置弹窗提升到 App 层

将 SettingsDialog 状态提升到 App，Topbar 和 InputArea 都可触发。
根布局使用 CSS 变量替代硬编码颜色。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Sidebar 重构

**Files:**
- Rewrite: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/stores/sessionStore.ts`

- [ ] **Step 1: 更新 sessionStore 添加 searchQuery**

在 `frontend/src/stores/sessionStore.ts` 中：

在 `SessionState` 接口中添加：
```typescript
searchQuery: string;
setSearchQuery: (q: string) => void;
```

在 store 实现中添加：
```typescript
searchQuery: "",
setSearchQuery: (q: string) => set({ searchQuery: q }),
```

同时修改 `fetchSessions` 回调完成后的完整文件内容（仅添加新字段，不改变现有逻辑）。

- [ ] **Step 2: 重写 Sidebar 组件**

将 `frontend/src/components/Sidebar.tsx` 完整替换为：

```tsx
import { useState, useEffect, useRef } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { getImageFileUrl } from "../services/api";

export default function Sidebar() {
  const {
    sessions,
    activeSessionId,
    searchQuery,
    fetchSessions,
    selectSession,
    createSession,
    deleteSession,
    renameSession,
    setSearchQuery,
  } = useSessionStore();

  const [contextMenu, setContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (contextMenu) {
      const close = () => setContextMenu(null);
      document.addEventListener("click", close);
      return () => document.removeEventListener("click", close);
    }
  }, [contextMenu]);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

  const handleNew = async () => {
    const name = `Session ${sessions.length + 1}`;
    await createSession(name);
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  };

  const handleRename = (id: string) => {
    const session = sessions.find((s) => s.id === id);
    if (session) {
      setEditingId(id);
      setEditName(session.name);
    }
    setContextMenu(null);
  };

  const handleRenameSubmit = async () => {
    if (editingId && editName.trim()) {
      await renameSession(editingId, editName.trim());
    }
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteSession(id);
    setContextMenu(null);
  };

  const filtered = searchQuery
    ? sessions.filter((s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sessions;

  return (
    <div
      className="flex flex-col h-full border-r"
      style={{
        width: "var(--sidebar-w)",
        minWidth: "var(--sidebar-w)",
        background: "var(--sidebar-bg)",
        borderColor: "var(--border)",
        transition: "background 0.3s, border-color 0.3s",
      }}
    >
      {/* Header */}
      <div className="p-5 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
        <div
          className="mb-3.5"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 600,
            color: "var(--fg)",
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          Open<span style={{ color: "var(--accent)" }}>Image</span>
        </div>
        <button
          onClick={handleNew}
          className="w-full rounded-lg text-sm font-medium transition-all"
          style={{
            padding: "9px 16px",
            background: "var(--accent)",
            color: "#faf9f5",
            letterSpacing: "0.01em",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--accent-h)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--accent)";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          + New Session
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-2.5 border-b" style={{ borderColor: "var(--border-s)" }}>
        <input
          type="text"
          placeholder="搜索会话..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full border rounded-lg text-[12.5px] outline-none transition-all"
          style={{
            padding: "7px 12px",
            background: "var(--input-bg)",
            borderColor: "var(--border)",
            color: "var(--fg)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
            e.currentTarget.style.boxShadow = "0 0 0 2px rgba(201,100,66,0.12)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-1.5">
        {filtered.length === 0 && (
          <div className="py-8 px-4 text-center text-[13px] leading-relaxed" style={{ color: "var(--faint)" }}>
            {searchQuery ? "无匹配会话" : "暂无会话"}
          </div>
        )}
        {filtered.map((session) => (
          <div
            key={session.id}
            onClick={() => selectSession(session.id)}
            onContextMenu={(e) => handleContextMenu(e, session.id)}
            className="flex items-center gap-2.5 cursor-pointer relative border transition-colors"
            style={{
              padding: "10px 12px",
              borderRadius: "var(--radius-sm)",
              borderColor: activeSessionId === session.id ? "var(--border)" : "transparent",
              background: activeSessionId === session.id ? "var(--surface)" : "transparent",
              boxShadow:
                activeSessionId === session.id
                  ? "0 0 0 1px var(--border-s), 0 1px 3px var(--card-shadow)"
                  : "none",
            }}
            onMouseEnter={(e) => {
              if (activeSessionId !== session.id) {
                e.currentTarget.style.background = "var(--sand)";
              }
            }}
            onMouseLeave={(e) => {
              if (activeSessionId !== session.id) {
                e.currentTarget.style.background = "transparent";
              }
            }}
          >
            {/* Session icon / thumbnail */}
            <div
              className="flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{
                width: 32,
                height: 32,
                borderRadius: "var(--radius-sm)",
                background: activeSessionId === session.id ? "var(--accent)" : "var(--sand)",
              }}
            >
              {session.latest_image_id ? (
                <img
                  src={getImageFileUrl(session.latest_image_id)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <svg
                  className="flex-shrink-0"
                  style={{ width: 14, height: 14, color: activeSessionId === session.id ? "#faf9f5" : "var(--faint)" }}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
              )}
            </div>

            {/* Session info */}
            <div className="flex-1 min-w-0">
              {editingId === session.id ? (
                <input
                  ref={editRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleRenameSubmit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameSubmit();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full border rounded px-2 py-0.5 text-sm outline-none"
                  style={{
                    background: "var(--input-bg)",
                    borderColor: "var(--accent)",
                    color: "var(--fg)",
                  }}
                />
              ) : (
                <>
                  <div
                    className="text-[13px] font-medium truncate"
                    style={{ color: "var(--fg)" }}
                  >
                    {session.name}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--faint)" }}>
                    {session.image_count ?? 0} images
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 p-1 min-w-[140px]"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "0 4px 20px var(--card-shadow)",
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          <button
            onClick={() => handleRename(contextMenu.id)}
            className="w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors"
            style={{ color: "var(--fg)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sand)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            Rename
          </button>
          <button
            onClick={() => handleDelete(contextMenu.id)}
            className="w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors"
            style={{ color: "var(--error)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(181,51,51,0.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 验证编译和渲染**

Run: `cd D:/CODE/Project/OpenImage/frontend && npx tsc --noEmit`

确认无类型错误。在浏览器中检查：
1. Sidebar 宽度变为 260px
2. 显示 "OpenImage" wordmark（赤陶色 "Image"）
3. 搜索框可见
4. Session 图标显示缩略图（如有图片）或 SVG 占位符

- [ ] **Step 4: 提交**

```bash
cd D:/CODE/Project/OpenImage
git add frontend/src/components/Sidebar.tsx frontend/src/stores/sessionStore.ts
git commit -m "feat: 重构 Sidebar 为 Claude 暖色调设计

新增 wordmark（Playfair Display 字体）、搜索框（前端过滤）、
会话缩略图（使用最新生成图片）。所有颜色使用 CSS 变量。
右键菜单更新为暖色风格。sessionStore 新增 searchQuery 状态。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: Gallery 更新

**Files:**
- Modify: `frontend/src/components/Gallery.tsx`

- [ ] **Step 1: 重写 Gallery 组件样式**

将 `frontend/src/components/Gallery.tsx` 完整替换为：

```tsx
import { useSessionStore } from "../stores/sessionStore";
import { useGenerationStore } from "../stores/generationStore";
import { getImageFileUrl } from "../services/api";

export default function Gallery() {
  const { images, selectedImageId, selectImage, loading } = useSessionStore();
  const { isGenerating, partialImage } = useGenerationStore();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: "var(--faint)" }}>
        Loading...
      </div>
    );
  }

  if (images.length === 0 && !isGenerating) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-10 text-center" style={{ color: "var(--faint)" }}>
        <div
          className="flex items-center justify-center mb-1"
          style={{
            width: 64,
            height: 64,
            borderRadius: "var(--radius-xl)",
            background: "var(--sand)",
            fontSize: 28,
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.4">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        </div>
        <h3
          className="font-semibold"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            color: "var(--muted)",
          }}
        >
          No images yet
        </h3>
        <p className="text-[13px] max-w-[300px] leading-relaxed">
          Generate an image to get started
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        }}
      >
        {images.map((img) => (
          <div
            key={img.id}
            onClick={() => selectImage(img.id)}
            className="relative overflow-hidden cursor-pointer transition-all"
            style={{
              borderRadius: "var(--radius-md)",
              background: "var(--card-bg)",
              border:
                selectedImageId === img.id
                  ? "2px solid var(--accent)"
                  : "1px solid var(--border-s)",
              boxShadow:
                selectedImageId === img.id
                  ? "0 0 0 2px var(--accent), 0 4px 16px var(--card-shadow)"
                  : "none",
              aspectRatio: "1",
            }}
            onMouseEnter={(e) => {
              if (selectedImageId !== img.id) {
                e.currentTarget.style.boxShadow =
                  "0 0 0 1px var(--border), 0 4px 16px var(--card-shadow)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }
            }}
            onMouseLeave={(e) => {
              if (selectedImageId !== img.id) {
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "translateY(0)";
              }
            }}
          >
            <img
              src={getImageFileUrl(img.id)}
              alt={`Step ${img.step}`}
              className="w-full h-full object-cover"
              style={{ background: "var(--sand)" }}
              loading="lazy"
            />
            <div
              className="absolute bottom-0 left-0 right-0 px-3 pt-6 pb-2.5"
              style={{
                background: "linear-gradient(to top, rgba(20,20,19,0.65), transparent)",
                color: "#faf9f5",
              }}
            >
              <div
                className="font-medium"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.03em",
                  opacity: 0.9,
                }}
              >
                Step {img.step}
              </div>
              <div
                className="truncate mt-0.5"
                style={{ fontSize: 11.5, opacity: 0.75 }}
              >
                {img.prompt}
              </div>
            </div>
          </div>
        ))}

        {isGenerating && (
          <div
            className="flex items-center justify-center"
            style={{
              borderRadius: "var(--radius-md)",
              border: "2px dashed var(--accent)",
              background: "var(--surface)",
              aspectRatio: "1",
            }}
          >
            {partialImage ? (
              <div className="relative w-full h-full">
                <img
                  src={partialImage}
                  alt="Generating..."
                  className="w-full h-full object-cover animate-pulse"
                />
                <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}>
                  <span className="text-white text-sm font-medium">Generating...</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3" style={{ color: "var(--muted)" }}>
                <div
                  className="rounded-full animate-spin"
                  style={{
                    width: 32,
                    height: 32,
                    border: "2.5px solid var(--border)",
                    borderTopColor: "var(--accent)",
                  }}
                />
                <div className="text-xs" style={{ color: "var(--faint)" }}>Generating...</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证渲染**

在浏览器中确认：
1. 卡片背景为白色（亮色）/ 暗色（暗色）
2. 选中态为赤陶色 ring
3. 空状态显示图标 + 标题
4. Grid 间距和卡片大小正确

- [ ] **Step 3: 提交**

```bash
cd D:/CODE/Project/OpenImage
git add frontend/src/components/Gallery.tsx
git commit -m "feat: Gallery 更新为 Claude 暖色调设计

卡片使用 CSS 变量控制颜色，选中态改为赤陶色 ring。
空状态新增图标和 Playfair Display 标题。
生成中卡片使用虚线边框 + 赤陶色 spinner。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: DetailPanel 更新

**Files:**
- Modify: `frontend/src/components/DetailPanel.tsx`

- [ ] **Step 1: 重写 DetailPanel 组件**

将 `frontend/src/components/DetailPanel.tsx` 完整替换为：

```tsx
import { useSessionStore } from "../stores/sessionStore";
import { useGenerationStore } from "../stores/generationStore";
import { getImageFileUrl } from "../services/api";

export default function DetailPanel() {
  const { images, selectedImageId } = useSessionStore();
  const { setPendingForkFrom } = useGenerationStore();

  const selectedImage = images.find((img) => img.id === selectedImageId);

  if (!selectedImage) {
    return (
      <div
        className="flex items-center justify-center border-l"
        style={{
          width: "var(--detail-w)",
          minWidth: "var(--detail-w)",
          background: "var(--surface)",
          borderColor: "var(--border)",
          color: "var(--faint)",
          fontSize: 13,
        }}
      >
        Select an image
      </div>
    );
  }

  const handleSave = async () => {
    const url = getImageFileUrl(selectedImage.id);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openimage_step${selectedImage.step}.png`;
    a.click();
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(selectedImage.prompt);
  };

  const handleFork = () => {
    setPendingForkFrom(selectedImage.id);
  };

  return (
    <div
      className="flex flex-col h-full overflow-y-auto border-l"
      style={{
        width: "var(--detail-w)",
        minWidth: "var(--detail-w)",
        background: "var(--surface)",
        borderColor: "var(--border)",
        transition: "background 0.3s, border-color 0.3s",
      }}
    >
      {/* Preview */}
      <div className="p-4 border-b" style={{ borderColor: "var(--border-s)" }}>
        <img
          src={getImageFileUrl(selectedImage.id)}
          alt={`Step ${selectedImage.step}`}
          className="w-full rounded-xl"
          style={{ background: "var(--sand)" }}
        />
      </div>

      {/* Metadata */}
      <div className="p-4 flex flex-col gap-3.5 flex-1">
        <div>
          <div
            className="mb-1"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--faint)",
            }}
          >
            Step
          </div>
          <div className="text-[13px]" style={{ color: "var(--fg)" }}>
            {selectedImage.step}
          </div>
        </div>

        <div>
          <div
            className="mb-1"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--faint)",
            }}
          >
            Prompt
          </div>
          <div className="text-[13px] leading-relaxed" style={{ color: "var(--muted)" }}>
            {selectedImage.prompt}
          </div>
        </div>

        {selectedImage.revised_prompt && (
          <div>
            <div
              className="mb-1"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--faint)",
              }}
            >
              Revised Prompt
            </div>
            <div className="text-[13px] leading-relaxed italic" style={{ color: "var(--muted)" }}>
              {selectedImage.revised_prompt}
            </div>
          </div>
        )}

        <div className="flex gap-4">
          {[
            { label: "Size", value: selectedImage.size },
            { label: "Quality", value: selectedImage.quality },
            { label: "Format", value: selectedImage.output_format },
          ].map(({ label, value }) => (
            <div key={label} className="flex-1">
              <div
                className="mb-1"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--faint)",
                }}
              >
                {label}
              </div>
              <div className="text-[13px]" style={{ color: "var(--fg)" }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        <div>
          <div
            className="mb-1"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--faint)",
            }}
          >
            Created
          </div>
          <div className="text-[13px]" style={{ color: "var(--fg)" }}>
            {new Date(selectedImage.created_at).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t flex flex-col gap-2 mt-auto" style={{ borderColor: "var(--border-s)" }}>
        <button
          onClick={handleSave}
          className="w-full py-2 px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border-none"
          style={{ background: "var(--accent)", color: "#faf9f5" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-h)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          Save Image
        </button>
        <button
          onClick={handleCopyPrompt}
          className="w-full py-2 px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border"
          style={{ background: "var(--sand)", color: "var(--fg)", borderColor: "var(--border)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--border)";
            e.currentTarget.style.boxShadow = "0 1px 4px var(--card-shadow)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--sand)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          Copy Prompt
        </button>
        <button
          onClick={handleFork}
          className="w-full py-2 px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border"
          style={{ background: "var(--sand)", color: "var(--accent)", borderColor: "var(--border)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--border)";
            e.currentTarget.style.boxShadow = "0 1px 4px var(--card-shadow)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--sand)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          Fork from Here
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证渲染**

在浏览器中选中一张图片，确认：
1. 宽度为 310px
2. 背景色为 surface 色
3. 元数据标签为 mono 字体、大写
4. 按钮样式正确（赤陶色 primary、sand 色 secondary、赤陶文字 fork）

- [ ] **Step 3: 提交**

```bash
cd D:/CODE/Project/OpenImage
git add frontend/src/components/DetailPanel.tsx
git commit -m "feat: DetailPanel 更新为 Claude 暖色调设计

宽度扩展至 310px，使用 CSS 变量控制所有颜色。
元数据标签使用 JetBrains Mono 等宽字体。
按钮风格更新：赤陶色 Save、sand 色 Copy、赤陶文字 Fork。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: InputArea 更新

**Files:**
- Modify: `frontend/src/components/InputArea.tsx`

- [ ] **Step 1: 重写 InputArea 组件**

将 `frontend/src/components/InputArea.tsx` 完整替换为：

```tsx
import { useState, useRef, useCallback } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { useGenerationStore } from "../stores/generationStore";
import type { AttachedFile } from "../types";

interface InputAreaProps {
  onOpenSettings?: () => void;
}

export default function InputArea({ onOpenSettings }: InputAreaProps) {
  const { activeSessionId } = useSessionStore();
  const {
    isGenerating,
    attachments,
    error,
    addAttachment,
    removeAttachment,
    startGeneration,
    cancelGeneration,
    clearAttachments,
    clearError,
    pendingForkFrom,
    setPendingForkFrom,
  } = useGenerationStore();

  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAttach = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;

        const data = await fileToBase64(file);
        const attachment: AttachedFile = {
          id: crypto.randomUUID(),
          name: file.name,
          data,
          media_type: file.type,
          preview_url: `data:${file.type};base64,${data}`,
        };
        addAttachment(attachment);
      }
      e.target.value = "";
    },
    [addAttachment]
  );

  const handleGenerate = () => {
    if (!activeSessionId || !prompt.trim() || isGenerating) return;
    startGeneration(
      activeSessionId,
      prompt.trim(),
      pendingForkFrom || undefined,
      () => {
        setPrompt("");
        clearAttachments();
        setPendingForkFrom(null);
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleTextareaInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 100) + "px";
    }
  };

  return (
    <div
      className="border-t flex flex-col gap-2"
      style={{
        background: "var(--bg)",
        borderColor: "var(--border)",
        padding: "12px 20px 14px",
        transition: "background 0.3s, border-color 0.3s",
      }}
    >
      {/* Error bar */}
      {error && (
        <div
          className="flex items-center justify-between px-3 py-2 rounded-lg"
          style={{
            background: "rgba(181,51,51,0.08)",
            border: "1px solid rgba(181,51,51,0.2)",
          }}
        >
          <span className="text-sm" style={{ color: "var(--error)" }}>{error}</span>
          <button onClick={clearError} className="cursor-pointer text-sm" style={{ color: "var(--error)" }}>
            x
          </button>
        </div>
      )}

      {/* Fork bar */}
      {pendingForkFrom && (
        <div
          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs"
          style={{
            background: "rgba(201,100,66,0.08)",
            border: "1px solid rgba(201,100,66,0.15)",
            color: "var(--accent)",
          }}
        >
          <span>Forking from {pendingForkFrom.slice(0, 16)}...</span>
          <button
            onClick={() => setPendingForkFrom(null)}
            className="cursor-pointer text-xs"
            style={{ color: "var(--accent)" }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Attachment strip */}
      {attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="relative flex-shrink-0 overflow-hidden border group"
              style={{
                width: 52,
                height: 52,
                borderRadius: "var(--radius-sm)",
                borderColor: "var(--border)",
                background: "var(--sand)",
              }}
            >
              <img src={att.preview_url} alt={att.name} className="w-full h-full object-cover" />
              <button
                onClick={() => removeAttachment(att.id)}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                style={{
                  background: "rgba(20,20,19,0.6)",
                  fontSize: 10,
                }}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tools row */}
      <div className="flex gap-1 pb-0.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={handleAttach}
          disabled={isGenerating}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors disabled:opacity-50 cursor-pointer"
          style={{ color: "var(--muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--sand)";
            e.currentTarget.style.color = "var(--fg)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "none";
            e.currentTarget.style.color = "var(--muted)";
          }}
          title="Attach image"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
          Attach
        </button>
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer"
          style={{ color: "var(--muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--sand)";
            e.currentTarget.style.color = "var(--fg)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "none";
            e.currentTarget.style.color = "var(--muted)";
          }}
          title="Settings"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Settings
        </button>
        <span className="flex-1" />
        <span className="text-[11px] leading-6" style={{ color: "var(--faint)" }}>
          Ctrl+Enter to send
        </span>
      </div>

      {/* Input row */}
      <div className="flex gap-2 items-end">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleTextareaInput}
            placeholder={
              activeSessionId
                ? "Describe the image you want to generate..."
                : "Select or create a session first"
            }
            disabled={!activeSessionId}
            rows={1}
            className="w-full border outline-none resize-none transition-all"
            style={{
              padding: "9px 14px",
              background: "var(--input-bg)",
              borderColor: "var(--border)",
              borderRadius: "var(--radius-md)",
              color: "var(--fg)",
              fontSize: "13.5px",
              lineHeight: 1.5,
              minHeight: "40px",
              maxHeight: "100px",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.boxShadow = "0 0 0 2px rgba(201,100,66,0.1)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
        </div>

        {isGenerating ? (
          <button
            onClick={cancelGeneration}
            className="rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors cursor-pointer"
            style={{
              padding: "9px 18px",
              background: "rgba(181,51,51,0.08)",
              color: "var(--error)",
              border: "1px solid rgba(181,51,51,0.2)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(181,51,51,0.14)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(181,51,51,0.08)")}
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={!activeSessionId || !prompt.trim()}
            className="rounded-lg text-[13px] font-medium whitespace-nowrap transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              padding: "9px 22px",
              background: "var(--accent)",
              color: "#faf9f5",
            }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.background = "var(--accent-h)";
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(201,100,66,0.2)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--accent)";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            Generate
          </button>
        )}
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

- [ ] **Step 2: 验证编译和渲染**

Run: `cd D:/CODE/Project/OpenImage/frontend && npx tsc --noEmit`

确认无类型错误。在浏览器中检查：
1. 文本框为白色/暗色背景，聚焦时赤陶色边框
2. Generate 按钮为赤陶色
3. 工具栏显示 Attach + Settings + Ctrl+Enter 提示
4. Settings 按钮点击后弹出设置弹窗

- [ ] **Step 3: 提交**

```bash
cd D:/CODE/Project/OpenImage
git add frontend/src/components/InputArea.tsx
git commit -m "feat: InputArea 更新为 Claude 暖色调设计

所有颜色使用 CSS 变量。附件条改为水平滚动 52px 缩略图。
Fork 栏使用赤陶半透明背景。工具栏独立一行显示图标按钮。
Generate 按钮改为赤陶色，Cancel 按钮使用红色半透明背景。
SettingsDialog 提取为独立组件，通过 onOpenSettings prop 触发。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: 最终验证 & 清理

**Files:**
- 可能需要微调的文件

- [ ] **Step 1: 完整编译检查**

Run: `cd D:/CODE/Project/OpenImage/frontend && npm run build`

确认生产构建无错误。

- [ ] **Step 2: 浏览器端到端测试**

启动后端和前端开发服务器：
- 后端：`cd D:/CODE/Project/OpenImage/backend && python -m src.cli serve`
- 前端：`cd D:/CODE/Project/OpenImage/frontend && npm run dev`

在浏览器中测试以下流程：
1. 页面加载 → 亮色主题，暖色调背景
2. 点击主题切换 → 切换到暗色 → 再切换回亮色
3. 刷新页面 → 主题保持上次选择
4. 创建新会话 → Sidebar 显示新会话
5. 输入 prompt → Generate → 图片生成 → Gallery 显示卡片
6. 点击图片 → DetailPanel 显示详情
7. 右键会话 → Rename/Delete
8. 搜索框过滤会话
9. 点击设置按钮 → 弹出设置弹窗

- [ ] **Step 3: 修复发现的问题**

根据测试结果修复任何视觉或功能问题。

- [ ] **Step 4: 最终提交**

```bash
cd D:/CODE/Project/OpenImage
git add -A
git commit -m "fix: 前端迁移最终修复和清理

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## 自审结果

### Spec 覆盖率
- [x] CSS 变量系统（Task 1）→ globals.css + useTheme hook
- [x] 主题切换（Task 1, 3）→ useTheme + Topbar toggle
- [x] Topbar 组件（Task 3）→ 完整实现
- [x] Sidebar 重构（Task 6）→ wordmark + search + thumbnails
- [x] Gallery 更新（Task 7）→ 暖色卡片 + 空状态
- [x] DetailPanel 更新（Task 8）→ 暖色风格 + 按钮
- [x] InputArea 更新（Task 9）→ 附件条 + fork 栏 + 工具栏
- [x] Context Menu → 在 Sidebar 中实现
- [x] SettingsDialog 提取（Task 4）→ 独立共享组件
- [x] 后端 Session image_count（Task 2）

### Placeholder 扫描
无 TBD/TODO/类似 pattern。

### 类型一致性
- `Session.image_count` 和 `Session.latest_image_id` 在 Task 2 定义，Task 6 使用
- `InputArea` 的 `onOpenSettings` prop 在 Task 5 传入，Task 9 定义
- `useTheme` hook 在 Task 1 定义，Task 3 使用
- `SettingsDialog` 在 Task 4 定义，Task 5 使用
