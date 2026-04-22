from fastapi import APIRouter
from ..config import settings
from ..ws.manager import manager

router = APIRouter()


@router.get("/healthz")
async def healthz():
    return {
        "status": "ok",
        "version": settings.app_version,
        "agents_online": len(manager.online_pc_ids()),
    }
