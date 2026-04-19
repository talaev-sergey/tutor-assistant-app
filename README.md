# Classroom Control

Telegram Mini App for remote classroom PC management.  
Teachers lock/unlock screens, launch programs, and protect PCs from students — all from Telegram.

## Architecture

- **Backend** — Python 3.12, FastAPI, aiogram 3, SQLModel, SQLite
- **Webapp** — React 19, TypeScript, Vite, Tailwind (Telegram Mini App)
- **Agent** — C# .NET 8 Windows Service (school PCs)
- **Transport** — HTTPS REST + WebSocket (WSS)
- **Deploy** — VPS Fornex, nginx, systemd, GitHub Actions

See [`docs/PROJECT_MAP.md`](docs/PROJECT_MAP.md) for full architecture specification.

## Structure

```
backend/    FastAPI + aiogram backend
webapp/     Telegram Mini App UI
agent/      C# .NET 8 Windows agent
deploy/     systemd units, nginx config, deploy scripts
docs/       Architecture docs
```

## Environments

| | prod | dev |
|---|---|---|
| URL | `266602.fornex.cloud` | `dev.266602.fornex.cloud` |
| Branch | `master` | `dev` |

> Do not merge to `master` during school hours (08:00–16:00 MSK).
