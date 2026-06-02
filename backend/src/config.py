from pydantic_settings import BaseSettings
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

    # App
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost"]

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
