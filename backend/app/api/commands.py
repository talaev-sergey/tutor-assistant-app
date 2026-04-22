from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from ..database import get_session
from ..middleware.auth import get_current_user
from ..models import Command, CommandResult, PC, User
from ..services.command_dispatcher import dispatch_command
from ..ws.manager import manager

router = APIRouter()

VALID_COMMAND_TYPES = {
    "lock", "unlock", "protect_on", "protect_off",
    "launch", "reboot", "shutdown", "upload_logs", "ping",
}
VALID_TARGET_TYPES = {"single", "group", "all", "multi"}


class CommandRequest(BaseModel):
    command_type: str
    target_type: str
    target_pc_ids: list[int] | None = None
    target_pc_id: int | None = None
    target_group_id: int | None = None
    params: dict = {}


class CommandResponse(BaseModel):
    command_id: str
    trace_id: str
    status: str
    target_count: int


class CommandResultItem(BaseModel):
    pc_id: int
    pc_name: str
    success: bool
    error: str | None
    executed_at: datetime | None


class CommandStatusResponse(BaseModel):
    command_id: str
    command_type: str
    status: str
    results: list[CommandResultItem]
    success_count: int
    fail_count: int
    created_at: datetime
    completed_at: datetime | None


@router.post("", response_model=CommandResponse, status_code=202)
async def create_command(
    body: CommandRequest,
    current_user: User = Depends(get_current_user),
):
    if body.command_type not in VALID_COMMAND_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown command_type: {body.command_type}")
    if body.target_type not in VALID_TARGET_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown target_type: {body.target_type}")

    with get_session() as session:
        command = await dispatch_command(
            session=session,
            command_type=body.command_type,
            target_type=body.target_type,
            params=body.params,
            issued_by=current_user.id,
            target_pc_id=body.target_pc_id,
            target_group_id=body.target_group_id,
            target_pc_ids=body.target_pc_ids,
            ws_manager=manager,
        )

        target_count = _count_targets(session, body)

        return CommandResponse(
            command_id=command.uuid,
            trace_id=command.trace_id,
            status=command.status,
            target_count=target_count,
        )


@router.get("/{command_id}", response_model=CommandStatusResponse)
async def get_command(
    command_id: str,
    current_user: User = Depends(get_current_user),
):
    with get_session() as session:
        command = session.exec(
            select(Command).where(Command.uuid == command_id)
        ).first()
        if not command:
            raise HTTPException(status_code=404, detail="Command not found")

        results_raw = session.exec(
            select(CommandResult).where(CommandResult.command_id == command.id)
        ).all()

        results = []
        for r in results_raw:
            pc = session.get(PC, r.pc_id)
            results.append(CommandResultItem(
                pc_id=r.pc_id,
                pc_name=pc.name if pc else f"PC-{r.pc_id}",
                success=r.success,
                error=r.error,
                executed_at=r.executed_at,
            ))

        success_count = sum(1 for r in results if r.success)
        fail_count = len(results) - success_count
        completed_at = max((r.executed_at for r in results if r.executed_at), default=None)

        return CommandStatusResponse(
            command_id=command.uuid,
            command_type=command.command_type,
            status=command.status,
            results=results,
            success_count=success_count,
            fail_count=fail_count,
            created_at=command.created_at,
            completed_at=completed_at,
        )


def _count_targets(session, body: CommandRequest) -> int:
    from ..models import PCGroupMembership
    if body.target_type == "single":
        return 1
    if body.target_type == "multi":
        return len(body.target_pc_ids or [])
    if body.target_type == "group" and body.target_group_id:
        return session.exec(
            select(PCGroupMembership).where(
                PCGroupMembership.group_id == body.target_group_id
            )
        ).all().__len__()
    if body.target_type == "all":
        return len(session.exec(select(PC)).all())
    return 0
