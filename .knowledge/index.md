# Project Wiki Index — Classroom Control

## Summary

Telegram Mini App for remote classroom PC management.  
Teacher controls school PCs (lock/unlock, launch programs, protect) via **local network** WebSocket.

Full architecture spec: `docs/PROJECT_MAP.md`

## Implementation Status (2026-04-24)

| Component | Status |
|---|---|
| Backend (FastAPI + SQLModel + Alembic) | ✅ MVP done |
| WebSocket manager + handlers | ✅ MVP done |
| API endpoints (pcs/commands/tokens/programs) | ✅ MVP done |
| JWT + one-time link auth | ✅ done |
| Windows Agent (C# .NET 8 Service) | ✅ MVP done |
| Agent auto-update (ClassroomUpdater) | ✅ done |
| GUI installer (ClassroomSetup.exe) | ✅ done |
| Linux host installer (install_host.py) | ✅ done |
| Deploy scripts (systemd, nginx, deploy.sh) | ✅ done |
| GitHub Actions CI/CD | ✅ done |
| Webapp connected to real API | ✅ done |
| Webapp served by backend (StaticFiles) | ✅ done |
| Telegram bot commands | ✅ done |
| Bot /new_token command | ✅ done |
| Webapp Admin page (PC management) | ✅ done |
| mDNS discovery (classroom.local) | ✅ done |
| Auto webapp URL (LAN IP detection) | ✅ done |
| Agent instant reconnect on network change | ✅ done |

## Topics

- [[topics/architecture]]: Architecture — stack, deployment, key decisions
- [[topics/protocol]]: WebSocket Protocol — Backend ↔ Agent message types and flows
- [[topics/agent]]: Windows Agent — C# .NET 8, installer, auto-update, student protection

## Architecture Decisions (quick reference)

| Decision | Choice |
|---|---|
| ORM | SQLModel |
| Program paths | Stored in DB, synced via `register_ack` |
| Self-update | Automatic (no confirmation) |
| Token granularity | One per PC |
| Binary signing | Ed25519 (BouncyCastle) — planned for v1 |
| Deployment model | Local network (no VPS required) |
| Dev port | 8082 (8081 occupied by Apache on Fornex VPS) |
| Service discovery | mDNS — backend announces `classroom.local` via zeroconf |
| Webapp URL | Auto-detected from LAN IP if `WEBAPP_URL` not set in .env |

## Open Questions

See `docs/PROJECT_MAP.md` § 13 for pending decisions.

## Notes

- Updated 2026-04-24 after admin page, webapp static serving, installer webapp build, /new_token bot command.
- Fornex provides only one technical domain — dev subdomain not possible; dev runs on IP:8082.
- Abandoned VPS deployment; backend runs on teacher's local machine (local network mode).
- Agent built on Linux via `agent/publish.sh` (cross-compile win-x64, no Windows needed).
- `WEBAPP_URL` in .env optional — auto-detected from LAN IP if absent. `WEBAPP_PORT` default is 8082 (prod); set to 5173 in dev `.env`.
- Agent installer defaults to `ws://classroom.local:8082/ws`; backend announces via mDNS on startup.
- Backend serves `webapp/dist/` via StaticFiles — no nginx needed on local network. SPA fallback via catch-all route.
- Linux installer (`deploy/scripts/install_host.py`) runs `pnpm build`, `uv sync`, writes `/etc/classroom-control/secrets` (mode 600), installs systemd service.
- Admin page in webapp (gear icon, admin-only): add PC (creates token shown once), rename PC, delete PC + token.
