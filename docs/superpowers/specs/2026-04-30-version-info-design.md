# 版本信息 + 打包时间戳功能设计

## 目标

在设置页面和 CLI `-v` 中展示带打包时间戳的版本信息，格式：`v1.0.0-20260430.120800`

## 方案

构建时生成 `backend/src/build_info.py`，后端 import 读取，通过 API 传递给前端，CLI 直接读取。

## 改动清单

### 1. 构建脚本 `scripts/build.py`

在 `build_backend()` 之前，生成 `backend/src/build_info.py`：

```python
from datetime import datetime

def generate_build_info():
    timestamp = datetime.now().strftime("%Y%m%d.%H%M%S")
    target = BACKEND / "src" / "build_info.py"
    target.write_text(f'BUILD_TIMESTAMP = "{timestamp}"\n')
    print(f"  Build timestamp: {timestamp}")
```

### 2. 构建产物 `backend/src/build_info.py`（gitignore）

```python
BUILD_TIMESTAMP = "20260430.120800"
```

PyInstaller 打包时 `src` 目录已包含在 `datas` 中，此文件自动被打包。

### 3. `.gitignore`

`backend/src/build_info.py` 加入 gitignore。

### 4. 后端 `backend/src/server.py`

在 `create_app()` 中读取版本信息并存入 app.state：

```python
try:
    from src.build_info import BUILD_TIMESTAMP
except ImportError:
    BUILD_TIMESTAMP = None

APP_VERSION = "1.0.0"
FULL_VERSION = f"v{APP_VERSION}-{BUILD_TIMESTAMP}" if BUILD_TIMESTAMP else f"v{APP_VERSION}-dev"

# 在 create_app() 中：
app.state.full_version = FULL_VERSION
```

### 5. 后端 API `backend/src/api/settings.py`

`GET /api/settings` 响应增加字段：

```python
"full_version": request.app.state.full_version
```

### 6. CLI `backend/src/cli.py`

添加 `--version` / `-v` 支持。Typer callback 方式：

```python
def version_callback(value: bool):
    if value:
        from src.server import FULL_VERSION
        console.print(FULL_VERSION)
        raise typer.Exit()

@app.callback()
def main(version: bool = typer.Option(False, "--version", "-v", callback=version_callback, is_eager=True)):
    pass
```

### 7. 前端 API 层 `frontend/src/services/api.ts`

Settings 类型增加 `full_version: string`。

### 8. 前端设置页面 `frontend/src/components/SettingsDialog.tsx`

在对话框底部（Cancel/Save 按钮下方）显示版本号：

```
v1.0.0-20260430.120800
```

小字号、居中、使用 muted 颜色，不可交互。

## 数据流

```
build.py → build_info.py → server.py (app.state.full_version)
                              ├→ settings.py (API 响应) → 前端 SettingsDialog
                              └→ cli.py --version
```

## 边界情况

- **开发环境**：无 build_info.py → `v1.0.0-dev`
- **版本号更新**：`bump.mjs` 更新 `server.py` 中的 `APP_VERSION`，无需改 build_info 逻辑
- **PyInstaller**：`build_info.py` 通过 `datas=[('src', 'src')]` 自动包含
