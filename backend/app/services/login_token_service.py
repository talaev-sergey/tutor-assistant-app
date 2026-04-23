import secrets
import time

# In-memory store: token -> (telegram_id, expires_at)
_tokens: dict[str, tuple[int, float]] = {}


def create_login_token(telegram_id: int, ttl_seconds: int = 600) -> str:
    token = secrets.token_urlsafe(32)
    _tokens[token] = (telegram_id, time.time() + ttl_seconds)
    return token


def consume_login_token(token: str) -> int | None:
    entry = _tokens.pop(token, None)
    if not entry:
        return None
    telegram_id, expires_at = entry
    if time.time() > expires_at:
        return None
    return telegram_id
