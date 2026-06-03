import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from src.database import init_db
from src.api import auth, conversations, messages, models, upload, export
from src.config import settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="YangChat API", version="1.0.0", lifespan=lifespan)

# W4: CORS 收窄，明確列出需要的 methods/headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router,          prefix="/api/auth")
app.include_router(conversations.router, prefix="/api/conversations")
app.include_router(messages.router,      prefix="/api/messages")
app.include_router(models.router,        prefix="/api/models")
app.include_router(upload.router,        prefix="/api")
app.include_router(export.router,        prefix="/api")


@app.get("/health")
async def health():
    """健康檢查：同時驗證 DB 可連線"""
    try:
        from src.database import get_db_ctx
        async with get_db_ctx() as db:
            await db.execute("SELECT 1")
        return {"status": "ok", "db": "ok", "service": "YangChat"}
    except Exception as e:
        logger.error("Health check DB 失敗: %s", e)
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="DB 無法連線")
