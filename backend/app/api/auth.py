from datetime import datetime, timezone, timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from ..config import settings
from ..database import get_session
from ..middleware.auth import get_current_user
from ..models import User
from ..services.login_token_service import consume_login_token

router = APIRouter()


class AuthResponse(BaseModel):
    token: str
    telegram_id: int
    full_name: str
    is_admin: bool


class MeResponse(BaseModel):
    telegram_id: int
    full_name: str
    is_admin: bool


class TokenLoginRequest(BaseModel):
    token: str


def create_jwt(telegram_id: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expire_hours)
    return jwt.encode({"sub": telegram_id, "exp": exp}, settings.jwt_secret, algorithm="HS256")


def _make_auth_response(user: User) -> AuthResponse:
    return AuthResponse(
        token=create_jwt(user.telegram_id),
        telegram_id=user.telegram_id,
        full_name=user.full_name,
        is_admin=user.is_admin,
    )


@router.get("/me", response_model=MeResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return MeResponse(
        telegram_id=current_user.telegram_id,
        full_name=current_user.full_name,
        is_admin=current_user.is_admin,
    )


@router.post("/token", response_model=AuthResponse)
async def auth_by_token(body: TokenLoginRequest):
    telegram_id = consume_login_token(body.token)
    if not telegram_id:
        raise HTTPException(status_code=401, detail="Ссылка недействительна или устарела")

    with get_session() as session:
        user = session.exec(
            select(User).where(User.telegram_id == telegram_id, User.is_active == True)
        ).first()

    if not user:
        raise HTTPException(status_code=403, detail="Доступ запрещён")

    return _make_auth_response(user)
