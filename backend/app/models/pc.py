from datetime import datetime
from sqlmodel import SQLModel, Field


class PC(SQLModel, table=True):
    __tablename__ = "pcs"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)
    hostname: str | None = Field(default=None, max_length=100)
    ip_local: str | None = Field(default=None, max_length=45)
    machine_fingerprint: str | None = Field(default=None, max_length=64, unique=True)
    group_id: int | None = Field(default=None, foreign_key="groups.id", index=True)
    online: bool = Field(default=False, index=True)
    locked: bool = False
    protected: bool = False
    agent_version: str | None = Field(default=None, max_length=20)
    update_channel: str = Field(default="stable", max_length=10)
    last_seen: datetime | None = Field(default=None, index=True)
    os_version: str | None = Field(default=None, max_length=100)
    created_at: datetime = Field(default_factory=datetime.utcnow)
