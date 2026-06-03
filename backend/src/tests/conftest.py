import os
import asyncio
import pytest

os.environ.setdefault("PIONEER_API_KEY", "test-key")
os.environ.setdefault("JWT_SECRET", "test-secret-for-unit-tests-minimum-32-chars!!")
os.environ.setdefault("DB_PATH", "/tmp/yangchat_test.db")

# 帳密：優先用環境變數（容器/CI 注入），fallback 才用預設值
# 這樣本機 docker 測試（CHAT_USERNAME=irene）和 CI（admin）都可以通過
_TEST_USERNAME = os.environ.get("CHAT_USERNAME", "admin")
_TEST_PASSWORD = os.environ.get("CHAT_PASSWORD", "admin")
# 確保 conftest 讀到的帳密回寫給 settings（若 .env 已載入則不影響，因為值一致）
os.environ.setdefault("CHAT_USERNAME", _TEST_USERNAME)
os.environ.setdefault("CHAT_PASSWORD", _TEST_PASSWORD)


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
    """使用實際環境的帳密登入，取得 JWT token"""
    resp = client.post("/api/auth/login", json={"username": _TEST_USERNAME, "password": _TEST_PASSWORD})
    data = resp.json()
    assert data.get("success") is True, f"登入失敗，請確認 CHAT_USERNAME/CHAT_PASSWORD 設定正確。回應: {data}"
    return data["token"]
