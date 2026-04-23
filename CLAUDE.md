# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project

**Classroom Control** — Telegram Mini App for remote classroom PC management.  
Teacher controls school PCs (lock/unlock, launch programs, protect) via local network WebSocket.

Full spec: `docs/PROJECT_MAP.md`

## Repository Structure

```
backend/    FastAPI + SQLModel backend (Python 3.12, uv)
webapp/     Telegram Mini App UI (React 19 + Vite + Tailwind)
agent/      C# .NET 8 solution (3 projects)
deploy/     systemd units, nginx configs, deploy/update scripts
docs/       Architecture spec (PROJECT_MAP.md)
```

## Backend Commands

Run from `backend/` directory (uses `uv`):

```bash
uv sync                              # Install dependencies
uv run uvicorn app.main:app --host 0.0.0.0 --port 8082 --reload  # Dev server (LAN-accessible)
uv run alembic upgrade head          # Apply migrations
uv run alembic revision --autogenerate -m "description"  # New migration
uv run pytest                        # Run tests

# Bootstrap first admin + create PC token (no webapp needed):
uv run python scripts/create_token.py --telegram-id 123456789 --name "PC-01"
uv run python scripts/create_token.py --name "PC-02"
```

Environment: copy `backend/.env.example` → `backend/.env` and fill in values.

## Webapp Commands

Run from `webapp/` directory:

```bash
pnpm install    # Install dependencies
pnpm dev        # Vite dev server
pnpm build      # Production build → dist/
pnpm typecheck  # TypeScript check
```

## Agent Commands

Run from `agent/` directory:

```bash
# Linux (cross-compile to win-x64):
./publish.sh                         # Build all 3 projects → release/

# Windows (requires .NET 8 SDK):
.\publish.ps1                        # Build all 3 projects → release/
```

Output: `release/ClassroomSetup.exe`, `ClassroomAgent.exe`, `ClassroomUpdater.exe`

To install on a school PC (as Administrator):
```
ClassroomSetup.exe   # GUI installer — enter PcName, BackendUrl, Token
```

## Key Architecture Points

- **Local network**: backend runs on teacher machine, agents connect outbound via WebSocket
- **No VPS needed**: school PCs (static IPs in router) → WebSocket → local backend
- **Dev port**: 8082 (Apache occupies 8081 on VPS if using Fornex)
- **Prod port**: 8080
- **Auth**: Telegram initData HMAC-SHA256 for webapp; Bearer token (bcrypt) for agents
- **Auto-update**: backend detects version mismatch on heartbeat → sends `update_available` → agent downloads, verifies SHA256, runs ClassroomUpdater

## Environment Variables (backend/.env)

| Variable | Example | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:////opt/classroom-dev/backend/app-dev.db` | SQLite DB (absolute path) |
| `BOT_TOKEN` | `7123456789:AAH...` | Telegram bot token (from @BotFather) |
| `ADMIN_TELEGRAM_ID` | `123456789` | Admin Telegram ID (from @userinfobot) |
| `APP_VERSION` | `1.0.0` | Shown in /healthz |
| `DEBUG` | `false` | SQLAlchemy echo + debug logging |

## Deploy

```bash
# Update dev host (Linux)
./deploy/scripts/update_host.sh dev

# Update prod host (Linux)
./deploy/scripts/update_host.sh prod

# Update host (Windows)
.\deploy\scripts\update_host.ps1
```
