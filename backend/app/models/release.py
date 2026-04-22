from datetime import datetime
from sqlmodel import SQLModel, Field


class AgentRelease(SQLModel, table=True):
    __tablename__ = "agent_releases"

    id: int | None = Field(default=None, primary_key=True)
    version: str = Field(max_length=20)
    channel: str = Field(default="stable", max_length=10)
    download_url: str = Field(max_length=500)
    sha256: str = Field(max_length=64)
    signature: str  # base64 Ed25519
    min_protocol_version: int = 1
    released_at: datetime = Field(default_factory=datetime.utcnow)
    released_by: int | None = Field(default=None, foreign_key="users.id")
    is_active: bool = True
