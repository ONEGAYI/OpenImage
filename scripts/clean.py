#!/usr/bin/env python3
"""OpenImage 构建产物清理脚本

用法:
  python scripts/clean.py           # 清理所有构建产物
  python scripts/clean.py --safe    # 仅清理轻量缓存（排除 Rust target）
  python scripts/clean.py --dry-run # 预览将删除的内容
"""
import shutil
from pathlib import Path

ROOT = Path(__file__).parent.parent

# (相对路径, 描述, 是否属于 heavy)
TARGETS = [
    # Python 运行时缓存
    ("__pycache__", "Python 字节码缓存", False),
    ("backend/__pycache__", "Python 字节码缓存 (backend)", False),
    ("backend/src/__pycache__", "Python 字节码缓存 (backend/src)", False),
    ("backend/tests/__pycache__", "Python 字节码缓存 (backend/tests)", False),
    # PyInstaller
    ("backend/dist", "PyInstaller 输出", False),
    ("backend/build", "PyInstaller 中间文件", False),
    # Node / Vite
    ("frontend/node_modules", "Node.js 依赖", False),
    ("frontend/dist", "Vite 前端构建产物", False),
    # Tauri sidecar
    ("frontend/src-tauri/binaries", "Sidecar 二进制部署", False),
    ("frontend/src-tauri/gen", "Tauri codegen", False),
    # 构建生成的源文件
    ("backend/src/build_info.py", "构建时间戳（下次构建自动重新生成）", False),
]

HEAVY_TARGETS = [
    # Rust 编译缓存（通常 1-5 GB，重编需数分钟）
    ("frontend/src-tauri/target", "Rust/Cargo 编译缓存", True),
]

# 通配符匹配
GLOB_PATTERNS = [
    ("*.pyc", "Python 编译文件", False),
    ("*.egg-info", "Python 包元数据", False),
]


def collect(targets: list[tuple[str, str, bool]]) -> list[tuple[Path, str]]:
    """收集所有存在的待清理路径。"""
    found = []
    for rel, desc, _ in targets:
        p = ROOT / rel
        if p.exists():
            found.append((p, desc))
    return found


def collect_globs(patterns: list[tuple[str, str, bool]]) -> list[tuple[Path, str]]:
    """收集通配符匹配的文件。"""
    found = []
    for pattern, desc, _ in patterns:
        for p in ROOT.rglob(pattern):
            if p.exists():
                found.append((p, desc))
    return found


def main():
    import argparse

    parser = argparse.ArgumentParser(description="清理 OpenImage 构建产物")
    parser.add_argument("--safe", action="store_true", help="仅清理轻量缓存（保留 Rust target）")
    parser.add_argument("--dry-run", action="store_true", help="预览将删除的内容，不实际执行")
    args = parser.parse_args()

    all_targets = list(TARGETS)
    if not args.safe:
        all_targets.extend(HEAVY_TARGETS)

    found = collect(all_targets)
    found.extend(collect_globs(GLOB_PATTERNS))

    if not found:
        print("没有发现构建产物需要清理。")
        return

    total_size = 0
    for p, desc in found:
        if p.is_dir():
            size = sum(f.stat().st_size for f in p.rglob("*") if f.is_file())
        else:
            size = p.stat().st_size
        total_size += size
        tag = "dir" if p.is_dir() else "file"
        print(f"  [{tag:>4}] {p.relative_to(ROOT)}  ({desc})  {size / 1024 / 1024:.1f} MB")

    print(f"\n  共 {len(found)} 项，合计 {total_size / 1024 / 1024:.1f} MB")

    if args.dry_run:
        print("\n  [dry-run] 以上内容未被删除。")
        return

    confirm = input("\n  确认删除以上内容？[y/N] ").strip().lower()
    if confirm != "y":
        print("  已取消。")
        return

    for p, _ in found:
        try:
            if p.is_dir():
                shutil.rmtree(p)
            else:
                p.unlink()
        except FileNotFoundError:
            pass

    print("  清理完成。")


if __name__ == "__main__":
    main()
