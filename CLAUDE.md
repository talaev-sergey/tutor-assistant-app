# CLAUDE.md

**Classroom Control** — Telegram Mini App для управления школьными ПК через локальную сеть WebSocket.  
Полная спецификация: `docs/PROJECT_MAP.md`

## Стек

- `backend/` — FastAPI + SQLModel + Alembic (Python 3.12, uv)
- `webapp/` — React 19 + Vite + Tailwind (Telegram Mini App)
- `agent/` — C# .NET 8 (ClassroomAgent, ClassroomUpdater, ClassroomInstaller)
- `deploy/` — systemd, deploy-скрипты

## Команды

```bash
# Backend (из backend/)
uv run uvicorn app.main:app --host 0.0.0.0 --port 8082 --reload
uv run alembic upgrade head

# Webapp (из webapp/)
pnpm dev        # :5173, прокси /api → :8082
pnpm build

# Agent (из agent/)
./publish.sh    # кросс-компиляция win-x64 → release/
```

## Ключевая архитектура

- Бэкенд на машине учителя, агенты подключаются наружу через WebSocket (обход NAT школы)
- Порт 8082 (dev и prod на локальной сети)
- Auth: Telegram initData HMAC-SHA256 (webapp) / Bearer bcrypt (агенты)
- Автообновление: heartbeat → version mismatch → `update_available` → SHA256+Ed25519 verify → ClassroomUpdater
- mDNS: бэкенд анонсирует `classroom.local`, агент подключается по умолчанию к `ws://classroom.local:8082/ws`
- Бэкенд раздаёт `webapp/dist/` через StaticFiles (nginx не нужен)
- `WEBAPP_PORT` в .env: 5173 для dev, 8082 для prod (installer пишет в `/etc/classroom-control/secrets`)

## Перед коммитом

1. Проверить `.knowledge/index.md` — обновить только устаревшее
2. Проверить `docs/PROJECT_MAP.md` — обновить чеклист и изменившиеся разделы
3. Закоммитить
