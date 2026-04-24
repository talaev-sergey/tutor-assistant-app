from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from ..database import get_session
from ..middleware.auth import get_current_user
from ..models import Group, PC, User

router = APIRouter()


class GroupResponse(BaseModel):
    id: int
    name: str
    pc_count: int


class CreateGroupRequest(BaseModel):
    name: str


@router.get("", response_model=list[GroupResponse])
async def list_groups(current_user: User = Depends(get_current_user)):
    with get_session() as session:
        groups = session.exec(select(Group)).all()
        result = []
        for g in groups:
            count = len(session.exec(select(PC).where(PC.group_id == g.id)).all())
            result.append(GroupResponse(id=g.id, name=g.name, pc_count=count))
        return result


@router.post("", response_model=GroupResponse, status_code=201)
async def create_group(
    body: CreateGroupRequest,
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    with get_session() as session:
        group = Group(name=name)
        session.add(group)
        session.commit()
        session.refresh(group)
        return GroupResponse(id=group.id, name=group.name, pc_count=0)


@router.delete("/{group_id}", status_code=204)
async def delete_group(
    group_id: int,
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    with get_session() as session:
        group = session.get(Group, group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        # Unassign all PCs from this group
        pcs = session.exec(select(PC).where(PC.group_id == group_id)).all()
        for pc in pcs:
            pc.group_id = None
            session.add(pc)
        session.delete(group)
        session.commit()
