from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import select

from ..database import get_session
from ..middleware.auth import get_current_user
from ..models import AllowedProgram, User

router = APIRouter()


class ProgramResponse(BaseModel):
    id: int
    slug: str
    name: str
    icon: str | None
    description: str | None
    is_active: bool


@router.get("", response_model=list[ProgramResponse])
async def list_programs(current_user: User = Depends(get_current_user)):
    with get_session() as session:
        programs = session.exec(
            select(AllowedProgram).where(AllowedProgram.is_active == True)
        ).all()
        return [
            ProgramResponse(
                id=p.id,
                slug=p.slug,
                name=p.name,
                icon=p.icon,
                description=p.description,
                is_active=p.is_active,
            )
            for p in programs
        ]
