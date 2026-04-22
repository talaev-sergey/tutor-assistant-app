import uuid
import logging
from datetime import datetime, timedelta
from sqlmodel import Session, select

from ..models import Command, CommandResult, PC, Group, PCGroupMembership

logger = logging.getLogger(__name__)

OFFLINE_QUEUE_TTL_SECONDS = 300  # 5 min


async def dispatch_command(
    session: Session,
    command_type: str,
    target_type: str,
    params: dict,
    issued_by: int | None,
    target_pc_id: int | None = None,
    target_group_id: int | None = None,
    target_pc_ids: list[int] | None = None,
    ws_manager=None,
) -> Command:
    command = Command(
        uuid=str(uuid.uuid4()),
        trace_id=str(uuid.uuid4())[:8],
        command_type=command_type,
        params=params,
        target_type=target_type,
        target_pc_id=target_pc_id,
        target_group_id=target_group_id,
        issued_by=issued_by,
        status="pending",
        expires_at=datetime.utcnow() + timedelta(seconds=OFFLINE_QUEUE_TTL_SECONDS),
    )
    session.add(command)
    session.flush()

    pc_ids = _resolve_targets(
        session, target_type, target_pc_id, target_group_id, target_pc_ids
    )

    if ws_manager:
        await _send_to_agents(session, command, pc_ids, ws_manager)

    command.status = "sent"
    session.add(command)
    session.commit()
    session.refresh(command)

    return command


def _resolve_targets(
    session: Session,
    target_type: str,
    target_pc_id: int | None,
    target_group_id: int | None,
    target_pc_ids: list[int] | None,
) -> list[int]:
    if target_type == "single" and target_pc_id:
        return [target_pc_id]
    if target_type == "multi" and target_pc_ids:
        return target_pc_ids
    if target_type == "group" and target_group_id:
        memberships = session.exec(
            select(PCGroupMembership).where(PCGroupMembership.group_id == target_group_id)
        ).all()
        return [m.pc_id for m in memberships]
    if target_type == "all":
        pcs = session.exec(select(PC)).all()
        return [pc.id for pc in pcs if pc.id]
    return []


async def _send_to_agents(session: Session, command: Command, pc_ids: list[int], ws_manager):
    from datetime import timezone

    for pc_id in pc_ids:
        pc = session.get(PC, pc_id)
        if not pc:
            continue

        msg = {
            "type": "command",
            "protocol_version": 1,
            "message_id": str(uuid.uuid4()),
            "command_id": command.uuid,
            "trace_id": command.trace_id,
            "command_type": command.command_type,
            "params": command.params or {},
            "issued_at": command.created_at.isoformat() + "Z",
            "expires_at": command.expires_at.isoformat() + "Z" if command.expires_at else None,
        }

        sent = await ws_manager.send_to_pc(pc_id, msg)
        if not sent:
            logger.info(
                "pc_id=%d offline, command %s queued", pc_id, command.uuid
            )
