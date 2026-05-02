# Toast 通知系统设计

## 背景

当前保存图片操作（DetailPanel 中的「保存图片」和「保存全部」）使用 `<a download>` 触发浏览器原生下载，没有任何视觉反馈。用户无法确认操作是否成功。

## 目标

添加底部气泡提示（Toast），在保存图片后显示确认信息。

## 需求

- 单张保存：显示「已保存图片 xxx.png」
- 批量保存：显示「已保存 N 张图片」（合并为一条提示）
- Web / Desktop 统一行为，仅显示文件名
- Toast 位于屏幕底部居中，自动 3 秒消失
- 点击可关闭

## 架构

### 新增文件

| 文件 | 职责 |
|------|------|
| `frontend/src/stores/toastStore.ts` | Zustand store，管理通知队列 |
| `frontend/src/components/Toast.tsx` | Toast 容器 + 单条 Toast 组件 |

### toastStore

```ts
interface Toast {
  id: string;
  message: string;
}
```

暴露方法：
- `showToast(message: string, duration?: number)` — 推入通知，默认 3s 后自动移除。新 toast 替换旧的（队列上限 1 条）。
- `dismissToast(id: string)` — 手动关闭。

### Toast 组件

- `<ToastContainer>` 在 `App.tsx` 根层级渲染
- `position: fixed`，底部居中，距底部 24px
- 读取 toastStore 的通知队列并渲染

### 集成点

- `DetailPanel.tsx` 的 `handleSave()` → `showToast(t("toast.imageSaved", { name }))`
- `DetailPanel.tsx` 的 `handleSaveAll()` → `showToast(t("toast.imagesSaved", { count }))`

## 样式

- 背景：`rgba(0,0,0,0.75)`，圆角 `8px`，内边距 `16px`
- 文字：白色，`14px`，最大宽度 `400px`，超出省略
- 不依赖 CSS 变量 — 深色半透明背景在浅色/深色主题下均适用

### 动画

- 进入：从底部滑入 + 淡入（`translateY(20px) → 0`，`opacity 0 → 1`，200ms）
- 退出：淡出（`opacity 1 → 0`，150ms）
- 使用 CSS `transition` + React 状态切换实现

## i18n

| Key | 中文 | English |
|-----|------|---------|
| `toast.imageSaved` | 已保存图片 {{name}} | Image saved: {{name}} |
| `toast.imagesSaved` | 已保存 {{count}} 张图片 | {{count}} images saved |

## 不做什么

- 不引入第三方 toast 库
- 不支持多条堆叠（上限 1 条，新 toast 替换旧的）
- 不在 Desktop 端改用 Tauri 另存为对话框（保持 `<a download>` 行为统一）
- 不添加关闭按钮、进度条等复杂 UI
