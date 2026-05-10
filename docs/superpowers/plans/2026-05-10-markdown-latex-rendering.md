# AI 聊天消息 Markdown + LaTeX 渲染 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AI 助手聊天消息从纯文本渲染升级为 Markdown + LaTeX 格式化渲染，支持 GFM 语法、代码高亮和 KaTeX 数学公式。

**Architecture:** 在 `ChatMessage.tsx` 中引入 `react-markdown` 作为 Markdown 解析器，配合 `remark-gfm` 支持 GFM 扩展语法（表格、删除线、任务列表），使用 `rehype-katex` + `katex` 处理 LaTeX 数学公式。创建一个 `MarkdownRenderer` 组件封装所有渲染逻辑和样式，通过 CSS 变量与项目设计系统对齐。流式输出期间保持纯文本渲染（避免 Markdown 不完整时的闪烁），流式结束后切换到 Markdown 渲染。

**Tech Stack:** react-markdown ^9, remark-gfm ^4, rehype-katex ^7, katex ^0.16, react-syntax-highlighter ^15 (代码块语法高亮)

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 新建 | `frontend/src/components/ChatPanel/MarkdownRenderer.tsx` | Markdown + LaTeX 渲染组件（核心） |
| 新建 | `frontend/src/components/ChatPanel/MarkdownRenderer.css` | Markdown 内容样式（与 CSS 变量对齐） |
| 修改 | `frontend/src/components/ChatPanel/ChatMessage.tsx` | 接入 MarkdownRenderer，区分流式/完成态 |
| 修改 | `frontend/src/styles/globals.css` | 导入 KaTeX CSS（仅一行 @import） |
| 修改 | `frontend/package.json` | 新增 5 个依赖 |

---

### Task 1: 安装依赖

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: 安装 react-markdown 及相关插件**

```bash
cd frontend
npm install react-markdown remark-gfm rehype-katex katex react-syntax-highlighter
npm install -D @types/react-syntax-highlighter
```

- [ ] **Step 2: 验证安装成功**

```bash
npm ls react-markdown remark-gfm rehype-katex katex react-syntax-highlighter
```

Expected: 所有包版本正常显示，无 peer dependency 错误。

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "feat: 添加 Markdown/LaTeX 渲染依赖

- react-markdown: Markdown 解析器
- remark-gfm: GFM 扩展语法（表格、删除线、任务列表）
- rehype-katex + katex: LaTeX 数学公式渲染
- react-syntax-highlighter: 代码块语法高亮"
```

---

### Task 2: 创建 MarkdownRenderer 组件

**Files:**
- Create: `frontend/src/components/ChatPanel/MarkdownRenderer.tsx`

此组件是核心渲染器，负责将 Markdown 文本解析为格式化 React 元素。设计要点：

1. **组件接口** — 接收 `content: string`，返回格式化的 JSX
2. **LaTeX 分隔符支持** — 将 `$...$` 转为行内公式，`$$...$$` 转为块级公式，再交给 remark-math/rehype-katex 处理
3. **代码块高亮** — 使用 react-syntax-highlighter 的 `Prism` 轻量模式
4. **样式与设计系统对齐** — 通过 CSS 变量引用 `--fg`, `--muted`, `--border` 等，不做硬编码颜色

- [ ] **Step 1: 创建 MarkdownRenderer.tsx**

```tsx
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import "./MarkdownRenderer.css";

interface Props {
  content: string;
}

/** 提取 lang 和是否内联，从 className 如 "language-python" */
function parseLang(className?: string): string {
  const match = (className || "").match(/language-(\w+)/);
  return match ? match[1] : "text";
}

export default function MarkdownRenderer({ content }: Props) {
  return (
    <div className="md-renderer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ className, children, ...props }) {
            const codeStr = String(children).replace(/\n$/, "");
            // 含 className 的 <code> 来自 fenced code block
            if (className) {
              const lang = parseLang(className);
              return (
                <SyntaxHighlighter
                  style={oneDark}
                  language={lang}
                  PreTag="div"
                  className="md-code-block"
                  customStyle={{
                    margin: 0,
                    borderRadius: "var(--radius-sm)",
                    fontSize: 12,
                    padding: "10px 12px",
                  }}
                >
                  {codeStr}
                </SyntaxHighlighter>
              );
            }
            // 行内 code
            return (
              <code className="md-code-inline" {...props}>
                {children}
              </code>
            );
          },
          // 表格样式由 CSS 类控制，无需额外组件
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)", textDecoration: "underline" }}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ChatPanel/MarkdownRenderer.tsx
git commit -m "feat: 创建 MarkdownRenderer 组件

- react-markdown + remark-gfm + remark-math + rehype-katex 管线
- fenced code block 使用 react-syntax-highlighter 语法高亮
- 行内 code 使用自定义 CSS 类
- 链接新窗口打开，使用 accent 色"
```

---

### Task 3: 创建 Markdown 样式文件

**Files:**
- Create: `frontend/src/components/ChatPanel/MarkdownRenderer.css`

样式必须与项目设计系统（`globals.css` CSS 变量）对齐，使用 `--fg`、`--muted`、`--border` 等变量，确保深浅主题自动适配。

- [ ] **Step 1: 创建 MarkdownRenderer.css**

```css
/* ── Markdown 渲染器样式 ── */

.md-renderer {
  line-height: 1.6;
  word-break: break-word;
}

/* 段落 */
.md-renderer p {
  margin: 0 0 0.5em;
}
.md-renderer p:last-child {
  margin-bottom: 0;
}

/* 标题 — 使用 serif display 字体，遵循 DESIGN.md */
.md-renderer h1,
.md-renderer h2,
.md-renderer h3,
.md-renderer h4 {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--fg);
  margin: 0.8em 0 0.3em;
  line-height: 1.3;
}
.md-renderer h1 { font-size: 1.3em; }
.md-renderer h2 { font-size: 1.15em; }
.md-renderer h3 { font-size: 1.05em; }
.md-renderer h4 { font-size: 1em; }
.md-renderer h1:first-child,
.md-renderer h2:first-child,
.md-renderer h3:first-child {
  margin-top: 0;
}

/* 列表 */
.md-renderer ul,
.md-renderer ol {
  margin: 0.3em 0;
  padding-left: 1.5em;
}
.md-renderer li {
  margin: 0.15em 0;
}
.md-renderer li > p {
  margin: 0;
}

/* 引用块 */
.md-renderer blockquote {
  margin: 0.5em 0;
  padding: 0.3em 0.8em;
  border-left: 3px solid var(--accent);
  background: rgba(201, 100, 66, 0.05);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--muted);
}
.md-renderer blockquote p:last-child {
  margin-bottom: 0;
}

/* 分隔线 */
.md-renderer hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 0.8em 0;
}

/* 行内代码 */
.md-code-inline {
  background: var(--sand);
  color: var(--fg);
  padding: 0.1em 0.35em;
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 0.9em;
}

/* 代码块容器 */
.md-code-block {
  margin: 0.5em 0 !important;
}

/* 表格 */
.md-renderer table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.5em 0;
  font-size: 0.95em;
}
.md-renderer th,
.md-renderer td {
  border: 1px solid var(--border);
  padding: 4px 8px;
  text-align: left;
}
.md-renderer th {
  background: var(--sand);
  font-weight: 600;
  color: var(--fg);
}

/* 粗体 / 斜体 */
.md-renderer strong {
  font-weight: 600;
  color: var(--fg);
}
.md-renderer em {
  font-style: italic;
}

/* 删除线 */
.md-renderer del {
  opacity: 0.6;
}

/* 任务列表 checkbox */
.md-renderer input[type="checkbox"] {
  margin-right: 0.3em;
  accent-color: var(--accent);
}

/* 图片（AI 回复中的图片引用） */
.md-renderer img {
  max-width: 100%;
  border-radius: var(--radius-sm);
}

/* KaTeX 块级公式居中 */
.katex-display {
  margin: 0.5em 0;
  overflow-x: auto;
  overflow-y: hidden;
}

/* KaTeX 行内公式 */
.katex {
  font-size: 1em;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ChatPanel/MarkdownRenderer.css
git commit -m "feat: 添加 Markdown 渲染样式

- 使用 CSS 变量对齐设计系统，深浅主题自动适配
- 标题使用 serif display 字体
- 引用块使用 accent 左边框
- 表格、列表、代码块等完整样式覆盖"
```

---

### Task 4: 导入 KaTeX CSS

**Files:**
- Modify: `frontend/src/styles/globals.css`

KaTeX 需要其自带的 CSS 来正确渲染数学公式符号和布局。只需在 `globals.css` 顶部添加一行 `@import`。

- [ ] **Step 1: 在 globals.css 的第一行 Google Fonts 导入之后添加 KaTeX CSS 导入**

在 `frontend/src/styles/globals.css` 文件中，在第 1 行（`@import url(...)` Google Fonts）之后、`@import "tailwindcss";` 之前，插入：

```css
@import url('https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css');
```

最终文件头部应为：
```css
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap&font-display=swap');
@import url('https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css');
@import "tailwindcss";
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/styles/globals.css
git commit -m "feat: 导入 KaTeX CSS 以支持数学公式渲染"
```

---

### Task 5: 修改 ChatMessage 接入 MarkdownRenderer

**Files:**
- Modify: `frontend/src/components/ChatPanel/ChatMessage.tsx`

核心修改：将第 114 行的 `{displayText}` 纯文本渲染替换为条件渲染 — **流式阶段保持纯文本**（避免 Markdown 不完整时闪烁），**流式结束后切换到 MarkdownRenderer**。

用户消息（`isUser`）保持纯文本，仅 AI 消息使用 Markdown 渲染。

- [ ] **Step 1: 在 ChatMessage.tsx 顶部添加 import**

在文件第 3 行后添加：
```tsx
import MarkdownRenderer from "./MarkdownRenderer";
```

- [ ] **Step 2: 替换消息正文渲染逻辑**

将第 102-136 行的 `{showBody && (...)}` 块替换为：

```tsx
        {showBody && (
          <div
            style={{
              padding: "6px 10px",
              borderRadius: isUser ? "10px 10px 2px 10px" : "2px 10px 10px 10px",
              background: isUser ? "var(--accent)" : "var(--card-bg)",
              color: isUser ? "#fff" : "var(--fg)",
              border: isUser ? "none" : "1px solid var(--border)",
              lineHeight: 1.5,
              fontSize: 13,
            }}
          >
            {isUser || isStreaming ? displayText : <MarkdownRenderer content={displayText} />}
            {isStreaming && (
              <span className="animate-pulse" style={{ marginLeft: 1 }}>▊</span>
            )}
            {isInterrupted && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 6,
                  paddingTop: 6,
                  borderTop: "1px solid var(--border-s)",
                  fontSize: 10,
                  color: "var(--faint)",
                }}
              >
                <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--warning, #d4a017)" }} />
                {t("llm.interrupted")}
              </div>
            )}
          </div>
        )}
```

关键变更说明：
- `isUser || isStreaming ? displayText` — 用户消息和流式中的 AI 消息保持纯文本
- `: <MarkdownRenderer content={displayText} />` — 流式完成后的 AI 消息使用 Markdown 渲染
- 流式光标 `▊` 和中断标记逻辑不变

- [ ] **Step 3: 验证编译通过**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ChatPanel/ChatMessage.tsx
git commit -m "feat: ChatMessage 接入 MarkdownRenderer

- AI 完成消息使用 Markdown + LaTeX 渲染
- 流式输出和用户消息保持纯文本
- 避免 Markdown 不完整时的渲染闪烁"
```

---

### Task 6: 安装 remark-math 并验证完整管线

**Files:**
- Modify: `frontend/package.json`

在 Task 2 的 MarkdownRenderer 中使用了 `remark-math` 插件来解析 `$...$` 和 `$$...$$` LaTeX 语法。需要安装此依赖。

- [ ] **Step 1: 安装 remark-math**

```bash
cd frontend
npm install remark-math
```

- [ ] **Step 2: 验证完整依赖链**

```bash
npm ls react-markdown remark-gfm remark-math rehype-katex katex react-syntax-highlighter
```

Expected: 所有包正常

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "feat: 添加 remark-math 依赖用于 LaTeX 语法解析"
```

---

### Task 7: 端到端验证

**Files:**
- 无文件修改

- [ ] **Step 1: 启动开发环境**

```bash
# 终端 1: 启动后端
cd backend && python -m src.cli serve

# 终端 2: 启动前端
cd frontend && npm run dev
```

- [ ] **Step 2: 手动验证以下场景**

在 AI 聊天面板中发送消息（或查看历史消息），验证：

1. **基本 Markdown** — 标题（`#`）、粗体（`**bold**`）、斜体（`*italic*`）、删除线（`~~strike~~`）正确渲染
2. **列表** — 无序列表（`-`）、有序列表（`1.`）、嵌套列表正确缩进
3. **代码块** — fenced code block 带语法高亮，行内 code 有背景色
4. **引用块** — `>` 引用有左侧 accent 色边框
5. **表格** — GFM 表格正确渲染边框和对齐
6. **LaTeX 行内** — `$E=mc^2$` 渲染为上标公式
7. **LaTeX 块级** — `$$\int_0^1 f(x)dx$$` 居中渲染
8. **流式输出** — AI 流式回复期间显示纯文本 + 光标动画，完成后切换为 Markdown
9. **用户消息** — 保持纯文本不变
10. **深浅主题** — 切换主题后 Markdown 样式跟随变化
11. **ThinkingCard** — 思考链内容不受影响，仍为纯文本

- [ ] **Step 3: 记录验证结果，如有问题修复后提交**

---

## 自审清单

### 1. Spec 覆盖
| 需求 | 对应 Task |
|------|-----------|
| Markdown 基础语法 | Task 2 (react-markdown) |
| GFM 扩展（表格、删除线、任务列表） | Task 2 (remark-gfm) |
| 代码块语法高亮 | Task 2 (react-syntax-highlighter) |
| LaTeX 行内公式 `$...$` | Task 2 + Task 6 (remark-math + rehype-katex) |
| LaTeX 块级公式 `$$...$$` | Task 2 + Task 6 (remark-math + rehype-katex) |
| 与设计系统对齐 | Task 3 (CSS 变量) |
| 流式输出兼容 | Task 5 (条件渲染) |
| 用户消息不受影响 | Task 5 (isUser 判断) |
| 深浅主题适配 | Task 3 (CSS 变量) |

### 2. Placeholder 扫描
无 TBD / TODO / "implement later" / "add appropriate error handling" 等占位符。所有代码步骤包含完整实现。

### 3. 类型一致性
- `MarkdownRenderer` 组件接收 `content: string`，与 `displayText`（string）一致
- `ChatMessage` 的 props 接口未变更
- `react-markdown` v9 的 `components` 回调签名与代码中解构方式一致
