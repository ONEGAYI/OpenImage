# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

OpenImage 是一个桌面端 AI 图片生成工具，基于 OpenAI gpt-image-2 模型，支持多步迭代编辑、多图参考和分支 Fork。架构为 Python FastAPI 后端 + Tauri 2.x + React 前端。

## 文件结构树

```
.
├── backend/
│   ├── src/
│   │   ├── api/                    # FastAPI 路由层
│   │   │   ├── generate.py         # POST /api/generate — SSE 流式生成
│   │   │   ├── images.py           # 图片元数据查询、文件下载、删除
│   │   │   ├── sessions.py         # 会话 CRUD
│   │   │   └── settings.py         # API 设置（key/url/mode/model）
│   │   ├── core/                   # 业务核心层
│   │   │   ├── client.py           # OpenAI API 客户端（三种模式）
│   │   │   ├── config.py           # 路径配置（data/db/images/logs）
│   │   │   ├── database.py         # SQLite 异步数据库 + Schema
│   │   │   ├── session.py          # 会话管理器
│   │   │   └── storage.py          # 图片文件存取
│   │   ├── cli.py                  # Typer CLI 入口（serve/generate/edit/config）
│   │   └── server.py               # FastAPI app 工厂 + 生命周期
│   ├── tests/                      # pytest 异步测试
│   │   ├── conftest.py             # 临时目录 fixture
│   │   ├── test_client.py          # API 客户端测试（respx mock）
│   │   ├── test_config.py
│   │   ├── test_database.py
│   │   ├── test_session.py
│   │   └── test_storage.py
│   ├── data/                       # 运行时数据（gitignored）
│   │   ├── openimage.db            # SQLite 数据库
│   │   ├── images/                 # 按 session_id 分目录存储图片
│   │   └── logs/
│   └── pyproject.toml              # 依赖与 CLI 入口定义
├── frontend/
│   ├── src/
│   │   ├── components/             # UI 组件
│   │   │   ├── Sidebar.tsx         # 会话列表（260px 左栏）
│   │   │   ├── Gallery.tsx         # 图片网格（中部 flex-1），支持 Ctrl+Click 多选
│   │   │   ├── InputArea.tsx       # 输入区 + 图片附件
│   │   │   ├── DetailPanel.tsx     # 图片详情（310px 右栏），含3D堆叠预览/全分辨率查看/删除
│   │   │   ├── Topbar.tsx          # 顶栏：会话标题 + 主题切换
│   │   │   └── SettingsDialog.tsx  # API 设置对话框
│   │   ├── hooks/
│   │   │   └── useTheme.ts         # 浅色/深色主题切换 hook
│   │   ├── services/
│   │   │   └── api.ts              # HTTP + SSE 通信层，含批量删除
│   │   ├── stores/                 # Zustand 状态管理
│   │   │   ├── sessionStore.ts     # 会话 + 图片多选状态（selectedImageIds[]）
│   │   │   └── generationStore.ts  # 生成流程状态（附件、中断、完成后刷新）
│   │   ├── types/
│   │   │   └── index.ts            # 与后端 API 对齐的类型定义
│   │   ├── styles/
│   │   │   └── globals.css         # CSS 变量设计系统 + Tailwind CSS 4 入口
│   │   ├── App.tsx                 # 三栏布局根组件
│   │   └── main.tsx                # React 入口
│   ├── src-tauri/                  # Tauri 2.x 桌面壳
│   │   ├── src/lib.rs              # Rust 后端（当前为空壳）
│   │   └── tauri.conf.json         # 窗口 1280×800, min 960×600
│   ├── vite.config.ts              # Vite 配置（代理 /api → 后端 8765）
│   └── package.json                # npm scripts
├── scripts/
│   └── compare_ui.py               # UI 截图对比（Gemini 视觉模型）
└── docs/superpowers/               # 设计文档与实施计划
    ├── specs/                      # 功能规格说明
    └── plans/                      # 实施计划
```

## 开发命令

### 后端
```bash
cd backend
pip install -e ".[dev]"          # 安装依赖
python -m src.cli serve           # 启动 HTTP 服务（默认 8765 端口）
python -m pytest tests/ -v        # 运行测试
python -m src.cli config set api_key <key>  # 配置 API Key
```

### 前端
```bash
cd frontend
npm install                       # 安装依赖
npm run dev                       # Vite 开发服务器（1420 端口）
npm run build                     # 生产构建
```

### Tauri 桌面应用
```bash
cd frontend
npm run tauri dev                  # 开发模式（需先启动后端）
```

## 核心架构

### 三模式 API 客户端

`ImageClient`（`core/client.py`）通过 `api_mode` 设置路由到不同的 OpenAI API 端点：

| 模式 | 端点 | 多步迭代 | 多模态上传 | 适用场景 |
|------|------|----------|------------|----------|
| `responses` | OpenAI SDK `/responses` | `previous_response_id` | `input_image` | OpenAI 直连 |
| `images` | httpx `/v1/images/generations` | 不支持 | 不支持 | Images API 兼容 |
| `chat` | httpx `/v1/chat/completions` | 历史图片参考 | `image_url` 数组 | 第三方中转代理 |

base_url 自动补全 `/v1` 前缀。`_check_response()` 统一验证 HTTP 响应（空响应、非 JSON、错误状态码）。

### 图片生成数据流

1. 前端 `generateImage()` 发 SSE POST → `/api/generate`
2. `_resolve_previous()` 查询历史上下文（`response_id` + 上一步图片 base64）
3. `ImageClient.generate()` 调用 API → 返回 `GenerateResult(image_b64, response_id, ...)`
4. `_save_generated_image()` 保存文件到 `data/images/{session_id}/` + 写入数据库
5. SSE 事件流：`generating` → `completed`（或 `error`）

### 前后端通信

- **常规 API**: `fetch` + JSON（会话/图片/设置 CRUD）
- **生成请求**: 手动 SSE 解析（`ReadableStream` + 行缓冲），支持中断（`AbortController`）
- **前端固定端口**: 后端 8765，前端 Vite 1420

### 状态管理

两个 Zustand store，无路由：
- `sessionStore` — 会话列表、图片列表、**多选状态**（`selectedImageIds: string[]`，`toggleImageSelect` 切换，`clearSelection` 清空）
- `generationStore` — 生成流程、附件、中断。完成时动态 import `sessionStore` 避免循环依赖，并行调用 `fetchSessions()` + `selectSession()` 刷新

### 设计系统

CSS 变量驱动的暖色调双主题（`globals.css`）：
- 浅色：米色纸张质感（`--bg: #f5f4ed`），橙红强调色（`--accent: #c96442`）
- 深色：深炭底色（`--bg: #141413`），亮橙强调色（`--accent: #d97757`）
- `[data-theme="dark"]` 切换，`useTheme` hook 管理
- Tailwind CSS 4 的 `@layer utilities` 优先级低于 unlayered CSS 规则

## 编码约定

- **后端**: 全异步（aiosqlite + async/await），FastAPI `app.state` 注入依赖，`_` 前缀表示内部方法
- **前端**: CSS 变量 + inline style 驱动样式（非 Tailwind class 着色），组件内 onMouseEnter/Leave 实现悬停效果
- **类型对齐**: 前端 `types/index.ts` 与后端 Pydantic model 字段一一对应
- **测试**: pytest 异步模式（`asyncio_mode = "auto"`），临时目录 fixture 隔离，respx mock 外部 API

## 注意事项

- CORS 仅白名单 Tauri 源（`tauri://localhost`、`http://localhost:1420`），调试时如遇跨域问题检查此配置
- SQLite 数据库文件在 `data/openimage.db`，表通过 `database.py` 的 `CREATE TABLE IF NOT EXISTS` 自动创建
- 设置更新时热重建 `ImageClient`（`_rebuild_client`），无需重启
- 设计文档在 `docs/superpowers/specs/`，包含完整的 HTTP API 协议和 UI 布局规格
- `globals.css` 中的 CSS 重置规则**不可**使用通配符 `* { padding: 0 }`，会覆盖 Tailwind v4 的 `@layer utilities`（unlayered 优先级更高）
