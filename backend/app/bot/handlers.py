import logging
from sqlmodel import select
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, ContextTypes

from ..config import settings
from ..database import get_session
from ..models import PC, User
from ..services.login_token_service import create_login_token

logger = logging.getLogger(__name__)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return

    tg_id = update.effective_user.id if update.effective_user else None
    with get_session() as session:
        user = session.exec(
            select(User).where(User.telegram_id == tg_id, User.is_active == True)
        ).first() if tg_id else None

    if not user:
        await update.message.reply_text(
            "⛔ Доступ закрыт.\n\nОбратитесь к администратору, чтобы получить доступ."
        )
        return

    if not settings.webapp_url:
        await update.message.reply_text(
            f"👋 Привет, {user.full_name}!\n\nWEBAPP_URL не настроен. Укажите его в .env."
        )
        return

    token = create_login_token(user.telegram_id)
    login_url = f"{settings.webapp_url.rstrip('/')}/?token={token}"

    kb = InlineKeyboardMarkup([[
        InlineKeyboardButton("🖥 Войти в Класс-Контроль", url=login_url)
    ]])
    await update.message.reply_text(
        f"👋 Привет, {user.full_name}!\n\nНажми кнопку ниже для входа.\n"
        f"Ссылка действительна 10 минут.",
        reply_markup=kb,
    )


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return

    tg_id = update.effective_user.id if update.effective_user else None
    with get_session() as session:
        user = session.exec(
            select(User).where(User.telegram_id == tg_id, User.is_active == True)
        ).first() if tg_id else None

        if not user:
            await update.message.reply_text("⛔ Доступ закрыт.")
            return

        pcs = session.exec(select(PC)).all()

    total = len(pcs)
    online = sum(1 for p in pcs if p.online)
    locked = sum(1 for p in pcs if p.locked)
    protected = sum(1 for p in pcs if p.protected)

    lines = [f"📊 *Состояние класса*"]
    lines.append(f"🖥 Компьютеров: {total}")
    lines.append(f"🟢 Онлайн: {online} / {total}")
    if locked:
        lines.append(f"🔒 Заблокировано: {locked}")
    if protected:
        lines.append(f"🛡 Под защитой: {protected}")

    if online > 0:
        online_names = [p.name for p in pcs if p.online]
        lines.append(f"\nОнлайн: {', '.join(online_names)}")

    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def cmd_add_teacher(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return

    tg_id = update.effective_user.id if update.effective_user else None
    with get_session() as session:
        admin = session.exec(
            select(User).where(User.telegram_id == tg_id, User.is_admin == True, User.is_active == True)
        ).first() if tg_id else None

    if not admin:
        await update.message.reply_text("⛔ Только администратор может добавлять учителей.")
        return

    args = context.args or []
    if not args:
        await update.message.reply_text(
            "Использование: /add_teacher <telegram_id> [имя]\n"
            "Пример: /add_teacher 123456789 Иван Петров"
        )
        return

    try:
        new_tg_id = int(args[0])
    except ValueError:
        await update.message.reply_text("❌ Некорректный Telegram ID.")
        return

    full_name = " ".join(args[1:]) if len(args) > 1 else f"Teacher {new_tg_id}"

    with get_session() as session:
        existing = session.exec(
            select(User).where(User.telegram_id == new_tg_id)
        ).first()

        if existing:
            if existing.is_active:
                await update.message.reply_text(f"ℹ️ Пользователь {full_name} уже существует.")
                return
            existing.is_active = True
            existing.full_name = full_name
            session.add(existing)
            session.commit()
        else:
            user = User(
                telegram_id=new_tg_id,
                username=f"user_{new_tg_id}",
                full_name=full_name,
                is_admin=False,
                is_active=True,
            )
            session.add(user)
            session.commit()

    await update.message.reply_text(
        f"✅ Учитель добавлен: *{full_name}* (ID: {new_tg_id})\n"
        f"Пусть напишет боту /start для входа.",
        parse_mode="Markdown",
    )


def build_bot_app() -> Application:
    app = Application.builder().token(settings.bot_token).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("add_teacher", cmd_add_teacher))
    return app
