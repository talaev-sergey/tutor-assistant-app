# Project Wiki — Classroom Control

Telegram Mini App для управления школьными ПК через локальную сеть WebSocket.  
Полная спецификация: `docs/PROJECT_MAP.md`

## Статус (2026-04-24) — MVP полностью готов

Все компоненты реализованы: backend, WebSocket, API, auth (JWT + one-time link), Windows Agent (C# .NET 8), auto-update, GUI installer, Linux installer, CI/CD, webapp (Admin page, PCGrid, мультиселект), Telegram bot (/new_token), mDNS (classroom.local), StaticFiles раздача webapp.

## Topics

- [[topics/architecture]]: Architecture — stack, deployment, key decisions
- [[topics/protocol]]: WebSocket Protocol — Backend ↔ Agent message types and flows
- [[topics/agent]]: Windows Agent — C# .NET 8, installer, auto-update, student protection
- [[topics/graph]]: Code Graph — god nodes, community map (читать по запросу, не грузить автоматически)

## Архитектурные решения

| Решение | Выбор |
|---|---|
| ORM | SQLModel |
| Пути программ | В БД, синхронизируются через `register_ack` |
| Автообновление | Автоматическое, без подтверждения |
| Токены | Один на ПК |
| Подпись бинарей | Ed25519 (BouncyCastle) — планируется в v1 |
| Service discovery | mDNS — `classroom.local` через zeroconf |
| Webapp URL | Авто-определяется из LAN IP если `WEBAPP_URL` не задан |

## Заметки

- Бэкенд на машине учителя (локальная сеть), VPS не нужен
- Agent собирается на Linux (`agent/publish.sh`), кросс-компиляция win-x64
- `WEBAPP_PORT`: 8082 prod (пишется в `/etc/classroom-control/secrets`), 5173 dev (в `backend/.env`)
- Admin page (иконка шестерёнки, только admin): добавить ПК (токен показывается один раз), переименовать, удалить ПК вместе с токеном
- PCGrid: офлайн-карточки скрыты по умолчанию, кнопка "Недоступные: N" показывает их
