from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..database import get_session
from ..middleware.auth import get_current_user
from ..models import Token, User
from ..services.token_service import generate_token, hash_token
from ..ws.manager import manager

router = APIRouter()


class TokenCreateRequest(BaseModel):
    name: str


class TokenCreateResponse(BaseModel):
    id: int
    name: str
    token: str  # shown once
    created_at: datetime


@router.post("", response_model=TokenCreateResponse, status_code=201)
async def create_token(
    body: TokenCreateRequest,
    current_user: User = Depends(get_current_user),
):
    raw = generate_token()
    with get_session() as session:
        token = Token(
            name=body.name,
            token_hash=hash_token(raw),
            created_by=current_user.id,
        )
        session.add(token)
        session.commit()
        session.refresh(token)
        return TokenCreateResponse(
            id=token.id,
            name=token.name,
            token=raw,
            created_at=token.created_at,
        )


@router.delete("/{token_id}")
async def revoke_token(
    token_id: int,
    current_user: User = Depends(get_current_user),
):
    with get_session() as session:
        token = session.get(Token, token_id)
        if not token:
            raise HTTPException(status_code=404, detail="Token not found")
        token.is_active = False
        session.add(token)
        session.commit()

    # Close any open WS connection for this PC
    if token.pc_id:
        ws = manager._connections.get(token.pc_id)
        if ws:
            await ws.close(code=4401)
            await manager.disconnect(token.pc_id)

    return {"revoked": True}
