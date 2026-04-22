from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from ..database import get_session
from ..middleware.auth import get_current_user
from ..models import PC, User

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
