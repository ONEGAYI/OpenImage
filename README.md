<p align="center">
  <img src="frontend/src-tauri/icons/128x128.png" alt="OpenImage" width="80" height="80" />
</p>

<h1 align="center">OpenImage</h1>

<p align="center">
  <strong>桌面端 AI 图片生成工具</strong> — 基于 GPT Image 模型，支持多步迭代编辑、多图参考和分支 Fork
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.5.0-blue" alt="version" />
  <img src="https://img.shields.io/badge/Python-3.12+-green" alt="python" />
  <img src="https://img.shields.io/badge/Tauri-2.x-orange" alt="tauri" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="license" />
</p>

<p align="center">
  <a href="README.en.md">English</a> | 中文
</p>

---

## 特性

### 图片生成

- **多步迭代编辑** — 基于上一步生成结果继续优化，支持分支 Fork 探索不同方向
- **三种 API 模式** — 兼容 OpenAI 直连（Responses API）、Images API 中转、Chat Completions 代理
- **多图参考** — 生成时附加参考图片，引导 AI 输出方向
- **局部重绘（Inpainting）** — Canvas 笔刷/矩形蒙版编辑器，支持缩放平移，可附加参考图

### AI 助手

- **内嵌式聊天助手** — 帮助优化提示词、提供图片生成建议
- **思考链可视化** — 展示 AI 推理过程，折叠/展开交互
- **结构化内容块** — XML 标签格式解析，支持代码块、建议列表等富文本
- **4 层系统提示词** — 身份 → 技能 → 上下文 → 摘要，自动组装
- **技能系统** — Markdown 文件定义技能指令，可扩展

### 桌面体验

- **跨平台** — Windows / macOS / Linux，Tauri 2.x 原生打包
- **双主题** — 暖色调浅色/深色主题，CSS 变量驱动
- **国际化** — 中文/英文双语，i18next 驱动
- **动态端口** — 运行时自动分配端口，零配置启动
- **轻量后端** — Python FastAPI + SQLite，PyInstaller 单文件打包为 sidecar

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.x（Rust） |
| 前端 | React 18 + TypeScript + Zustand + Tailwind CSS 4 |
| 后端 | Python 3.12 + FastAPI + aiosqlite |
| AI 模型 | OpenAI gpt-image-2（图片生成）、GPT 系列（AI 助手） |
| 打包 | PyInstaller（后端 sidecar）+ Tauri NSIS（安装包） |
| 构建 | Vite 6 + hatchling |

## 快速开始

### 环境要求

- Python 3.12+
- Node.js 18+
- Rust（Tauri 构建需要）
- 操作系统：Windows 10+ / macOS 12+ / Linux

### 一键启动开发环境

```bash
# Windows
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1

# macOS / Linux
bash scripts/dev.sh
```

脚本会自动启动后端服务和前端开发服务器，无需手动配置端口。

### 手动启动

```bash
# 后端
cd backend
pip install -e ".[dev]"
python -m src.cli serve

# 前端（新终端）
cd frontend
npm install
npm run dev
```

### 配置

启动后打开浏览器访问前端页面，点击右上角设置按钮：

1. **图片生成设置** — 填入 API Key、Base URL，选择 API 模式和模型
2. **AI 助手设置** — 填入 LLM API Key 和 Base URL（可与图片生成使用不同服务商）

也可以通过 CLI 配置：

```bash
cd backend
python -m src.cli config set api_key <your-key>
```

## 架构概览

```
┌─────────────────────────────────────────────────────┐
│                   Tauri 桌面壳 (Rust)               │
│    启动 sidecar → 健康检查 → 就绪信号 → 退出清理      │
├─────────────────────────────────────────────────────┤
│              React 前端 (Vite + TS)                 │
│   Sidebar │ Gallery │ DetailPanel │ ChatPanel       │
│   Zustand Stores │ i18n │ CSS Variables             │
├──────────────────────┬──────────────────────────────┤
│  FastAPI 后端        │  SSE 流式                     │
│  ├─ api/ 路由层      │  ├─ /api/generate            │
│  ├─ core/ 业务层     │  ├─ /api/inpaint             │
│  │  ├─ ImageClient   │  └─ /api/llm/.../messages    │
│  │  ├─ LLMClient     │                              │
│  │  ├─ SessionManager│  SQLite (aiosqlite)          │
│  │  └─ Skills        │  5 张数据表                   │
│  └─ server.py 工厂   │                              │
└──────────────────────┴──────────────────────────────┘
```

**数据流**：前端 SSE 请求 → FastAPI 路由 → 核心业务层（客户端/会话/存储）→ OpenAI API → SSE 事件流 → 前端实时渲染

**状态管理**：四个 Zustand Store 分管会话、生成流程、AI 聊天、Toast 通知，无路由，单页面三栏布局。

## 打包构建

```bash
# 安装 PyInstaller
pip install pyinstaller

# 一键构建安装包
python scripts/build.py
```

构建流程：生成时间戳 → PyInstaller 打包后端为单文件 → 部署到 Tauri binaries → Tauri 打包为系统安装包。

**版本号管理**：

```bash
cd frontend
npm run bump patch    # +0.0.1
npm run bump minor    # +0.1.0
npm run bump major    # +1.0.0
```

同步更新 `pyproject.toml`、`server.py`、`package.json`、`Cargo.toml`、`tauri.conf.json` 五个文件。

## 项目结构

```
backend/
├── src/
│   ├── api/            # FastAPI 路由（generate, inpaint, llm_chat, ...）
│   ├── core/           # 业务核心（client, session, storage, skills）
│   ├── cli.py          # Typer CLI 入口
│   └── server.py       # FastAPI app 工厂 + 生命周期
├── tests/              # pytest 异步测试
└── pyproject.toml
frontend/
├── src/
│   ├── components/     # UI 组件（Gallery, ChatPanel, MaskEditor, ...）
│   ├── stores/         # Zustand 状态管理
│   ├── services/       # API 通信层
│   ├── i18n/           # 国际化资源
│   └── styles/         # CSS 变量设计系统
├── src-tauri/          # Tauri 2.x 桌面壳（Rust）
└── package.json
scripts/                # 构建、版本、开发辅助脚本
docs/                   # 设计文档与实施计划
```

## 测试

```bash
cd backend
python -m pytest tests/ -v
```

使用 respx mock 外部 API 调用，临时目录隔离测试数据，`asyncio_mode = "auto"` 全异步测试。

## 许可证

MIT License
