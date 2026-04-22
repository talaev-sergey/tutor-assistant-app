import uuid
import logging
from packaging.version import Version
from sqlmodel import Session, select

from ..models import PC, AgentRelease

logger = logging.getLogger(__name__)


def build_update_message(session: Session, pc: PC) -> dict | None:
    if not pc.agent_version or not pc.update_channel:
        return None

    latest = session.exec(
        select(AgentRelease)
        .where(AgentRelease.channel == pc.update_channel, AgentRelease.is_active == True)
        .order_by(AgentRelease.released_at.desc())
    ).first()

    if not latest:
        return None

    try:
        if Version(latest.version) <= Version(pc.agent_version):
            return None
    except Exception:
        return None

    logger.info(
        "Update available for pc_id=%d: %s → %s",
        pc.id, pc.agent_version, latest.version,
    )

    return {
        "type": "update_available",
        "protocol_version": 1,
        "message_id": str(uuid.uuid4()),
        "version": latest.version,
        "download_url": latest.download_url,
        "sha256": latest.sha256,
        "signature": latest.signature,
        "min_protocol_version": latest.min_protocol_version,
        "channel": latest.channel,
    }
