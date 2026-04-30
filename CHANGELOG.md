# Changelog

本项目的所有重要变更均记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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
[1.0.1]: https://github.com/user/OpenImage/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/user/OpenImage/releases/tag/v1.0.0
