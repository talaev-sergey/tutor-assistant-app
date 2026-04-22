import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from .config import settings
from .database import engine, create_db_and_tables
from .api import health, pcs, commands, tokens, programs, groups
from .ws.handlers import handle_websocket
from .ws.manager import manager

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    logger.info("Classroom Control Backend started (version %s)", settings.app_version)
    yield
    logger.info("Backend shutting down")


app = FastAPI(
    title="Classroom Control API",
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://t.me", "https://web.telegram.org"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(health.router, prefix="/api")
app.include_router(pcs.router, prefix="/api/pcs", tags=["PCs"])
app.include_router(commands.router, prefix="/api/commands", tags=["Commands"])
app.include_router(tokens.router, prefix="/api/tokens", tags=["Tokens"])
app.include_router(programs.router, prefix="/api/programs", tags=["Programs"])
app.include_router(groups.router, prefix="/api/groups", tags=["Groups"])


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    with Session(engine) as session:
        await handle_websocket(websocket, session)
