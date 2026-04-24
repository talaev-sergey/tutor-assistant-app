import logging
import socket
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session
from zeroconf import ServiceInfo
from zeroconf.asyncio import AsyncZeroconf

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .config import settings, _detect_lan_ip
from .middleware.rate_limit import limiter

WEBAPP_DIST = Path(__file__).resolve().parent.parent.parent / "webapp" / "dist"
from .database import engine, create_db_and_tables
from .api import health, pcs, commands, tokens, programs, groups, auth
from .ws.handlers import handle_websocket
from .ws.manager import manager
from .bot.handlers import build_bot_app
from .services.alert_service import set_bot_app

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


async def _start_mdns() -> tuple[AsyncZeroconf, ServiceInfo] | None:
    try:
        local_ip = _detect_lan_ip()
        info = ServiceInfo(
            "_classroom._tcp.local.",
            "Classroom Control._classroom._tcp.local.",
            addresses=[socket.inet_aton(local_ip)],
            port=8082,
            server="classroom.local.",
        )
        azc = AsyncZeroconf()
        await azc.async_register_service(info)
        logger.info("mDNS: classroom.local → %s", local_ip)
        return azc, info
    except Exception as e:
        logger.warning("mDNS failed to start: %s", e)
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    logger.info("Classroom Control Backend started (version %s)", settings.app_version)

    mdns = await _start_mdns()

    bot_app = None
    if settings.bot_token:
        try:
            bot_app = build_bot_app()
            await bot_app.initialize()
            await bot_app.start()
            await bot_app.updater.start_polling(allowed_updates=["message"])
            set_bot_app(bot_app)
            logger.info("Telegram bot started (polling)")
        except Exception as e:
            logger.warning("Telegram bot failed to start: %s", e)
            bot_app = None
    else:
        logger.info("BOT_TOKEN not set — Telegram bot disabled")

    yield

    if mdns:
        azc, info = mdns
        await azc.async_unregister_service(info)
        await azc.async_close()

    if bot_app:
        await bot_app.updater.stop()
        await bot_app.stop()
        await bot_app.shutdown()
    logger.info("Backend shutting down")


CORS_ORIGINS = ["https://t.me", "https://web.telegram.org"]
if settings.debug:
    CORS_ORIGINS += ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174"]

app = FastAPI(
    title="Classroom Control API",
    version=settings.app_version,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(pcs.router, prefix="/api/pcs", tags=["PCs"])
app.include_router(commands.router, prefix="/api/commands", tags=["Commands"])
app.include_router(tokens.router, prefix="/api/tokens", tags=["Tokens"])
app.include_router(programs.router, prefix="/api/programs", tags=["Programs"])
app.include_router(groups.router, prefix="/api/groups", tags=["Groups"])


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    with Session(engine) as session:
        await handle_websocket(websocket, session)


# Serve webapp static files (production: webapp/dist must be built)
if WEBAPP_DIST.exists():
    # Static assets (JS/CSS/images) served directly
    app.mount("/assets", StaticFiles(directory=str(WEBAPP_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        file = WEBAPP_DIST / full_path
        if file.is_file():
            return FileResponse(file)
        return FileResponse(WEBAPP_DIST / "index.html")
