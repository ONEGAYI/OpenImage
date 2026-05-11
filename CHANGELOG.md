# Changelog

本项目的所有重要变更均记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.8.0] - 2026-05-11

### 新功能

- **Fork 会话分支**：从任意生成步骤创建独立分支，实现图片迭代的多路径探索（PR #3）
  - 后端新增 `POST /api/sessions/{id}/fork` 端点，接受 `image_id` 参数，创建新会话并拷贝目标图片及之前所有图片的记录和文件
  - `SessionManager.fork()` 方法：自动命名（`原会话名 (Fork #N)`）、数据库记录复制、`head_response_id` 继承
  - `Storage.copy_session_images()` 方法：物理拷贝图片文件到新会话目录，源文件缺失时抛出异常而非静默跳过
  - 前端 DetailPanel 新增 Fork 按钮，直接调用 API 创建独立分支

### Bug 修复

- 增大图片生成 HTTP 超时（180s → 300s，连接超时 30s），修复 Images 模式下长时间生成请求超时问题

### 其他改进

- 移除旧的 `fork_from` 前端状态（`pendingForkFrom`、`forkFrom`）和生成参数，简化为直接 API 调用模式

## [1.7.0] - 2026-05-10

### 新功能

- **AI 聊天消息 Markdown + LaTeX 渲染**：AI 助手回复从纯文本升级为富文本格式化渲染（PR #2）
  - 新增 `MarkdownRenderer` 组件，支持 GFM 扩展语法（表格、删除线、任务列表）、代码块语法高亮（11 种常用语言按需注册）、KaTeX 数学公式
  - 流式输出期间保持纯文本，完成后切换 Markdown 渲染，避免不完整语法闪烁
  - CSS 样式使用项目 CSS 变量，深浅主题自动适配
  - `React.memo` 包裹 + 插件/组件提升为模块级常量，避免不必要重渲染

- **Images API 参数扩展**：适配 gpt-image-2 新文档，支持 quality/input_fidelity/moderation 参数透传（PR #1）
  - 后端 `_PARAM_KEYS` 和 `GenerateParams` 新增 `input_fidelity`、`moderation` 字段
  - 前端 RatioSelector 新增 Quality（auto/low/medium/high）和 Moderation（auto/low）选择区段
  - Popover 改为 `createPortal` 渲染到 document.body，避免溢出裁剪
  - `quality` 默认值从 `high` 改为 `auto`（与 API 文档一致）

### 其他改进

- 新增 PR Agent CI 自动审查（`.github/workflows/pr-agent.yml` + `.pr_agent.toml`）

## [1.6.0] - 2026-05-04

### 新功能

- **LLM 聊天消息管理**：支持删除最后一条消息，完整链路覆盖
  - 后端：`DELETE /llm-chats/{id}/messages/last` 端点 + 中断消息保存端点 `POST /.../interrupted`
  - 前端：API 层、Store 层、ChatMessage 悬浮删除按钮、ChatPanel 集成

- **LLM 会话交互增强**：会话更名功能 + 终止生成功能（中断 SSE 流并保存已生成内容）

- **项目文档**：新增中英文 README（README.md + README.en.md），含项目介绍、特性、技术栈、架构概览、开发指南

### Bug 修复

- 修复 ThinkingCard 流式传输时无法展开，以及 ai_block 格式兼容问题
- 修复 Token 回填幂等性 bug，提取 `_get_prev_cumulative_tokens` 辅助函数确保回填数据一致性
- 修复前端 `onUsage` token 累加计算错误

### 其他改进

- **Token 计数改为累计值语义**：user/AI/中断消息的 token_count 统一为累计值，list_chat_sessions 回填逻辑同步适配，消除历史数据不一致
- **前后端代码全面审查与优化**（4 批次）：资源泄漏修复（FastAPI lifespan 客户端清理）、启动流程并行化（asyncio.gather）、数据库 N+1 查询消除、冗余包装函数移除、异常处理增强、前端错误日志添加
- 删除按钮改用 React state 驱动 opacity/transform 动画，替代直接 DOM 操作
- 代码审查文档整理至 `docs/review/` 子目录
- 新增通用组件：Spinner 加载指示器、PopoverArrow 箭头组件、useClickOutside hook
- 后端新增共享模块：`api/deps.py`（依赖注入）、`core/sse.py`（SSE 辅助）、`core/utils.py`（工具函数）

## [1.5.0] - 2026-05-03

### 新功能

- **LLM AI 助手集成**：完整的内嵌式 AI 聊天助手，帮助用户优化提示词、提供图片生成建议。独立于图片生成系统，共享同一后端进程
  - 后端：LLM 客户端（OpenAI 兼容协议，SSE 流式）、Token 近似估算（中英文混合计算）、4 层系统提示词组装器（身份→技能→上下文→摘要）、技能系统（Markdown 文件 + `@lru_cache` 缓存注册）
  - API 路由：LLM 设置 CRUD（`/api/llm/settings`）、聊天会话 CRUD、消息 CRUD（含软删除）、SSE 流式聊天端点
  - 数据库：新增 `llm_chat_sessions` 和 `llm_messages` 两张表
  - 前端 ChatPanel（8 个子组件）：面板容器、消息气泡（含 AiBlock 渲染）、会话切换栏、输入框、建议卡片、等待指示器、AI 结构化内容块渲染、思考链卡片
  - AI 开关按钮（AiToggle）集成到输入框内部右端
  - 发送消息时携带生成偏好上下文（比例/尺寸），供系统提示词动态注入

- **思考链（reasoning_content）支持**：AI 回复中展示推理过程，ThinkingCard 组件支持吸顶标题、折叠/展开交互、overflow:clip 适配

- **ai_block XML 标签格式**：结构化内容块从 JSON 格式改为 XML 标签解析，聊天会话支持自动命名

### Bug 修复

- 修复 Token 计数严重低估：AI 消息未包含 thinking_content 和 ai_block 内容，用户消息 token_count 也未计入统计（多次迭代修复）
- 修复 SSE 流式传输中跨 token 分割导致 ai_block 解析失败
- 修复 ai_block 字段可能为非数组类型导致的渲染崩溃
- 修复 LLM 聊天历史持久化失效问题
- 修复 ThinkingCard 吸顶标题透字问题和 position: sticky 与 overflow:hidden 冲突
- 修复 ChatPanel 智能滚动异常
- 修复 LLMClient base_url 为 None 时的启动崩溃

### 其他改进

- 历史会话 Token 数据自动回填修复
- 短 prompt 不再显示截断省略号
- SSE 事件输出简化，统一查询 LIMIT，技能内容缓存

## [1.4.0] - 2026-05-03

### 新功能

- **动态端口分配**：消除前后端硬编码端口依赖，改为运行时自动分配空闲端口
  - 后端新增 `port.py` 工具模块（find_free_port + 端口文件读写），cli.py 和 entry.py 支持 port=0 自动分配
  - Rust 侧启动时动态分配端口，通过 --port 传递给 sidecar，前端自动发现后端地址
  - api.ts 移除硬编码 BASE_URL，改用 initBaseUrl() + getBaseUrl() 动态获取后端地址
  - Vite 开发服务器动态端口，/api 代理自动转发到后端实际端口

- **Inpaint 参考图附件**：蒙版重绘时支持附加参考图片，为生成提供视觉指导
  - MaskEditor 新增参考图 UI：缩略图预览、拖拽/粘贴上传、移除按钮
  - InputArea、DetailPanel 两个入口均支持传递参考图给 inpaint API
  - client.py 三种模式（responses/images/chat）inpaint 方法统一支持 reference_images 参数
  - 新增 file.ts 图片文件处理工具模块

- **一键启动开发环境**：新增 scripts/dev.sh（macOS/Linux）和 scripts/dev.ps1（Windows），一键同时启动前后端开发服务器

### Bug 修复

- 修复详情栏提示词在长文本时无限撑开且丢失换行格式的问题
- 修复 Images API 模式下用户上传的附件图片被忽略的问题
- 改进代理超时错误提示，添加 HTTP 5xx 自动重试机制
- 修复 Web 模式 cleanup 函数丢失和 isTauri 重复定义的问题

### 其他改进

- 添加分辨率设置不生效的诊断警告和用户提示（中转代理压价限制，暂不支持高分辨率）
- 代码审查修复：消除重复定义、修正类型注解和效率问题

## [1.3.2] - 2026-05-02

### 新功能

- **Images API 多步迭代**：Step 2+ 自动使用上一步图片作为参考图，调用 `/v1/images/edits` 端点（参考图作为 `image` 字段，无 mask 纯编辑）
  - 新增 `_edit_via_images()` 方法处理带参考图的生成请求
  - `history_images` 参数不再仅限 chat 模式，统一传递给所有 API 模式路由
  - 新增 `_parse_images_api_item()` 辅助方法，消除三处重复的 Images API 响应解析逻辑

### Bug 修复

- 修复 `_inpaint_via_images()` 缺少 `Authorization` header 导致 multipart/form-data 请求认证失败的问题
- 修复 `_edit_via_images()` 同样缺少 `Authorization` header 的问题

### 其他改进

- `generate.py` 添加模块级 logger，生成失败时记录完整异常堆栈和 session_id，提升调试效率

## [1.3.1] - 2026-05-02

### 新功能

- **Toast 通知系统**：操作反馈气泡提示，保存图片时显示成功通知
  - 新增 Toast 组件（底部居中气泡，自动消失），toastStore 状态管理（单 Toast 模式 + Timer 生命周期清理）
  - DetailPanel 保存图片操作触发 toast 提示
  - 中英文 i18n 翻译

### Bug 修复

- 修复跨会话生成状态泄漏：会话 A 生图时其他会话不再错误显示 generating 图标
  - generationStore 从单一全局 isGenerating 重构为 sessionGenerations Map，每会话独立状态
  - Gallery、InputArea 使用 Zustand selector 细粒度订阅，清理未使用的辅助方法死代码

## [1.3.0] - 2026-05-01

### 新功能

- **i18n 国际化**：完整的前端国际化支持，中英文自由切换
  - 基于 react-i18next + i18next，默认跟随系统语言，手动切换后持久化到 localStorage
  - 新增 LanguageSwitcher 语言切换组件（下拉菜单，含 ARIA 无障碍属性和键盘交互），集成到 Topbar
  - 翻译所有前端组件用户可见文本：App、Sidebar、Gallery、DetailPanel、InputArea、RatioSelector、MaskEditor、SettingsDialog、Topbar
  - i18n 代码审查修复：统一 t() 调用模式，消除硬编码字符串，修复 React key 稳定性

### Bug 修复

- DetailPanel 空状态高度未撑满导致背景色不可见
- 输入区 UI 对齐瑕疵（Attach/Settings 按钮居中、Ctrl+Enter 提示文案恢复）

## [1.2.0] - 2026-05-01

### 新功能

- **图片比例/尺寸选择**：完整的比例/尺寸控制管线，支持 3 种比例（1:1、16:9、9:16）× 3 种尺寸档位（1K、2K、4K）
  - 后端 SIZE_TABLE 定义 9 种组合的像素尺寸（边长均为 16 的倍数，满足 gpt-image-2 要求），`resolve_size()` 映射抽象参数为像素字符串，`detect_closest_ratio()` 从图片尺寸检测最接近比例
  - 前端 RatioSelector Popover：工具栏触发按钮 + 向上弹出选单，比例区含形状图标，尺寸区纯文字按钮，选中态 coral 高亮，点击外部自动关闭
  - generationStore 使用字面量联合类型管理 aspectRatio/imageSize 状态，`startGeneration` 自动构造 `params.size` 传递给 API
- **Inpaint 自动比例锁定**：Inpaint 端点自动从源图尺寸检测最接近比例并计算输出像素尺寸，保证蒙版坐标不变形

### 其他改进

- 新增 `scripts/clean.py` 构建产物清理脚本，支持清理 Python/Node/Tauri 三套构建管线中间产物（--safe 保留 Rust target、--dry-run 预览）
- inpaint.py 添加显式内存释放（`del` + `close()`），避免 SSE 长连接期间冗余占用
- RatioSelector 提取公共样式常量，消除重复代码

## [1.1.0] - 2026-04-30

### 新功能

- **Inpainting 局部重绘**：完整的前后端 inpainting 管线，支持在图片上绘制蒙版并局部重新生成
  - 后端 `/api/inpaint` SSE 端点，接收原图 + mask base64 + prompt，支持三模式路由（Responses API 双图模式、Images Edits API、Chat Completions 双图模式）
  - 前端 MaskEditor 全屏蒙版编辑器：画笔（自由绘制）、矩形（选区填充）、橡皮擦三种工具，支持画布缩放（滚轮 0.25×–5×）和中键平移
  - DetailPanel 单图选中时提供 Inpaint 入口按钮，InputArea 附件缩略图 hover 显示 Inpaint 编辑图标，两个入口均自动携带原图数据
  - 蒙版导出为透明 PNG base64，用户输入 Prompt 描述希望生成的区域内容后提交

### Bug 修复

- **MaskEditor 三连修**：修复打开后黑屏无画面（CORS crossOrigin 冲突 + renderOverlay 过早返回双重根因）、修复高 DPI 屏幕下图片模糊（Canvas 未适配 devicePixelRatio）、修复 Generate 点击后无成功/失败反馈的静默失败问题
- **测试修复**：`test_client.py` 中过时的方法名更新

### 其他改进

- 新增 `DESIGN.md` Claude 设计哲学参考文档，前端组件遵循该设计令牌系统
- 代码审查清理：消除 useMaskCanvas 重复逻辑、移除冗余状态别名、优化 Canvas 重绘条件

## [1.0.1] - 2026-04-30

### 新功能

- **版本信息全链路展示**：CLI `--version`/`-v` 显示版本号；`/api/settings` 返回 `full_version` 字段（含构建时间戳）；前端设置页面底部展示版本号和打包时间；`build.py` 构建时自动生成 `build_info.py` 注入时间戳；`bump` 脚本同步更新 `APP_VERSION` 常量
- **纯 Vite 开发模式支持**：`App.tsx` 自动检测运行环境，浏览器环境下通过 HTTP 轮询检测后端就绪状态，无需 Tauri 运行时即可进行前端开发
- **NSIS 卸载数据保留**：卸载时询问用户是否保留用户数据（图片、设置等），保留的数据在重新安装后自动恢复

### Bug 修复

- **消除启动白屏**：后端启动逻辑从同步阻塞重构为异步 `tauri::async_runtime::spawn`，应用启动时不再出现长时间白屏
- **消除黑框闪动**：Windows 环境下启动/关闭时的 `taskkill` 命令添加 `CREATE_NO_WINDOW` 标志，消除控制台黑框闪过

### 其他改进

- CORS 配置改为正则匹配，兼容开发环境任意端口（`localhost:\d+`）
- API 基础 URL 集中管理：`api.ts` 导出 `BASE_URL` 常量，消除多处硬编码 URL 重复
- 代码清理：进程名常量化、自解释注释移除

## [1.0.0] - 2026-04-30

### Added

#### 后端服务

- 基于 FastAPI + SQLite 的异步图片生成后端服务，默认监听 `127.0.0.1:8765`
- 三种 API 模式支持：
  - **Responses API** — OpenAI 直连，支持 `previous_response_id` 实现多步迭代编辑和 `partial_image` 流式预览
  - **Images API** — 兼容 OpenAI `/v1/images/generations` 端点，支持 b64_json 和 URL 两种响应格式
  - **Chat Completions API** — 兼容第三方中转代理，支持多模态图片上传和历史图片上下文
- 自定义 API Base URL、模型名称，设置中展示最终拼接的请求端点便于确认
- SSE 流式图片生成，事件类型包括 `generating`、`partial_image`（渐进式预览）、`completed`、`error`
- 会话管理系统：创建（自动编号命名）、重命名、删除、列表查询（含图片计数和最新图片 ID）
- 图片文件存储：按 `{session_id}/{timestamp}_{uuid}.{fmt}` 分目录管理
- 图片元数据记录：step 序号、prompt、revised_prompt、parent_image_id（Fork 来源）、尺寸、质量、格式
- 图片删除：同时清理磁盘文件和数据库记录
- 设置持久化：API Key（脱敏显示）、Base URL、API 模式、模型名称，更新后热重建客户端无需重启
- 跨平台数据目录自动定位：Windows `%APPDATA%`、macOS `~/Library/Application Support`、Linux `~/.local/share`
- CLI 命令行工具（Typer + Rich）：`serve`、`generate`、`edit`、`config set`、`sessions list`
- CLI 内置指数退避重试机制（最多 3 次，自动跳过不可重试错误）
- 异步测试套件（pytest + pytest-asyncio + respx mock）

#### 前端界面

- React 18 + TypeScript + Vite 6 + Tailwind CSS 4 桌面应用
- 三栏布局：会话侧边栏（260px）| 图片画廊 + 输入区 + 顶栏 | 图片详情面板（310px）
- **Sidebar**：会话列表、最新图片缩略图、图片计数、实时搜索过滤、右键上下文菜单、行内重命名
- **Gallery**：响应式网格布局、图片卡片（step 编号 + prompt 摘要覆盖层）、`Ctrl/Cmd+Click` 多选、选中光晕效果、懒加载
- **DetailPanel**：图片元数据展示、3D 堆叠照片预览（CSS perspective 透视旋转）、全分辨率查看器（backdrop-filter 毛玻璃）
- 图片多选操作：批量删除、批量保存（200ms 间隔逐一下载）、批量复制 Prompt、从最后一张 Fork
- **Fork 分支**：从任意历史图片创建分支，生成时自动携带 `fork_from` 参数
- **InputArea**：自动伸缩文本框（最大 100px）、`Ctrl+Enter` 发送、多图附件上传（base64）、Fork 来源提示条、生成中取消按钮
- 生成失败时保留输入框内容和已上传附件，避免重复操作
- **SettingsDialog**：API Key（密码输入）、Base URL、三选一 API 模式下拉、模型名称、解析端点显示
- CSS 变量驱动的暖色调双主题系统：
  - 浅色 — 米色纸张质感（`#f5f4ed`）+ 赤陶橙强调色（`#c96442`）
  - 深色 — 深炭底色（`#141413`）+ 亮橙强调色（`#d97757`）
- 主题切换（`useTheme` hook，localStorage 持久化，`main.tsx` 同步预设防闪烁）
- **Topbar**：当前会话名称、pill-shaped 主题切换按钮（太阳/月亮图标动画）、设置入口
- Zustand 状态管理（`sessionStore` 会话 + 图片多选状态，`generationStore` 生成流程 + 附件）
- 自定义滚动条、颜色过渡动画、悬停效果、生成中虚线占位卡片

#### 桌面打包与部署

- Tauri 2.x 桌面壳（Rust），窗口 1280×800（最小 960×600），居中显示
- Python 后端 sidecar 自动生命周期管理：
  - 启动时传入 `--base-dir` 指向系统应用数据目录
  - 健康检查轮询（500ms 间隔，30 秒超时），就绪后 emit `backend-ready` 事件
  - 退出时通过 `kill()` + Windows `taskkill /F /T` 清理完整进程树（含 PyInstaller bootloader 子进程）
- 前端后端就绪加载门控：监听 Tauri 事件，30 秒超时显示错误提示
- PyInstaller onefile 打包（无控制台窗口，UPX 压缩），自动收集 Conda 环境 DLL 依赖
- 后端日志重定向：打包环境下 stderr/stdout 输出到日志文件，超过 2MB 自动轮转
- Windows NSIS 安装/卸载钩子：自动终止残留后端进程（含重试机制）
- 最小权限 Shell 能力配置：仅授权执行指定 sidecar 二进制
- 一键构建脚本 `scripts/build.py`：PyInstaller → sidecar 部署（含 target triple 命名）→ Tauri 打包
- 版本号统一管理 `scripts/bump.mjs`：5 文件同步（pyproject.toml、server.py、package.json、Cargo.toml、tauri.conf.json），支持 `patch/minor/major` 语义化递增
- 应用图标集：多尺寸 PNG、macOS ICNS、Windows ICO

<!-- 变更链接 -->
[1.8.0]: https://github.com/ONEGAYI/OpenImage/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/ONEGAYI/OpenImage/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/ONEGAYI/OpenImage/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/ONEGAYI/OpenImage/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/ONEGAYI/OpenImage/compare/v1.3.2...v1.4.0
[1.3.2]: https://github.com/ONEGAYI/OpenImage/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/ONEGAYI/OpenImage/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/ONEGAYI/OpenImage/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/ONEGAYI/OpenImage/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ONEGAYI/OpenImage/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/ONEGAYI/OpenImage/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/ONEGAYI/OpenImage/releases/tag/v1.0.0
