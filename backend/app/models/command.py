from datetime import datetime
from typing import Any
from sqlmodel import SQLModel, Field
from sqlalchemy import Column
from sqlalchemy.types import JSON


class Command(SQLModel, table=True):
    __tablename__ = "commands"

    id: int | None = Field(default=None, primary_key=True)
    uuid: str = Field(max_length=36, unique=True, index=True)
    trace_id: str = Field(max_length=36, index=True)
    command_type: str = Field(max_length=50)
    params: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    target_type: str = Field(max_length=10)  # single/group/all/multi
    target_pc_id: int | None = Field(default=None, foreign_key="pcs.id", index=True)
    target_group_id: int | None = Field(default=None, foreign_key="groups.id", index=True)
    issued_by: int | None = Field(default=None, foreign_key="users.id")
    status: str = Field(default="pending", max_length=20, index=True)
    expires_at: datetime | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CommandResult(SQLModel, table=True):
    __tablename__ = "command_results"

    id: int | None = Field(default=None, primary_key=True)
    command_id: int = Field(foreign_key="commands.id", index=True)
    pc_id: int = Field(foreign_key="pcs.id", index=True)
    success: bool
    error: str | None = None
    executed_at: datetime | None = None
