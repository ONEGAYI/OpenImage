<p align="center">
  <img src="frontend/src-tauri/icons/128x128.png" alt="OpenImage" width="80" height="80" />
</p>

<h1 align="center">OpenImage</h1>

<p align="center">
  <strong>Desktop AI Image Generation Tool</strong> — Powered by GPT Image, with multi-step iterative editing, multi-image references, and branch forking
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.5.0-blue" alt="version" />
  <img src="https://img.shields.io/badge/Python-3.12+-green" alt="python" />
  <img src="https://img.shields.io/badge/Tauri-2.x-orange" alt="tauri" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="license" />
</p>

<p align="center">
  English | <a href="README.md">中文</a>
</p>

---

## Features

### Image Generation

- **Multi-step iterative editing** — Build on previous results, with branch forking to explore different directions
- **Three API modes** — Compatible with OpenAI direct (Responses API), Images API proxy, and Chat Completions relay
- **Multi-image references** — Attach reference images during generation to guide AI output
- **Inpainting** — Canvas brush/rectangle mask editor with zoom/pan, optional reference images

### AI Assistant

- **Embedded chat assistant** — Helps optimize prompts and provides image generation suggestions
- **Chain-of-thought visualization** — Displays AI reasoning process with collapsible UI
- **Structured content blocks** — XML tag parsing for rich text (code blocks, suggestion lists, etc.)
- **4-layer system prompts** — Identity → Skills → Context → Summary, auto-assembled
- **Skill system** — Markdown-defined skill instructions, extensible

### Desktop Experience

- **Cross-platform** — Windows / macOS / Linux via Tauri 2.x native packaging
- **Dual themes** — Warm-toned light/dark themes driven by CSS variables
- **Internationalization** — Chinese/English bilingual, powered by i18next
- **Dynamic ports** — Runtime port allocation, zero-configuration startup
- **Lightweight backend** — Python FastAPI + SQLite, packaged as a single-file sidecar via PyInstaller

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Tauri 2.x (Rust) |
| Frontend | React 18 + TypeScript + Zustand + Tailwind CSS 4 |
| Backend | Python 3.12 + FastAPI + aiosqlite |
| AI Models | OpenAI gpt-image-2 (generation), GPT series (assistant) |
| Packaging | PyInstaller (backend sidecar) + Tauri NSIS (installer) |
| Build | Vite 6 + hatchling |

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+
- Rust (for Tauri builds)
- OS: Windows 10+ / macOS 12+ / Linux

### One-click Dev Setup

```bash
# Windows
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1

# macOS / Linux
bash scripts/dev.sh
```

The script starts both the backend service and the frontend dev server with automatic port configuration.

### Manual Setup

```bash
# Backend
cd backend
pip install -e ".[dev]"
python -m src.cli serve

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

### Configuration

After launching, open the frontend in your browser and click the settings button in the top-right corner:

1. **Image generation settings** — Enter API Key, Base URL, select API mode and model
2. **AI assistant settings** — Enter LLM API Key and Base URL (can use a different provider than image generation)

You can also configure via CLI:

```bash
cd backend
python -m src.cli config set api_key <your-key>
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  Tauri Shell (Rust)                  │
│   Start sidecar → Health check → Ready signal → Cleanup │
├─────────────────────────────────────────────────────┤
│              React Frontend (Vite + TS)              │
│   Sidebar │ Gallery │ DetailPanel │ ChatPanel       │
│   Zustand Stores │ i18n │ CSS Variables              │
├──────────────────────┬──────────────────────────────┤
│  FastAPI Backend     │  SSE Streaming                │
│  ├─ api/ Routes      │  ├─ /api/generate             │
│  ├─ core/ Business   │  ├─ /api/inpaint              │
│  │  ├─ ImageClient   │  └─ /api/llm/.../messages    │
│  │  ├─ LLMClient     │                               │
│  │  ├─ SessionManager│  SQLite (aiosqlite)           │
│  │  └─ Skills        │  5 database tables            │
│  └─ server.py Factory│                               │
└──────────────────────┴──────────────────────────────┘
```

**Data flow**: Frontend SSE request → FastAPI route → Core business layer (client/session/storage) → OpenAI API → SSE event stream → Frontend real-time rendering

**State management**: Four Zustand stores manage sessions, generation workflow, AI chat, and toast notifications. Single-page three-column layout with no routing.

## Building & Packaging

```bash
# Install PyInstaller
pip install pyinstaller

# One-click build
python scripts/build.py
```

Build pipeline: Generate timestamp → PyInstaller packages backend as single file → Deploy to Tauri binaries → Tauri builds system installer.

**Version management**:

```bash
cd frontend
npm run bump patch    # +0.0.1
npm run bump minor    # +0.1.0
npm run bump major    # +1.0.0
```

Syncs version across `pyproject.toml`, `server.py`, `package.json`, `Cargo.toml`, and `tauri.conf.json`.

## Project Structure

```
backend/
├── src/
│   ├── api/            # FastAPI routes (generate, inpaint, llm_chat, ...)
│   ├── core/           # Business core (client, session, storage, skills)
│   ├── cli.py          # Typer CLI entry point
│   └── server.py       # FastAPI app factory + lifecycle
├── tests/              # pytest async tests
└── pyproject.toml
frontend/
├── src/
│   ├── components/     # UI components (Gallery, ChatPanel, MaskEditor, ...)
│   ├── stores/         # Zustand state management
│   ├── services/       # API communication layer
│   ├── i18n/           # Internationalization resources
│   └── styles/         # CSS variable design system
├── src-tauri/          # Tauri 2.x shell (Rust)
└── package.json
scripts/                # Build, version, and dev helper scripts
docs/                   # Design docs and implementation plans
```

## Testing

```bash
cd backend
python -m pytest tests/ -v
```

Uses respx to mock external API calls, temporary directory fixtures for test isolation, and `asyncio_mode = "auto"` for fully async testing.

## License

MIT License
