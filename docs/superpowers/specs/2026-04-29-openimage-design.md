# OpenImage — GPT Image 2 桌面客户端设计文档

> 日期：2026-04-29
> 状态：已批准

## 概述

OpenImage 是一个桌面应用，通过 OpenAI Responses API 调用 GPT Image 2 模型生成图像。支持文生图、图生图、多图融合以及基于 response chain 的连续迭代编辑。前后端独立开发，后端可独立通过 CLI 使用。

## 技术栈

| 层 | 技术 | 说明 |
|---|------|------|
| 后端 | Python + FastAPI + Typer | HTTP 服务 + CLI 双入口 |
| 前端 | Tauri 2.x + React 18 + TypeScript | 桌面壳 + SPA |
| UI | Tailwind CSS（暗色主题） | 图片优先的视觉风格 |
| 状态管理 | Zustand | 轻量级 |
| 构建 | Vite（前端）+ PyInstaller（后端打包 exe） | |
| 存储 | SQLite + 文件系统 | 安装目录下，非 user profile |
| 通信 | HTTP API + SSE | 前端通过 fetch/SSE 调后端 |

## 系统架构

```
┌─────────────┐   ┌─────────────┐
│ Tauri App   │   │   CLI       │
│ React+TS    │   │   Typer     │
└──────┬──────┘   └──────┬──────┘
       │   HTTP API/SSE  │
       └────────┬────────┘
                │
       ┌────────┴────────┐
       │  FastAPI Server  │
       │  ├─ SessionMgr   │
       │  ├─ ResponseAPI  │
       │  ├─ ImageStore   │
       │  └─ SSE Streamer │
       └────────┬────────┘
                │  Responses API
       ┌────────┴────────┐
       │   OpenAI API     │
       │   gpt-image-2    │
       └─────────────────┘
```

## 目录结构

```
OpenImage/
├── backend/                 # Python 后端（独立可运行）
│   ├── src/
│   │   ├── api/             # FastAPI 路由
│   │   │   ├── generate.py  # 生成端点（SSE）
│   │   │   ├── sessions.py  # 会话 CRUD
│   │   │   ├── images.py    # 图片管理
│   │   │   └── settings.py  # 配置管理
│   │   ├── core/            # 核心业务逻辑
│   │   │   ├── client.py    # OpenAI Response API 封装
│   │   │   ├── session.py   # 会话 & 迭代链管理
│   │   │   ├── storage.py   # 图片本地存储
│   │   │   └── config.py    # 配置管理（路径、API Key）
│   │   ├── cli.py           # CLI 入口（Typer）
│   │   └── server.py        # FastAPI 应用
│   ├── pyproject.toml
│   └── README.md
├── frontend/                # Tauri + React 前端
│   ├── src-tauri/           # Tauri 2.x 配置
│   │   ├── src/
│   │   └── Cargo.toml
│   ├── src/                 # React 应用
│   │   ├── components/      # UI 组件
│   │   ├── hooks/           # 自定义 Hooks
│   │   ├── services/        # API 调用层
│   │   ├── stores/          # Zustand stores
│   │   ├── types/           # TypeScript 类型
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
└── .gitignore
```

## 后端核心模块

### 1. ResponseAPIClient（core/client.py）

封装 OpenAI SDK 的 `client.responses.create()` 调用。

**职责：**
- 接受 prompt（文本）+ 图片列表（base64 或 image_id）
- 接受 `previous_response_id` 用于迭代链
- 调用 OpenAI Responses API，model 使用宿主模型（如 gpt-4.1），tools 包含 `image_generation`
- 支持流式返回（`partial_images`）
- 可配置参数：size、quality、output_format、output_compression

**关键映射：**

| 本系统输入 | Response API 格式 |
|-----------|-------------------|
| 纯文本 prompt | `input=input_text` |
| base64 图片 | `input_image.image_url = data:image/...;base64,...` |
| image_id（本系统） | 查 DB 获取 response_id，设为 `previous_response_id`；图片已在上下文中，无需重新传 |

### 2. SessionManager（core/session.py）

**职责：**
- 会话 CRUD（创建、查询、重命名、删除）
- 维护每个会话的 `head_response_id`（迭代链头）
- Fork 支持：从任意历史图片的 response_id 创建新迭代链

**迭代链树状结构：**
```
img_1 → img_2 → img_3 → img_4
               ↘ img_5 → img_6  (fork from img_3)
```

通过 `parent_image_id` 字段构建树，支持向上回溯完整路径。

### 3. ImageStore（core/storage.py）

**职责：**
- 图片文件读写（安装目录下）
- 元数据管理（SQLite images 表）
- 生成唯一文件名（`{timestamp}_{random}.png`）

### 4. SSE Streamer（api/generate.py）

**SSE 事件序列：**

```
event: generating       → {"step": N, "response_id": "resp_xxx"}
event: partial_image    → {"index": 1, "b64_json": "..."}  (0~3 次)
event: completed        → {"image_id": "img_xxx", "revised_prompt": "...", ...}
event: error            → {"code": "...", "message": "..."}
```

### 5. CLI（cli.py）

```
openimage serve [--port 8765]              # 启动 HTTP 服务
openimage generate "prompt" [options]       # 单次文生图
openimage edit -i photo.png "prompt"        # 单次图生图
openimage edit -i a.png -i b.png "prompt"   # 多图融合
openimage chat                              # 交互式会话
openimage sessions list                     # 列出会话
openimage sessions show <id>                # 查看会话详情
openimage sessions delete <id>              # 删除会话
openimage config set api_key <key>          # 设置 API Key
```

## 前端设计

### 三栏布局

```
┌──────────┬──────────────────────────────┬──────────────┐
│ 会话列表  │       图片画廊 + 输入区       │   图片详情    │
│ (220px)  │                              │   (280px)    │
│          │  ┌──────────────────────┐    │              │
│ + 新建    │  │  图片卡片网格         │    │  预览图      │
│ ──────── │  │  (横向滚动/换行)      │    │  Prompt      │
│ 海边日落  │  │                      │    │  参数信息     │
│ 产品设计  │  └──────────────────────┘    │  操作按钮     │
│ Logo迭代  │  ┌──────────────────────┐    │              │
│          │  │ 附件预览 (向上扩展)    │    │  💾 保存     │
│          │  ├──────────────────────┤    │  📋 复制     │
│          │  │ 文本输入框             │    │  🔀 Fork    │
│          │  ├──────────────────────┤    │              │
│          │  │ [上传] [设置] [生成]   │    │              │
│          │  └──────────────────────┘    │              │
└──────────┴──────────────────────────────┴──────────────┘
```

### 输入栏区块结构（动态扩展）

输入栏区块从底部向上构建：
1. **操作按钮行**（底部固定）：上传、设置、生成
2. **文本输入框**（中间）：自适应高度（40px~120px）
3. **附件预览区**（最上方）：向上动态扩展，自动换行

扩展规则：
- 附件区高度 = `Math.ceil(n / maxPerRow) × (thumbSize + gap) + padding`
- 附件区最大高度不超过视口 40%，超出后横向滚动
- 画廊区域 = 窗口剩余空间，自动收缩

### 视觉风格

- 暗色主题（背景 `#0f172a`）
- 图片优先（图片区域最大化，UI 元素最小化）
- 蓝色强调色（`#3b82f6`）
- 8px 圆角卡片

### 交互流程

1. 用户输入文本 prompt（可选上传参考图片）
2. 点击生成 → SSE 流式渐进预览（模糊→清晰）
3. 完成后展示图片卡片 + 右侧详情面板
4. 继续输入新 prompt → 自动传递 `previous_response_id` 迭代
5. 可从任意历史图片 Fork 创建新迭代链

## HTTP API 端点

```
POST   /api/generate              # 生成/迭代图片（SSE 流式）
POST   /api/sessions              # 创建会话
GET    /api/sessions              # 列出所有会话
GET    /api/sessions/{id}         # 获取会话详情（含迭代链树）
PATCH  /api/sessions/{id}         # 更新会话（重命名）
GET    /api/sessions/{id}/images  # 获取会话下所有图片
DELETE /api/sessions/{id}         # 删除会话及其图片
GET    /api/images/{id}           # 获取图片元数据
GET    /api/images/{id}/file      # 下载图片文件
DELETE /api/images/{id}           # 删除图片
GET    /api/settings              # 获取配置
PATCH  /api/settings              # 更新配置（API Key 等）
```

### POST /api/generate

**Request：**

```json
{
  "session_id": "sess_abc123",
  "prompt": "加一些海鸥",
  "images": [
    {"type": "base64", "data": "iVBOR...", "media_type": "image/png"},
    {"type": "image_id", "id": "img_xyz789"}
  ],
  "fork_from": "img_xyz789",
  "params": {
    "size": "1024x1024",
    "quality": "high",
    "output_format": "png"
  }
}
```

**SSE Response：** 见"后端核心模块 > SSE Streamer"。

### 图片输入方式

| type | 说明 | 后端处理 |
|------|------|----------|
| `base64` | 前端新上传的图片 | 直接作为 `input_image.image_url` 传给 Response API |
| `image_id` | 系统内已有图片 | 查 DB 获取 response_id，设为 `previous_response_id`（图片已在上下文中） |

## 数据存储

### 存储位置

所有数据存放在**安装目录**下，非 user profile：

| 数据 | 路径 |
|------|------|
| 数据库 | `{install_dir}/data/openimage.db` |
| 图片文件 | `{install_dir}/data/images/{session_id}/` |
| 日志 | `{install_dir}/data/logs/` |

默认安装路径建议 `D:\OpenImage`，用户可自定义。卸载时提示是否保留数据。

### SQLite 表结构

**sessions：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | `sess_` 前缀 UUID |
| name | TEXT | 用户自定义名称 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 最后活动时间 |
| head_response_id | TEXT | 当前迭代链头 |

**images：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | `img_` 前缀 UUID |
| session_id | TEXT FK | 所属会话 |
| step | INTEGER | 迭代链序号（1-based） |
| response_id | TEXT | OpenAI Response ID |
| prompt | TEXT | 用户输入的 prompt |
| revised_prompt | TEXT | OpenAI 修订后的 prompt |
| parent_image_id | TEXT FK nullable | 上一步图片 ID（构建迭代树） |
| file_path | TEXT | 本地文件相对路径 |
| size | TEXT | 如 `1024x1024` |
| quality | TEXT | `low`/`medium`/`high` |
| output_format | TEXT | `png`/`jpeg`/`webp` |
| created_at | DATETIME | 生成时间 |

**settings：**

| 字段 | 类型 | 说明 |
|------|------|------|
| key | TEXT PK | 配置键名 |
| value | TEXT | 配置值 |

## 安装与打包

### 打包策略

| 组件 | 方式 | 产物 |
|------|------|------|
| 后端 | PyInstaller | 单文件 `openimage.exe` → `{install_dir}/bin/` |
| 前端 | Tauri build | 原生安装包（MSI/NSIS） |

### 安装/更新/卸载策略

| 阶段 | 操作 |
|------|------|
| 首次安装 | 用户选择安装路径（默认 `D:\OpenImage`），创建 `bin/` + `data/` 目录，注册系统 PATH |
| 更新安装 | 自动识别已有安装路径（通过注册表或卸载信息），仅覆盖 `bin/` 下的程序文件，**不覆盖** `data/` 目录（数据库、图片、配置） |
| 卸载 | 从系统 PATH 移除条目，提示用户是否保留 `data/` 目录（保留则历史数据不丢失） |

**更新安装的关键行为：**
1. 检测注册表/卸载键中记录的安装路径
2. 若检测到已有安装，自动填充该路径，禁止用户手动改为其他路径（避免数据割裂）
3. 备份 `bin/` 后覆盖，`data/` 目录完全跳过
4. 若数据库 schema 有变更，启动时自动执行 migration（不破坏已有数据）

Windows 通过注册表 `HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment` 操作 PATH。安装路径记录在 `HKLM\SOFTWARE\OpenImage` 或 `HKCU\SOFTWARE\OpenImage` 下。

## 第一版范围

### 包含

- 文生图（纯文本 prompt）
- 图生图（上传参考图片 + prompt）
- 多图融合（多张参考图片 + prompt）
- Response Chain 迭代编辑（基于 previous_response_id）
- Fork 分支（从历史图片创建新迭代链）
- 多会话管理
- SSE 流式渐进预览
- CLI 单次调用 + 交互式会话
- 本地持久化（安装目录）
- 暗色主题 UI

### 不包含（后续版本）

- Inpainting（遮罩局部重绘）
- 图片 URL 输入
- 批量生成（n > 1）
- 图片对比视图
- Prompt 模板/预设
- 多语言支持
