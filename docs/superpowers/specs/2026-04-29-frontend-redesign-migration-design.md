# 前端样式迁移设计：Claude 暖色调设计系统

**日期**：2026-04-29
**参考文件**：`references/index.html`
**状态**：已审批

## 概述

将现有前端从深蓝色 Tailwind 内联样式迁移为参考文件（`references/index.html`）中的 Claude 暖色调设计系统。迁移范围包括视觉风格 + 新功能组件。

### 决策记录

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 迁移范围 | 完整迁移（样式 + 新功能） | 参考文件设计完整，部分迁移会导致不一致 |
| CSS 架构 | Tailwind + CSS 变量 | 保留 Tailwind 布局能力，通过变量实现主题切换 |
| 默认主题 | 亮色 | 参考文件默认亮色，符合 Claude 官网风格 |
| Session 图标 | 真实缩略图 | 视觉区分度更高 |
| 迁移策略 | 基础先行 | 先搭建变量系统，再逐个更新组件 |

---

## 1. CSS 变量系统 & 主题基础设施

### 变量体系

在 `globals.css` 中定义两套变量（亮色/暗色），通过 `[data-theme="dark"]` 覆盖：

#### 颜色变量

| 变量 | 亮色值 | 暗色值 | 用途 |
|------|--------|--------|------|
| `--bg` | `#f5f4ed` | `#141413` | 主背景 |
| `--surface` | `#faf9f5` | `#1e1d1b` | 表面/卡片层 |
| `--fg` | `#141413` | `#faf9f5` | 主文字 |
| `--muted` | `#5e5d59` | `#b0aea5` | 次要文字 |
| `--faint` | `#87867f` | `#87867f` | 弱文字/placeholder |
| `--border` | `#e8e6dc` | `#30302e` | 边框 |
| `--border-s` | `#f0eee6` | `#252422` | 轻边框 |
| `--accent` | `#c96442` | `#d97757` | 强调色（赤陶） |
| `--accent-h` | `#b35537` | `#c96442` | 强调色 hover |
| `--sand` | `#e8e6dc` | `#2a2927` | 沙色背景（按钮/悬浮） |
| `--silver` | `#b0aea5` | `#5e5d59` | 银色 |
| `--ring` | `#d1cfc5` | `#4d4c48` | 焦点环 |
| `--input-bg` | `#ffffff` | `#1e1d1b` | 输入框背景 |
| `--sidebar-bg` | `#ebe8de` | `#1a1918` | 侧边栏背景 |
| `--card-bg` | `#ffffff` | `#1e1d1b` | 卡片背景 |
| `--card-shadow` | `rgba(0,0,0,0.04)` | `rgba(0,0,0,0.2)` | 卡片阴影 |
| `--overlay` | `rgba(20,20,19,0.5)` | `rgba(0,0,0,0.7)` | 遮罩层 |
| `--error` | `#b53333` | `#e05555` | 错误色 |
| `--info` | `#3898ec` | `#5aabf0` | 信息色 |
| `--success` | `#4a7c59` | `#6aad7a` | 成功色 |

#### 字体变量

| 变量 | 值 | 用途 |
|------|----|------|
| `--font-display` | `'Playfair Display', Georgia, serif` | 标题、wordmark |
| `--font-body` | `system-ui, -apple-system, sans-serif` | 正文 |
| `--font-mono` | `'JetBrains Mono', ui-monospace, monospace` | 元数据标签 |

#### 布局变量

| 变量 | 值 | 用途 |
|------|----|------|
| `--radius-sm` | `8px` | 小圆角（按钮、输入框） |
| `--radius-md` | `12px` | 中圆角（卡片、文本框） |
| `--radius-lg` | `16px` | 大圆角 |
| `--radius-xl` | `24px` | 超大圆角（空状态图标） |
| `--sidebar-w` | `260px` | 侧边栏宽度 |
| `--detail-w` | `310px` | 详情面板宽度 |
| `--topbar-h` | `52px` | 标题栏高度 |

### 主题切换机制

- `<html>` 元素上通过 `data-theme="light"` / `data-theme="dark"` 控制主题
- 默认亮色（`data-theme="light"`）
- 用户选择存入 `localStorage`，key: `oi-theme`
- 创建 `hooks/useTheme.ts`：
  - `useTheme()` 返回 `{ theme, toggleTheme }`
  - 初始化时读取 localStorage，无值则默认 `light`
  - `toggleTheme()` 切换主题并持久化
- Tailwind 中通过 `bg-[var(--bg)]` 引用变量

### Google Fonts

- 保留现有 Playfair Display 导入
- 替换 Inter 为 system-ui（参考文件不加载 Inter）
- 新增 JetBrains Mono 导入（用于 mono 字体）

---

## 2. 布局结构 & Topbar

### 新布局（App.tsx）

```
┌──────────────────────────────────────────────────┐
│ [Sidebar 260px] │ [Main flex-1] │ [Detail 310px] │
│                 │ ┌── Topbar ──┐ │                │
│  Wordmark       │ │ Title  ⚙ ◐│ │  Preview       │
│  + New Session  │ ├────────────┤ │  Metadata      │
│  Search         │ │            │ │  Actions       │
│  Sessions...    │ │  Gallery   │ │                │
│                 │ │            │ │                │
│                 │ ├────────────┤ │                │
│                 │ │ Input Area │ │                │
│                 │ └────────────┘ │                │
└──────────────────────────────────────────────────┘
```

**App.tsx 变更**：
- 根 div：`bg-[var(--bg)] text-[var(--fg)]`
- `<Sidebar />` | `<div className="flex-1 flex flex-col min-w-0">` 包含 Topbar + Gallery + InputArea | `<DetailPanel />`

### Topbar 组件（新增 `components/Topbar.tsx`）

- 高度 `var(--topbar-h)` (52px)
- 左侧：当前会话名称，Playfair Display 16px/600
- 右侧：
  - 设置按钮（34×34 图标按钮，齿轮 SVG）→ 打开 SettingsDialog
  - 主题切换开关（50×28 滑块，赤陶色圆点，暗色时右移 22px）
- 底部 `var(--border-s)` 边框
- 背景色跟随 `var(--bg)`

---

## 3. Sidebar 重构

### 结构变化

宽度 220px → 260px。新增三个区块：

1. **Sidebar Header**：
   - Wordmark：`Open`（前景色）+ `Image`（强调色），Playfair Display 22px/600
   - "New Session" 按钮：赤陶背景色，全宽

2. **Sidebar Search**：
   - 12.5px 字号输入框
   - placeholder: "搜索会话..."
   - 功能：过滤会话列表（前端过滤 session.name）
   - 聚焦时赤陶色边框 + 光晕

3. **Session List**：
   - 每个 session 项：32×32 缩略图 + 会话名 + 图片数量
   - 缩略图逻辑：调用后端获取会话最新图片，无图则显示 SVG 占位图标
   - 选中态：表面背景 + 边框 + 轻阴影（替代现有的左侧蓝色边框）
   - hover 态：沙色背景

### 交互保留

- 右键菜单（Rename/Delete）保持现有功能
- 行内编辑（Rename）保持
- 点击切换会话保持

### 所需后端支持

Session 列表需要返回每个会话的图片数量。检查现有 API `/api/sessions` 是否已包含此字段。如不包含，可能需要在 session 查询中添加 image count。

---

## 4. Gallery 更新

### 样式变化

- 卡片背景：`var(--card-bg)`，边框 `var(--border-s)`
- 选中态 ring：`var(--accent)`（赤陶色，替代蓝色）
- hover 态：边框 + 阴影 + 上浮 2px
- 底部渐变标签保持，颜色微调
- Grid 间距 12px → 16px，最小卡片宽度 180px → 200px
- 生成中卡片：2px 虚线边框 + 赤陶色 + 旋转 spinner

### 空状态

参考文件的 `gallery-empty`：
- 64×64 圆角图标容器（沙色背景 + 图片 SVG）
- Playfair Display 18px 标题
- 13px 描述文字

---

## 5. DetailPanel 更新

### 样式变化

- 宽度 280px → 310px
- 背景 `var(--surface)`，左边框 `var(--border)`
- 元数据标签：mono 字体 10px 大写，`var(--faint)` 颜色
- 元数据值：13px，`var(--fg)` 颜色

### 按钮风格

| 按钮 | 风格 | 颜色 |
|------|------|------|
| Save Image | primary | 赤陶背景 + 白文字 |
| Copy Prompt | default | sand 背景 + 前景文字 |
| Fork from Here | accent-text | sand 背景 + 赤陶文字 |

---

## 6. InputArea 更新

### 结构变化

- 附件条改为水平滚动（`overflow-x: auto`），52×52 缩略图
- Fork 栏：赤陶半透明背景（`rgba(201,100,66,0.08)`）+ 赤陶边框
- 工具栏：独立的 `input-tools` 行，小图标 + 文字按钮，右对齐快捷键提示
- 文本框：`var(--input-bg)` 背景，聚焦时赤陶色边框 + 光晕
- Generate 按钮：赤陶色，hover 上浮 + 阴影
- Cancel 按钮：红色半透明背景 + 红色边框

### 工具栏布局

```
[📎 Attach] [⚙ Settings]                    [Ctrl+Enter to send]
```

---

## 7. Context Menu 更新

- 背景 `var(--surface)`，边框 `var(--border)`
- 按钮悬浮：沙色背景
- 删除按钮：红色文字，悬浮时红色背景

---

## 文件变更清单

| 文件 | 变更类型 | 描述 |
|------|----------|------|
| `globals.css` | 重写 | CSS 变量系统 + 主题 + 基础样式 |
| `App.tsx` | 修改 | 新布局结构 + Topbar 集成 |
| `components/Topbar.tsx` | 新增 | 标题栏 + 主题切换 + 设置 |
| `components/Sidebar.tsx` | 重构 | wordmark + 搜索 + 缩略图 + 新样式 |
| `components/Gallery.tsx` | 修改 | 暖色卡片 + 空状态 |
| `components/DetailPanel.tsx` | 修改 | 暖色风格 + 按钮更新 |
| `components/InputArea.tsx` | 修改 | 附件条 + 工具栏 + 新样式 |
| `hooks/useTheme.ts` | 新增 | 主题切换 hook |

### SettingsDialog

SettingsDialog 从 InputArea 中提取到 Topbar 的设置按钮触发。InputArea 中的 Settings 按钮改为调用同一个回调（通过 prop 或 store 传递）。或者保持两处都能打开——InputArea 工具栏的 Settings 和 Topbar 的齿轮图标都触发同一个 dialog。

**推荐方案**：将 `showSettings` 状态提升到 App 或创建一个简单的 store/hook，让 Topbar 和 InputArea 都能打开 SettingsDialog。SettingsDialog 的视觉样式也需要同步更新为暖色调。
