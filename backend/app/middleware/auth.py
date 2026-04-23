import hmac
import hashlib
import json
import time
from urllib.parse import unquote, parse_qsl

import jwt as pyjwt
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import select

from ..config import settings
from ..database import get_session
from ..models import User

security = HTTPBearer()


class AuthError(Exception):
    pass


def verify_telegram_init_data(init_data: str) -> dict:
    parsed = dict(parse_qsl(unquote(init_data), keep_blank_values=True))
    hash_from_client = parsed.pop("hash", "")

    data_check = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
    secret_key = hmac.new(b"WebAppData", settings.bot_token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret_key, data_check.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected, hash_from_client):
        raise AuthError("Invalid signature")

    if time.time() - int(parsed.get("auth_date", 0)) > 86400:
        raise AuthError("Expired initData")

    return parsed


def _get_user_by_telegram_id(telegram_id: int) -> User:
    with get_session() as session:
        user = session.exec(
            select(User).where(User.telegram_id == telegram_id, User.is_active == True)
        ).first()
    if not user:
        raise HTTPException(status_code=403, detail="Access denied")
    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> User:
    scheme = credentials.scheme.lower()
    token = credentials.credentials

    # JWT session (web app login via Telegram widget)
    if scheme == "bearer":
        try:
            payload = pyjwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        except pyjwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Session expired")
        except pyjwt.PyJWTError:
            raise HTTPException(status_code=401, detail="Invalid token")
        return _get_user_by_telegram_id(int(payload["sub"]))

    # Telegram Mini App initData (legacy / future use)
    if scheme == "tma":
        try:
            parsed = verify_telegram_init_data(token)
        except AuthError as e:
            raise HTTPException(status_code=401, detail=str(e))
        user_data = json.loads(parsed.get("user", "{}"))
        telegram_id = user_data.get("id")
        if not telegram_id:
            raise HTTPException(status_code=401, detail="No user in initData")
        return _get_user_by_telegram_id(telegram_id)

    raise HTTPException(status_code=401, detail="Unsupported auth scheme")
