from datetime import datetime
from sqlmodel import SQLModel, Field


class Group(SQLModel, table=True):
    __tablename__ = "groups"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)
    description: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PCGroupMembership(SQLModel, table=True):
    __tablename__ = "pc_group_memberships"

    pc_id: int = Field(foreign_key="pcs.id", primary_key=True)
    group_id: int = Field(foreign_key="groups.id", primary_key=True)
