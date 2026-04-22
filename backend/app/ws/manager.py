import asyncio
import json
import logging
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # pc_id -> WebSocket
        self._connections: dict[int, WebSocket] = {}
        self._lock = asyncio.Lock()

    async def connect(self, pc_id: int, websocket: WebSocket):
        async with self._lock:
            old = self._connections.get(pc_id)
            if old:
                try:
                    await old.close(code=4000)
                except Exception:
                    pass
            self._connections[pc_id] = websocket
        logger.info("pc_id=%d connected", pc_id)

    async def disconnect(self, pc_id: int):
        async with self._lock:
            self._connections.pop(pc_id, None)
        logger.info("pc_id=%d disconnected", pc_id)

    async def send_to_pc(self, pc_id: int, message: dict) -> bool:
        ws = self._connections.get(pc_id)
        if not ws:
            return False
        try:
            await ws.send_text(json.dumps(message))
            return True
        except Exception as e:
            logger.warning("send_to_pc pc_id=%d failed: %s", pc_id, e)
            await self.disconnect(pc_id)
            return False

    def online_pc_ids(self) -> list[int]:
        return list(self._connections.keys())

    def is_online(self, pc_id: int) -> bool:
        return pc_id in self._connections


manager = ConnectionManager()
