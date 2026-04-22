from datetime import datetime
from sqlmodel import SQLModel, Field


class Token(SQLModel, table=True):
    __tablename__ = "tokens"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)
    token_hash: str = Field(max_length=128)
    pc_id: int | None = Field(default=None, foreign_key="pcs.id")
    created_by: int | None = Field(default=None, foreign_key="users.id")
    is_active: bool = True
    last_used: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
