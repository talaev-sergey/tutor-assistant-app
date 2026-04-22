import json
import logging
import uuid
from datetime import datetime, timedelta

from fastapi import WebSocket, WebSocketDisconnect
from sqlmodel import Session, select

from ..models import PC, Token, Command, CommandResult, AllowedProgram
from ..services.token_service import verify_token
from .manager import manager

logger = logging.getLogger(__name__)

HEARTBEAT_TIMEOUT_SECONDS = 45


async def handle_websocket(websocket: WebSocket, session: Session):
    await websocket.accept()

    # Authenticate via Bearer token from header
    auth_header = websocket.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        await websocket.close(code=4401)
        return

    raw_token = auth_header.removeprefix("Bearer ").strip()
    token_record = _authenticate_token(session, raw_token)
    if not token_record:
        await websocket.close(code=4401)
        return

    pc_id: int | None = None

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "register":
                pc_id = await _handle_register(websocket, session, msg, token_record)
            elif msg_type == "heartbeat":
                await _handle_heartbeat(session, msg)
            elif msg_type == "command_result":
                await _handle_command_result(session, msg)
            elif msg_type == "log_upload":
                _handle_log_upload(msg)
            else:
                logger.debug("unknown message type: %s", msg_type)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error("ws error pc_id=%s: %s", pc_id, e)
    finally:
        if pc_id:
            await manager.disconnect(pc_id)
            _mark_offline(session, pc_id)


def _authenticate_token(session: Session, raw_token: str) -> Token | None:
    tokens = session.exec(select(Token).where(Token.is_active == True)).all()
    for t in tokens:
        if verify_token(raw_token, t.token_hash):
            t.last_used = datetime.utcnow()
            session.add(t)
            session.commit()
            return t
    return None


async def _handle_register(
    websocket: WebSocket, session: Session, msg: dict, token_record: Token
) -> int | None:
    fingerprint = msg.get("machine_fingerprint")
    agent_version = msg.get("agent_version", "")
    hostname = msg.get("hostname", "")
    ip_local = msg.get("ip_local", "")
    os_version = msg.get("os_version", "")

    # Find or create PC by fingerprint
    pc: PC | None = None
    if fingerprint:
        pc = session.exec(select(PC).where(PC.machine_fingerprint == fingerprint)).first()

    if not pc and token_record.pc_id:
        pc = session.get(PC, token_record.pc_id)

    if not pc:
        pc = PC(
            name=msg.get("pc_name", hostname or "Unknown"),
            machine_fingerprint=fingerprint,
        )
        session.add(pc)
        session.flush()

    pc.hostname = hostname
    pc.ip_local = ip_local
    pc.agent_version = agent_version
    pc.os_version = os_version
    pc.online = True
    pc.last_seen = datetime.utcnow()

    if token_record.pc_id != pc.id:
        token_record.pc_id = pc.id
        session.add(token_record)

    session.add(pc)
    session.commit()
    session.refresh(pc)

    await manager.connect(pc.id, websocket)

    # Build pending commands
    pending = _get_pending_commands(session, pc.id)

    # Allowed programs
    programs = session.exec(
        select(AllowedProgram).where(AllowedProgram.is_active == True)
    ).all()

    ack = {
        "type": "register_ack",
        "protocol_version": 1,
        "message_id": str(uuid.uuid4()),
        "pc_id": pc.id,
        "accepted": True,
        "allowed_programs": [
            {"slug": p.slug, "name": p.name, "windows_path": p.windows_path}
            for p in programs
        ],
        "pending_commands": pending,
    }
    await websocket.send_text(json.dumps(ack))
    logger.info("registered pc_id=%d name=%s version=%s", pc.id, pc.name, agent_version)
    return pc.id


def _get_pending_commands(session: Session, pc_id: int) -> list[dict]:
    now = datetime.utcnow()
    commands = session.exec(
        select(Command).where(
            Command.status == "pending",
            Command.expires_at > now,
        )
    ).all()

    result = []
    for cmd in commands:
        targets = _resolve_command_targets(session, cmd)
        if pc_id in targets:
            result.append({
                "type": "command",
                "protocol_version": 1,
                "message_id": str(uuid.uuid4()),
                "command_id": cmd.uuid,
                "trace_id": cmd.trace_id,
                "command_type": cmd.command_type,
                "params": cmd.params or {},
                "issued_at": cmd.created_at.isoformat() + "Z",
                "expires_at": cmd.expires_at.isoformat() + "Z" if cmd.expires_at else None,
            })
    return result


def _resolve_command_targets(session: Session, command: Command) -> list[int]:
    from ..models import PCGroupMembership
    if command.target_type == "single" and command.target_pc_id:
        return [command.target_pc_id]
    if command.target_type == "group" and command.target_group_id:
        memberships = session.exec(
            select(PCGroupMembership).where(
                PCGroupMembership.group_id == command.target_group_id
            )
        ).all()
        return [m.pc_id for m in memberships]
    if command.target_type == "all":
        pcs = session.exec(select(PC)).all()
        return [pc.id for pc in pcs if pc.id]
    return []


async def _handle_heartbeat(session: Session, msg: dict):
    pc_id = msg.get("pc_id")
    if not pc_id:
        return
    pc = session.get(PC, pc_id)
    if not pc:
        return

    status = msg.get("status", {})
    pc.locked = status.get("locked", pc.locked)
    pc.protected = status.get("protected", pc.protected)
    pc.agent_version = msg.get("agent_version", pc.agent_version)
    pc.online = True
    pc.last_seen = datetime.utcnow()
    session.add(pc)
    session.commit()


async def _handle_command_result(session: Session, msg: dict):
    command_uuid = msg.get("command_id")
    if not command_uuid:
        return

    command = session.exec(
        select(Command).where(Command.uuid == command_uuid)
    ).first()
    if not command:
        return

    result = CommandResult(
        command_id=command.id,
        pc_id=msg.get("pc_id", 0),
        success=msg.get("success", False),
        error=msg.get("error"),
        executed_at=datetime.utcnow(),
    )
    session.add(result)

    # Update PC state based on command type
    pc = session.get(PC, msg.get("pc_id"))
    if pc and msg.get("success"):
        if command.command_type == "lock":
            pc.locked = True
        elif command.command_type == "unlock":
            pc.locked = False
        elif command.command_type == "protect_on":
            pc.protected = True
        elif command.command_type == "protect_off":
            pc.protected = False
        session.add(pc)

    session.commit()
    logger.info(
        "command_result command_id=%s pc_id=%s success=%s",
        command_uuid, msg.get("pc_id"), msg.get("success"),
    )


def _handle_log_upload(msg: dict):
    pc_id = msg.get("pc_id")
    size = msg.get("size_bytes", 0)
    logger.info("log_upload from pc_id=%d size=%d bytes", pc_id, size)


def _mark_offline(session: Session, pc_id: int):
    pc = session.get(PC, pc_id)
    if pc:
        pc.online = False
        session.add(pc)
        session.commit()
