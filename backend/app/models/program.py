from datetime import datetime
from sqlmodel import SQLModel, Field


class AllowedProgram(SQLModel, table=True):
    __tablename__ = "allowed_programs"

    id: int | None = Field(default=None, primary_key=True)
    slug: str = Field(max_length=50, unique=True, index=True)
    name: str = Field(max_length=100)
    icon: str | None = Field(default=None, max_length=10)
    description: str | None = Field(default=None, max_length=200)
    windows_path: str = Field(max_length=500)
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
