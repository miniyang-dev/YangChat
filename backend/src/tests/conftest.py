import os
import asyncio
import pytest

os.environ.setdefault("PIONEER_API_KEY", "test-key")
os.environ.setdefault("JWT_SECRET", "test-secret-for-unit-tests-minimum-32-chars!!")
os.environ.setdefault("CHAT_USERNAME", "admin")
os.environ.setdefault("CHAT_PASSWORD", "admin")
os.environ.setdefault("DB_PATH", "/tmp/yangchat_test.db")


@pytest.fixture(scope="session", autouse=True)
def init_test_db():
    """在測試開始前先手動初始化 DB（TestClient 不觸發 lifespan）"""
    from src.database import init_db
    asyncio.run(init_db())


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from src.main import app
    return TestClient(app)


@pytest.fixture
def auth_token(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    return resp.json()["token"]
