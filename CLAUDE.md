# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

OpenImage 是一个桌面端 AI 图片生成工具，基于 OpenAI gpt-image-2 模型，支持多步迭代编辑、多图参考和分支 Fork。架构为 Python FastAPI 后端 + Tauri 2.x + React 前端。打包为 PyInstaller sidecar + Tauri 安装包。

## 版本管理

当前版本：**1.1.0**

版本号统一管理在 5 个文件中，通过 `npm run bump <VerNum | patch | minor | major>` 一键更新：
- `backend/pyproject.toml`
- `backend/src/server.py`
- `frontend/package.json`
- `frontend/src-tauri/Cargo.toml`
- `frontend/src-tauri/tauri.conf.json`

## 文件结构树

```
.
├── CHANGELOG.md                   # 变更日志（Keep a Changelog 格式）
├── CLAUDE.md                      # 本文件 — 项目开发指引
├── DESIGN.md                      # Claude 设计哲学参考（前端遵循此设计令牌）
├── backend/
│   ├── src/
│   │   ├── api/                    # FastAPI 路由层
│   │   │   ├── generate.py         # POST /api/generate — SSE 流式生成
│   │   │   ├── images.py           # 图片元数据查询、文件下载、删除
│   │   │   ├── inpaint.py          # POST /api/inpaint — 局部重绘（mask + 原图 → SSE）
│   │   │   ├── sessions.py         # 会话 CRUD
│   │   │   └── settings.py         # API 设置（key/url/mode/model）+ 版本信息
│   │   ├── core/                   # 业务核心层
│   │   │   ├── client.py           # OpenAI API 客户端（三种模式 + inpainting 路由）
│   │   │   ├── config.py           # 路径配置（data/db/images/logs）
│   │   │   ├── database.py         # SQLite 异步数据库 + Schema
│   │   │   ├── session.py          # 会话管理器
│   │   │   └── storage.py          # 图片文件存取
│   │   ├── build_info.py            # 构建时生成的时间戳信息（BUILD_TIMESTAMP）
│   │   ├── cli.py                  # Typer CLI 入口（serve/generate/edit/config，-v 版本信息）
│   │   └── server.py               # FastAPI app 工厂 + 生命周期 + 版本信息（APP_VERSION/FULL_VERSION）
│   ├── entry.py                    # PyInstaller 入口点（绕过 Typer 直接调 uvicorn）
│   ├── openimage-backend.spec      # PyInstaller 配置（onefile 模式）
│   ├── tests/                      # pytest 异步测试
│   │   ├── conftest.py             # 临时目录 fixture
│   │   ├── test_client.py          # API 客户端测试（respx mock）
│   │   ├── test_inpaint.py         # Inpainting client 路由和 API 端点测试
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
│   │   │   ├── MaskEditor/         # 蒙版编辑器（Canvas 笔刷/矩形 + 工具栏）
│   │   │   │   ├── index.tsx       # 全屏 Overlay 容器
│   │   │   │   ├── MaskCanvas.tsx  # Canvas 渲染 + 事件分发
│   │   │   │   ├── ToolBar.tsx     # 工具选择 + 笔刷大小 + 缩放
│   │   │   │   └── useMaskCanvas.ts  # 绘制逻辑 hook（笔刷/矩形/橡皮擦 + 缩放平移 + 蒙版导出）
│   │   │   ├── Sidebar.tsx         # 会话列表（260px 左栏）
│   │   │   ├── Gallery.tsx         # 图片网格（中部 flex-1），支持 Ctrl+Click 多选
│   │   │   ├── InputArea.tsx       # 输入区 + 图片附件（附件 hover 显示 Inpaint 编辑图标）
│   │   │   ├── DetailPanel.tsx     # 图片详情（310px 右栏），翻页按钮 + Inpaint 入口
│   │   │   ├── Topbar.tsx          # 顶栏：会话标题 + 主题切换
│   │   │   └── SettingsDialog.tsx  # API 设置对话框，底部显示版本号
│   │   ├── hooks/
│   │   │   └── useTheme.ts         # 浅色/深色主题切换 hook
│   │   ├── services/
│   │   │   └── api.ts              # HTTP + SSE 通信层
│   │   ├── stores/                 # Zustand 状态管理
│   │   │   ├── sessionStore.ts     # 会话 + 图片多选状态（selectedImageIds[]）
│   │   │   └── generationStore.ts  # 生成流程状态（附件、中断、完成后刷新）
│   │   ├── types/
│   │   │   └── index.ts            # 与后端 API 对齐的类型定义
│   │   ├── styles/
│   │   │   └── globals.css         # CSS 变量设计系统 + Tailwind CSS 4 入口
│   │   ├── App.tsx                 # 三栏布局根组件，含后端就绪 loading gate
│   │   └── main.tsx                # React 入口
│   ├── src-tauri/                  # Tauri 2.x 桌面壳
│   │   ├── src/lib.rs              # Rust sidecar 管理（启动/健康检查/清理后端进程）
│   │   ├── binaries/               # sidecar 二进制（gitignored，构建时生成）
│   │   ├── capabilities/default.json  # sidecar 执行权限
│   │   ├── windows/hooks.nsh       # NSIS 安装/卸载钩子（进程清理 + 数据保留确认）
│   │   └── tauri.conf.json         # 窗口 1280×800, externalBin, 版本号
│   ├── vite.config.ts              # Vite 配置（代理 /api → 后端 8765）
│   └── package.json                # npm scripts（含 bump 命令）
├── scripts/
│   ├── build.py                    # 一键构建：生成时间戳 → PyInstaller → sidecar 部署 → Tauri 打包
│   ├── bump.mjs                    # 版本号管理脚本（同步更新 5 文件 + APP_VERSION）
│   └── compare_ui.py               # UI 截图对比（Gemini 视觉模型）
└── docs/superpowers/               # 设计文档与实施计划
    ├── specs/                      # 功能规格说明（4 篇：inpainting、version-info、redesign-migration、openimage）
    └── plans/                      # 实施计划（4 篇，与 specs 对应）
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
npm run bump patch                # 版本号 +0.0.1
```

### Tauri 桌面应用
```bash
cd frontend
npm run tauri dev                  # 开发模式（需先启动后端）
```

### 打包构建
```bash
pip install pyinstaller            # 安装 PyInstaller
python scripts/build.py           # 一键构建安装包
```

## 核心架构

### 打包架构

生产模式下，Tauri 启动时自动管理 Python 后端 sidecar：
1. `lib.rs` 的 `setup` 阶段启动 `openimage-backend` sidecar
2. 传递 `--base-dir` 指向安装目录（`executable_dir()`），数据存放在 `<安装目录>/data/`
3. 健康检查轮询 `/api/settings`（最多 30s），就绪后 emit `backend-ready`
4. 前端 `App.tsx` 的 loading gate 等待后端就绪后再渲染主 UI（Tauri 环境监听 IPC 事件，浏览器环境 HTTP 轮询）
5. 应用退出时 Rust 侧自动 kill 后端进程

可执行文件在任务管理器中显示为 `OpenImage`（主进程）和 `OpenImage-Backend`（后端）。

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

### Inpainting 局部重绘

1. 用户通过 DetailPanel（生成图）或 InputArea（附件）入口打开 MaskEditor 全屏编辑器
2. 前端 Canvas 双层架构：
   - **显示层**（`canvasRef`）：原图 + 半透明蒙版覆盖层，DPR 感知（`canvas.width = CSS_width × devicePixelRatio`）
   - **离屏层**（`maskCanvasRef`）：与原图同尺寸的蒙版数据，笔刷/矩形/橡皮擦直接绘制在此层
3. 蒙版导出：`exportMask()` 将离屏 mask canvas 通过 `destination-in` 合成导出为白色蒙版 PNG base64
4. 用户输入 Prompt 并点击 Generate → `POST /api/inpaint`（SSE）→ `ImageClient.inpaint()` 根据 `api_mode` 路由：
   - `responses` 模式：发送两条消息（图片 + mask），`previous_response_id` 为空表示仅基于上传图片
   - `images` 模式：POST `/v1/images/edits` multipart（image + mask + prompt）
   - `chat` 模式：两条 user 消息（image_url + mask data_url）
5. 生成结果通过 SSE 流式返回 → 保存为新图片 → 刷新会话

### 前后端通信

- **常规 API**: `fetch` + JSON（会话/图片/设置 CRUD）
- **生成请求**: 手动 SSE 解析（`ReadableStream` + 行缓冲），支持中断（`AbortController`）
- **前端固定端口**: 后端 8765，前端 Vite 1420
- **数据目录**: 开发环境用项目根目录，打包后用安装目录（卸载时可选择保留数据）

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

## 发布流程

当前无远端仓库，使用 git tag 代替平台 release。

1. **更新 CHANGELOG**：回顾 `git log <上次release-tag>..HEAD --oneline`，将所有提交归纳为 CHANGELOG 条目（当提交信息过于简略时，使用 `git diff` 归纳总结）。新增版本段落置于文件顶部，格式与已有条目一致（`### 新功能` / `### Bug 修复` / `### 其他改进`）。同时在底部 `<!-- 变更链接 -->` 区域（用 Grep 定位）添加新版本的 compare 链接
   - 同一发布内，新功能及其初版修复应合并为一条，以最终定案描述为准（用户对发布前修复无感知）
2. **更新 CLAUDE.md**：更新文件树及被折叠的子文档（如有），严格对照 git 历史变更；更新架构描述，言简意赅
3. 更新版本号，使用 bump 脚本
4. 提交上述更新
5. 打 tag：`git tag -a v<版本号> -m "v<版本号> <简述>"`

## 编码约定

- **后端**: 全异步（aiosqlite + async/await），FastAPI `app.state` 注入依赖，`_` 前缀表示内部方法
- **前端**: CSS 变量 + inline style 驱动样式（非 Tailwind class 着色），组件内 onMouseEnter/Leave 实现悬停效果。前端**必须使用 DESIGN.md 中的设计哲学**，设计前阅读。
- **类型对齐**: 前端 `types/index.ts` 与后端 Pydantic model 字段一一对应
- **测试**: pytest 异步模式（`asyncio_mode = "auto"`），临时目录 fixture 隔离，respx mock 外部 API

## 注意事项

- CORS 白名单使用正则匹配 `tauri://localhost`、`https?://tauri.localhost`、`https?://localhost:\d+`（兼容开发环境任意端口）
- SQLite 数据库文件在 `data/openimage.db`（开发）或 `%APPDATA%/OpenImage/data/`（打包），表通过 `database.py` 的 `CREATE TABLE IF NOT EXISTS` 自动创建
- 设置更新时热重建 `ImageClient`（`_rebuild_client`），无需重启
- 设计文档在 `docs/superpowers/specs/`，包含完整的 HTTP API 协议和 UI 布局规格
- `globals.css` 中的 CSS 重置规则**不可**使用通配符 `* { padding: 0 }`，会覆盖 Tailwind v4 的 `@layer utilities`（unlayered 优先级更高）
- `frontend/src-tauri/binaries/` 目录存放 sidecar 二进制（gitignored，由 `scripts/build.py` 生成）
