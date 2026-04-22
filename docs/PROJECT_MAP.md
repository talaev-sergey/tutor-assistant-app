# PROJECT MAP — Classroom Control

> Source of truth for all development. Update when architecture changes.  
> Last updated: 2026-04-19

---

## Table of Contents

1. [UI Analysis (webapp)](#1-ui-analysis-webapp)
2. [Architecture](#2-architecture)
3. [Backend ↔ Agent Protocol](#3-backend--agent-protocol)
4. [Monorepo Structure](#4-monorepo-structure)
5. [Data Model](#5-data-model)
6. [API Contract (Backend ↔ Webapp)](#6-api-contract-backend--webapp)
7. [Windows Agent](#7-windows-agent)
8. [Security](#8-security)
9. [CI/CD and Deployment](#9-cicd-and-deployment)
10. [Agent Self-Update](#10-agent-self-update)
11. [Logging and Observability](#11-logging-and-observability)
12. [Roadmap](#12-roadmap)
13. [Open Questions](#13-open-questions)

---

## 1. UI Analysis (webapp)

### Source

`artifacts/classroom-control/` — React 19 + TypeScript + Vite + Tailwind + Radix UI.  
Will be renamed to `webapp/` in the new monorepo structure.

### Three Pages

| Page | File | Description |
|---|---|---|
| **ListPage** | `pages/ListPage.tsx` | 13-PC grid (7 online / 6 offline). Header: title, server IP, version, selection button. Long-press (400 ms) → multiselect mode. |
| **ActionsPage** | `pages/ActionsPage.tsx` | Actions for selected PCs: Protection toggle, Lock Screen toggle, Launch Program / Reboot / Shutdown buttons. |
| **ProgramsPage** | `pages/ProgramsPage.tsx` | Searchable allowlist programs, multi-select, "Launch (N)" button. |

### Components and State

```
App.tsx (root state)
├── page: 'list' | 'actions' | 'programs'
├── target: number | number[] | 'all'   — selected PCs
├── multiMode: boolean
├── selectedPCs: Set<number>
├── protectedPCs: Set<number>           — ShieldCheck indicator
├── lockedPCs: Set<number>              — Lock indicator
├── taskPCs: Set<number>                — indicator (unused for now)
└── toast: { message, visible, exiting }
```

### Actions (currently all local state — no API calls)

| Action key | Description | Required endpoint |
|---|---|---|
| `protect-on` / `protect-off` | Enable/disable student protection | `POST /api/commands` |
| `lock-on` / `lock-off` | Lock / unlock screen | `POST /api/commands` |
| `launch` | Navigate to ProgramsPage | — |
| `reboot` | Reboot (confirm dialog) | `POST /api/commands` |
| `shutdown` | Shutdown (confirm dialog) | `POST /api/commands` |
| *(launch programs)* | Launch N programs on N PCs | `POST /api/commands` |

### Existing API Client

- Infrastructure ready: `lib/api-client-react/src/custom-fetch.ts`
- Configured via `setBaseUrl()` + `setAuthTokenGetter()`
- Authentication: Bearer token in `Authorization` header
- Only real endpoint defined: `GET /api/healthz`
- Everything else is pending implementation

### What the UI Tells Us About the API

Each PC displays: `name`, `ip`, `online` (bool), `protected` (bool), `locked` (bool), `task` (bool), `version` (string).  
Therefore `GET /api/pcs` must return exactly these fields.

---

## 2. Architecture

### Component Diagram

```mermaid
graph TB
    subgraph Teacher
        TG[Telegram App]
    end

    subgraph VPS["VPS — 266602.fornex.cloud"]
        NX[nginx / reverse proxy]
        BE[Backend\nFastAPI + aiogram\nPython 3.12]
        DB[(SQLite\napp.db)]
        ST[Static files\nwebapp/dist]
        AR[Agent releases\n/agent-releases/]
        NX -->|":443 /api/*"| BE
        NX -->|":443 /"| ST
        NX -->|":443 /ws"| BE
        NX -->|":443 /agent-releases/*"| AR
        BE <--> DB
    end

    subgraph School["School (behind NAT)"]
        AG1[Agent PC-01\nC# .NET 8 Service]
        AG2[Agent PC-02]
        AGN[Agent PC-N]
    end

    TG -- "HTTPS\nTelegram Bot API" --> BE
    TG -- "HTTPS Mini App\ninitData auth" --> NX

    AG1 -- "WSS outbound\ntoken auth" --> BE
    AG2 -- "WSS outbound" --> BE
    AGN -- "WSS outbound" --> BE
```

> **Key point:** WebSocket connections are **initiated by agents** (outbound from school).  
> The school firewall does not block this — it permits outbound HTTPS/WSS.

### Two Environments on One VPS

| Parameter | prod | dev |
|---|---|---|
| Hostname | `266602.fornex.cloud` | `dev.266602.fornex.cloud` |
| FastAPI port | 8080 | 8082 |
| Database | `/opt/classroom/app.db` | `/opt/classroom-dev/app-dev.db` |
| systemd unit | `classroom-backend` | `classroom-backend-dev` |
| WebSocket URL | `wss://266602.fornex.cloud/ws` | `wss://dev.266602.fornex.cloud/ws` |

### Data Flows

#### Scenario 1: Get PC List

```
Teacher opens Mini App
  → [GET /api/pcs] → Backend
  → Backend reads from DB: PC.* + last heartbeat timestamp
  → Backend returns JSON array of PCs with statuses
  → Webapp renders PCGrid
```

#### Scenario 2: Mass Screen Lock

```
Teacher selects several PCs → clicks "Lock Screen"
  → [POST /api/commands] body: { command_type: "lock", target_pc_ids: [1,3,5] }
  → Backend creates Command in DB, gets command_uuid
  → Backend iterates target_pc_ids:
      if PC online  → sends {"type":"command",...} via open WebSocket
      if PC offline → puts Command in queue (TTL 5 min)
  → Agent executes LockWorkStation(), sends {"type":"command_result",...}
  → Backend updates CommandResult in DB, sets PC.locked = true
  → Webapp polls [GET /api/commands/{id}]
  → UI shows toast "Screens locked"
```

#### Scenario 3: Launch Program for a Group

```
Teacher selects group "Room 12" → ProgramsPage → selects Scratch → "Launch"
  → [POST /api/commands] body: { command_type: "launch", group_id: 4, params: { programs: ["scratch"] } }
  → Backend resolves group_id → list of PC ids
  → For each online PC → WebSocket command
  → Agent checks programs[i] ∈ local allowlist
  → Agent runs Process.Start(allowedPrograms["scratch"].windows_path)
  → Each agent sends command_result with success/error
  → Backend aggregates results, updates DB
```

---

## 3. Backend ↔ Agent Protocol

### Authentication

Token is passed in the **`Authorization: Bearer <token>` header** during the WebSocket handshake.

**Why header, not query parameter:**
- Query parameters are logged by nginx (`access.log`) and may leak into access logs or Referer headers
- Headers are not included in the URL and are not logged by default
- Standard practice for Bearer authentication (RFC 6750)

**Token model:** ✅ **one token per PC** — enables precise revocation and per-PC audit trail.

### Message Structure

Every message is a JSON object. Required fields in all messages:

```json
{
  "type": "<message_type>",
  "protocol_version": 1,
  "message_id": "<uuid4>"
}
```

---

#### `register` (Agent → Backend, on connect)

```json
{
  "type": "register",
  "protocol_version": 1,
  "message_id": "a1b2c3d4-...",
  "agent_version": "1.2.3",
  "pc_name": "PC-07",
  "machine_fingerprint": "sha256-of-motherboard-serial+mac",
  "hostname": "SCHOOL-PC-07",
  "ip_local": "192.168.1.107",
  "os_version": "Windows 11 Pro 23H2",
  "update_channel": "stable"
}
```

Backend responds with `register_ack`:
```json
{
  "type": "register_ack",
  "protocol_version": 1,
  "message_id": "...",
  "pc_id": 7,
  "accepted": true,
  "allowed_programs": [
    { "slug": "scratch", "name": "Scratch", "windows_path": "C:\\Program Files\\Scratch\\scratch.exe" }
  ],
  "pending_commands": []
}
```
If `accepted: false` — reason in `reason` field, agent closes connection.

> `allowed_programs` is synced from DB on every `register_ack`. ✅ **Paths stored in DB**, not hardcoded in agent.

---

#### `heartbeat` (Agent → Backend, every 15 sec)

```json
{
  "type": "heartbeat",
  "protocol_version": 1,
  "message_id": "...",
  "agent_version": "1.2.3",
  "pc_id": 7,
  "status": {
    "locked": false,
    "protected": true,
    "active_user": "student",
    "cpu_pct": 12.5,
    "ram_pct": 45.0
  }
}
```

Backend updates `PC.last_seen`, `PC.locked`, `PC.protected`.  
Timeout: no heartbeat for 45 sec → `PC.online = false`.

---

#### `command` (Backend → Agent)

```json
{
  "type": "command",
  "protocol_version": 1,
  "message_id": "...",
  "command_id": "f9e8d7c6-...",
  "trace_id": "abc123",
  "command_type": "lock",
  "params": {},
  "issued_at": "2026-04-19T10:00:00Z",
  "expires_at": "2026-04-19T10:05:00Z"
}
```

**Command types:**

| `command_type` | `params` | Agent action |
|---|---|---|
| `lock` | `{}` | `user32.dll LockWorkStation()` |
| `unlock` | `{}` | Unlock screen |
| `protect_on` | `{}` | Enable protection (registry + watchdog) |
| `protect_off` | `{}` | Disable protection |
| `launch` | `{ "programs": ["scratch", "chrome"] }` | Launch from allowlist |
| `reboot` | `{ "delay_sec": 30 }` | `shutdown /r /t 30` |
| `shutdown` | `{ "delay_sec": 30 }` | `shutdown /s /t 30` |
| `upload_logs` | `{ "lines": 500, "level": "DEBUG" }` | Upload logs to backend |
| `ping` | `{}` | Connectivity check, reply with `pong` |
| `rollback` | `{}` | Emergency: restore `agent.previous.exe` |
| `sync_programs` | `{}` | Re-fetch allowed programs from backend |

---

#### `command_result` (Agent → Backend)

```json
{
  "type": "command_result",
  "protocol_version": 1,
  "message_id": "...",
  "command_id": "f9e8d7c6-...",
  "trace_id": "abc123",
  "pc_id": 7,
  "success": true,
  "error": null,
  "executed_at": "2026-04-19T10:00:01Z"
}
```

**Idempotency:** agent keeps `executed_command_ids` (LRU cache, 1000 entries). If `command_id` already in cache — returns the same result without re-executing.

---

#### `log_upload` (Agent → Backend, response to `upload_logs`)

```json
{
  "type": "log_upload",
  "protocol_version": 1,
  "message_id": "...",
  "command_id": "...",
  "pc_id": 7,
  "encoding": "gzip+base64",
  "size_bytes": 8192,
  "data": "<base64-encoded gzip>"
}
```

If size > 64 KB — agent posts to `POST /api/logs/upload` via HTTPS instead of WebSocket.

---

#### `update_available` (Backend → Agent)

```json
{
  "type": "update_available",
  "protocol_version": 1,
  "message_id": "...",
  "version": "1.3.0",
  "download_url": "https://266602.fornex.cloud/agent-releases/v1.3.0/agent.exe",
  "sha256": "abcdef1234...",
  "signature": "base64-ed25519-signature",
  "min_protocol_version": 1,
  "channel": "stable"
}
```

✅ **Signing algorithm: Ed25519** (via BouncyCastle in .NET 8; native in .NET 9).

---

#### `telemetry` (Agent → Backend, optional, v2)

```json
{
  "type": "telemetry",
  "protocol_version": 1,
  "message_id": "...",
  "pc_id": 7,
  "timestamp": "2026-04-19T10:00:00Z",
  "cpu_pct": 23.5,
  "ram_pct": 61.2,
  "active_window": "Scratch 3.0",
  "disk_free_gb": 45.2
}
```

### Offline Handling

**Agent (reconnect):**
```
Connection lost → exponential backoff:
1s → 2s → 4s → 8s → 16s → 32s → 60s (max)
Jitter: ±20% per delay (prevents 30 agents reconnecting simultaneously)
```

**Backend (command queue):**
- Command for offline PC → stored as `Command` with `status=pending`
- On agent connect → backend sends pending commands in `register_ack.pending_commands`
- TTL: 5 minutes (configurable). After expiry → `status=expired`

---

## 4. Monorepo Structure

```
classroom-control/               ← repo root
├── backend/                     ← FastAPI + aiogram
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              ← entry point (uvicorn app)
│   │   ├── config.py            ← pydantic Settings (env vars)
│   │   ├── database.py          ← SQLModel engine + session
│   │   ├── models/              ← SQLModel table definitions
│   │   │   ├── pc.py
│   │   │   ├── group.py
│   │   │   ├── command.py
│   │   │   ├── token.py
│   │   │   ├── program.py
│   │   │   ├── user.py
│   │   │   └── release.py
│   │   ├── api/                 ← FastAPI routers
│   │   │   ├── pcs.py
│   │   │   ├── groups.py
│   │   │   ├── commands.py
│   │   │   ├── tokens.py
│   │   │   ├── programs.py
│   │   │   ├── logs.py
│   │   │   └── health.py
│   │   ├── ws/
│   │   │   ├── manager.py       ← ConnectionManager (active WS connections)
│   │   │   └── handlers.py      ← message type handlers
│   │   ├── bot/
│   │   │   ├── router.py        ← aiogram router
│   │   │   └── commands.py      ← /start, /status, /promote, /emergency_rollback
│   │   ├── middleware/
│   │   │   ├── auth.py          ← Telegram initData validation (HMAC)
│   │   │   └── rate_limit.py
│   │   └── services/
│   │       ├── command_dispatcher.py  ← send command via WS or queue
│   │       ├── token_service.py       ← agent token generation/verification
│   │       ├── update_service.py      ← self-update logic
│   │       └── notification.py        ← Telegram alerts to admin chat
│   ├── alembic/
│   │   ├── env.py
│   │   ├── versions/
│   │   └── alembic.ini
│   ├── tests/
│   │   ├── test_api.py
│   │   ├── test_ws.py
│   │   └── test_auth.py
│   ├── requirements.txt
│   └── requirements-dev.txt
│
├── agent/                       ← C# .NET 8 solution
│   ├── ClassroomAgent.sln
│   ├── ClassroomAgent/          ← main Windows Service
│   │   ├── Program.cs           ← entry point, WindowsService host
│   │   ├── Worker.cs            ← BackgroundService, main loop
│   │   ├── WebSocketClient.cs   ← reconnect loop, message pump
│   │   ├── MessageHandler.cs    ← incoming command dispatcher
│   │   ├── Commands/
│   │   │   ├── ICommand.cs
│   │   │   ├── LockCommand.cs
│   │   │   ├── ProtectCommand.cs
│   │   │   ├── LaunchCommand.cs
│   │   │   ├── RebootCommand.cs
│   │   │   └── LogUploadCommand.cs
│   │   ├── Protection/
│   │   │   ├── ScreenLocker.cs       ← P/Invoke LockWorkStation
│   │   │   ├── TaskManagerBlocker.cs ← registry HKCU
│   │   │   └── ProcessWatchdog.cs
│   │   ├── Security/
│   │   │   ├── TokenStorage.cs       ← DPAPI token storage
│   │   │   └── SignatureVerifier.cs  ← Ed25519 signature verification (BouncyCastle)
│   │   ├── Update/
│   │   │   └── UpdateManager.cs      ← download, verify, launch updater
│   │   ├── Logging/
│   │   │   └── LogCollector.cs       ← read log files, gzip
│   │   └── ClassroomAgent.csproj
│   ├── ClassroomUpdater/        ← standalone updater.exe
│   │   ├── Program.cs           ← args: old_path, new_path, service_pid
│   │   ├── Updater.cs           ← wait, backup, copy, start, rollback
│   │   └── ClassroomUpdater.csproj
│   └── publish.ps1              ← build + sign both binaries
│
├── webapp/                      ← ready UI (renamed from artifacts/classroom-control)
│   ├── src/
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── deploy/
│   ├── systemd/
│   │   ├── classroom-backend.service
│   │   └── classroom-backend-dev.service
│   ├── nginx/
│   │   ├── classroom-prod.conf
│   │   └── classroom-dev.conf
│   └── scripts/
│       ├── deploy.sh              ← manual deploy (works from CI and locally)
│       ├── setup-vps.sh           ← one-time VPS provisioning
│       ├── release-agent.sh       ← build + sign + upload agent to VPS
│       ├── backup-db.sh           ← SQLite backup before migrations
│       └── install-agent.ps1      ← first-time agent install on Windows
│
├── .github/
│   └── workflows/
│       └── deploy.yml
│
├── docs/
│   ├── PROJECT_MAP.md           ← this file
│   ├── RELEASE.md               ← release checklist
│   └── PROTOCOL.md              ← detailed WS protocol specification
│
├── .gitignore
├── pyproject.toml               ← Python environment (uv)
├── uv.lock
└── README.md
```

---

## 5. Data Model

✅ **ORM: SQLModel** — single class = Pydantic schema + ORM table. Less boilerplate, native FastAPI integration.

### Pattern

```python
class PCBase(SQLModel):          # shared fields
    name: str
    online: bool = False

class PC(PCBase, table=True):   # DB table
    id: int | None = Field(default=None, primary_key=True)
    ...

class PCResponse(PCBase):       # API response shape
    id: int
    last_seen: datetime
```

### Tables

#### `PC`

| Field | Type | Index | Description |
|---|---|---|---|
| `id` | INTEGER PK | PK | auto |
| `name` | VARCHAR(100) | | "PC-07" |
| `hostname` | VARCHAR(100) | | "SCHOOL-PC-07" |
| `ip_local` | VARCHAR(45) | | last known local IP |
| `machine_fingerprint` | VARCHAR(64) | UNIQUE | hardware hash, token binding |
| `token_id` | INTEGER FK→Token | | active token |
| `group_id` | INTEGER FK→Group | INDEX | primary group |
| `online` | BOOLEAN | INDEX | updated by heartbeat |
| `locked` | BOOLEAN | | |
| `protected` | BOOLEAN | | |
| `agent_version` | VARCHAR(20) | | "1.2.3" |
| `update_channel` | VARCHAR(10) | | "stable" / "canary" |
| `last_seen` | DATETIME | INDEX | last heartbeat |
| `os_version` | VARCHAR(100) | | |
| `created_at` | DATETIME | | |

#### `Group`

| Field | Type | Description |
|---|---|---|
| `id` | INTEGER PK | |
| `name` | VARCHAR(100) | "Room 12" |
| `description` | TEXT | |
| `created_at` | DATETIME | |

#### `PCGroupMembership`

| Field | Type | Description |
|---|---|---|
| `pc_id` | INTEGER FK→PC | composite PK |
| `group_id` | INTEGER FK→Group | composite PK |

(`PC.group_id` is the "primary" group; this table handles PC belonging to multiple rooms)

#### `Command`

| Field | Type | Index | Description |
|---|---|---|---|
| `id` | INTEGER PK | | |
| `uuid` | VARCHAR(36) | UNIQUE | idempotency identifier |
| `trace_id` | VARCHAR(36) | INDEX | cross-cutting trace id |
| `command_type` | VARCHAR(50) | | "lock", "launch", etc. |
| `params` | JSON | | additional parameters |
| `target_type` | VARCHAR(10) | | "single" / "group" / "all" / "multi" |
| `target_pc_id` | INTEGER FK→PC | INDEX | if target_type=single |
| `target_group_id` | INTEGER FK→Group | INDEX | if target_type=group |
| `issued_by` | INTEGER FK→User | | |
| `status` | VARCHAR(20) | INDEX | pending/sent/completed/expired/failed |
| `expires_at` | DATETIME | INDEX | offline queue TTL |
| `created_at` | DATETIME | | |

#### `CommandResult`

| Field | Type | Description |
|---|---|---|
| `id` | INTEGER PK | |
| `command_id` | INTEGER FK→Command | |
| `pc_id` | INTEGER FK→PC | |
| `success` | BOOLEAN | |
| `error` | TEXT | null if success |
| `executed_at` | DATETIME | |

#### `User` (teacher)

| Field | Type | Description |
|---|---|---|
| `id` | INTEGER PK | |
| `telegram_id` | BIGINT | UNIQUE |
| `username` | VARCHAR(100) | |
| `full_name` | VARCHAR(200) | |
| `is_admin` | BOOLEAN | |
| `is_active` | BOOLEAN | revoke access |
| `created_at` | DATETIME | |

#### `Token` (agent token)

| Field | Type | Description |
|---|---|---|
| `id` | INTEGER PK | |
| `name` | VARCHAR(100) | "PC-07 token" |
| `token_hash` | VARCHAR(128) | bcrypt hash — plaintext shown once |
| `pc_id` | INTEGER FK→PC | null until first register |
| `created_by` | INTEGER FK→User | |
| `is_active` | BOOLEAN | false = revoked |
| `last_used` | DATETIME | |
| `created_at` | DATETIME | |

✅ **One token per PC** — precise revocation granularity, per-PC audit trail.

#### `AllowedProgram`

| Field | Type | Description |
|---|---|---|
| `id` | INTEGER PK | |
| `slug` | VARCHAR(50) | "chrome", "scratch" — command key |
| `name` | VARCHAR(100) | "Google Chrome" |
| `icon` | VARCHAR(10) | emoji |
| `description` | VARCHAR(200) | |
| `windows_path` | VARCHAR(500) | `C:\Program Files\...` — full exe path |
| `is_active` | BOOLEAN | |
| `created_at` | DATETIME | |

✅ **Paths stored in DB**, synced to agent on every `register_ack`. Agent never executes arbitrary paths from commands — only slugs that resolve via the local synced allowlist.

#### `AgentRelease`

| Field | Type | Description |
|---|---|---|
| `id` | INTEGER PK | |
| `version` | VARCHAR(20) | "1.3.0" |
| `channel` | VARCHAR(10) | "stable" / "canary" |
| `download_url` | VARCHAR(500) | |
| `sha256` | VARCHAR(64) | |
| `signature` | TEXT | base64 Ed25519 signature |
| `min_protocol_version` | INTEGER | |
| `released_at` | DATETIME | |
| `released_by` | INTEGER FK→User | |
| `is_active` | BOOLEAN | false = pulled |

### Alembic from Day One

```python
# alembic/env.py
from sqlmodel import SQLModel
from app.models import *  # import all models

target_metadata = SQLModel.metadata
```

Every schema change → new migration:
```bash
alembic revision --autogenerate -m "add update_channel to pc"
alembic upgrade head
```

**PostgreSQL migration path:** change one line in `config.py`:
```python
DATABASE_URL = "sqlite:///app.db"  # → "postgresql://user:pass@localhost/classroom"
```
SQLModel and Alembic are database-agnostic. Note: `JSON` in SQLite is stored as TEXT; PostgreSQL will use native JSONB (better). Handle via a typed migration.

---

## 6. API Contract (Backend ↔ Webapp)

### Middleware: Telegram initData Validation

**All requests to `/api/*`** (except `/api/healthz`) must include:
```
Authorization: tma <initData>
```

Where `initData` is the string from `window.Telegram.WebApp.initData`.

**Verification algorithm:**
```python
import hmac, hashlib, time
from urllib.parse import unquote, parse_qsl

def verify_telegram_init_data(init_data: str, bot_token: str) -> dict:
    parsed = dict(parse_qsl(unquote(init_data), keep_blank_values=True))
    hash_from_client = parsed.pop("hash")

    # 1. Check string — all fields alphabetically sorted as key=value joined by \n
    data_check = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))

    # 2. HMAC_SHA256(data_check, key=HMAC_SHA256("WebAppData", bot_token))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret_key, data_check.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected, hash_from_client):
        raise AuthError("Invalid signature")

    # 3. Freshness check (not older than 24 hours)
    if time.time() - int(parsed["auth_date"]) > 86400:
        raise AuthError("Expired initData")

    return parsed  # contains user JSON with telegram_id
```

After verification — look up `telegram_id` in `User` where `is_active = True`.

---

### Endpoints

Base URL: `https://266602.fornex.cloud/api`

---

#### `GET /healthz`

```json
// 200 OK
{ "status": "ok", "version": "1.0.0", "agents_online": 7 }
```
*No auth required.*

---

#### `GET /pcs`

Query: `?group_id=<int>` (optional filter by group)

```json
// 200 OK
[
  {
    "id": 7,
    "name": "PC-07",
    "ip_local": "192.168.1.107",
    "online": true,
    "locked": false,
    "protected": true,
    "agent_version": "1.2.3",
    "last_seen": "2026-04-19T10:01:30Z",
    "group_id": 2
  }
]
```

---

#### `GET /groups`

```json
// 200 OK
[
  { "id": 1, "name": "Room 10", "pc_count": 13 },
  { "id": 2, "name": "Room 12", "pc_count": 15 }
]
```

---

#### `POST /commands`

```json
// Request
{
  "command_type": "lock",
  "target_type": "group",       // "single" | "group" | "all" | "multi"
  "target_pc_ids": null,        // [1,3,5] if target_type="multi"
  "target_group_id": 2,         // if target_type="group"
  "params": {}
}

// 202 Accepted
{
  "command_id": "f9e8d7c6-...",
  "trace_id": "abc123",
  "status": "dispatching",
  "target_count": 13
}
```

---

#### `GET /commands/{command_id}`

```json
// 200 OK
{
  "command_id": "f9e8d7c6-...",
  "command_type": "lock",
  "status": "completed",
  "results": [
    { "pc_id": 7, "pc_name": "PC-07", "success": true, "executed_at": "..." },
    { "pc_id": 9, "pc_name": "PC-09", "success": false, "error": "PC offline", "executed_at": null }
  ],
  "success_count": 12,
  "fail_count": 1,
  "created_at": "...",
  "completed_at": "..."
}
```

---

#### `POST /pcs/{id}/rename`

```json
// Request
{ "name": "PC-Masha" }

// 200 OK
{ "id": 7, "name": "PC-Masha" }
```

---

#### `POST /tokens`

```json
// Request
{ "name": "PC-07 — room 12" }

// 201 Created
{
  "id": 42,
  "name": "PC-07 — room 12",
  "token": "Xt8k2mPqR...",   // shown ONCE — only hash stored in DB
  "created_at": "..."
}
```

---

#### `DELETE /tokens/{id}`

```json
// 200 OK
{ "revoked": true }
```
Open WS connection using this token is closed immediately (code 4401).

---

#### `GET /programs`

```json
// 200 OK
[
  { "id": 1, "slug": "chrome", "name": "Google Chrome", "icon": "🌐", "description": "Browser", "is_active": true },
  { "id": 2, "slug": "scratch", "name": "Scratch", "icon": "🐱", "description": "Visual programming", "is_active": true }
]
```

---

#### `GET /pcs/{id}/logs`

Triggers `upload_logs` command via WebSocket, waits for receipt:

```json
// 200 OK
{
  "pc_id": 7,
  "lines": 200,
  "log_url": "/api/pcs/7/logs/2026-04-19T10-00-00.log.gz",
  "size_bytes": 8192
}

// 504 if agent did not respond within 15 sec
{ "error": "Agent did not respond in time" }
```

---

## 7. Windows Agent

### Rationale for C# .NET 8

1. **Antivirus compatibility:** Python+PyInstaller binaries are mass-detected by AV (especially corporate Kaspersky/ESET in schools) due to the bundled interpreter. C# self-contained is a native PE binary — AV treats it neutrally.
2. **Win32 API:** `LockWorkStation`, DPAPI, Windows Service, ACL — all natively available via P/Invoke or .NET API. Python equivalents are third-party bindings of varying reliability.
3. **Windows Service:** `Microsoft.Extensions.Hosting.WindowsServices` — one line in Program.cs. Complex workaround in Python/PyInstaller.
4. **Bundle size:** self-contained .exe ≈ 30–50 MB (includes .NET runtime). Similar to PyInstaller but with more predictable behavior.
5. **Single-file publish:** `dotnet publish -r win-x64 --self-contained -p:PublishSingleFile=true` — one .exe, no .NET installation required on student machines.

### Process Architecture

```
Windows Service: ClassroomAgent.exe
├── BackgroundService (Worker.cs) — main loop
│   ├── WebSocketClient — reconnect loop, message pump
│   ├── CommandDispatcher — command routing
│   ├── HeartbeatTimer — every 15 sec
│   └── UpdateManager — handles update_available, downloads, validates
│
└── ProcessWatchdog — built-in watchdog (monitors self via named mutex)
    If mutex lost (process killed) → Windows SCM restarts service (Restart=Always)

ClassroomUpdater.exe — launched only during update
├── Waits for ClassroomAgent.exe to exit (by PID)
├── Backs up agent.exe → agent.previous.exe
├── Copies new agent.exe
├── Starts service via sc.exe
└── Waits for register with new version (60 sec), otherwise rollback
```

### Start Before User Login

```bat
sc.exe create ClassroomAgent binPath="C:\ProgramData\ClassroomAgent\agent.exe"
sc.exe config ClassroomAgent start=auto
sc.exe config ClassroomAgent obj=LocalSystem   # starts before user login
```

### Student Protection

```csharp
// TaskManagerBlocker.cs — via registry
Registry.SetValue(
    @"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Policies\System",
    "DisableTaskMgr", 1, RegistryValueKind.DWord);

// Folder ACL — deny Modify for Users/Everyone, allow only SYSTEM and Administrators
var security = Directory.GetAccessControl(agentDir);
```

```csharp
// ScreenLocker.cs
[DllImport("user32.dll")] static extern bool LockWorkStation();
```

> ⚠️ Explicit limitation: does not protect against an administrator with physical access. This protects against a student with standard user rights only.

### Token Storage (DPAPI)

```csharp
// TokenStorage.cs
// Write (on install)
byte[] encrypted = ProtectedData.Protect(
    Encoding.UTF8.GetBytes(plainToken),
    null,
    DataProtectionScope.LocalMachine  // machine-bound, not user-bound
);
File.WriteAllBytes(tokenPath, encrypted);

// Read
byte[] decrypted = ProtectedData.Unprotect(
    File.ReadAllBytes(tokenPath), null, DataProtectionScope.LocalMachine);
string token = Encoding.UTF8.GetString(decrypted);
```

### Program Launch (allowlist only)

```csharp
// LaunchCommand.cs — allowlist is synced from DB via register_ack
if (!_syncedPrograms.TryGetValue(slug, out var prog))
    return CommandResult.Fail($"Program '{slug}' not in allowlist");

if (!File.Exists(prog.WindowsPath))
    return CommandResult.Fail($"Executable not found: {prog.WindowsPath}");

Process.Start(new ProcessStartInfo {
    FileName = prog.WindowsPath,  // ONLY from synced allowlist, NEVER from command payload
    UseShellExecute = true
});
```

### Signature Verification (Ed25519)

✅ **Ed25519** via BouncyCastle (NuGet: `BouncyCastle.Cryptography`).  
Public key is embedded in the binary at build time.

```csharp
// SignatureVerifier.cs
public bool Verify(byte[] fileBytes, byte[] signatureBytes)
{
    var pubKeyBytes = Convert.FromBase64String(EmbeddedPublicKey);
    var pubKey = new Ed25519PublicKeyParameters(pubKeyBytes, 0);
    var verifier = new Ed25519Signer();
    verifier.Init(false, pubKey);
    verifier.BlockUpdate(fileBytes, 0, fileBytes.Length);
    return verifier.VerifySignature(signatureBytes);
}
```

---

## 8. Security

### Telegram initData

- HMAC-SHA256 verification on every request (algorithm in Section 6)
- `auth_date` not older than 24 hours
- `telegram_id` from `initData` verified against `User.is_active = True`
- Teacher whitelist maintained in DB, managed via bot command: `/add_teacher @username`

### Agent Tokens

- Generation: `secrets.token_urlsafe(32)` — 43 chars, 256 bits of entropy
- DB storage: only `bcrypt.hash(token)` — plaintext never persisted
- Shown once on creation via `POST /api/tokens`
- Revocation: `DELETE /tokens/{id}` → `Token.is_active=False` + WS connection closed (code 4401)
- WS handshake verification: `bcrypt.verify(token, token_hash)`

### Threat Model: Token Leak

| Threat | Mitigation |
|---|---|
| Token leaked (log scan, etc.) | Revoke via bot — invalidated immediately |
| Attacker connects with stolen token | Receives commands addressed to that PC, cannot issue commands (only Backend→Agent direction) |
| VPS compromised | Attacker cannot release malicious update — no access to signing private key |
| Token reused on different machine | Backend checks `machine_fingerprint` on every reconnect — mismatch → rejected |

### Code Signing

✅ **Ed25519** signing.

- Private key: generated **once** on developer machine
- Stored **only** on developer machine + encrypted offline backup (USB)
- **Never** on VPS, never in repo
- Public key embedded in `agent.exe` at build time
- On release: `release-agent.sh` signs the binary, puts signature in `manifest.json`
- VPS only distributes pre-signed binaries — cannot produce valid signatures

### Rate Limiting

```python
# middleware/rate_limit.py
# /api/*           — 60 req/min per IP
# /ws handshake    — 10 attempts/min per IP (brute-force token protection)
# POST /api/tokens — 5/min per user
```

### CORS

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://t.me", "https://web.telegram.org"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

---

## 9. CI/CD and Deployment

### GitHub Actions Workflow

`.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [master, dev]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Check deploy window (prod only)
        if: github.ref == 'refs/heads/master'
        run: |
          HOUR=$(TZ=Europe/Moscow date +%H)
          if [ $HOUR -ge 8 ] && [ $HOUR -lt 16 ]; then
            echo "::error::Deploy blocked 8:00–16:00 MSK. Use workflow_dispatch with force=true."
            exit 1
          fi

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          port: ${{ secrets.VPS_PORT }}
          script: /opt/classroom/deploy/scripts/deploy.sh ${{ github.ref_name }}
```

### `deploy.sh`

```bash
#!/bin/bash
set -e

BRANCH=${1:-master}
ENV=$([ "$BRANCH" = "master" ] && echo "prod" || echo "dev")
DIR=$([ "$ENV" = "prod" ] && echo "/opt/classroom" || echo "/opt/classroom-dev")
SERVICE="classroom-backend$([ "$ENV" = "dev" ] && echo "-dev")"
HEALTH_URL="https://$([ "$ENV" = "prod" ] \
  && echo "266602.fornex.cloud" \
  || echo "dev.266602.fornex.cloud")/api/healthz"

cd $DIR

echo "→ Backup DB"
./deploy/scripts/backup-db.sh $ENV

echo "→ Pull code"
git fetch origin && git checkout $BRANCH && git pull origin $BRANCH

echo "→ Install deps"
uv sync --frozen

echo "→ Migrate DB"
uv run alembic upgrade head

echo "→ Restart service"
sudo systemctl restart $SERVICE

echo "→ Healthcheck"
for i in {1..5}; do
  sleep 3
  curl -sf $HEALTH_URL && echo "✓ Deploy successful" && exit 0
done

echo "✗ Healthcheck failed — rolling back"
git reset --hard HEAD~1
uv run alembic downgrade -1
sudo systemctl restart $SERVICE
exit 1
```

### GitHub Secrets

| Secret | Value |
|---|---|
| `VPS_HOST` | `266602.fornex.cloud` |
| `VPS_USER` | `classroom-deploy` |
| `VPS_SSH_KEY` | ED25519 private key (deploy-only) |
| `VPS_PORT` | `22` |

### Deploy User on VPS

```bash
useradd -m classroom-deploy
echo "classroom-deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart classroom-backend, /bin/systemctl restart classroom-backend-dev" \
  >> /etc/sudoers.d/classroom-deploy
```

### systemd Unit

```ini
[Unit]
Description=Classroom Control Backend (prod)
After=network.target

[Service]
Type=simple
User=classroom
WorkingDirectory=/opt/classroom
ExecStart=/opt/classroom/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8080
Restart=always
RestartSec=5
EnvironmentFile=/opt/classroom/.env

[Install]
WantedBy=multi-user.target
```

### nginx

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

location /ws {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 300s;
}

location / {
    root /opt/classroom/webapp/dist;
    try_files $uri $uri/ /index.html;
}
```

---

## 10. Agent Self-Update

✅ **Automatic** — no confirmation required. Backend sends `update_available`, agent proceeds immediately.

### Update Flow

```
1. heartbeat → backend compares agent_version with AgentRelease[channel=stable]
2. Newer version found → backend sends update_available (url, sha256, Ed25519 signature)
3. Agent:
   a. Downloads agent.exe to C:\ProgramData\ClassroomAgent\pending\
   b. Verifies SHA256 matches message
   c. Verifies Ed25519 signature against embedded public key
   d. If both pass → launches ClassroomUpdater.exe --old-path ... --new-path ... --service-pid ...
   e. Stops gracefully (StopAsync)

4. ClassroomUpdater.exe:
   a. Waits for agent PID to exit (max 10 sec, then kill)
   b. cp agent.exe → backup/agent.previous.exe
   c. cp pending/agent.exe → agent.exe
   d. sc start ClassroomAgent
   e. Waits for register with new version (max 60 sec)
   f. Success → log to Windows Event Log "Update to vX.Y.Z successful"
   g. No register in 60 sec → rollback: restore agent.previous.exe, sc start
```

### Canary Rollout

```
release-agent.sh vX.Y.Z --channel canary
  → upload to VPS, register in AgentRelease (channel=canary)
  → 1-2 test PCs (update_channel=canary) receive update_available
  → 24 hours without errors
  → /promote vX.Y.Z stable  (bot command)
  → AgentRelease.channel = stable
  → all PCs with update_channel=stable receive update
```

### Emergency Rollback

```
/emergency_rollback  (bot command)
  → backend sends command_type=rollback to all online agents
  → agent launches updater with --rollback flag
  → updater: cp backup/agent.previous.exe → agent.exe, sc restart
```

### Signing Private Key

- Generated **once** locally: `openssl genpkey -algorithm ed25519 -out signing.key`
- Stored **only** on developer machine + encrypted USB backup
- Never on VPS, never in git
- Public key embedded at build time via `publish.ps1`

---

## 11. Logging and Observability

### Backend

- Format: JSON (`python-json-logger`)
- Output: stdout → journald (systemd)
- `journalctl -u classroom-backend -f` — live tail
- Security events: `/var/log/classroom/security.log`

Sample entry:
```json
{
  "timestamp": "2026-04-19T10:00:01Z",
  "level": "INFO",
  "trace_id": "abc123",
  "event": "command_dispatched",
  "command_type": "lock",
  "target_count": 13,
  "user_id": 42
}
```

### Agent

**Windows Event Log** — critical events (visible in Event Viewer on-site)  
**Local file** `C:\ProgramData\ClassroomAgent\logs\agent.log` — DEBUG level (Serilog, rolling 10 MB × 5)  
**Remote upload** — on `upload_logs` command, gzip via WebSocket (or HTTPS POST if > 64 KB)

### Trace ID

Every webapp command → `trace_id = uuid4()`  
Propagated through: webapp → POST /commands → DB record → WS command → command_result  
Grep `trace_id` in backend logs + fetch agent logs → complete incident picture.

### Telegram Admin Alerts

| Event | Trigger |
|---|---|
| Agent offline during school hours | `last_seen + 10 min` during working hours |
| Failed deploy | healthcheck fail + rollback |
| High error rate after update | > 5% agents on new version with errors in first hour |
| Revoked token attempts | > 10 in 1 min |
| Rate limit hit | > 100 req/min from one IP |

---

## 12. Roadmap

### MVP — one room, manual deploy

- [ ] Repo structure, `.env`, systemd unit, nginx config
- [ ] Backend: FastAPI + SQLModel + Alembic, models PC/Command/Token/User
- [ ] WebSocket manager (connect, disconnect, heartbeat)
- [ ] Commands: lock/unlock, protect_on/off
- [ ] API: GET /pcs, POST /commands, GET /commands/{id}, POST /tokens, GET /healthz
- [ ] Middleware: initData validation
- [ ] Webapp: connect to real API (remove hardcoded data), setBaseUrl, setAuthTokenGetter
- [ ] Agent C#: Windows Service, WebSocket reconnect, lock/unlock, protect, allowlist sync
- [ ] Manual deploy via `deploy.sh`
- [ ] Logging: Event Log + local file on agent
- *Self-update: NO (protocol field agent_version: YES, mechanism: NO)*
- *GitHub Actions: NO*
- *Groups: NO (single room)*

### v1 — full school, CI/CD

- [ ] PC groups + PCGroupMembership
- [ ] Mass commands to group / all
- [ ] Program launch + AllowedProgram API + DB-synced paths
- [ ] Telegram bot: /status, /add_teacher, /revoke_token
- [ ] GitHub Actions CI/CD (master → prod, dev → dev)
- [ ] Agent self-update (ClassroomUpdater + Ed25519 signing)
- [ ] Remote log upload (`upload_logs`)
- [ ] Telegram admin alerts
- [ ] Rate limiting
- [ ] Reboot / Shutdown commands

### v2

- [ ] On-demand screenshots
- [ ] Telemetry (CPU/RAM/active window) in heartbeat
- [ ] Teacher action audit log
- [ ] Prometheus endpoint `/metrics`
- [ ] Canary channel with auto-promote

### v3 (optional)

- [ ] Web admin panel outside Telegram
- [ ] Multi-tenant (multiple schools on one VPS)

---

## 13. Open Questions

### Resolved ✅

| # | Question | Decision |
|---|---|---|
| ✅1 | ORM library | **SQLModel** — less boilerplate, native FastAPI integration |
| ✅2 | Program paths — DB or agent config? | **DB** (`AllowedProgram.windows_path`), synced to agent on `register_ack` |
| ✅3 | Self-update — automatic or confirmed? | **Automatic** — no confirmation required |
| ✅4 | Token granularity | **One token per PC** — precise revocation, per-PC audit |
| ✅5 | Binary signing algorithm | **Ed25519** via BouncyCastle (NuGet) in .NET 8 |

### Pending ❓

| # | Question | Options |
|---|---|---|
| ❓1 | Screenshots — MVP or v2? | — |
| ❓2 | Admin alerts — which events are critical? Second admin Telegram ID? | — |
| ❓3 | Deploy window block in CI — hard block or README convention only? | Hard block = safer; requires override flag for hotfixes |
| ❓4 | Offline command queue TTL — 5 min acceptable for MVP? Needed at all? | — |
| ❓5 | Allowlist sync — only on `register_ack` or also via `sync_programs` command? | `register_ack` only is simpler; command allows hot-reload without reconnect |

---

*Document created from webapp/ analysis and architecture specification. Update manually when architectural decisions change.*
