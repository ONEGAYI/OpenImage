# 动态端口分配设计

> 日期：2026-05-02
> 状态：已批准

## 背景

当前前后端通信端口硬编码为 `8765`，前端开发服务器固定 `1420`。这导致：
1. 端口冲突：用户机器上其他程序占用 8765 时后端启动失败
2. 无法多实例：同时运行多个 OpenImage 实例会端口冲突

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 分配策略 | OS 自动分配（port=0） | 业界标准，零冲突，无上限多实例 |
| Desktop 端口发现 | Rust 绑定临时 socket 获取端口后传给 sidecar | Rust 完全掌控生命周期 |
| Web 端口发现 | 后端写端口文件，Vite 启动时读取 | 简单可靠，无额外依赖 |
| Web API 通信 | Vite proxy 转发 /api → 后端 | 前端无需知道后端端口 |
| Desktop API 通信 | Tauri invoke("backend_url") 获取 | 前端动态获取完整 URL |

## 架构

### Desktop 模式（Tauri + Sidecar）

```
Rust setup
  ├─ TcpListener::bind("127.0.0.1:0") → 获取空闲端口 P
  ├─ 关闭 listener
  ├─ sidecar --port P --base-dir <dir>
  ├─ 健康检查 http://127.0.0.1:P/api/settings（30s 超时）
  └─ emit("backend-ready")

前端
  ├─ invoke("backend_url") → "http://127.0.0.1:P"
  ├─ 缓存该 URL
  └─ 所有 API 请求使用缓存 URL
```

### Web 开发模式（Vite only）

```
后端启动
  ├─ find_free_port() → 端口 P
  ├─ uvicorn.bind(port=P)
  └─ 写入 frontend/.backend-port（内容: P）

npm run dev
  ├─ vite.config.ts 读取 .backend-port → P
  ├─ Vite 开发服务器 port=0（动态）
  └─ proxy /api → http://127.0.0.1:P

前端
  ├─ BASE_URL = ""（空字符串，使用相对路径）
  └─ 所有请求 /api/... 由 Vite proxy 转发
```

## 变更详情

### 后端

#### `backend/entry.py`

- `--port` 默认值从 `8765` 改为 `0`
- 新增 `find_free_port()` 函数：
  ```python
  import socket

  def find_free_port() -> int:
      with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
          s.bind(("127.0.0.1", 0))
          return s.getsockname()[1]
  ```
- 当 `port == 0` 时调用 `find_free_port()` 获取实际端口
- **仅非 frozen 模式**下写入端口文件 `frontend/.backend-port`

#### `backend/src/cli.py`

- `serve` 命令 `port` 参数默认值从 `8765` 改为 `0`
- 同样使用 `find_free_port()` 逻辑
- 端口确定后写入 `frontend/.backend-port`

#### `backend/src/server.py`

- 无需改动。CORS `allow_origin_regex` 已匹配 `localhost:\d+`

### Rust（Tauri）

#### `frontend/src-tauri/src/lib.rs`

- 移除 `const BACKEND_PORT: u16 = 8765`
- 新增 `struct AppState { backend_port: u16 }` 存入 `app.manage()`
- `setup` 阶段：
  1. `TcpListener::bind("127.0.0.1:0")` 获取空闲端口
  2. 关闭 listener
  3. sidecar 启动时传入 `--port <port>`
  4. 健康检查 URL 使用动态端口
- `backend_url()` 命令从 `AppState` 读取端口：
  ```rust
  #[tauri::command]
  fn backend_url(state: tauri::State<AppState>) -> String {
      format!("http://127.0.0.1:{}", state.backend_port)
  }
  ```

### 前端

#### `frontend/src/services/api.ts`

- 移除硬编码 `BASE_URL`
- 新增 `getBaseUrl(): Promise<string>`：
  - Tauri 模式：`invoke("backend_url")` 获取，首次调用后缓存
  - Web 模式：返回空字符串 `""`（走 Vite proxy 相对路径）
- 所有 `request()` / `connectSSE()` 调用改为 `async`，使用 `getBaseUrl()`
- `getImageFileUrl()` 同样适配：
  - Tauri：返回完整 URL `http://127.0.0.1:<port>/api/images/<id>/file`
  - Web：返回相对路径 `/api/images/<id>/file`

#### `frontend/src/App.tsx`

- polling URL 改为 `getBaseUrl()` 动态获取

#### `frontend/vite.config.ts`

- `server.port` 从 `1420` 改为 `0`
- `server.strictPort` 改为 `false`
- 新增 proxy 配置：
  ```ts
  proxy: {
    '/api': {
      target: `http://127.0.0.1:${readPortFile()}`,
      changeOrigin: true,
    }
  }
  ```
- `readPortFile()` 函数：同步读取 `frontend/.backend-port`，文件不存在时 fallback 到 `8765`

#### `frontend/src-tauri/tauri.conf.json`

- `build.devUrl` 从 `http://localhost:1420` 改为 `http://localhost:0` 或使用动态方案
  - 注意：Tauri dev 模式需要知道前端 dev server 的实际端口
  - 方案：Vite 启动后通过环境变量或配置传递实际端口

**devUrl 的特殊性**：Tauri dev 模式 (`tauri dev`) 先启动 `beforeDevCommand`（即 `npm run dev`），需要知道 Vite 的实际端口来加载 WebView。处理方式：
- Vite 配置 `server.port: 0` 后，实际端口会在启动时打印到 stdout
- Tauri 2.x 支持在 `beforeDevCommand` 中等待 dev server 就绪
- 或者：`devUrl` 保持为固定端口但允许 Vite 回退到该端口（使用 `strictPort: false` + 优选端口）

**推荐做法**：前端开发端口保持一个首选值但不强制：
- `server.port: 1420, strictPort: false` — 优先使用 1420，冲突时自动递增
- `tauri.conf.json` 的 `devUrl` 保持 `http://localhost:1420`
- 如果 Vite 实际分配了其他端口，`tauri dev` 会自动检测（Tauri 2.x 会读取 Vite stdout）

#### `frontend/.gitignore`

- 添加 `.backend-port`

## 错误处理

| 场景 | 处理 |
|------|------|
| 端口文件不存在（Web 模式） | Vite proxy fallback 到 8765，控制台打印警告 |
| bind→close 竞态（极低概率） | uvicorn 启动时报错，Rust 健康检查超时后 emit `backend-error` |
| 前端 invoke 获取端口失败 | 重试 3 次，失败显示错误页面 |
| 后端进程意外退出 | Rust 已有 `healthy_flag` 机制，30s 超时 |

## 不涉及的变更

- 生产模式打包流程（`scripts/build.py`）不变
- API 路由层不变
- CORS 策略不变（已支持任意 localhost 端口）
- 数据库/存储层不变
