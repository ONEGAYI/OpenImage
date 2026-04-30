# 版本信息 + 打包时间戳 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在设置页面底部和 CLI `-v` 中展示带打包时间戳的版本信息（如 `v1.0.0-20260430.120800`）

**Architecture:** 构建时 `build.py` 生成 `backend/src/build_info.py`（含时间戳），后端 import 读取并存入 `app.state`，API 层返回给前端，CLI 直接读取。开发环境 fallback 为 `v1.0.0-dev`。

**Tech Stack:** Python / FastAPI / Typer / React / TypeScript

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `scripts/build.py` | 打包前生成 build_info.py |
| Create (gitignore) | `backend/src/build_info.py` | 存储构建时间戳常量 |
| Modify | `.gitignore` | 忽略构建产物 |
| Modify | `backend/src/server.py:1-42` | 读取版本信息，存入 app.state |
| Modify | `backend/src/api/settings.py:50-61` | GET 响应增加 full_version |
| Modify | `backend/src/cli.py:12-14` | 添加 --version / -v callback |
| Modify | `frontend/src/types/index.ts:57-65` | SettingsResponse 增加 full_version |
| Modify | `frontend/src/components/SettingsDialog.tsx:119-133` | 底部显示版本号 |

---

### Task 1: 后端版本信息基础设施

**Files:**
- Modify: `backend/src/server.py`
- Modify: `.gitignore`

- [ ] **Step 1: 在 server.py 顶部添加版本信息读取逻辑**

在 `backend/src/server.py` 的 import 区域后、`create_app` 函数前，添加：

```python
try:
    from src.build_info import BUILD_TIMESTAMP
except ImportError:
    BUILD_TIMESTAMP = None

APP_VERSION = "1.0.0"
FULL_VERSION = f"v{APP_VERSION}-{BUILD_TIMESTAMP}" if BUILD_TIMESTAMP else f"v{APP_VERSION}-dev"
```

然后在 `create_app()` 函数内部、`app = FastAPI(...)` 之后添加：

```python
app.state.full_version = FULL_VERSION
```

同时将 FastAPI 的 version 参数引用常量：

```python
app = FastAPI(title="OpenImage", version=APP_VERSION, lifespan=lifespan)
```

- [ ] **Step 2: 在 .gitignore 中忽略构建产物**

在 `.gitignore` 的 `# PyInstaller` 区块后添加：

```
# Build info (generated at build time)
backend/src/build_info.py
```

- [ ] **Step 3: 验证后端启动正常**

Run: `cd backend && python -c "from src.server import FULL_VERSION; print(FULL_VERSION)"`
Expected: `v1.0.0-dev`（开发环境无 build_info.py）

- [ ] **Step 4: 提交**

```bash
git add backend/src/server.py .gitignore
git commit -m "feat(backend): 添加版本信息基础设施 — FULL_VERSION + build_info fallback"
```

---

### Task 2: API 层暴露版本信息

**Files:**
- Modify: `backend/src/api/settings.py:50-61`

- [ ] **Step 1: 修改 GET /api/settings 响应**

在 `backend/src/api/settings.py` 的 `get_settings` 函数中，修改返回值，在 `resolved_endpoint` 之后增加 `full_version` 字段：

```python
@router.get("")
async def get_settings(request: Request):
    db = request.app.state.db
    settings = await _load_settings(db)
    api_key = settings["api_key"]
    return {
        "api_key_set": api_key is not None,
        "api_key_preview": f"...{api_key[-4:]}" if api_key else None,
        "api_key": api_key,
        **{k: settings[k] for k in ("base_url", "api_mode", "model_name")},
        "resolved_endpoint": _resolve_endpoint(settings["base_url"], settings["api_mode"]),
        "full_version": request.app.state.full_version,
    }
```

- [ ] **Step 2: 验证 API 返回**

Run: `cd backend && python -c "
import asyncio
from src.server import create_app
from pathlib import Path
app = create_app()
print(app.state.full_version)
"`
Expected: `v1.0.0-dev`

- [ ] **Step 3: 提交**

```bash
git add backend/src/api/settings.py
git commit -m "feat(api): GET /api/settings 返回 full_version 字段"
```

---

### Task 3: CLI --version 支持

**Files:**
- Modify: `backend/src/cli.py:12-14`

- [ ] **Step 1: 添加 version callback 和 @app.callback**

在 `backend/src/cli.py` 中，在 `console = Console()` 之后、`MAX_RETRIES` 之前，添加：

```python
def _version_callback(value: bool):
    if value:
        from src.server import FULL_VERSION
        console.print(FULL_VERSION)
        raise typer.Exit()


@app.callback()
def main(
    version: bool = typer.Option(
        False, "--version", "-v",
        callback=_version_callback,
        is_eager=True,
        help="显示版本信息",
    ),
):
    pass
```

- [ ] **Step 2: 验证 CLI -v 输出**

Run: `cd backend && python -m src.cli -v`
Expected: `v1.0.0-dev`

- [ ] **Step 3: 提交**

```bash
git add backend/src/cli.py
git commit -m "feat(cli): 添加 --version / -v 显示版本信息"
```

---

### Task 4: 前端类型 + 设置页面展示

**Files:**
- Modify: `frontend/src/types/index.ts:57-65`
- Modify: `frontend/src/components/SettingsDialog.tsx:119-133`

- [ ] **Step 1: 更新 SettingsResponse 类型**

在 `frontend/src/types/index.ts` 的 `SettingsResponse` 接口中，`resolved_endpoint` 后增加：

```typescript
export interface SettingsResponse {
  api_key_set: boolean;
  api_key_preview: string | null;
  api_key: string | null;
  base_url: string | null;
  api_mode: "responses" | "images" | "chat";
  model_name: string;
  resolved_endpoint: string;
  full_version: string;
}
```

- [ ] **Step 2: 在 SettingsDialog 底部显示版本号**

在 `frontend/src/components/SettingsDialog.tsx` 中：

1. 添加 state：
```typescript
const [fullVersion, setFullVersion] = useState("");
```

2. 在 `useEffect` 的 `getSettings().then()` 回调中增加：
```typescript
if (s.full_version) setFullVersion(s.full_version);
```

3. 在 `{message && ...}` div 之后、`<div className="flex justify-end gap-2">` 按钮行之前，添加版本展示：

```tsx
{fullVersion && (
  <div
    className="text-xs text-center mb-3 select-all"
    style={{ color: "var(--faint)", fontFamily: "monospace" }}
  >
    {fullVersion}
  </div>
)}
```

- [ ] **Step 3: 验证前端编译**

Run: `cd frontend && npm run build`
Expected: 编译成功无报错

- [ ] **Step 4: 提交**

```bash
git add frontend/src/types/index.ts frontend/src/components/SettingsDialog.tsx
git commit -m "feat(frontend): 设置页面底部显示版本号+打包时间戳"
```

---

### Task 5: 构建脚本生成 build_info.py

**Files:**
- Modify: `scripts/build.py`

- [ ] **Step 1: 在 build.py 中添加 generate_build_info 函数**

在 `scripts/build.py` 顶部 import 区增加：

```python
from datetime import datetime
```

在 `build_backend()` 函数之前添加：

```python
def generate_build_info():
    timestamp = datetime.now().strftime("%Y%m%d.%H%M%S")
    target = BACKEND / "src" / "build_info.py"
    target.write_text(f'BUILD_TIMESTAMP = "{timestamp}"\n', encoding="utf-8")
    print(f"  Build timestamp: {timestamp}")
```

修改 `main()` 函数，在 `build_backend()` 之前调用：

```python
def main():
    generate_build_info()
    build_backend()
    deploy_sidecar()
    build_tauri()
```

- [ ] **Step 2: 验证 build_info.py 生成**

Run: `cd D:/CODE/Project/OpenImage && python scripts/build.py`（仅测试生成步骤）

或者手动验证：
Run: `cd D:/CODE/Project/OpenImage && python -c "
from pathlib import Path
from datetime import datetime
BACKEND = Path('backend')
timestamp = datetime.now().strftime('%Y%m%d.%H%M%S')
target = BACKEND / 'src' / 'build_info.py'
target.write_text(f'BUILD_TIMESTAMP = \"{timestamp}\"\n')
print(target.read_text())
"`
Expected: `BUILD_TIMESTAMP = "20260430.xxxxxx"`

验证后端读取：
Run: `cd backend && python -c "from src.server import FULL_VERSION; print(FULL_VERSION)"`
Expected: `v1.0.0-20260430.xxxxxx`

- [ ] **Step 3: 提交**

```bash
git add scripts/build.py
git commit -m "feat(build): 构建时生成 build_info.py 注入打包时间戳"
```

- [ ] **Step 4: 清理测试产物**

Run: `rm backend/src/build_info.py`（恢复 gitignore 状态）

---

### Task 6: bump.mjs 同步更新 FULL_VERSION

当 `bump.mjs` 更新版本号时，`server.py` 中的 `APP_VERSION` 也需要同步。

**Files:**
- Modify: `scripts/bump.mjs`

- [ ] **Step 1: 在 bump.mjs 的 FILES 数组中增加 server.py 的 APP_VERSION 匹配**

在 `scripts/bump.mjs` 的 `FILES` 数组中，在 `backend/src/server.py` 条目之后添加一条新模式（因为 server.py 中有两个版本号出现：`version="1.0.0"` 和 `APP_VERSION = "1.0.0"`）：

由于 Task 1 将 `version="1.0.0"` 改为 `version=APP_VERSION`，原模式不再匹配。将现有的 `backend/src/server.py` 条目从：

```javascript
{
  path: "backend/src/server.py",
  pattern: /version="(\d+\.\d+\.\d+)"/,
  replace: (v) => `version="${v}"`,
},
```

替换为（匹配新的常量定义）：

```javascript
{
  path: "backend/src/server.py",
  pattern: /APP_VERSION = "(\d+\.\d+\.\d+)"/,
  replace: (v) => `APP_VERSION = "${v}"`,
},
```

这样 bump 更新 `APP_VERSION = "1.0.1"` 后，FastAPI 构造中的 `version=APP_VERSION` 自动引用新值。

- [ ] **Step 2: 验证 bump 脚本**

Run: `cd frontend && npm run bump`
Expected: 输出 `Usage: npm run bump <VerNum | patch | minor | major>` 和 `Current: 1.0.0`

- [ ] **Step 3: 提交**

```bash
git add scripts/bump.mjs
git commit -m "feat(scripts): bump 命令同步更新 APP_VERSION 常量"
```
