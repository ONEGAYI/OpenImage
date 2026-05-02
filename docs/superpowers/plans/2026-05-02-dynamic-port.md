# 动态端口分配实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将固定端口 8765/1420 改为 OS 自动分配，支持多实例运行和端口冲突规避。

**Architecture:** 后端通过 `socket.bind(:0)` 获取空闲端口，Tauri 模式下 Rust 主导分配并传给 sidecar，Web 模式下后端写端口文件供 Vite 读取。前端 Tauri 模式通过 `invoke("backend_url")` 获取后端地址，Web 模式通过 Vite proxy 转发 `/api` 请求。

**Tech Stack:** Python socket, Rust std::net::TcpListener, Tauri 2.x State/invoke, Vite server.proxy

---

## 文件变更清单

| 操作 | 文件 | 职责 |
|------|------|------|
| 创建 | `backend/src/core/port.py` | `find_free_port()` + 端口文件读写工具 |
| 创建 | `backend/tests/test_port.py` | 端口工具的测试 |
| 修改 | `backend/entry.py:33,57-59` | 默认 port=0，调用 find_free_port，非 frozen 写端口文件 |
| 修改 | `backend/src/cli.py:72,82` | 默认 port=0，调用 find_free_port，写端口文件 |
| 修改 | `frontend/src-tauri/src/lib.rs` | 动态端口分配，AppState，传 --port 给 sidecar |
| 修改 | `frontend/src/services/api.ts:11-13,15-28,71-73` | 移除硬编码 BASE_URL，改用缓存 + invoke |
| 修改 | `frontend/src/App.tsx:3-4,24-61` | initBaseUrl() 调用，polling 适配 |
| 修改 | `frontend/vite.config.ts` | port=0，strictPort=false，proxy /api |
| 修改 | `frontend/src-tauri/tauri.conf.json:8` | devUrl 适配 |
| 修改 | `.gitignore` | 添加 .backend-port |

---

### Task 1: 后端端口工具模块 + 测试

**Files:**
- Create: `backend/tests/test_port.py`
- Create: `backend/src/core/port.py`

- [ ] **Step 1: 写失败测试**

```python
# backend/tests/test_port.py
import socket
from pathlib import Path

from src.core.port import find_free_port, write_port_file, read_port_file


def test_find_free_port_returns_positive_int():
    port = find_free_port()
    assert isinstance(port, int)
    assert port > 0


def test_find_free_port_is_available():
    """验证返回的端口确实可以绑定"""
    port = find_free_port()
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", port))  # 不应抛异常


def test_find_free_port_returns_different_ports():
    """连续调用应返回不同端口（前一个已释放，可能重复但概率极低）"""
    ports = {find_free_port() for _ in range(5)}
    assert len(ports) >= 2


def test_write_and_read_port_file(tmp_path, monkeypatch):
    monkeypatch.setattr("src.core.port.PORT_FILE", tmp_path / ".backend-port")
    write_port_file(12345)
    assert read_port_file() == 12345


def test_read_port_file_missing_returns_default(tmp_path, monkeypatch):
    monkeypatch.setattr("src.core.port.PORT_FILE", tmp_path / "nonexistent")
    assert read_port_file() == 8765


def test_read_port_file_invalid_content_returns_default(tmp_path, monkeypatch):
    port_file = tmp_path / ".backend-port"
    port_file.write_text("not-a-number")
    monkeypatch.setattr("src.core.port.PORT_FILE", port_file)
    assert read_port_file() == 8765
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && python -m pytest tests/test_port.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'src.core.port'`

- [ ] **Step 3: 实现端口工具模块**

```python
# backend/src/core/port.py
import socket
from pathlib import Path

PORT_FILE = Path(__file__).resolve().parent.parent.parent.parent / "frontend" / ".backend-port"
DEFAULT_PORT = 8765


def find_free_port() -> int:
    """让 OS 分配一个空闲端口（bind :0 → 读取实际端口 → 关闭）"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def write_port_file(port: int) -> None:
    """将端口号写入文件，供 Vite 读取"""
    PORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    PORT_FILE.write_text(str(port))


def read_port_file() -> int:
    """读取端口文件，文件不存在或内容无效时返回默认端口 8765"""
    try:
        return int(PORT_FILE.read_text().strip())
    except (FileNotFoundError, ValueError):
        return DEFAULT_PORT
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd backend && python -m pytest tests/test_port.py -v`
Expected: 6 passed

- [ ] **Step 5: 提交**

```bash
git add backend/src/core/port.py backend/tests/test_port.py
git commit -m "feat: 添加端口工具模块（find_free_port + 端口文件读写）"
```

---

### Task 2: 后端 entry.py 适配动态端口

**Files:**
- Modify: `backend/entry.py`

- [ ] **Step 1: 修改 entry.py**

在 `main()` 函数中：
1. `--port` 默认值改为 `0`
2. 当 port==0 时调用 `find_free_port()`
3. 非 frozen 模式写端口文件

```python
# backend/entry.py
"""PyInstaller 入口点 — 绕过 Typer CLI 直接调用 uvicorn"""
import argparse
import logging
import sys
from pathlib import Path


def _setup_logging(base_dir: Path) -> None:
    """将 stderr/stdout 重定向到日志文件（console=False 下无终端输出）"""
    log_dir = base_dir / "data" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "backend.log"

    # 超过 2MB 清空，避免无限增长
    try:
        if log_file.stat().st_size > 2_000_000:
            log_file.write_text("")
    except FileNotFoundError:
        pass

    fh = open(log_file, "a", encoding="utf-8")  # noqa: SIM115
    sys.stderr = fh
    sys.stdout = fh
    logging.basicConfig(
        stream=sys.stderr,
        level=logging.DEBUG,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def main():
    parser = argparse.ArgumentParser(description="OpenImage Backend Server")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--base-dir", type=str, default=None)
    args = parser.parse_args()

    if getattr(sys, "frozen", False):
        if hasattr(sys, "_MEIPASS"):
            sys.path.insert(0, str(Path(sys._MEIPASS)))

        from src.core.config import get_base_dir
        resolved = Path(args.base_dir) if args.base_dir else get_base_dir()
        _setup_logging(resolved)
        logging.info("Backend starting (frozen mode), base_dir=%s", resolved)
    else:
        from src.core.config import get_base_dir
        resolved = Path(args.base_dir) if args.base_dir else get_base_dir()

    from src.core.port import find_free_port, write_port_file

    actual_port = args.port or find_free_port()

    # 非 frozen 模式（开发环境）写端口文件供 Vite 读取
    if not getattr(sys, "frozen", False):
        write_port_file(actual_port)

    try:
        import uvicorn
        from src.server import create_app
    except Exception as e:
        logging.critical("Import failed: %s", e, exc_info=True)
        raise

    try:
        uvicorn.run(
            create_app(resolved),
            host="127.0.0.1",
            port=actual_port,
            log_level="info",
            log_config={
                "version": 1,
                "disable_existing_loggers": False,
                "formatters": {
                    "default": {
                        "()": "uvicorn.logging.DefaultFormatter",
                        "fmt": "%(levelprefix)s %(message)s",
                        "use_colors": False,
                    },
                    "access": {
                        "()": "uvicorn.logging.AccessFormatter",
                        "fmt": '%(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s',
                        "use_colors": False,
                    },
                },
                "handlers": {
                    "default": {
                        "formatter": "default",
                        "class": "logging.StreamHandler",
                        "stream": "ext://sys.stderr",
                    },
                    "access": {
                        "formatter": "access",
                        "class": "logging.StreamHandler",
                        "stream": "ext://sys.stderr",
                    },
                },
                "loggers": {
                    "uvicorn": {"handlers": ["default"], "level": "INFO"},
                    "uvicorn.error": {"level": "INFO"},
                    "uvicorn.access": {"handlers": ["access"], "level": "INFO", "propagate": False},
                },
            },
        )
    except Exception as e:
        logging.critical("Backend failed to start: %s", e, exc_info=True)
        raise


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 手动验证后端启动**

Run: `cd backend && python entry.py`
Expected: 后端启动在随机端口，`frontend/.backend-port` 文件被创建，内容为实际端口号

- [ ] **Step 3: 提交**

```bash
git add backend/entry.py
git commit -m "feat: entry.py 支持 port=0 动态分配并写端口文件"
```

---

### Task 3: 后端 cli.py 适配动态端口

**Files:**
- Modify: `backend/src/cli.py`

- [ ] **Step 1: 修改 cli.py serve 命令**

仅修改 `serve` 函数，其他命令不变：

```python
# backend/src/cli.py — 仅展示 serve 命令的修改
@app.command()
def serve(
    port: int = 0,
    base_dir: str = typer.Option(None, "--base-dir", help="数据目录覆盖"),
):
    """启动 HTTP API 服务"""
    import uvicorn
    from src.server import create_app
    from src.core.port import find_free_port, write_port_file

    resolved = Path(base_dir) if base_dir else get_base_dir()
    actual_port = port or find_free_port()
    write_port_file(actual_port)
    console.print(f"[green]Starting OpenImage server on port {actual_port}...[/green]")
    console.print(f"[dim]Data directory: {resolved}[/dim]")
    uvicorn.run(create_app(resolved), host="127.0.0.1", port=actual_port)
```

- [ ] **Step 2: 手动验证**

Run: `cd backend && python -m src.cli serve`
Expected: 启动在随机端口，端口文件被创建

Run: `cd backend && python -m src.cli serve --port 9999`
Expected: 启动在端口 9999，端口文件内容为 9999

- [ ] **Step 3: 提交**

```bash
git add backend/src/cli.py
git commit -m "feat: cli.py serve 命令支持 port=0 动态分配并写端口文件"
```

---

### Task 4: Rust 动态端口分配 + AppState

**Files:**
- Modify: `frontend/src-tauri/src/lib.rs`

- [ ] **Step 1: 修改 lib.rs**

完整替换文件：

```rust
// frontend/src-tauri/src/lib.rs
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{Emitter, Manager, RunEvent};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(target_os = "windows")]
const BACKEND_PROCESS: &str = "openimage-backend.exe";

struct Backend(Mutex<Option<CommandChild>>);

struct AppState {
    backend_port: u16,
}

#[tauri::command]
fn backend_url(state: tauri::State<AppState>) -> String {
    format!("http://127.0.0.1:{}", state.backend_port)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Backend(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![backend_url])
        .setup(|app| {
            // 分配空闲端口
            let port = {
                let listener = std::net::TcpListener::bind("127.0.0.1:0")
                    .expect("Failed to find free port");
                let port = listener.local_addr().unwrap().port();
                drop(listener);
                port
            };

            app.manage(AppState { backend_port: port });

            let app_handle = app.handle().clone();

            let data_dir = std::env::current_exe()?
                .parent()
                .expect("executable has no parent directory")
                .to_path_buf();
            std::fs::create_dir_all(&data_dir)?;

            let data_dir_str = data_dir.to_string_lossy().to_string();
            let port_str = port.to_string();

            // Heavy work in background so the window shows the loading screen immediately.
            tauri::async_runtime::spawn(async move {
                #[cfg(target_os = "windows")]
                {
                    let output = std::process::Command::new("taskkill")
                        .args(["/F", "/T", "/IM", BACKEND_PROCESS])
                        .creation_flags(CREATE_NO_WINDOW)
                        .output();
                    if output.as_ref().map(|o| o.status.success()).unwrap_or(false) {
                        tokio::time::sleep(Duration::from_millis(500)).await;
                    }
                }

                let sidecar = app_handle
                    .shell()
                    .sidecar("openimage-backend")
                    .expect("Failed to resolve openimage-backend sidecar")
                    .args(["--port", &port_str, "--base-dir", &data_dir_str]);

                let (mut rx, child) = sidecar.spawn().expect("Failed to spawn backend sidecar");

                app_handle
                    .state::<Backend>()
                    .0
                    .lock()
                    .unwrap()
                    .replace(child);

                let healthy = Arc::new(AtomicBool::new(false));

                let log_handle = app_handle.clone();
                let healthy_flag = healthy.clone();
                tauri::async_runtime::spawn(async move {
                    use tauri_plugin_shell::process::CommandEvent;
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => {
                                println!("[backend] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Stderr(line) => {
                                eprintln!("[backend] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Terminated(status) => {
                                eprintln!("[backend] exited: {:?}", status);
                                if !healthy_flag.load(Ordering::Relaxed) {
                                    let _ = log_handle.emit("backend-error", "Backend process exited unexpectedly");
                                }
                                break;
                            }
                            CommandEvent::Error(err) => {
                                eprintln!("[backend] error: {}", err);
                                if !healthy_flag.load(Ordering::Relaxed) {
                                    let _ = log_handle.emit("backend-error", "Backend error");
                                }
                                break;
                            }
                            _ => {}
                        }
                    }
                });

                let health_handle = app_handle.clone();
                let healthy_flag2 = healthy.clone();
                tauri::async_runtime::spawn(async move {
                    let url = format!("http://127.0.0.1:{}/api/settings", port);
                    let client = reqwest::Client::builder()
                        .timeout(Duration::from_secs(2))
                        .build()
                        .unwrap();

                    for attempt in 0..150 {
                        if attempt > 0 {
                            tokio::time::sleep(Duration::from_millis(200)).await;
                        }
                        match client.get(&url).send().await {
                            Ok(_) => {
                                println!("[backend] healthy after {} attempts", attempt + 1);
                                healthy_flag2.store(true, Ordering::Relaxed);
                                health_handle.emit("backend-ready", ()).ok();
                                return;
                            }
                            Err(_) => {
                                println!("[backend] waiting... attempt {}", attempt + 1);
                            }
                        }
                    }
                    eprintln!("[backend] failed to start within 30s");
                    let _ = health_handle.emit("backend-error", "Backend failed to start within 30 seconds");
                });
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            RunEvent::Exit | RunEvent::ExitRequested { .. } => {
                if let Some(backend) = app_handle.try_state::<Backend>() {
                    if let Ok(mut guard) = backend.0.lock() {
                        if let Some(child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
                #[cfg(target_os = "windows")]
                let _ = std::process::Command::new("taskkill")
                    .args(["/F", "/T", "/IM", BACKEND_PROCESS])
                    .creation_flags(CREATE_NO_WINDOW)
                    .spawn();
            }
            _ => {}
        });
}
```

关键变更点：
1. 移除 `const BACKEND_PORT: u16 = 8765`
2. 新增 `struct AppState { backend_port: u16 }`
3. setup 中通过 `TcpListener::bind("127.0.0.1:0")` 获取端口
4. `app.manage(AppState { backend_port: port })`
5. sidecar 启动传入 `--port` 参数
6. `backend_url()` 从 `State<AppState>` 读取端口
7. 健康检查 URL 使用动态端口

- [ ] **Step 2: 编译验证**

Run: `cd frontend && npm run tauri build -- --debug 2>&1 | head -20` 或 `cd frontend/src-tauri && cargo build`
Expected: 编译成功，无错误

- [ ] **Step 3: 提交**

```bash
git add frontend/src-tauri/src/lib.rs
git commit -m "feat: Rust 侧动态端口分配，传 --port 给 sidecar"
```

---

### Task 5: 前端 api.ts 重构 — 移除硬编码 BASE_URL

**Files:**
- Modify: `frontend/src/services/api.ts`

这是最关键的前端变更。核心思路：
- 新增 `initBaseUrl()` 异步初始化 + `getBaseUrl()` 同步读取缓存
- Tauri 模式通过 `invoke("backend_url")` 获取，Web 模式返回空字符串（走 Vite proxy）
- `getImageFileUrl()` 使用缓存的 base URL

- [ ] **Step 1: 重写 api.ts**

```typescript
// frontend/src/services/api.ts
import type {
  Session,
  Image,
  GenerateRequest,
  GenerateCompleted,
  SettingsResponse,
  InpaintRequest,
  InpaintCompleted,
} from "../types";

// --- Base URL 管理 ---

let cachedBaseUrl: string | null = null;
const isTauri = "__TAURI_INTERNALS__" in window;

/**
 * 初始化后端 base URL。
 * Tauri 模式：invoke("backend_url") 获取完整 URL。
 * Web 模式：返回空字符串（走 Vite proxy 相对路径）。
 * 必须在任何 API 调用之前调用。
 */
export async function initBaseUrl(): Promise<void> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    cachedBaseUrl = await invoke<string>("backend_url");
  } else {
    cachedBaseUrl = "";
  }
}

function getBaseUrl(): string {
  if (cachedBaseUrl === null) {
    throw new Error("initBaseUrl() must be called before using API");
  }
  return cachedBaseUrl;
}

// --- HTTP helpers ---

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

// --- Sessions ---

export async function listSessions(): Promise<Session[]> {
  return request("/api/sessions");
}

export async function createSession(name: string): Promise<Session> {
  return request("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function getSession(id: string): Promise<Session> {
  return request(`/api/sessions/${id}`);
}

export async function renameSession(
  id: string,
  name: string
): Promise<Session> {
  return request(`/api/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function deleteSession(id: string): Promise<void> {
  await request(`/api/sessions/${id}`, { method: "DELETE" });
}

// --- Images ---

export async function getSessionImages(sessionId: string): Promise<Image[]> {
  return request(`/api/sessions/${sessionId}/images`);
}

export async function getImage(id: string): Promise<Image> {
  return request(`/api/images/${id}`);
}

export function getImageFileUrl(id: string): string {
  return `${getBaseUrl()}/api/images/${id}/file`;
}

export async function deleteImage(id: string): Promise<void> {
  await request(`/api/images/${id}`, { method: "DELETE" });
}

export async function deleteImages(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => deleteImage(id)));
}

// --- SSE helpers ---

type SSEEventHandler = (event: string, data: unknown) => void;

function connectSSE(url: string, body: unknown, handler: SSEEventHandler): AbortController {
  const controller = new AbortController();

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (res) => {
      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              handler(currentEvent, JSON.parse(line.slice(6)));
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        handler("network_error", { code: "network_error", message: err.message });
      }
    });

  return controller;
}

// --- Generate (SSE) ---

export function generateImage(
  req: GenerateRequest,
  onPartial: (index: number, b64: string) => void,
  onCompleted: (data: GenerateCompleted) => void,
  onError: (code: string, message: string) => void
): AbortController {
  return connectSSE(`${getBaseUrl()}/api/generate`, req, (event, data) => {
    if (event === "partial_image") onPartial((data as { index: number; b64_json: string }).index, (data as { index: number; b64_json: string }).b64_json);
    else if (event === "completed") onCompleted(data as GenerateCompleted);
    else if (event === "error") onError((data as { code: string; message: string }).code, (data as { code: string; message: string }).message);
    else if (event === "network_error") onError((data as { code: string; message: string }).code, (data as { code: string; message: string }).message);
  });
}

// --- Inpaint (SSE) ---

export function inpaintImage(
  req: InpaintRequest,
  onCompleted: (data: InpaintCompleted) => void,
  onError: (code: string, message: string) => void
): AbortController {
  return connectSSE(`${getBaseUrl()}/api/inpaint`, req, (event, data) => {
    if (event === "completed") onCompleted(data as InpaintCompleted);
    else if (event === "error" || event === "network_error") onError((data as { code: string; message: string }).code, (data as { code: string; message: string }).message);
  });
}

// --- Settings ---

export async function getSettings(): Promise<SettingsResponse> {
  return request("/api/settings");
}

export async function updateSettings(
  settings: Record<string, string>
): Promise<void> {
  await request("/api/settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/services/api.ts
git commit -m "feat: api.ts 移除硬编码 BASE_URL，改用 initBaseUrl() + getBaseUrl()"
```

---

### Task 6: 前端 App.tsx 适配动态端口

**Files:**
- Modify: `frontend/src/App.tsx`

变更要点：
1. 导入 `initBaseUrl` 替代 `BASE_URL`
2. Tauri 模式：在 `backend-ready` 回调中先调用 `initBaseUrl()`，再 `setReady(true)`
3. Web 模式：poll 使用相对路径 `/api/settings`（不再需要 BASE_URL）

- [ ] **Step 1: 修改 App.tsx**

```tsx
// frontend/src/App.tsx
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { initBaseUrl } from "./services/api";
import Sidebar from "./components/Sidebar";
import Gallery from "./components/Gallery";
import InputArea from "./components/InputArea";
import DetailPanel from "./components/DetailPanel";
import Topbar from "./components/Topbar";
import SettingsDialog from "./components/SettingsDialog";
import ToastContainer from "./components/Toast";

function App() {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setError(t("app.backendTimeout"));
    }, 30000);

    if ("__TAURI_INTERNALS__" in window) {
      const unlistenReady = listen("backend-ready", async () => {
        try {
          await initBaseUrl();
          clearTimeout(timeout);
          setReady(true);
        } catch (e) {
          clearTimeout(timeout);
          setError(String(e));
        }
      });

      const unlistenError = listen<string>("backend-error", (e) => {
        clearTimeout(timeout);
        setError(e.payload);
      });

      return () => {
        unlistenReady.then((fn) => fn());
        unlistenError.then((fn) => fn());
        clearTimeout(timeout);
      };
    } else {
      // Web 模式：baseUrl 为空字符串（Vite proxy），直接用相对路径 poll
      initBaseUrl().then(() => {
        let active = true;
        const poll = async () => {
          while (active) {
            try {
              const res = await fetch("/api/settings");
              if (res.ok) {
                clearTimeout(timeout);
                setReady(true);
                return;
              }
            } catch {}
            await new Promise((r) => setTimeout(r, 500));
          }
        };
        poll();
        return () => {
          active = false;
          clearTimeout(timeout);
        };
      });
    }
  }, []);

  if (error) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ background: "var(--bg)", color: "var(--fg)" }}
      >
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            {t("app.backendFailed")}
          </h2>
          <p style={{ fontSize: 14, opacity: 0.7 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ background: "var(--bg)", color: "var(--fg)" }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: "3px solid var(--border)",
              borderTopColor: "var(--accent)",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <p style={{ fontSize: 14, opacity: 0.7 }}>{t("app.starting")}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--bg)", color: "var(--fg)" }}
    >
      <div className="shrink-0"><Sidebar /></div>
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onOpenSettings={() => setShowSettings(true)} />
        <Gallery />
        <InputArea onOpenSettings={() => setShowSettings(true)} />
      </div>
      <div className="shrink-0 overflow-hidden"><DetailPanel /></div>
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
      <ToastContainer />
    </div>
  );
}

export default App;
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/App.tsx
git commit -m "feat: App.tsx 使用 initBaseUrl() 初始化后端地址"
```

---

### Task 7: Vite 配置 — 动态端口 + proxy

**Files:**
- Modify: `frontend/vite.config.ts`

变更要点：
1. `port: 0` + `strictPort: false`（优先 1420 但不强制）
2. 新增 proxy `/api` 转发到后端
3. `readPortFile()` 读取 `frontend/.backend-port`

- [ ] **Step 1: 修改 vite.config.ts**

```typescript
// frontend/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "fs";
import { resolve } from "path";

const host = process.env.TAURI_DEV_HOST;

function readBackendPort(): number {
  try {
    const portFile = resolve(__dirname, ".backend-port");
    return parseInt(readFileSync(portFile, "utf-8").trim(), 10);
  } catch {
    console.warn("[vite] .backend-port not found, falling back to 8765");
    return 8765;
  }
}

export default defineConfig(async () => {
  const backendPort = readBackendPort();

  return {
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: false,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        ignored: ["**/src-tauri/**"],
      },
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
```

注意：Vite 端口保持 `1420` 但 `strictPort: false`，冲突时自动递增。Tauri 2.x 会自动检测 Vite 输出中的实际端口。

- [ ] **Step 2: 验证 Vite 启动**

Run: `cd frontend && npm run dev`
Expected: Vite 启动成功，控制台显示代理配置信息（如 backend port）

- [ ] **Step 3: 提交**

```bash
git add frontend/vite.config.ts
git commit -m "feat: Vite 动态端口 + /api proxy 转发到后端"
```

---

### Task 8: 配置文件更新

**Files:**
- Modify: `.gitignore`
- Modify: `frontend/src-tauri/tauri.conf.json`

- [ ] **Step 1: 更新 .gitignore**

在文件末尾的 `# Misc` 之前添加：

```
# Dynamic port file
.backend-port
```

具体位置：在 `# Tauri codegen` 块之后、`# Misc` 块之前添加：

```
# Tauri codegen
frontend/src-tauri/gen/

# Dynamic port file
.backend-port

# Misc
references/
.superpowers/
```

注意：`.backend-port` 位于 `frontend/` 目录下，但 .gitignore 中的路径需要匹配实际位置。由于 `.gitignore` 在项目根目录，应写为 `frontend/.backend-port`。

更正：使用精确路径：

```
# Dynamic port file
frontend/.backend-port
```

- [ ] **Step 2: 确认 tauri.conf.json 无需改动**

当前 `devUrl: "http://localhost:1420"` 配合 Vite 的 `port: 1420, strictPort: false` 即可。Tauri 2.x 在 `beforeDevCommand` 启动后会自动检测 Vite 输出中的实际端口，因此 `devUrl` 保持不变。

- [ ] **Step 3: 提交**

```bash
git add .gitignore
git commit -m "chore: 添加 .backend-port 到 gitignore"
```

---

### Task 9: 集成验证

**Files:** 无新文件

这一步验证所有变更协同工作。

- [ ] **Step 1: 验证 Web 开发模式**

```bash
# 终端 1：启动后端
cd backend
python -m src.cli serve

# 检查端口文件
cat frontend/.backend-port

# 终端 2：启动前端
cd frontend
npm run dev
```

Expected:
1. 后端启动在随机端口（非 8765）
2. `frontend/.backend-port` 文件内容为实际端口
3. Vite proxy 转发 `/api` 请求到该端口
4. 浏览器中应用正常加载、会话和图片功能正常

- [ ] **Step 2: 验证固定端口参数仍有效**

```bash
cd backend
python -m src.cli serve --port 9000
```

Expected: 后端启动在 9000，端口文件内容为 9000

- [ ] **Step 3: 验证后端测试通过**

Run: `cd backend && python -m pytest tests/ -v`
Expected: 所有测试通过（包括新的 test_port.py）

- [ ] **Step 4: 验证 Tauri 构建不报错**

Run: `cd frontend/src-tauri && cargo check`
Expected: 编译通过

- [ ] **Step 5: 提交最终集成状态**

```bash
git add -A
git status  # 确认无遗漏
git commit -m "chore: 动态端口分配重构完成，集成验证通过"
```

---

## 自查清单

| Spec 要求 | 对应 Task |
|-----------|----------|
| `find_free_port()` 工具函数 | Task 1 |
| `entry.py` port=0 + 端口文件 | Task 2 |
| `cli.py` port=0 + 端口文件 | Task 3 |
| Rust 动态端口 + AppState | Task 4 |
| `api.ts` 移除硬编码 + invoke | Task 5 |
| `App.tsx` initBaseUrl + polling | Task 6 |
| Vite proxy + 动态端口 | Task 7 |
| .gitignore + tauri.conf.json | Task 8 |
| 错误处理（fallback 8765） | Task 1 (read_port_file), Task 7 (readBackendPort) |
| CORS 不变 | 未改动，已确认 |
| getImageFileUrl 适配 | Task 5 |
