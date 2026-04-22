import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine, Session
from sqlmodel.pool import StaticPool

import os
os.environ.setdefault("BOT_TOKEN", "test:token")
os.environ.setdefault("ADMIN_TELEGRAM_ID", "12345")
os.environ.setdefault("DATABASE_URL", "sqlite://")

from app.main import app
from app.database import engine as real_engine


@pytest.fixture(name="client")
def client_fixture():
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(test_engine)

    with TestClient(app) as c:
        yield c


def test_healthz(client):
    response = client.get("/api/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "agents_online" in data
