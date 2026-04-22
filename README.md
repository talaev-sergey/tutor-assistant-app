# Classroom Control

Telegram Mini App for remote classroom PC management.  
Teachers lock/unlock screens, launch programs, and protect PCs from students — all from Telegram.

## Architecture

- **Backend** — Python 3.12, FastAPI, SQLModel, Alembic, SQLite
- **Webapp** — React 19, TypeScript, Vite, Tailwind (Telegram Mini App)
- **Agent** — C# .NET 8 Windows Service (school PCs, 3 projects)
- **Transport** — Local network WebSocket + HTTP REST
- **Deploy** — Local machine or VPS Fornex, nginx, systemd, GitHub Actions

See [`docs/PROJECT_MAP.md`](docs/PROJECT_MAP.md) for full architecture specification.

## Structure

```
backend/    FastAPI backend (Python, uv)
webapp/     Telegram Mini App UI (React 19 + Vite)
agent/      C# .NET 8 solution
  ├── ClassroomAgent/     Windows Service
  ├── ClassroomUpdater/   Auto-update helper
  └── ClassroomInstaller/ GUI installer (ClassroomSetup.exe)
deploy/     systemd units, nginx configs, deploy/update scripts
docs/       Architecture spec (PROJECT_MAP.md)
```

## Quick Start

**Backend:**
```bash
cd backend
cp .env.example .env  # fill in BOT_TOKEN and ADMIN_TELEGRAM_ID
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

**Agent (Windows, requires .NET 8 SDK):**
```powershell
cd agent
.\publish.ps1          # builds to release/
# On school PC (as Admin): run ClassroomSetup.exe
```

## Environments

| | prod | dev |
|---|---|---|
| URL | `266602.fornex.cloud` | `185.18.55.232:8082` |
| Port | 8080 | 8082 |
| Branch | `master` | `master` (dev branch not yet created) |

> Do not merge to `master` during school hours (08:00–16:00 MSK).
