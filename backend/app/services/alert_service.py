import logging
from sqlmodel import select

logger = logging.getLogger(__name__)
_bot_app = None


def set_bot_app(app) -> None:
    global _bot_app
    _bot_app = app


async def send_alert(text: str) -> None:
    if not _bot_app:
        return
    from ..database import get_session
    from ..models import User

    with get_session() as session:
        admins = session.exec(
            select(User).where(User.is_admin == True, User.is_active == True)
        ).all()
        admin_ids = [a.telegram_id for a in admins]

    for tg_id in admin_ids:
        try:
            await _bot_app.bot.send_message(chat_id=tg_id, text=text)
        except Exception as e:
            logger.warning("alert to tg_id=%d failed: %s", tg_id, e)
