#!/usr/bin/env python3
"""
OpenImage 构建脚本
  1. PyInstaller 打包 Python 后端
  2. 复制到 Tauri binaries/ 并添加 target triple 后缀
  3. Tauri 构建安装包
"""
import shutil
import subprocess
import sys
from pathlib import Path
ROOT = Path(__file__).parent.parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
TAURI_BINARIES = FRONTEND / "src-tauri" / "binaries"


def get_target_triple() -> str:
    result = subprocess.run(
        ["rustc", "--print", "host-tuple"],
        capture_output=True, text=True, check=True,
    )
    return result.stdout.strip()


def build_backend():
    print("=== Building Python backend ===")
    subprocess.run(
        [sys.executable, "-m", "PyInstaller", "openimage-backend.spec", "--noconfirm"],
        cwd=BACKEND, check=True,
    )


def deploy_sidecar():
    print("=== Deploying sidecar ===")
    triple = get_target_triple()
    ext = ".exe" if sys.platform == "win32" else ""

    TAURI_BINARIES.mkdir(parents=True, exist_ok=True)

    src = BACKEND / "dist" / f"OpenImage-Backend{ext}"
    dest = TAURI_BINARIES / f"openimage-backend-{triple}{ext}"

    if not src.exists():
        print(f"  Error: {src} not found. Did PyInstaller succeed?")
        sys.exit(1)

    shutil.copy2(src, dest)
    print(f"  Sidecar: {dest}")


def build_tauri():
    print("=== Building Tauri app ===")
    subprocess.run(
        ["npm", "run", "tauri", "build"],
        cwd=FRONTEND, check=True,
    )


def main():
    build_backend()
    deploy_sidecar()
    build_tauri()

    print("\n=== Build complete! ===")
    bundle_dir = FRONTEND / "src-tauri" / "target" / "release" / "bundle"
    print(f"  Installer at: {bundle_dir}")


if __name__ == "__main__":
    main()
