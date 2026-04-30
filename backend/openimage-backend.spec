# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller 配置文件 — OpenImage Backend"""
import sysconfig
from pathlib import Path

block_cipher = None

# Conda 环境下 DLL 存放在 Library/bin/，PyInstaller 无法自动发现
conda_bin = Path(sysconfig.get_config_var('BINDIR') or '') / 'Library' / 'bin'
conda_dlls = []
_conda_dll_names = [
    'libexpat.dll', 'libcrypto-3-x64.dll', 'libssl-3-x64.dll',
    'liblzma.dll', 'libbz2.dll', 'ffi.dll', 'sqlite3.dll',
    'libmpdec-4.dll', 'zstd.dll',
]
for _name in _conda_dll_names:
    _p = conda_bin / _name
    if _p.exists():
        conda_dlls.append((str(_p), '.'))

a = Analysis(
    ['entry.py'],
    pathex=[],
    binaries=conda_dlls,
    datas=[
        ('src', 'src'),
    ],
    hiddenimports=[
        # Web framework
        'fastapi',
        'starlette',
        'starlette.responses',
        'starlette.routing',
        'starlette.middleware',
        'starlette.middleware.cors',
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        # OpenAI SDK — heavy dynamic imports
        'openai',
        'openai.types',
        'openai.types.shared',
        'openai.types.shared_params',
        'openai.types.responses',
        'openai.types.responses.response',
        'openai._models',
        'openai._types',
        'openai._utils',
        'openai.resources',
        'openai.resources.responses',
        'httpx',
        'h2',
        'hpack',
        'hyperframe',
        # Pydantic
        'pydantic',
        'pydantic.deprecated',
        'pydantic.deprecated.decorator',
        'pydantic_settings',
        # Database / image
        'aiosqlite',
        'PIL',
        'PIL.Image',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # CLI — 打包后不需要
        'typer', 'rich', 'pygments',
        # AWS — 不使用
        'boto3', 'botocore', 'boto',
        # 测试
        'pytest', 'py', '_pytest',
        # 科学计算/可视化 — 不使用
        'numpy', 'scipy', 'matplotlib', 'pandas',
        # GUI — 不使用
        'tkinter',
        # XML 处理 — heavy, 不使用
        'lxml', 'lxml.etree', 'lxml._elementpath',
        # 测试/内部
        'unittest', 'test', 'tests',
        # 包管理
        'pip', 'setuptools', 'pkg_resources',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
    optimize=1,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='OpenImage-Backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
