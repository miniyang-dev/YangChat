from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List


class Settings(BaseSettings):
    # Pioneer AI
    PIONEER_API_KEY: str = ""
    PIONEER_BASE_URL: str = "https://api.pioneer.ai/v1"
    DEFAULT_MODEL: str = "claude-sonnet-4-6"

    # Auth（單一使用者）
    JWT_SECRET: str = "change-me-in-production"
    JWT_EXPIRATION_HOURS: int = 24
    CHAT_USERNAME: str = "admin"
    CHAT_PASSWORD: str = "admin"

    # DB
    DB_PATH: str = "/data/yangchat.db"

    # Tavily Search
    TAVILY_API_KEY: str = ""

    # App
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost"]

    model_config = {"env_file": ".env", "extra": "ignore"}

    # B-C1: 阻止以預設值部署
    @field_validator("JWT_SECRET")
    @classmethod
    def jwt_secret_must_be_strong(cls, v: str) -> str:
        UNSAFE = {"change-me-in-production", "", "secret", "changeme"}
        if v in UNSAFE:
            raise ValueError(
                "JWT_SECRET 不可使用預設值，請在 .env 設定長度 ≥ 32 的隨機字串"
            )
        if len(v) < 32:
            raise ValueError("JWT_SECRET 長度至少需要 32 字元")
        return v


settings = Settings()
