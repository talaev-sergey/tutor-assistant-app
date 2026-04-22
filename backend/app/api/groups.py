from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import select, func

from ..database import get_session
from ..middleware.auth import get_current_user
from ..models import Group, PCGroupMembership, User

router = APIRouter()


class GroupResponse(BaseModel):
    id: int
    name: str
    pc_count: int


@router.get("", response_model=list[GroupResponse])
async def list_groups(current_user: User = Depends(get_current_user)):
    with get_session() as session:
        groups = session.exec(select(Group)).all()
        result = []
        for g in groups:
            count = len(
                session.exec(
                    select(PCGroupMembership).where(PCGroupMembership.group_id == g.id)
                ).all()
            )
            result.append(GroupResponse(id=g.id, name=g.name, pc_count=count))
        return result
