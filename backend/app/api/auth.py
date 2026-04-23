import hashlib
import hmac
import time
from datetime import datetime, timezone, timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from ..config import settings
from ..database import get_session
from ..middleware.auth import get_current_user
from ..models import User

router = APIRouter()


class TelegramAuthData(BaseModel):
    id: int
    first_name: str
    last_name: str | None = None
    username: str | None = None
    photo_url: str | None = None
    auth_date: int
    hash: str


class AuthResponse(BaseModel):
    token: str
    telegram_id: int
    full_name: str
    is_admin: bool


def verify_widget_auth(data: TelegramAuthData) -> bool:
    payload = {
        "id": str(data.id),
        "first_name": data.first_name,
        "auth_date": str(data.auth_date),
    }
    if data.last_name:
        payload["last_name"] = data.last_name
    if data.username:
        payload["username"] = data.username
    if data.photo_url:
        payload["photo_url"] = data.photo_url

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(payload.items()))
    secret_key = hashlib.sha256(settings.bot_token.encode()).digest()
    expected = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, data.hash)


def create_jwt(telegram_id: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expire_hours)
    return jwt.encode({"sub": telegram_id, "exp": exp}, settings.jwt_secret, algorithm="HS256")


class MeResponse(BaseModel):
    telegram_id: int
    full_name: str
    is_admin: bool


@router.get("/me", response_model=MeResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return MeResponse(
        telegram_id=current_user.telegram_id,
        full_name=current_user.full_name,
        is_admin=current_user.is_admin,
    )


@router.post("/telegram", response_model=AuthResponse)
async def auth_telegram(data: TelegramAuthData):
    if not settings.bot_token:
        raise HTTPException(status_code=503, detail="Bot not configured")

    if time.time() - data.auth_date > 86400:
        raise HTTPException(status_code=401, detail="Auth data expired")

    if not verify_widget_auth(data):
        raise HTTPException(status_code=401, detail="Invalid signature")

    with get_session() as session:
        user = session.exec(
            select(User).where(User.telegram_id == data.id, User.is_active == True)
        ).first()

    if not user:
        raise HTTPException(status_code=403, detail="Access denied. Ask admin to add you.")

    token = create_jwt(data.id)
    return AuthResponse(
        token=token,
        telegram_id=user.telegram_id,
        full_name=user.full_name,
        is_admin=user.is_admin,
    )
