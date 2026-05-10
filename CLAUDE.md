# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

OpenImage 是一个桌面端 AI 图片生成工具，基于 OpenAI gpt-image-2 模型，支持多步迭代编辑、多图参考和分支 Fork。架构为 Python FastAPI 后端 + Tauri 2.x + React 前端。打包为 PyInstaller sidecar + Tauri 安装包。

## 版本管理

当前版本：**1.7.0**

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
├── .pr_agent.toml                 # PR Agent 审查机器人配置
├── .github/
│   └── workflows/
│       └── pr-agent.yml           # PR Agent 自动审查 GitHub Action
├── backend/
│   ├── src/
│   │   ├── api/                    # FastAPI 路由层
│   │   │   ├── generate.py         # POST /api/generate — SSE 流式生成 + 比例/尺寸映射表
│   │   │   ├── images.py           # 图片元数据查询、文件下载、删除
│   │   │   ├── inpaint.py          # POST /api/inpaint — 局部重绘（mask + 原图 + 可选参考图 → SSE）
│   │   │   ├── llm_chat.py         # LLM 聊天会话 CRUD + SSE 流式对话
│   │   │   ├── llm_settings.py     # LLM 配置（API Key/模型/系统提示词）
│   │   │   ├── deps.py              # 共享依赖注入（数据库获取、辅助函数）
│   │   │   ├── sessions.py         # 图片生成会话 CRUD
│   │   │   └── settings.py         # 图片生成 API 设置（key/url/mode/model）+ 版本信息
│   │   ├── core/                   # 业务核心层
│   │   │   ├── client.py           # 图片生成 OpenAI 客户端（三种模式 + inpainting + 多步迭代）
│   │   │   ├── config.py           # 路径配置（data/db/images/logs）
│   │   │   ├── database.py         # SQLite 异步数据库 + Schema（5 张表）
│   │   │   ├── llm_client.py       # LLM API 客户端（OpenAI 兼容协议，SSE 流式）
│   │   │   ├── llm_prompt.py       # 4 层系统提示词组装器（身份→技能→上下文→摘要）
│   │   │   ├── llm_tokenizer.py    # Token 估算（中英文混合计算）
│   │   │   ├── port.py             # 动态端口工具（find_free_port + 端口文件读写）
│   │   │   ├── session.py          # 图片生成会话管理器
│   │   │   ├── skills/             # 技能系统
│   │   │   │   ├── registry.py     # 技能注册表（SKILLS 字典 + LRU 缓存加载）
│   │   │   │   └── prompt_optimizer.md  # 提示词优化技能（默认激活）
│   │   │   ├── sse.py              # SSE 事件生成器辅助函数
│   │   │   ├── utils.py            # 通用工具函数（并发加载、token 重算等）
│   │   │   └── storage.py          # 图片文件存取
│   │   ├── build_info.py           # 构建时生成的时间戳信息（BUILD_TIMESTAMP）
│   │   ├── cli.py                  # Typer CLI 入口（serve/generate/edit/config，-v 版本信息）
│   │   └── server.py               # FastAPI app 工厂 + 生命周期 + 版本信息（APP_VERSION/FULL_VERSION）
│   ├── entry.py                    # PyInstaller 入口点（绕过 Typer 直接调 uvicorn）
│   ├── openimage-backend.spec      # PyInstaller 配置（onefile 模式）
│   ├── tests/                      # pytest 异步测试
│   │   ├── conftest.py             # 临时目录 fixture
│   │   ├── test_client.py          # 图片生成 API 客户端测试（respx mock）
│   │   ├── test_config.py          # 路径配置测试
│   │   ├── test_database.py        # 数据库 Schema + CRUD 测试
│   │   ├── test_inpaint.py         # Inpainting 路由和 API 端点测试
│   │   ├── test_llm_client.py      # LLM 客户端测试
│   │   ├── test_llm_prompt.py      # 4 层提示词组装器测试
│   │   ├── test_llm_tokenizer.py   # Token 估算测试
│   │   ├── test_port.py            # 动态端口工具测试
│   │   ├── test_session.py         # 会话管理器测试
│   │   ├── test_size_mapping.py    # 比例→像素映射 + Inpaint 尺寸计算测试
│   │   ├── test_skills_registry.py # 技能注册表测试
│   │   └── test_storage.py         # 图片文件存取测试
│   ├── data/                       # 运行时数据（gitignored）
│   │   ├── openimage.db            # SQLite 数据库
│   │   ├── images/                 # 按 session_id 分目录存储图片
│   │   └── logs/
│   └── pyproject.toml              # 依赖与 CLI 入口定义
├── frontend/
│   ├── src/
│   │   ├── components/             # UI 组件
│   │   │   ├── ChatPanel/          # AI 聊天面板（输入框侧栏，10 个子组件）
│   │   │   │   ├── index.tsx       # 聊天面板容器
│   │   │   │   ├── ChatMessage.tsx # 消息气泡（用户/流式纯文本，AI 完成后 Markdown 渲染）
│   │   │   │   ├── ChatSessionBar.tsx  # 聊天会话切换栏
│   │   │   │   ├── QuestionForm.tsx    # 输入框 + 发送
│   │   │   │   ├── SuggestionCards.tsx # 初始建议卡片
│   │   │   │   ├── BufferingIndicator.tsx  # 等待指示器
│   │   │   │   ├── ThinkingCard.tsx    # 思考链卡片（吸顶标题 + 折叠展开）
│   │   │   │   ├── AiBlockRenderer.tsx     # AI 结构化内容块渲染
│   │   │   │   ├── MarkdownRenderer.tsx    # Markdown + LaTeX + 代码高亮渲染
│   │   │   │   └── MarkdownRenderer.css   # Markdown 渲染器样式（CSS 变量，深浅主题适配）
│   │   │   ├── MaskEditor/         # 蒙版编辑器（Canvas 笔刷/矩形 + 参考图 + 工具栏）
│   │   │   │   ├── index.tsx       # 全屏 Overlay 容器
│   │   │   │   ├── MaskCanvas.tsx  # Canvas 渲染 + 事件分发
│   │   │   │   ├── ToolBar.tsx     # 工具选择 + 笔刷大小 + 缩放
│   │   │   │   └── useMaskCanvas.ts  # 绘制逻辑 hook（笔刷/矩形/橡皮擦 + 缩放平移 + 蒙版导出）
│   │   │   ├── AiToggle.tsx        # AI 助手开关按钮
│   │   │   ├── Sidebar.tsx         # 会话列表（260px 左栏）
│   │   │   ├── Gallery.tsx         # 图片网格（中部 flex-1），支持 Ctrl+Click 多选
│   │   │   ├── RatioSelector.tsx   # 比例/尺寸/质量/审核选择 Popover（Portal 渲染）
│   │   │   ├── InputArea.tsx       # 输入区 + 图片附件 + AI 开关集成
│   │   │   ├── DetailPanel.tsx     # 图片详情（310px 右栏），翻页按钮 + Inpaint 入口
│   │   │   ├── LanguageSwitcher.tsx # 语言切换下拉菜单（ARIA 无障碍 + 键盘交互）
│   │   │   ├── Toast.tsx           # Toast 通知气泡组件（底部居中，自动消失）
│   │   │   ├── Topbar.tsx          # 顶栏：会话标题 + 主题切换 + 语言切换
│   │   │   ├── SettingsDialog.tsx  # API 设置对话框，底部显示版本号
│   │   │   ├── Spinner.tsx         # 加载旋转指示器
│   │   │   └── PopoverArrow.tsx    # Popover 箭头组件
│   │   ├── i18n/                   # 国际化
│   │   │   ├── index.ts            # i18next 初始化配置（语言检测 + localStorage 持久化）
│   │   │   ├── en.json             # 英文翻译资源
│   │   │   └── zh.json             # 中文翻译资源
│   │   ├── hooks/
│   │   │   ├── useTheme.ts         # 浅色/深色主题切换 hook
│   │   │   └── useClickOutside.ts  # 点击外部关闭 hook
│   │   ├── services/
│   │   │   └── api.ts              # HTTP + SSE 通信层（图片生成 + LLM 聊天 + 动态端口）
│   │   ├── utils/
│   │   │   └── file.ts             # 图片文件处理工具（File → base64、拖拽/粘贴上传）
│   │   ├── stores/                 # Zustand 状态管理
│   │   │   ├── sessionStore.ts     # 会话 + 图片多选状态（selectedImageIds[]）
│   │   │   ├── generationStore.ts  # 生成流程状态（会话级隔离，附件、中断、比例/尺寸、完成后刷新）
│   │   │   ├── llmChatStore.ts     # LLM 聊天状态（会话管理、SSE 流、消息收发、生成偏好上下文）
│   │   │   └── toastStore.ts       # Toast 通知状态管理（单 Toast 模式 + Timer 生命周期）
│   │   ├── types/
│   │   │   └── index.ts            # 与后端 API 对齐的类型定义（含 LLM 聊天 + ChatContext）
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
│   ├── vite.config.ts              # Vite 配置（动态端口 + 代理 /api → 后端动态端口）
│   └── package.json                # npm scripts（含 bump 命令）
├── scripts/
│   ├── build.py                    # 一键构建：生成时间戳 → PyInstaller → sidecar 部署 → Tauri 打包
│   ├── bump.mjs                    # 版本号管理脚本（同步更新 5 文件 + APP_VERSION）
│   ├── clean.py                    # 构建产物清理（Python/Node/Tauri，--safe/--dry-run）
│   ├── compare_ui.py               # UI 截图对比（Gemini 视觉模型）
│   ├── dev.ps1                     # Windows 一键启动开发环境
│   └── dev.sh                      # macOS/Linux 一键启动开发环境
└── docs/
    ├── references/                 # 外部参考文档
    │   ├── ai-prompt-assist-adaptation-plan.md
    │   └── open-design-prompt-system-research.md
    └── superpowers/                # 设计文档与实施计划
        ├── specs/                  # 功能规格说明（11 篇）
        └── plans/                  # 实施计划（11 篇，与 specs 对应）
```

## 开发命令

### 后端
```bash
cd backend
pip install -e ".[dev]"          # 安装依赖
python -m src.cli serve           # 启动 HTTP 服务（默认 8765，port=0 自动分配）
python -m pytest tests/ -v        # 运行测试
python -m src.cli config set api_key <key>  # 配置 API Key
```

### 一键启动（推荐）
```bash
# Windows
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1
# macOS/Linux
bash scripts/dev.sh
```

### 前端
```bash
cd frontend
npm install                       # 安装依赖
npm run dev                       # Vite 开发服务器（动态端口）
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
2. 动态分配空闲端口，传递 `--port` 和 `--base-dir` 给 sidecar，数据存放在 `<安装目录>/data/`
3. 健康检查轮询 `/api/settings`（最多 30s），就绪后 emit `backend-ready`
4. 前端 `App.tsx` 的 loading gate 等待后端就绪后再渲染主 UI（Tauri 环境监听 IPC 事件，浏览器环境 HTTP 轮询）
5. 应用退出时 Rust 侧自动 kill 后端进程

可执行文件在任务管理器中显示为 `OpenImage`（主进程）和 `OpenImage-Backend`（后端）。

### 三模式 API 客户端

`ImageClient`（`core/client.py`）通过 `api_mode` 设置路由到不同的 OpenAI API 端点：

| 模式 | 端点 | 多步迭代 | 多模态上传 | 适用场景 |
|------|------|----------|------------|----------|
| `responses` | OpenAI SDK `/responses` | `previous_response_id` | `input_image` | OpenAI 直连 |
| `images` | httpx `/v1/images/generations` + `/edits` | 参考图 via edits | 不支持 | Images API 兼容 |
| `chat` | httpx `/v1/chat/completions` | 历史图片参考 | `image_url` 数组 | 第三方中转代理 |

base_url 自动补全 `/v1` 前缀。`_PARAM_KEYS` 控制 Images API 模式下透传的参数（size、quality、output_format、input_fidelity、moderation）。`_check_response()` 统一验证 HTTP 响应（空响应、非 JSON、错误状态码）。

### 图片生成数据流

1. 前端 `generateImage()` 发 SSE POST → `/api/generate`
2. `_resolve_previous()` 查询历史上下文（`response_id` + 上一步图片 base64）
3. `ImageClient.generate()` 调用 API → 返回 `GenerateResult(image_b64, response_id, ...)`
4. `_save_generated_image()` 保存文件到 `data/images/{session_id}/` + 写入数据库
5. SSE 事件流：`generating` → `completed`（或 `error`）

### Inpainting 局部重绘

1. 用户通过 DetailPanel（生成图）或 InputArea（附件）入口打开 MaskEditor 全屏编辑器，可附加参考图片提供视觉指导
2. 前端 Canvas 双层架构：
   - **显示层**（`canvasRef`）：原图 + 半透明蒙版覆盖层，DPR 感知（`canvas.width = CSS_width × devicePixelRatio`）
   - **离屏层**（`maskCanvasRef`）：与原图同尺寸的蒙版数据，笔刷/矩形/橡皮擦直接绘制在此层
3. 蒙版导出：`exportMask()` 将离屏 mask canvas 通过 `destination-in` 合成导出为白色蒙版 PNG base64
4. 用户输入 Prompt 并点击 Generate → `POST /api/inpaint`（SSE，携带可选 `reference_images`）→ `ImageClient.inpaint()` 根据 `api_mode` 路由：
   - `responses` 模式：发送消息（图片 + mask + 可选参考图），`previous_response_id` 为空表示仅基于上传图片
   - `images` 模式：POST `/v1/images/edits` multipart（image + mask + prompt + 可选参考图）
   - `chat` 模式：user 消息（image_url + mask data_url + 可选参考图）
5. 生成结果通过 SSE 流式返回 → 保存为新图片 → 刷新会话

### LLM AI 助手

内嵌式 AI 聊天助手，帮助用户优化提示词、提供图片生成建议。独立于图片生成系统，共享同一后端进程。

**4 层系统提示词组装**（`core/llm_prompt.py`）：
1. **身份层** — 固定角色定义（OpenImage AI 助手）
2. **技能层** — 从 `core/skills/` 动态加载 Markdown 技能指令（默认激活 `prompt-optimizer`）
3. **上下文层** — 用户自定义指令 + 生成偏好（比例/尺寸）+ 最近生成图片摘要
4. **对话摘要层** — 历史消息压缩摘要（超出 token 阈值时触发）

**数据流**：
1. 前端 `ChatPanel` 发送消息 → `POST /api/llm/sessions/{id}/messages`（SSE）
2. `compose_system_prompt()` 组装 4 层提示词 → `LLMClient.chat_stream()` 调用 OpenAI 兼容 API
3. SSE 流式返回 → 前端实时渲染消息（含 reasoning_content 思考链卡片 + AiBlock 结构化内容）
4. 流式期间纯文本渲染，完成后切换 `MarkdownRenderer`（GFM + KaTeX + 代码高亮）
5. 消息持久化到 `llm_messages` 表

**技能系统**（`core/skills/`）：每个技能是一个 Markdown 文件（含 frontmatter 元数据），通过 `registry.py` 注册和加载，`@lru_cache` 缓存文件内容。

### 前后端通信

- **常规 API**: `fetch` + JSON（会话/图片/设置/LLM CRUD）
- **生成/聊天请求**: 手动 SSE 解析（`ReadableStream` + 行缓冲），支持中断（`AbortController`）
- **动态端口**: 后端启动时自动分配空闲端口（port=0），Rust 侧传递 --port 给 sidecar，前端 api.ts 动态发现后端地址
- **数据目录**: 开发环境用项目根目录，打包后用安装目录（卸载时可选择保留数据）

### 状态管理

四个 Zustand store，无路由：
- `sessionStore` — 会话列表、图片列表、**多选状态**（`selectedImageIds: string[]`，`toggleImageSelect` 切换，`clearSelection` 清空）
- `generationStore` — 生成流程（**会话级隔离**：`sessionGenerations` Map，每会话独立 isGenerating/partialImage/abortController）、附件、中断、比例/尺寸、质量/审核参数。完成时动态 import `sessionStore` 避免循环依赖，并行调用 `fetchSessions()` + `selectSession()` 刷新
- `llmChatStore` — LLM 聊天（会话列表、当前会话消息、SSE 流控制、发送时携带 `ChatContext` 含生成偏好）
- `toastStore` — Toast 通知（单 Toast 模式，自动定时消失，Timer 生命周期管理）

### 设计系统

CSS 变量驱动的暖色调双主题（`globals.css`）：
- 浅色：米色纸张质感（`--bg: #f5f4ed`），橙红强调色（`--accent: #c96442`）
- 深色：深炭底色（`--bg: #141413`），亮橙强调色（`--accent: #d97757`）
- `[data-theme="dark"]` 切换，`useTheme` hook 管理
- Tailwind CSS 4 的 `@layer utilities` 优先级低于 unlayered CSS 规则

## 发布流程

1. **更新 CHANGELOG**：回顾 `git log <上次release-tag>..HEAD --oneline`，将所有提交归纳为 CHANGELOG 条目（当提交信息过于简略时，使用 `git diff` 归纳总结）。新增版本段落置于文件顶部，格式与已有条目一致（`### 新功能` / `### Bug 修复` / `### 其他改进`）。同时在底部 `<!-- 变更链接 -->` 区域（用 Grep 定位）添加新版本的 compare 链接
   - 同一发布内，新功能及其初版修复应合并为一条，以最终定案描述为准（用户对发布前修复无感知）
2. **更新 CLAUDE.md**：更新文件树及被折叠的子文档（如有），严格对照 git 历史变更；更新架构描述，言简意赅
3. 更新版本号，使用 bump 脚本
4. 提交上述更新
5. 推送到远端：`git push origin main`
6. 创建 GitHub Release：`gh release create v<版本号> --title "v<版本号> <简述>" --notes "<CHANGELOG 该版本正文>"`
7. 构建安装包：`python scripts/build.py`，将产物上传至 Release：`gh release upload v<版本号> <安装包路径>`

## 编码约定

- **后端**: 全异步（aiosqlite + async/await），FastAPI `app.state` 注入依赖，`_` 前缀表示内部方法
- **前端**: CSS 变量 + inline style 驱动样式（非 Tailwind class 着色），组件内 onMouseEnter/Leave 实现悬停效果。前端**必须使用 DESIGN.md 中的设计哲学**，设计前阅读。
- **类型对齐**: 前端 `types/index.ts` 与后端 Pydantic model 字段一一对应
- **测试**: pytest 异步模式（`asyncio_mode = "auto"`），临时目录 fixture 隔离，respx mock 外部 API
- **编码工具**：可使用 Serena 作为 LSP 工具，尤其对于函数定义查找、大纲发现等

## 注意事项

- CORS 白名单使用正则匹配 `tauri://localhost`、`https?://tauri.localhost`、`https?://localhost:\d+`（兼容开发环境任意端口）
- SQLite 数据库文件在 `data/openimage.db`（开发）或 `%APPDATA%/OpenImage/data/`（打包），表通过 `database.py` 的 `CREATE TABLE IF NOT EXISTS` 自动创建（5 张表：sessions、images、settings、llm_chat_sessions、llm_messages）
- 设置更新时热重建 `ImageClient`（`_rebuild_client`），无需重启
- 设计文档在 `docs/superpowers/specs/`，包含完整的 HTTP API 协议和 UI 布局规格
- `globals.css` 中的 CSS 重置规则**不可**使用通配符 `* { padding: 0 }`，会覆盖 Tailwind v4 的 `@layer utilities`（unlayered 优先级更高）
- `frontend/src-tauri/binaries/` 目录存放 sidecar 二进制（gitignored，由 `scripts/build.py` 生成）
- LLM 聊天和图片生成使用独立的 API 客户端和数据库表，互不影响
- 技能系统新增技能只需在 `core/skills/` 添加 Markdown 文件并在 `registry.py` 注册
