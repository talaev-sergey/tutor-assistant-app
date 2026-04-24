from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from ..database import get_session
from ..middleware.auth import get_current_user
from ..models import PC, Token, User
from ..ws.manager import manager

router = APIRouter()


class PCResponse(BaseModel):
    id: int
    name: str
    ip_local: str | None
    online: bool
    locked: bool
    protected: bool
    agent_version: str | None
    last_seen: datetime | None
    group_id: int | None


class RenameRequest(BaseModel):
    name: str


class AssignGroupRequest(BaseModel):
    group_id: int | None


@router.get("", response_model=list[PCResponse])
async def list_pcs(
    group_id: int | None = None,
    current_user: User = Depends(get_current_user),
):
    with get_session() as session:
        query = select(PC)
        if group_id is not None:
            query = query.where(PC.group_id == group_id)
        pcs = session.exec(query).all()
        return [_to_response(pc) for pc in pcs]


@router.post("/{pc_id}/rename", response_model=dict)
async def rename_pc(
    pc_id: int,
    body: RenameRequest,
    current_user: User = Depends(get_current_user),
):
    with get_session() as session:
        pc = session.get(PC, pc_id)
        if not pc:
            raise HTTPException(status_code=404, detail="PC not found")
        pc.name = body.name
        session.add(pc)
        session.commit()
        return {"id": pc.id, "name": pc.name}


@router.post("/{pc_id}/assign", response_model=dict)
async def assign_group(
    pc_id: int,
    body: AssignGroupRequest,
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    with get_session() as session:
        pc = session.get(PC, pc_id)
        if not pc:
            raise HTTPException(status_code=404, detail="PC not found")
        pc.group_id = body.group_id
        session.add(pc)
        session.commit()
        return {"id": pc.id, "group_id": pc.group_id}


@router.delete("/{pc_id}", status_code=204)
async def delete_pc(
    pc_id: int,
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    with get_session() as session:
        pc = session.get(PC, pc_id)
        if not pc:
            raise HTTPException(status_code=404, detail="PC not found")
        # Deactivate associated token
        token = session.exec(select(Token).where(Token.pc_id == pc_id, Token.is_active == True)).first()
        if token:
            token.is_active = False
            session.add(token)
        session.delete(pc)
        session.commit()

    ws = manager._connections.get(pc_id)
    if ws:
        await ws.close(code=4401)
        await manager.disconnect(pc_id)


def _to_response(pc: PC) -> PCResponse:
    return PCResponse(
        id=pc.id,
        name=pc.name,
        ip_local=pc.ip_local,
        online=pc.online,
        locked=pc.locked,
        protected=pc.protected,
        agent_version=pc.agent_version,
        last_seen=pc.last_seen,
        group_id=pc.group_id,
    )
